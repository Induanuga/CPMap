/**
 * Seed all JSON datasets from /scripts into MongoDB and sync to Neo4j Aura.
 *
 * Usage (from cpmap-backend):
 *   node scripts/seedAllDatasets.js
 *   node scripts/seedAllDatasets.js --sync-only   # skip MongoDB insert, only sync to Neo4j
 */

require('dotenv').config();
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = require('crypto').webcrypto;
}
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const CareerPath = require('../models/CareerPath');
const { syncAllToNeo4j: syncAllToNeo4jFromUtil } = require('../utils/neo4jSync');
const { verifyConnectivity } = require('../config/neo4j');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cpmap';
const SCRIPTS_DIR = path.join(__dirname, '../../scripts');
const SYNC_ONLY = process.argv.includes('--sync-only');

const STAGE_TYPE_MAP = {
  0: 'job',
  1: 'school',
  2: 'undergraduate',
  3: 'postgraduate',
  4: 'job',
  school: 'school',
  undergraduate: 'undergraduate',
  postgraduate: 'postgraduate',
  job: 'job',
  training: 'training',
  Work: 'job',
  Intern: 'training',
};

const CATEGORY_KEYWORDS = [
  { keys: ['software', 'developer', 'engineer', 'tech', 'data scientist', 'it '], cat: 'Engineering & Tech' },
  { keys: ['doctor', 'medical', 'health', 'nurse'], cat: 'Healthcare' },
  { keys: ['author', 'writer', 'journalist'], cat: 'Arts & Media' },
  { keys: ['film', 'actor', 'director', 'music', 'musician'], cat: 'Arts & Media' },
  { keys: ['business', 'ceo', 'entrepreneur', 'manager'], cat: 'Business' },
  { keys: ['scientist', 'research', 'physics', 'space'], cat: 'Science & Research' },
  { keys: ['politician', 'president', 'minister'], cat: 'Public Service' },
  { keys: ['sport', 'athlete', 'player', 'cricket', 'basketball'], cat: 'Sports' },
  { keys: ['agriculture', 'farmer', 'farming'], cat: 'Agriculture' },
  { keys: ['student', 'teacher', 'education'], cat: 'Education' },
];

function inferCategory(text = '') {
  const lower = String(text).toLowerCase();
  for (const { keys, cat } of CATEGORY_KEYWORDS) {
    if (keys.some((k) => lower.includes(k))) return cat;
  }
  return 'Other';
}

function mapEconomicStatus(val = '') {
  const v = String(val).toLowerCase();
  if (v.includes('poor') || v.includes('low')) return 'Poor';
  if (v.includes('rich') || v.includes('upper')) return 'Rich';
  return 'Middle';
}

function extractSkillsFromStages(stages = []) {
  const skills = new Set();
  for (const s of stages) {
    for (const sk of s.skills || []) {
      if (typeof sk === 'string') skills.add(sk);
      else if (sk.skill) skills.add(sk.skill);
      else if (sk.skillName) skills.add(sk.skillName);
    }
  }
  return [...skills];
}

function buildEducationHistory(educations = []) {
  return educations
    .map((e) => e.degree?.degree || e.degree || e.qualification || e.institution || '')
    .filter(Boolean)
    .join(' → ');
}

function autoTransitions(stages = []) {
  const transitions = [];
  for (let i = 0; i < stages.length - 1; i++) {
    transitions.push({
      fromStage: stages[i].stageName,
      toStage: stages[i + 1].stageName,
      reasonChosen: stages[i + 1].suggestions || '',
      advice: stages[i + 1].suggestions || '',
    });
  }
  return transitions;
}

function mapCpDataEntry(entry, sourceFile) {
  const stages = (entry.stages || []).map((s, idx) => ({
    stageName: s.stageName || `Stage ${idx + 1}`,
    stageType: STAGE_TYPE_MAP[s.stageType] || String(s.stageType || 'job').toLowerCase(),
    what: s.stageName || '',
    where: entry.address || '',
    field: entry.currentOccupation || entry.background || '',
    year: s.from || s.to || '',
    skills: (s.skills || []).map((sk) => (typeof sk === 'string' ? sk : sk.skill)).filter(Boolean),
    suggestions: s.suggestions || s.learnings || '',
    education: (entry.education || [])[0]?.degree || (entry.education || [])[0]?.qualification || '',
    experience: s.learnings || '',
  }));

  if (stages.length === 0) return null;

  const title = entry.currentOccupation
    ? `${entry.currentOccupation} — ${entry.name}`
    : entry.name;

  return {
    title,
    category: inferCategory(`${entry.currentOccupation} ${entry.background}`),
    description: `Career path of ${entry.name}. Source: ${sourceFile}`,
    submitterName: entry.name || '',
    submitterEmail: entry.email || '',
    submitterGender: entry.gender || '',
    submitterEducationHistory: buildEducationHistory(entry.education || entry.educations || []),
    submitterSkills: extractSkillsFromStages(entry.stages),
    submitterBackground: entry.background || '',
    submitterEconomicStatus: mapEconomicStatus(entry.economicStatus),
    stages,
    transitions: autoTransitions(stages),
    isSeeded: true,
    status: 'approved',
    seedKey: `${sourceFile}:${entry.name}`,
  };
}

function mapBioEntry(entry, sourceFile) {
  const stages = (entry.stages || []).map((s, idx) => {
    const stageName = s.stageName
      || s.degree?.degree
      || s.job?.job
      || `Stage ${idx + 1}`;
    return {
      stageName,
      stageType: STAGE_TYPE_MAP[s.stageType] || 'job',
      what: s.degree?.degree || s.job?.job || stageName,
      where: s.college?.collegeName || entry.city?.name || entry.address || '',
      field: entry.currentOccupation || entry.background || '',
      year: '',
      skills: (s.skills || []).map((sk) => sk.skillName || sk.skill || sk).filter(Boolean),
      suggestions: s.suggestion || s.motivation || entry.advice || '',
      education: buildEducationHistory(entry.educations || entry.education || []),
      experience: s.experience || '',
    };
  });

  if (stages.length === 0) return null;

  const title = entry.currentOccupation
    ? `${entry.currentOccupation} — ${entry.name}`
    : entry.name;

  return {
    title,
    category: inferCategory(`${sourceFile} ${entry.currentOccupation} ${entry.background}`),
    description: entry.advice || `Biography career path of ${entry.name}. Source: ${sourceFile}`,
    submitterName: entry.name || '',
    submitterEmail: typeof entry.email === 'string' && entry.email.includes('@') ? entry.email : '',
    submitterGender: entry.gender || '',
    submitterEducationHistory: buildEducationHistory(entry.educations || entry.education || []),
    submitterSkills: extractSkillsFromStages(entry.stages),
    submitterBackground: typeof entry.background === 'string' ? entry.background : 'Urban',
    submitterEconomicStatus: mapEconomicStatus(entry.economicStatus),
    stages,
    transitions: autoTransitions(stages),
    isSeeded: true,
    status: 'approved',
    seedKey: `${sourceFile}:${entry.name}`,
  };
}

function mapGeneratedEntry(entry) {
  return {
    ...entry,
    isSeeded: true,
    status: 'approved',
    seedKey: entry.wikidataId ? `generated:${entry.wikidataId}` : `generated:${entry.title}`,
  };
}

function transformFile(filePath) {
  const sourceFile = path.basename(filePath);
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(raw)) return [];

  if (sourceFile === 'generated_career_paths.json') {
    return raw.map(mapGeneratedEntry).filter(Boolean);
  }

  const isBio = sourceFile.startsWith('bio_') || sourceFile === 'data.json' || sourceFile === 'data1.json';
  const mapper = isBio ? mapBioEntry : mapCpDataEntry;

  return raw.map((entry) => mapper(entry, sourceFile)).filter(Boolean);
}

function collectDatasetFiles() {
  const files = [];

  if (fs.existsSync(SCRIPTS_DIR)) {
    for (const f of fs.readdirSync(SCRIPTS_DIR)) {
      if (f.endsWith('.json')) files.push(path.join(SCRIPTS_DIR, f));
    }
  }

  const generated = path.join(__dirname, 'generated_career_paths.json');
  if (fs.existsSync(generated)) files.push(generated);

  return files.sort();
}

async function seedMongoDB(allEntries) {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const entry of allEntries) {
    const filter = entry.wikidataId
      ? { wikidataId: entry.wikidataId, isSeeded: true }
      : { seedKey: entry.seedKey };

    const { seedKey, ...data } = entry;
    const payload = seedKey ? { ...data, seedKey } : data;

    const existing = await CareerPath.findOne(filter);
    if (existing) {
      await CareerPath.findByIdAndUpdate(existing._id, payload, { runValidators: true });
      updated++;
    } else {
      await CareerPath.create(payload);
      inserted++;
    }
  }

  return { inserted, updated, skipped, total: allEntries.length };
}

async function syncAllToNeo4j() {
  return syncAllToNeo4jFromUtil();
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log(' CPMap — Seed All Datasets + Neo4j Sync');
  console.log('═══════════════════════════════════════════════════\n');

  await mongoose.connect(MONGO_URI);
  console.log('✅ MongoDB connected');

  const neo4jOk = await verifyConnectivity();
  if (!neo4jOk) {
    console.error('❌ Neo4j not connected — fix .env and retry');
    process.exit(1);
  }

  if (!SYNC_ONLY) {
    const files = collectDatasetFiles();
    console.log(`\n📂 Found ${files.length} dataset files:`);
    files.forEach((f) => console.log(`   • ${path.basename(f)}`));

    const allEntries = [];
    const seen = new Set();

    for (const file of files) {
      const entries = transformFile(file);
      let count = 0;
      for (const e of entries) {
        const key = e.seedKey || e.wikidataId || e.title;
        if (seen.has(key)) continue;
        seen.add(key);
        allEntries.push(e);
        count++;
      }
      console.log(`   ✓ ${path.basename(file)} → ${count} career paths`);
    }

    console.log(`\n📥 Seeding ${allEntries.length} unique career paths to MongoDB…`);
    const seedResult = await seedMongoDB(allEntries);
    console.log(`   Inserted: ${seedResult.inserted}`);
    console.log(`   Updated:  ${seedResult.updated}`);
  } else {
    console.log('\n⏭  Skipping MongoDB seed (--sync-only)');
  }

  const approvedCount = await CareerPath.countDocuments({ status: 'approved' });
  console.log(`\n🔄 Syncing ${approvedCount} approved paths to Neo4j Aura…`);

  const syncResult = await syncAllToNeo4j();
  console.log(`   Persons:  ${syncResult.persons}`);
  console.log(`   Nodes:    ${syncResult.nodes}`);
  console.log(`   Edges:    ${syncResult.edges}`);

  const careerGraphService = require('../services/careerGraphService');
  const stats = await careerGraphService.getGraphStats();
  console.log('\n📊 Neo4j Graph Stats:');
  console.log(`   Nodes:    ${stats.nodes}`);
  console.log(`   Edges:    ${stats.edges}`);

  console.log('\n✅ Done!\n');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
