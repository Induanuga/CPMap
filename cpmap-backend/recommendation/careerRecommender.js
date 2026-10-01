/**
 * Career Recommendation Engine — Stage-Based Matching
 * =====================================================
 * Core idea:
 *   Instead of comparing the user's profile against the career path as a whole,
 *   we compare the user's current state against EACH STAGE of EACH career path.
 *
 *   The stage with the highest match tells us WHERE the user currently is.
 *   The NEXT stage tells them where to go next.
 *
 * User inputs:
 *   - education       : their current qualification  e.g. "B.Tech Computer Science"
 *   - skills          : skills they have now          e.g. ["Java", "Problem Solving"]
 *   - currentRole     : their current role/situation  e.g. "Fresher", "Junior Developer"
 *   - background      : Rural / Urban / Semi-Urban
 *   - economicStatus  : Poor / Middle / Rich
 *
 * Per stage scoring:
 *   50% education match  (semantic: user education vs stage's what+where)
 *   50% skills match     (semantic + O*NET: user skills vs stage's skills)
 *
 * Career path score = best stage score across all stages
 * Returns top 5 career paths, each annotated with:
 *   - matchedStageIndex : which stage the user is currently at
 *   - matchedStage      : the stage object they match
 *   - nextStage         : the stage they should aim for next
 */

const {
  generateEmbedding,
  cosineSimilarity,
  calculateSkillsSimilarity,
  calculateOnetSkillSimilarity,
  findMatchedSkills,
  findMatchedOnetSkills,
} = require('./similarityEngine');

// ── ML Model Weights & Scoring Constants (NFR 7.5) ─────────────────────────────
const WEIGHT_EDUCATION_MATCH    = 0.50;
const WEIGHT_SKILLS_MATCH       = 0.50;
const NEUTRAL_SKILL_SCORE        = 0.3;
const HAS_NEXT_STAGE_MULTIPLIER = 1.0;
const FINAL_STAGE_MULTIPLIER    = 0.85;

// ── Stage text builder ────────────────────────────────────────────────────────
// Combine all meaningful text from a stage into one string for embedding

function stageToText(stage) {
  const parts = [
    stage.what   || '',
    stage.where  || '',
    stage.field  || '',
    stage.stageName || '',
    ...(stage.skills || []),
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

// ── User state text builder ───────────────────────────────────────────────────

function userStateText(userInput) {
  const parts = [
    userInput.education    || '',
    userInput.currentRole  || '',
    ...(userInput.skills   || []),
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

// ── Score one stage against the user ─────────────────────────────────────────

async function scoreStageAgainstUser(stage, userInput) {
  // 1. Education / qualification match
  //    Compare user's education + currentRole text with stage's what + where + field
  let eduScore = 0;
  const stageText = stageToText(stage);
  const userText  = userStateText(userInput);

  if (stageText && userText) {
    try {
      const stageEmb = await generateEmbedding(stageText);
      const userEmb  = await generateEmbedding(userText);
      eduScore = cosineSimilarity(stageEmb, userEmb);
    } catch {
      eduScore = 0;
    }
  }

  // 2. Skills match
  //    Compare user skills against skills listed for this stage
  let skillScore = 0;
  const stageSkills = stage.skills || [];
  const userSkills  = userInput.skills || [];

  if (userSkills.length > 0 && stageSkills.length > 0) {
    // Semantic similarity between user skills and stage skills
    skillScore = await calculateSkillsSimilarity(userSkills, stageSkills);
  } else if (userSkills.length === 0 || stageSkills.length === 0) {
    // If no skills on one side, neutral score
    skillScore = NEUTRAL_SKILL_SCORE;
  }

  // Combined stage score using named constants (NFR 7.5)
  return (WEIGHT_EDUCATION_MATCH * eduScore) + (WEIGHT_SKILLS_MATCH * skillScore);
}

// ── Main recommender ──────────────────────────────────────────────────────────

async function recommendCareersPaths(userInput, careerPaths) {
  try {
    const scored = [];

    for (const career of careerPaths) {
      const stages = career.stages || [];
      if (stages.length === 0) continue;

      // Score every stage in this career path against the user
      const stageScores = [];
      for (let i = 0; i < stages.length; i++) {
        const s = await scoreStageAgainstUser(stages[i], userInput);
        stageScores.push(s);
      }

      // The matched stage = highest scoring stage
      let matchedIdx = 0;
      let bestScore  = 0;
      for (let i = 0; i < stageScores.length; i++) {
        if (stageScores[i] > bestScore) {
          bestScore  = stageScores[i];
          matchedIdx = i;
        }
      }

      const matchedStage = stages[matchedIdx];
      const nextStage    = stages[matchedIdx + 1] || null;   // null if already at last stage

      // Overall career path score = best stage match using named constants (NFR 7.5)
      const pathScore = bestScore * (nextStage ? HAS_NEXT_STAGE_MULTIPLIER : FINAL_STAGE_MULTIPLIER);

      // Matched skills across all stages (for display)
      const allStageSkills = stages.flatMap(s => s.skills || []);
      const matched = [
        ...findMatchedSkills(userInput.skills || [], allStageSkills),
        ...findMatchedOnetSkills(userInput.skills || [], career.onetSkills || []),
      ];
      const uniqueMatched = [...new Set(matched)];

      // Explanation
      const stageLabel = matchedStage.stageName || matchedStage.what || '';
      const nextLabel  = nextStage
        ? (nextStage.stageName || nextStage.what || '')
        : 'Final stage reached';

      const explanation = nextStage
        ? `You are at: ${stageLabel} → Next: ${nextLabel}`
        : `You match the final stage: ${stageLabel}`;

      scored.push({
        _id:               career._id,
        title:             career.title,
        category:          career.category,
        description:       career.description,
        stages,
        transitions:       career.transitions || [],
        onetSkills:        career.onetSkills  || [],
        finalScore:        parseFloat(pathScore.toFixed(4)),
        stageScores:       stageScores.map(s => parseFloat(s.toFixed(4))),
        matchedStageIndex: matchedIdx,
        matchedStage,
        nextStage,
        matchedSkills:     uniqueMatched,
        explanation,
        submitterBackground:     career.submitterBackground,
        submitterEconomicStatus: career.submitterEconomicStatus,
      });
    }

    // Sort by path score descending, return top 5
    scored.sort((a, b) => b.finalScore - a.finalScore);
    const top5 = scored.slice(0, 5);

    return {
      success: true,
      count:   top5.length,
      results: top5,
      message: `Found ${top5.length} matching career paths`,
    };
  } catch (err) {
    console.error('Recommendation error:', err.message);
    return { success: false, error: err.message, results: [] };
  }
}

module.exports = {
  recommendCareersPaths,
  WEIGHT_EDUCATION_MATCH,
  WEIGHT_SKILLS_MATCH,
  NEUTRAL_SKILL_SCORE,
  HAS_NEXT_STAGE_MULTIPLIER,
  FINAL_STAGE_MULTIPLIER,
};
