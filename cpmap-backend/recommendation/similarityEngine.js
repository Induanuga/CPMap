/**
 * Similarity Engine — Phase 3 Enhanced
 * ======================================
 * Semantic similarity matching using all-MiniLM-L6-v2 embeddings.
 * Phase 3 adds O*NET skill code matching alongside semantic matching.
 */

let transformersModulePromise = null;
let embeddingPipeline = null;

// ── Embedding model loader ───────────────────────────────────────────────────

async function loadTransformersModule() {
  if (!transformersModulePromise) {
    transformersModulePromise = import('@xenova/transformers');
  }
  const { pipeline, env } = await transformersModulePromise;
  env.cacheDir = './model_cache';
  return { pipeline, env };
}

async function initializeModel() {
  if (!embeddingPipeline) {
    const { pipeline } = await loadTransformersModule();
    console.log('Loading sentence-transformers model...');
    embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('✓ Embedding model loaded successfully');
  }
  return embeddingPipeline;
}

async function generateEmbedding(text) {
  try {
    const model = await initializeModel();
    const output = await model(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  } catch (error) {
    console.error('Error generating embedding:', error.message);
    throw error;
  }
}

// ── Vector math ──────────────────────────────────────────────────────────────

function cosineSimilarity(vec1, vec2) {
  if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;

  let dot = 0, mag1 = 0, mag2 = 0;
  for (let i = 0; i < vec1.length; i++) {
    dot  += vec1[i] * vec2[i];
    mag1 += vec1[i] * vec1[i];
    mag2 += vec2[i] * vec2[i];
  }
  mag1 = Math.sqrt(mag1);
  mag2 = Math.sqrt(mag2);
  return (mag1 === 0 || mag2 === 0) ? 0 : dot / (mag1 * mag2);
}

// ── Query builder ────────────────────────────────────────────────────────────

function createQueryText(userInput) {
  const parts = [
    userInput.education      || '',
    (userInput.skills || []).join(' '),
    userInput.background     || '',
    userInput.economicStatus || '',
  ];
  return parts.filter(p => p).join(' ').toLowerCase();
}

// ── Skill similarity ─────────────────────────────────────────────────────────

/**
 * O*NET code-level match: exact code prefix matching (fast, no embedding needed).
 * Returns 0–1 based on fraction of user skill codes that share a top-level
 * O*NET category (e.g. "2.A.1") with any career skill code.
 */
function calculateOnetSkillSimilarity(userSkills, careerOnetSkills) {
  if (!userSkills || userSkills.length === 0) return 0;
  if (!careerOnetSkills || careerOnetSkills.length === 0) return 0;

  const careerSkillNames = careerOnetSkills.map(s =>
    (s.skillName || s).toLowerCase()
  );

  let matches = 0;
  for (const us of userSkills) {
    const uLower = us.toLowerCase();
    // Exact or substring match against O*NET skill names in career
    const hit = careerSkillNames.some(cs =>
      cs.includes(uLower) || uLower.includes(cs)
    );
    if (hit) matches++;
  }
  return matches / userSkills.length;
}

/**
 * Semantic skill similarity using embeddings.
 * For each user skill, find the best cosine match among career skills.
 */
async function calculateSkillsSimilarity(userSkills, careerSkills) {
  if (!userSkills || userSkills.length === 0 ||
      !careerSkills || careerSkills.length === 0) {
    return 0.5; // neutral score if no skills provided
  }

  try {
    let totalSimilarity = 0;

    for (const userSkill of userSkills) {
      const userEmbedding = await generateEmbedding(userSkill.toLowerCase());
      let bestMatch = 0;

      for (const careerSkill of careerSkills) {
        const careerEmbedding = await generateEmbedding(careerSkill.toLowerCase());
        const sim = cosineSimilarity(userEmbedding, careerEmbedding);
        if (sim > bestMatch) bestMatch = sim;
      }
      totalSimilarity += bestMatch;
    }

    return totalSimilarity / userSkills.length;
  } catch (error) {
    console.error('Error calculating skills similarity:', error.message);
    return 0.5;
  }
}

/**
 * Combined skill score: 70% semantic + 30% O*NET code match.
 */
async function calculateCombinedSkillsSimilarity(userSkills, careerSkills, careerOnetSkills) {
  const semanticScore = await calculateSkillsSimilarity(userSkills, careerSkills);
  const onetScore     = calculateOnetSkillSimilarity(userSkills, careerOnetSkills);

  // If O*NET skills are present, blend; otherwise use pure semantic
  if (careerOnetSkills && careerOnetSkills.length > 0) {
    return 0.70 * semanticScore + 0.30 * onetScore;
  }
  return semanticScore;
}

// ── Education similarity ─────────────────────────────────────────────────────

async function calculateEducationSimilarity(userEducation, careerEducationHistory) {
  if (!userEducation || !careerEducationHistory) return 0.5;

  try {
    const uEmb = await generateEmbedding(userEducation.toLowerCase());
    const cEmb = await generateEmbedding(careerEducationHistory.toLowerCase());
    return cosineSimilarity(uEmb, cEmb);
  } catch (error) {
    console.error('Error calculating education similarity:', error.message);
    return 0.5;
  }
}

// ── Background & economic similarity ────────────────────────────────────────

function calculateBackgroundSimilarity(userBackground, careerBackground) {
  if (!userBackground || !careerBackground) return 0.5;

  const uBg = userBackground.toLowerCase();
  const cBg = careerBackground.toLowerCase();
  if (uBg === cBg) return 1.0;

  const urbanTypes = ['urban', 'semi-urban'];
  const ruralTypes = ['rural', 'tribal'];

  const uUrban = urbanTypes.some(t => uBg.includes(t));
  const cUrban = urbanTypes.some(t => cBg.includes(t));
  const uRural = ruralTypes.some(t => uBg.includes(t));
  const cRural = ruralTypes.some(t => cBg.includes(t));

  if ((uUrban && cUrban) || (uRural && cRural)) return 0.8;
  if ((uUrban && cRural) || (uRural && cUrban)) return 0.4;
  return 0.5;
}

function calculateEconomicSimilarity(userEconomic, careerEconomic) {
  if (!userEconomic || !careerEconomic) return 0.5;

  const uEc = userEconomic.toLowerCase();
  const cEc = careerEconomic.toLowerCase();
  if (uEc === cEc) return 1.0;

  const dist = { 'middle-poor': 0.6, 'middle-rich': 0.6, 'poor-rich': 0.2 };
  const key  = [uEc, cEc].sort().join('-');
  return dist[key] || 0.3;
}

// ── Skill matching helpers ───────────────────────────────────────────────────

function findMatchedSkills(userSkills, careerSkills) {
  if (!userSkills || !careerSkills) return [];
  const userLower = userSkills.map(s => s.toLowerCase());
  return careerSkills.filter(cs => {
    const csLower = cs.toLowerCase();
    return userLower.some(us => us.includes(csLower) || csLower.includes(us));
  });
}

/**
 * Also look for O*NET skill name matches.
 */
function findMatchedOnetSkills(userSkills, careerOnetSkills) {
  if (!userSkills || !careerOnetSkills || careerOnetSkills.length === 0) return [];
  const userLower = userSkills.map(s => s.toLowerCase());
  return careerOnetSkills
    .filter(os => {
      const name = (os.skillName || os).toLowerCase();
      return userLower.some(us => us.includes(name) || name.includes(us));
    })
    .map(os => os.skillName || os);
}

// ── Explanation generator ────────────────────────────────────────────────────

function generateExplanation(semanticSim, skillsSim, eduSim, bgSim, ecSim, matchedSkills) {
  const parts = [];

  if (matchedSkills.length > 0) {
    parts.push(`Matched skills: ${matchedSkills.slice(0, 3).join(', ')}`);
  }

  if (skillsSim > 0.7) {
    parts.push('Strong skill alignment');
  } else if (skillsSim > 0.5) {
    parts.push('Moderate skill alignment');
  }

  if (eduSim > 0.7) {
    parts.push('Similar educational background');
  } else if (eduSim > 0.5) {
    parts.push('Some educational overlap');
  }

  if (bgSim > 0.7 && ecSim > 0.7) {
    parts.push('Similar background & economic conditions');
  }

  if (parts.length === 0) {
    parts.push('Broad career match based on your profile');
  }

  return parts.join(' · ');
}

module.exports = {
  initializeModel,
  warmupModel: async () => {
    try {
      await initializeModel();
      console.log('✓ Embedding model warmed up and cached');
    } catch (err) {
      console.warn('⚠️  Model warmup failed (will retry on first request):', err.message);
    }
  },
  generateEmbedding,
  cosineSimilarity,
  createQueryText,
  calculateSkillsSimilarity,
  calculateCombinedSkillsSimilarity,
  calculateOnetSkillSimilarity,
  calculateEducationSimilarity,
  calculateBackgroundSimilarity,
  calculateEconomicSimilarity,
  findMatchedSkills,
  findMatchedOnetSkills,
  generateExplanation,
};
