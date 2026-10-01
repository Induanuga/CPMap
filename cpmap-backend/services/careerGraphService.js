const { getSession } = require('../config/neo4j');
const neo4j = require('neo4j-driver');
const CareerPath = require('../models/CareerPath');
const {
  generateEmbedding,
  cosineSimilarity,
  calculateSkillsSimilarity,
  calculateEducationSimilarity,
  findMatchedSkills,
  findMatchedOnetSkills,
} = require('../recommendation/similarityEngine');

// ─── CPMAP field order (spec) ───────────────────────────────────────────────
const PRE_STAGE_FIELDS = [
  'gender', 'religion', 'caste', 'childhoodEconomicStatus', 'background',
  'parentOccupation', 'education', 'skills', 'currentJob',
];
const LIFE_STAGE_FIELDS = ['lifeStage_1', 'lifeStage_2', 'lifeStage_3', 'lifeStage_4', 'lifeStage_5'];
const FIELD_ORDER = [...PRE_STAGE_FIELDS, ...LIFE_STAGE_FIELDS];

const DROPDOWN_FIELDS = new Set([
  'gender', 'religion', 'caste', 'childhoodEconomicStatus', 'background',
]);
const LIST_FIELDS = new Set(['education', 'skills']);

const ECONOMIC_ORDER = ['Very Poor', 'Poor', 'Middle', 'Upper Middle', 'Rich'];
const BACKGROUND_ORDER = ['Tribal', 'Rural', 'Semi-Urban', 'Urban'];

const DEFAULT_WEIGHTS = {
  currentStage: 0.165,
  education: 0.20,
  currentJob: 0.20,
  skills: 0.25,
  childhoodEconomicStatus: 0.06,
  background: 0.045,
  parentOccupation: 0.03,
  gender: 0.02,
  religion: 0.02,
  caste: 0.01,
};

const DEFAULT_THRESHOLDS = {
  gender: 0.95,
  religion: 0.95,
  caste: 0.95,
  childhoodEconomicStatus: 0.45,
  background: 0.45,
  parentOccupation: 0.40,
  education: 0.50,
  skills: 0.45,
  currentJob: 0.55,
  currentStage: 0.50,
  lifeStage_1: 0.45,
  lifeStage_2: 0.45,
  lifeStage_3: 0.45,
  lifeStage_4: 0.45,
  lifeStage_5: 0.45,
};

const ROOT_ID = 'ROOT';
let cachedGraph = null;
let rebuildInProgress = false;

// ─── String similarity ──────────────────────────────────────────────────────
function jaroDistance(s1, s2) {
  if (!s1 || !s2) return 0;
  s1 = String(s1); s2 = String(s2);
  if (s1 === s2) return 1;
  const len1 = s1.length, len2 = s2.length;
  if (!len1 || !len2) return 0;
  const md = Math.floor(Math.max(len1, len2) / 2) - 1;
  const m1 = new Array(len1).fill(false), m2 = new Array(len2).fill(false);
  let matches = 0;
  for (let i = 0; i < len1; i++) {
    for (let j = Math.max(0, i - md); j <= Math.min(i + md, len2 - 1); j++) {
      if (m2[j] || s1[i] !== s2[j]) continue;
      m1[i] = m2[j] = true; matches++; break;
    }
  }
  if (!matches) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < len1; i++) {
    if (!m1[i]) continue;
    while (!m2[k]) k++;
    if (s1[i] !== s2[k]) t++;
    k++;
  }
  return (matches / len1 + matches / len2 + (matches - t / 2) / matches) / 3;
}

function jaroWinkler(s1, s2) {
  const j = jaroDistance(String(s1).toLowerCase(), String(s2).toLowerCase());
  if (!j) return 0;
  let prefix = 0;
  const a = String(s1).toLowerCase(), b = String(s2).toLowerCase();
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++; else break;
  }
  return j + prefix * 0.1 * (1 - j);
}

function orderedSimilarity(query, value, orderList) {
  const q = String(query).trim().toLowerCase();
  const v = String(value).trim().toLowerCase();
  if (q === v) return 1;
  const qi = orderList.findIndex((x) => x.toLowerCase() === q);
  const vi = orderList.findIndex((x) => x.toLowerCase() === v);
  if (qi < 0 || vi < 0) return q === v ? 1 : 0;
  const maxDist = orderList.length - 1;
  return 1 - Math.abs(qi - vi) / maxDist;
}

function parseTuple(val) {
  if (!val) return { first: '', second: '' };
  if (typeof val === 'object' && val !== null) {
    return {
      first: String(val.first || val.degree || val.father || '').trim(),
      second: String(val.second || val.institute || val.mother || '').trim(),
    };
  }
  const str = String(val).trim();
  const parts = str.split(/,| from | - | at |;/i).map((s) => s.trim()).filter(Boolean);
  return {
    first: parts[0] || str,
    second: parts[1] || '',
  };
}

function tupleSimilarity(query, value, weightFirst = 0.7) {
  const q = parseTuple(query);
  const v = parseTuple(value);
  if (!q.first && !q.second) return 1;
  if (!v.first && !v.second) return 0;

  const sim1 = jaroWinkler(q.first, v.first);
  if (!q.second || !v.second) {
    return sim1;
  }
  const sim2 = jaroWinkler(q.second, v.second);
  return weightFirst * sim1 + (1 - weightFirst) * sim2;
}

function extractEducationKeywords(val) {
  if (!val) return [];
  if (typeof val === 'object' && val !== null) {
    return [val.degree, val.first, val.institute, val.second].filter(Boolean).map((x) => String(x).toLowerCase().trim());
  }
  const str = String(val).toLowerCase();
  const parts = str.split(/→|->|,|;| from | at | in | - |\//).map((s) => s.trim()).filter(Boolean);
  return [str, ...parts];
}

function educationSimilarity(query, value) {
  if (!query || !value) return 0;
  const qStr = typeof query === 'object' && query !== null ? `${query.degree || query.first || ''} ${query.institute || query.second || ''}` : String(query);
  const vStr = typeof value === 'object' && value !== null ? `${value.degree || value.first || ''} ${value.institute || value.second || ''}` : String(value);

  const qLow = qStr.toLowerCase().trim();
  const vLow = vStr.toLowerCase().trim();
  if (qLow === vLow) return 1;

  const qKeywords = extractEducationKeywords(query);
  const vKeywords = extractEducationKeywords(value);

  let best = 0;
  for (const qk of qKeywords) {
    for (const vk of vKeywords) {
      if (!qk || !vk) continue;
      if (qk === vk) { best = Math.max(best, 1.0); break; }
      if (qk.includes(vk) || vk.includes(qk)) {
        best = Math.max(best, 0.9);
      }
      const jw = jaroWinkler(qk, vk);
      best = Math.max(best, jw);
    }
  }
  return best;
}

function simField(field, query, value) {
  if (query == null || query === '' || query === 'Any') return 1;
  if (value == null || value === '') return 0;

  if (field === 'childhoodEconomicStatus') {
    return orderedSimilarity(query, value, ECONOMIC_ORDER);
  }
  if (field === 'background') {
    return orderedSimilarity(query, value, BACKGROUND_ORDER);
  }
  if (DROPDOWN_FIELDS.has(field)) {
    return String(query).trim().toLowerCase() === String(value).trim().toLowerCase() ? 1 : 0;
  }
  if (field === 'education' || field === 'currentStage' || isLifeStageField(field)) {
    return educationSimilarity(query, value);
  }
  if (field === 'parentOccupation') {
    return tupleSimilarity(query, value, 0.5);
  }
  if (field === 'skills') {
    const qArr = Array.isArray(query) ? query : String(query).split(/[,|→]/).map((x) => x.trim()).filter(Boolean);
    const vArr = Array.isArray(value) ? value : String(value).split(/[,|→]/).map((x) => x.trim()).filter(Boolean);
    if (!qArr.length || !vArr.length) return 0;

    let maxMatch = 0;
    for (const v of vArr) {
      const vLow = String(v).toLowerCase().trim();
      if (!vLow) continue;
      for (const q of qArr) {
        const qLow = String(q).toLowerCase().trim();
        if (!qLow) continue;
        if (vLow === qLow) {
          maxMatch = 1.0;
          break;
        }
        if (vLow.includes(qLow) || qLow.includes(vLow)) {
          maxMatch = Math.max(maxMatch, 0.9);
        }
        const jw = jaroWinkler(qLow, vLow);
        if (jw >= 0.75) {
          maxMatch = Math.max(maxMatch, jw);
        }
      }
      if (maxMatch === 1.0) break;
    }
    return maxMatch;
  }
  return jaroWinkler(query, value);
}

function normalizeField(field) {
  const aliases = {
    currentstage: 'currentStage', currentjob: 'currentJob', current_job: 'currentJob',
    childhoodeconomicstatus: 'childhoodEconomicStatus', parentoccupation: 'parentOccupation',
    skillsinterests: 'skills', skills_interests: 'skills',
  };
  const key = String(field || '').replace(/\s+/g, '').replace(/[-/]/g, '').toLowerCase();
  return aliases[key] || field;
}

function isLifeStageField(field) {
  return LIFE_STAGE_FIELDS.includes(normalizeField(field));
}

function matchingFields(field) {
  return field === 'currentStage' ? LIFE_STAGE_FIELDS : [field];
}

function getThreshold(field, options = {}) {
  const f = normalizeField(field);
  return options.thresholds?.[f] ?? options.thresholds?.[field] ?? DEFAULT_THRESHOLDS[f] ?? 0.65;
}

function getWeight(field, options = {}) {
  const f = normalizeField(field);
  return options.weights?.[f] ?? options.weights?.[field] ?? DEFAULT_WEIGHTS[f] ?? 0.1;
}

const embeddingCache = new Map();

async function textSimilarity(query, value) {
  if (!query || !value) return 0;
  const queryText = String(query).trim().toLowerCase();
  const valueText = String(value).trim().toLowerCase();
  if (!queryText || !valueText) return 0;
  if (queryText === valueText) return 1;

  const getCachedEmbedding = async (text) => {
    if (!embeddingCache.has(text)) embeddingCache.set(text, generateEmbedding(text));
    return embeddingCache.get(text);
  };

  return cosineSimilarity(
    await getCachedEmbedding(queryText),
    await getCachedEmbedding(valueText),
  );
}

function exactSimilarity(query, value) {
  if (!query || !value) return 0;
  return String(query).trim().toLowerCase() === String(value).trim().toLowerCase() ? 1 : 0;
}

function stageText(stage) {
  if (!stage) return '';
  return [stage.stageName, stage.what, stage.where, stage.field]
    .filter(Boolean)
    .join(' ');
}

async function bestStageSimilarity(query, stages) {
  if (!query || !stages.length) return 0;
  const scores = await Promise.all(stages.map((stage) => textSimilarity(query, stageText(stage))));
  return Math.max(...scores, 0);
}

async function scoreCareerPath(career, query, options = {}) {
  const stages = career.stages || [];

  // Determine which stage in this career path best matches the user's current situation
  const stageTarget = query.currentStage || query.currentJob || query.education;
  let matchedStageIndex = 0;
  let bestStageSim = 0;
  if (stages.length > 0 && stageTarget) {
    for (let i = 0; i < stages.length; i++) {
      const s = await textSimilarity(stageTarget, stageText(stages[i]));
      if (s > bestStageSim) {
        bestStageSim = s;
        matchedStageIndex = i;
      }
    }
  }

  const matchedStage = stages[matchedStageIndex] || null;
  const nextStage = stages[matchedStageIndex + 1] || null;

  // Find overlapping skills between user query and this career's stages / O*NET skills
  const querySkills = Array.isArray(query.skills)
    ? query.skills
    : (typeof query.skills === 'string' ? query.skills.split(/[,|]/).map((x) => x.trim()).filter(Boolean) : []);
  const allStageSkills = stages.flatMap((stage) => stage.skills || []);
  const matched = [
    ...findMatchedSkills(querySkills, allStageSkills),
    ...findMatchedOnetSkills(querySkills, career.onetSkills || []),
  ];
  const matchedSkills = [...new Set(matched)];

  const values = {
    gender: exactSimilarity(query.gender, career.submitterGender),
    religion: exactSimilarity(query.religion, career.religion || career.submitterReligion),
    caste: exactSimilarity(query.caste, career.caste || career.submitterCaste),
    childhoodEconomicStatus: orderedSimilarity(
      query.childhoodEconomicStatus,
      career.submitterEconomicStatus,
      ECONOMIC_ORDER,
    ),
    background: orderedSimilarity(query.background, career.submitterBackground, BACKGROUND_ORDER),
    parentOccupation: await textSimilarity(query.parentOccupation, career.parentOccupation),
    education: await calculateEducationSimilarity(
      query.education,
      career.submitterEducationHistory || stages.map(stageText).join(' '),
    ),
    skills: await calculateSkillsSimilarity(query.skills, [
      ...(career.submitterSkills || []),
      ...stages.flatMap((stage) => stage.skills || []),
    ]),
    currentJob: await textSimilarity(
      query.currentJob,
      stageText(stages.find((stage) => /job|work|intern|senior/i.test(String(stage.stageType))) || stages[stages.length - 1]),
    ),
    currentStage: bestStageSim,
  };

  let weightedScore = 0;
  let totalWeight = 0;
  for (const [field, value] of Object.entries(query)) {
    if (value == null || value === '' || value === 'Any' || !Object.hasOwn(values, field)) continue;
    const weight = getWeight(field, options);
    weightedScore += weight * values[field];
    totalWeight += weight;
  }

  const score = totalWeight ? weightedScore / totalWeight : 0;

  return {
    score,
    matchedStageIndex,
    matchedStage,
    nextStage,
    matchedSkills,
  };
}

// ─── In-memory graph ────────────────────────────────────────────────────────
function emptyGraph() {
  return { nodes: new Map(), edges: [] };
}

function formatNodeValue(value) {
  if (value == null) return 'Unknown';
  if (typeof value === 'object') {
    if (value.degree !== undefined) {
      return value.institute ? `${value.degree} from ${value.institute}` : String(value.degree);
    }
    if (value.father !== undefined) {
      return value.mother && value.mother !== 'Unknown' ? `${value.father}, ${value.mother}` : String(value.father);
    }
    return JSON.stringify(value);
  }
  return String(value);
}

function addNode(G, field, value, ids) {
  const formattedVal = formatNodeValue(value);
  const id = `${field}:${formattedVal.slice(0, 120)}:${Math.random().toString(36).slice(2, 8)}`;
  G.nodes.set(id, { id, field, value: formattedVal, ids: new Set(ids) });
  return id;
}

function addEdge(G, fromId, toId, ids) {
  const idSet = new Set(ids);
  const existing = G.edges.find((e) => e.from === fromId && e.to === toId);
  if (existing) {
    for (const i of idSet) existing.ids.add(i);
  } else {
    G.edges.push({ from: fromId, to: toId, ids: idSet });
  }
}

function getOutgoing(G, nodeId) {
  return G.edges.filter((e) => e.from === nodeId);
}

function getSearchEdges(G, nodeId, field) {
  const edges = getOutgoing(G, nodeId);
  if (nodeId !== ROOT_ID || field !== 'currentStage') return edges;

  const allIds = G.nodes.get(ROOT_ID)?.ids || new Set();
  return G.edges
    .filter((edge) => isLifeStageField(G.nodes.get(edge.to)?.field))
    .map((edge) => ({
      ...edge,
      ids: new Set([...edge.ids].filter((id) => allIds.has(id))),
    }));
}

// ─── CONSTRUCT-GRAPH(person) ────────────────────────────────────────────────
function constructPersonGraph(G, person) {
  let prev = [];

  for (const f of PRE_STAGE_FIELDS) {
    const layer = [];
    const raw = person[f];
    const values = LIST_FIELDS.has(f)
      ? (Array.isArray(raw) ? raw : String(raw || '').split(/[,→|]/).map((x) => x.trim()).filter(Boolean))
      : [raw || 'Unknown'];

    for (const val of values) {
      if (!val && !LIST_FIELDS.has(f)) continue;
      layer.push(addNode(G, f, val, [person.id]));
    }
    if (layer.length === 0) layer.push(addNode(G, f, 'Unknown', [person.id]));

    if (prev.length === 0) {
      for (const v of layer) addEdge(G, ROOT_ID, v, [person.id]);
    } else {
      for (const u of prev) for (const v of layer) addEdge(G, u, v, [person.id]);
    }
    prev = layer;
  }

  const lastPreStage = prev;
  let prevStage = null;

  for (let i = 0; i < LIFE_STAGE_FIELDS.length; i++) {
    const val = person.lifeStages[i] || `Stage ${i + 1}`;
    const sid = addNode(G, LIFE_STAGE_FIELDS[i], val, [person.id]);
    for (const u of lastPreStage) addEdge(G, u, sid, [person.id]);
    if (prevStage) addEdge(G, prevStage, sid, [person.id]);
    prevStage = sid;
  }
}

function careerPathToPerson(cp) {
  const stages = cp.stages || [];
  const lifeStages = stages.slice(0, 5).map((s) => s.stageName || s.what || '');
  const jobStage = stages.find((s) => /job|work|intern|senior/i.test(String(s.stageType))) || stages[stages.length - 1];

  const education = [];
  if (cp.submitterEducationHistory) {
    education.push(...String(cp.submitterEducationHistory).split(/→|->/).map((x) => x.trim()).filter(Boolean));
  }
  for (const s of stages) {
    if (s.education) {
      education.push({ degree: s.education, institute: s.where || '' });
    } else if (s.what && /school|b\.|m\.|degree|tech|grade|bachelor|master|phd/i.test(String(s.stageType || s.what))) {
      education.push({ degree: s.what, institute: s.where || '' });
    }
  }

  const skills = [...(cp.submitterSkills || [])];
  for (const s of stages) {
    for (const sk of s.skills || []) {
      if (typeof sk === 'string') skills.push(sk);
    }
  }

  const rawParent = cp.parentOccupation || '';
  const parentParts = String(rawParent).split(/,|;| and |\//i).map((x) => x.trim()).filter(Boolean);
  const parentTuple = {
    father: parentParts[0] || rawParent || 'Unknown',
    mother: parentParts[1] || 'Unknown',
  };

  return {
    id: cp._id.toString(),
    gender: cp.submitterGender || 'Unknown',
    religion: cp.religion || cp.submitterReligion || 'Unknown',
    caste: cp.caste || cp.submitterCaste || 'Unknown',
    childhoodEconomicStatus: cp.submitterEconomicStatus || 'Middle',
    background: cp.submitterBackground || 'Urban',
    parentOccupation: parentTuple,
    education: education.length ? education.slice(0, 5) : ['Unknown'],
    skills: [...new Set(skills)].slice(0, 15),
    currentJob: jobStage?.what || jobStage?.stageName || cp.title || '',
    lifeStages,
  };
}

// ─── COALESCE ─────────────────────────────────────────────────────────────────
function agglomerativeClusterAverageLinkage(nodes, threshold, simFn) {
  if (nodes.length <= 1) return nodes.map((n) => [n]);

  const valueGroups = new Map();
  for (const node of nodes) {
    const key = typeof node.value === 'object' ? JSON.stringify(node.value) : String(node.value).trim().toLowerCase();
    if (!valueGroups.has(key)) valueGroups.set(key, []);
    valueGroups.get(key).push(node);
  }

  const uniqueKeys = [...valueGroups.keys()];
  const M = uniqueKeys.length;
  if (M <= 1) return [[...nodes]];

  const repNodes = uniqueKeys.map((k) => valueGroups.get(k)[0]);
  const weights = uniqueKeys.map((k) => valueGroups.get(k).length);

  const dist = Array.from({ length: M }, () => new Float32Array(M));
  for (let i = 0; i < M; i++) {
    for (let j = i + 1; j < M; j++) {
      const d = Math.max(0, 1 - simFn(repNodes[i].value, repNodes[j].value));
      dist[i][j] = d;
      dist[j][i] = d;
    }
  }

  const clusters = [];
  for (let i = 0; i < M; i++) {
    clusters.push({ id: i, active: true, items: [i], weight: weights[i] });
  }

  const maxDist = 1 - threshold;
  let activeCount = M;

  while (activeCount > 1) {
    let bestDist = Infinity;
    let bestA = -1, bestB = -1;

    for (let i = 0; i < clusters.length; i++) {
      if (!clusters[i].active) continue;
      for (let j = i + 1; j < clusters.length; j++) {
        if (!clusters[j].active) continue;
        const d = dist[clusters[i].id][clusters[j].id];
        if (d < bestDist) {
          bestDist = d;
          bestA = i;
          bestB = j;
        }
      }
    }

    if (bestDist > maxDist || bestA === -1) break;

    const cA = clusters[bestA];
    const cB = clusters[bestB];
    const newWeight = cA.weight + cB.weight;

    for (let k = 0; k < clusters.length; k++) {
      if (!clusters[k].active || k === bestA || k === bestB) continue;
      const dAK = dist[cA.id][clusters[k].id];
      const dBK = dist[cB.id][clusters[k].id];
      const avgDist = (cA.weight * dAK + cB.weight * dBK) / newWeight;
      dist[cA.id][clusters[k].id] = avgDist;
      dist[clusters[k].id][cA.id] = avgDist;
    }

    cA.items.push(...cB.items);
    cA.weight = newWeight;
    cB.active = false;
    activeCount--;
  }

  const resultClusters = [];
  for (const c of clusters) {
    if (!c.active) continue;
    const clusterNodes = [];
    for (const itemIdx of c.items) {
      clusterNodes.push(...valueGroups.get(uniqueKeys[itemIdx]));
    }
    resultClusters.push(clusterNodes);
  }

  return resultClusters;
}

function medoid(cluster, simFn) {
  let best = cluster[0], bestScore = -1;
  for (const c of cluster) {
    let sum = 0;
    for (const o of cluster) sum += simFn(c.value, o.value);
    if (sum > bestScore) { bestScore = sum; best = c; }
  }
  return best;
}

function coalesceGraph(G, fieldOrder, options = {}) {
  const nodeByField = new Map();
  for (const n of G.nodes.values()) {
    if (n.id === ROOT_ID) continue;
    if (!nodeByField.has(n.field)) nodeByField.set(n.field, []);
    nodeByField.get(n.field).push(n);
  }

  const redirect = new Map();

  for (const f of fieldOrder) {
    const nodes = nodeByField.get(f) || [];
    if (!nodes.length) continue;

    let clusters;
    if (DROPDOWN_FIELDS.has(f)) {
      const groups = new Map();
      for (const n of nodes) {
        const key = String(n.value).trim().toLowerCase();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(n);
      }
      clusters = [...groups.values()];
    } else {
      const theta = getThreshold(f, options);
      clusters = agglomerativeClusterAverageLinkage(nodes, theta, (a, b) => simField(f, a, b));
    }

    for (const cluster of clusters) {
      const rep = medoid(cluster, (a, b) => simField(f, a, b));
      const mergedIds = new Set();
      for (const n of cluster) {
        for (const id of n.ids) mergedIds.add(id);
        redirect.set(n.id, rep.id);
      }
      rep.ids = mergedIds;
      rep.value = rep.value;
      G.nodes.set(rep.id, rep);
      for (const n of cluster) {
        if (n.id !== rep.id) G.nodes.delete(n.id);
      }
    }
  }

  const newEdges = [];
  const edgeMap = new Map();

  for (const e of G.edges) {
    const from = redirect.get(e.from) || e.from;
    const to = redirect.get(e.to) || e.to;
    if (from === to) continue;
    const key = `${from}|${to}`;
    if (!edgeMap.has(key)) {
      edgeMap.set(key, { from, to, ids: new Set(e.ids) });
    } else {
      for (const id of e.ids) edgeMap.get(key).ids.add(id);
    }
  }
  G.edges = [...edgeMap.values()];
  return G;
}

function buildGraphFromPersons(persons, options = {}) {
  const G = emptyGraph();
  G.nodes.set(ROOT_ID, { id: ROOT_ID, field: 'root', value: 'ROOT', ids: new Set(persons.map((p) => p.id)) });

  for (const p of persons) constructPersonGraph(G, p);
  return coalesceGraph(G, FIELD_ORDER, options);
}

// ─── SEARCH(G, Query, F) ─────────────────────────────────────────────────────
function searchGraph(G, query, fieldOrder, options = {}) {
  const allIds = G.nodes.get(ROOT_ID)?.ids || new Set();
  let frontier = new Map([[ROOT_ID, new Set(allIds)]]);
  const path = new Map([[ROOT_ID, []]]);

  // 1. Traverse pre-stage fields sequentially across the graph layers
  for (const f of PRE_STAGE_FIELDS) {
    const field = normalizeField(f);
    const q = query[field] ?? query[f] ?? null;
    const newFrontier = new Map();
    const newPath = new Map();

    for (const [uId, uIds] of frontier.entries()) {
      if (!uIds.size) continue;
      const outEdges = G.edges.filter((e) => e.from === uId);

      for (const edge of outEdges) {
        const vNode = G.nodes.get(edge.to);
        if (!vNode || vNode.field !== field) continue;

        const ids = new Set([...uIds].filter((id) => edge.ids.has(id)));
        if (!ids.size) continue;

        let s = null;
        if (q != null && q !== '' && q !== 'Any') {
          s = simField(field, q, vNode.value);
          if (s < getThreshold(field, options)) continue;
        }

        if (!newFrontier.has(edge.to)) newFrontier.set(edge.to, new Set());
        for (const id of ids) newFrontier.get(edge.to).add(id);

        const step = { field, nodeId: edge.to, value: vNode.value, score: s };
        const prev = path.get(uId) || [];
        if (!newPath.has(edge.to) || (newPath.get(edge.to).length < prev.length + 1)) {
          newPath.set(edge.to, [...prev, step]);
        }
      }
    }

    if (newFrontier.size === 0) {
      return { frontier: new Map(), path: new Map(), ids: [] };
    }

    frontier = newFrontier;
    path.clear();
    for (const [k, v] of newPath) path.set(k, v);
  }

  // 2. Direct jump-in from CurrentJob (lastPreStage) into LifeStages
  const lifeStageFrontier = new Map();
  const lifeStagePath = new Map();
  const qStage = query.currentStage || null;

  for (const [uId, uIds] of frontier.entries()) {
    if (!uIds.size) continue;
    const outEdges = G.edges.filter((e) => e.from === uId);

    for (const edge of outEdges) {
      const vNode = G.nodes.get(edge.to);
      if (!vNode || !isLifeStageField(vNode.field)) continue;

      const ids = new Set([...uIds].filter((id) => edge.ids.has(id)));
      if (!ids.size) continue;

      let s = null;
      if (qStage != null && qStage !== '' && qStage !== 'Any') {
        s = simField(vNode.field, qStage, vNode.value);
        if (s < getThreshold('currentStage', options)) continue;
      }

      if (!lifeStageFrontier.has(edge.to)) lifeStageFrontier.set(edge.to, new Set());
      for (const id of ids) lifeStageFrontier.get(edge.to).add(id);

      const step = { field: vNode.field, nodeId: edge.to, value: vNode.value, score: s };
      const prev = path.get(uId) || [];
      if (!lifeStagePath.has(edge.to) || lifeStagePath.get(edge.to).length < prev.length + 1) {
        lifeStagePath.set(edge.to, [...prev, step]);
      }
    }
  }

  const finalFrontier = lifeStageFrontier.size > 0 ? lifeStageFrontier : frontier;
  const finalPath = lifeStageFrontier.size > 0 ? lifeStagePath : path;

  const ids = new Set();
  for (const idSet of finalFrontier.values()) for (const id of idSet) ids.add(id);
  return { frontier: finalFrontier, path: finalPath, ids: [...ids] };
}

// ─── RANK(Frontier, Path, Query, w) ─────────────────────────────────────────
function rankResults(frontier, path, query, options = {}, G = null) {
  const scores = new Map();
  const matchedInfo = new Map();

  for (const [vId, idSet] of frontier.entries()) {
    const P = path.get(vId) || [];
    let num = 0, den = 0;

    for (const step of P) {
      const fieldKey = normalizeField(step.field);
      const q = query[fieldKey] ?? (isLifeStageField(step.field) ? query.currentStage : null);
      if (q != null && q !== '' && q !== 'Any') {
        const weightField = isLifeStageField(step.field) ? 'currentStage' : fieldKey;
        const w = getWeight(weightField, options);
        const s = step.score != null ? step.score : simField(step.field, q, step.value);
        num += w * s;
        den += w;
      }
    }

    const scoreP = den > 0 ? num / den : 0;
    const vNode = G?.nodes?.get?.(vId);
    const chainEdge = G?.edges?.find?.((e) => e.from === vId && isLifeStageField(G.nodes.get(e.to)?.field));
    const nextNode = chainEdge ? G.nodes.get(chainEdge.to) : null;

    for (const id of idSet) {
      if (scoreP >= (scores.get(id) || 0)) {
        scores.set(id, scoreP);
        matchedInfo.set(id, {
          vId,
          field: vNode?.field || (P[P.length - 1]?.field),
          value: vNode?.value || (P[P.length - 1]?.value),
          nextStageValue: nextNode?.value || null,
          path: P,
          score: scoreP,
        });
      }
    }
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ id, score, info: matchedInfo.get(id) }))
    .sort((a, b) => b.score - a.score);
}

// ─── Neo4j persistence ────────────────────────────────────────────────────────
async function persistGraph(G) {
  const session = getSession();
  const nodes = [...G.nodes.values()]
    .filter((node) => node.id !== ROOT_ID)
    .map((node) => ({ id: node.id, field: node.field, value: node.value, ids: [...node.ids] }));
  const rootEdges = G.edges
    .filter((edge) => edge.from === ROOT_ID)
    .map((edge) => ({ to: edge.to, ids: [...edge.ids] }));
  const nodeEdges = G.edges
    .filter((edge) => edge.from !== ROOT_ID)
    .map((edge) => ({ from: edge.from, to: edge.to, ids: [...edge.ids] }));

  console.log(`[GRAPH] Persisting ${nodes.length} nodes and ${G.edges.length} edges`);
  try {
    console.log('[GRAPH] Ensuring Neo4j node id constraints');
    await session.run(
      'CREATE CONSTRAINT cpnode_node_id IF NOT EXISTS FOR (n:CpNode) REQUIRE n.nodeId IS UNIQUE'
    );
    await session.run(
      'CREATE CONSTRAINT cproot_node_id IF NOT EXISTS FOR (n:CpRoot) REQUIRE n.nodeId IS UNIQUE'
    );
    await session.executeWrite(async (tx) => {
      console.log('[GRAPH] Clearing previous CpNode/CpRoot graph');
      await tx.run('MATCH (n:CpNode) DETACH DELETE n');
      await tx.run('MATCH (r:CpRoot) DETACH DELETE r');

      console.log('[GRAPH] Creating root and nodes in bulk');
      await tx.run('CREATE (r:CpRoot {nodeId: $id})', { id: ROOT_ID });
      await tx.run(
        `UNWIND $nodes AS node
         CREATE (n:CpNode {nodeId: node.id, field: node.field, value: node.value, ids: node.ids})`,
        { nodes }
      );

      console.log(`[GRAPH] Creating ${G.edges.length} relationships in bulk`);
      if (rootEdges.length) {
        await tx.run(
          `UNWIND $edges AS edge
           MATCH (a:CpRoot {nodeId: $rootId}), (b:CpNode {nodeId: edge.to})
           CREATE (a)-[r:CP_EDGE {ids: edge.ids}]->(b)`,
          { rootId: ROOT_ID, edges: rootEdges }
        );
      }
      if (nodeEdges.length) {
        await tx.run(
          `UNWIND $edges AS edge
           MATCH (a:CpNode {nodeId: edge.from}), (b:CpNode {nodeId: edge.to})
           CREATE (a)-[r:CP_EDGE {ids: edge.ids}]->(b)`,
          { edges: nodeEdges }
        );
      }
    });
    console.log('[GRAPH] Neo4j persistence complete');
  } catch (error) {
    console.error('[GRAPH] Neo4j persistence failed:', error.message);
    throw error;
  } finally {
    await session.close();
  }
}

async function loadGraphFromNeo4j() {
  const session = getSession();
  try {
    const G = emptyGraph();
    const nodesRes = await session.run('MATCH (n:CpNode) RETURN n.nodeId AS id, n.field AS field, n.value AS value, n.ids AS ids');
    for (const r of nodesRes.records) {
      G.nodes.set(r.get('id'), {
        id: r.get('id'),
        field: r.get('field'),
        value: r.get('value'),
        ids: new Set((r.get('ids') || []).map(String)),
      });
    }

    const rootRes = await session.run('MATCH (r:CpRoot) RETURN r.nodeId AS id');
    if (rootRes.records.length) {
      const allIds = new Set();
      for (const n of G.nodes.values()) for (const id of n.ids) allIds.add(id);
      G.nodes.set(ROOT_ID, { id: ROOT_ID, field: 'root', value: 'ROOT', ids: allIds });
    }

    const edgesRes = await session.run(
      `MATCH (a)-[e:CP_EDGE]->(b:CpNode)
       RETURN CASE WHEN a:CpRoot THEN 'ROOT' ELSE a.nodeId END AS from, b.nodeId AS to, e.ids AS ids`
    );
    for (const r of edgesRes.records) {
      G.edges.push({
        from: r.get('from') === 'ROOT' ? ROOT_ID : r.get('from'),
        to: r.get('to'),
        ids: new Set((r.get('ids') || []).map(String)),
      });
    }

    if (!G.edges.some((e) => e.from === ROOT_ID)) {
      const firstField = PRE_STAGE_FIELDS[0];
      for (const n of G.nodes.values()) {
        if (n.field === firstField) addEdge(G, ROOT_ID, n.id, n.ids);
      }
    }

    return G;
  } finally {
    await session.close();
  }
}

async function getGraph() {
  if (cachedGraph) return cachedGraph;
  cachedGraph = await loadGraphFromNeo4j();
  return cachedGraph;
}

// ─── Service API ──────────────────────────────────────────────────────────────
class CareerGraphService {
  async rebuildGraph(options = {}) {
    if (rebuildInProgress) {
      throw new Error('A graph rebuild is already in progress. Wait for it to finish before retrying.');
    }
    rebuildInProgress = true;
    const startedAt = Date.now();
    try {
      console.log('[GRAPH] Rebuild started: loading approved career paths');
      const paths = await CareerPath.find({ status: 'approved' }).lean();
      console.log(`[GRAPH] Loaded ${paths.length} approved career paths`);
      const persons = paths.map(careerPathToPerson);
      console.log('[GRAPH] Constructing and coalescing in-memory graph');
      const G = buildGraphFromPersons(persons, options);
      console.log(`[GRAPH] Graph built: ${G.nodes.size - 1} nodes, ${G.edges.length} edges`);
      await persistGraph(G);
      cachedGraph = G;
      console.log(`[GRAPH] Rebuild complete in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
      return {
        persons: persons.length,
        nodes: G.nodes.size,
        edges: G.edges.length,
      };
    } finally {
      rebuildInProgress = false;
    }
  }

  async cpmapSearch(query, fields, options = {}) {
    const G = await getGraph();
    if (!G.nodes.size) {
      return { count: 0, results: [], ids: [], message: 'Graph empty — run POST /api/graph/rebuild first' };
    }

    const normalizedQuery = Object.fromEntries(
      Object.entries(query).map(([field, value]) => [normalizeField(field), value]),
    );
    const searchFields = (fields && fields.length)
      ? fields.map(normalizeField)
      : Object.keys(normalizedQuery);
    // 1. Run full-graph multi-layer SEARCH(G, Query, F)
    const { frontier, path, ids: candidateIds } = searchGraph(G, normalizedQuery, FIELD_ORDER, options);
    if (!candidateIds.length) {
      console.log('[GRAPH] Strict graph traversal returned 0 candidates, running fallback scoring over approved paths...');
      const allApproved = await CareerPath.find({ status: 'approved' }).lean();
      if (!allApproved.length) {
        return { count: 0, results: [], ids: [], searchFields };
      }
      const scoredList = await Promise.all(
        allApproved.map(async (cp) => {
          const res = await scoreCareerPath(cp, normalizedQuery, options);
          return { cp, ...res };
        })
      );
      scoredList.sort((a, b) => b.score - a.score);
      const topResults = scoredList.filter((x) => x.score > 0).slice(0, 20).map(({ cp, score, matchedStageIndex, matchedSkills, matchedStage, nextStage }) => {
        const stages = cp.stages || [];
        const mStage = matchedStage || stages[matchedStageIndex] || null;
        const nStage = nextStage || stages[matchedStageIndex + 1] || null;
        const stageLabel = mStage?.stageName || mStage?.what || '';
        const nextLabel = nStage ? (nStage.stageName || nStage.what || '') : 'Final stage reached';
        const explanation = nStage ? `You are at: ${stageLabel} → Next: ${nextLabel}` : `You match the final stage: ${stageLabel}`;
        const lifeStages = (stages || []).slice(0, 5).map((s) => ({
          name: s.stageName || s.what,
          type: s.stageType,
        }));
        return {
          _id: cp._id,
          title: cp.title,
          category: cp.category,
          description: cp.description,
          score: parseFloat(score.toFixed(4)),
          finalScore: parseFloat(score.toFixed(4)),
          stages,
          transitions: cp.transitions || [],
          onetSkills: cp.onetSkills || [],
          lifeStages,
          nextStages: lifeStages.filter(Boolean),
          matchedStageIndex,
          matchedStage: mStage,
          nextStage: nStage,
          matchedSkills: matchedSkills || [],
          explanation,
          submitterBackground: cp.submitterBackground || 'N/A',
          submitterEconomicStatus: cp.submitterEconomicStatus || 'N/A',
        };
      });
      return {
        count: topResults.length,
        results: topResults,
        ids: topResults.map((r) => r._id.toString()),
        searchFields,
      };
    }

    // 2. Run graph-path RANK(Frontier, Path, Query, w)
    const ranked = rankResults(frontier, path, normalizedQuery, options, G);

    // 3. Load career path details for ranked candidate IDs
    const candidateSet = new Set(ranked.map((r) => r.id));
    const careerPaths = await CareerPath.find({
      status: 'approved',
      _id: { $in: [...candidateSet] },
    }).lean();
    const careerMap = new Map(careerPaths.map((cp) => [cp._id.toString(), cp]));

    const results = ranked
      .map(({ id, score, info }) => {
        const cp = careerMap.get(id);
        if (!cp) return null;

        const stages = cp.stages || [];
        let matchedStageIndex = 0;
        if (info?.field && info.field.startsWith('lifeStage_')) {
          const num = parseInt(info.field.replace('lifeStage_', ''), 10);
          if (!isNaN(num) && num >= 1) {
            matchedStageIndex = Math.min(num - 1, Math.max(0, stages.length - 1));
          }
        }

        const matchedStage = stages[matchedStageIndex] || null;
        const nextStage = stages[matchedStageIndex + 1] || null;

        const querySkills = Array.isArray(normalizedQuery.skills)
          ? normalizedQuery.skills
          : (typeof normalizedQuery.skills === 'string' ? normalizedQuery.skills.split(/[,|]/).map((x) => x.trim()).filter(Boolean) : []);
        const allStageSkills = stages.flatMap((s) => s.skills || []);
        const matched = [
          ...findMatchedSkills(querySkills, allStageSkills),
          ...findMatchedOnetSkills(querySkills, cp.onetSkills || []),
        ];

        const lifeStages = (stages || []).slice(0, 5).map((s) => ({
          name: s.stageName || s.what,
          type: s.stageType,
        }));

        const stageLabel = matchedStage?.stageName || matchedStage?.what || '';
        const nextLabel = nextStage
          ? (nextStage.stageName || nextStage.what || '')
          : 'Final stage reached';
        const explanation = nextStage
          ? `You are at: ${stageLabel} → Next: ${nextLabel}`
          : `You match the final stage: ${stageLabel}`;

        return {
          _id: cp._id,
          title: cp.title,
          category: cp.category,
          description: cp.description,
          score: parseFloat(score.toFixed(4)),
          finalScore: parseFloat(score.toFixed(4)),
          stages,
          transitions: cp.transitions || [],
          onetSkills: cp.onetSkills || [],
          lifeStages,
          nextStages: lifeStages.filter(Boolean),
          matchedStageIndex,
          matchedStage,
          nextStage,
          matchedSkills: [...new Set(matched)],
          explanation,
          submitterBackground: cp.submitterBackground || 'N/A',
          submitterEconomicStatus: cp.submitterEconomicStatus || 'N/A',
        };
      })
      .filter(Boolean);

    return {
      count: results.length,
      results,
      ids: careerPaths.map((career) => career._id.toString()),
      searchFields,
    };
  }

  async getGraphStats() {
    const session = getSession();
    try {
      const result = await session.run(
        `OPTIONAL MATCH (n:CpNode) WITH count(n) AS nodes
         OPTIONAL MATCH ()-[e:CP_EDGE]->() WITH nodes, count(e) AS edges
         OPTIONAL MATCH (n:CpNode) WITH nodes, edges, reduce(s=0, x IN collect(n.ids) | s + size(x)) AS pathRefs
         RETURN nodes, edges, pathRefs`
      );
      const r = result.records[0];
      const nodes = r?.get('nodes')?.toNumber?.() ?? 0;
      const edges = r?.get('edges')?.toNumber?.() ?? 0;
      return { nodes, edges, careerPaths: cachedGraph ? new Set([...cachedGraph.nodes.values()].flatMap((n) => [...n.ids])).size : 0 };
    } finally {
      await session.close();
    }
  }

  async removeCareerPathFromGraph() {
    cachedGraph = null;
    await this.rebuildGraph();
  }
}

module.exports = new CareerGraphService();
module.exports.FIELD_ORDER = FIELD_ORDER;
module.exports.buildGraphFromPersons = buildGraphFromPersons;
module.exports.searchGraph = searchGraph;
module.exports.rankResults = rankResults;
module.exports.simField = simField;
