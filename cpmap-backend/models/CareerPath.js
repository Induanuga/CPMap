const mongoose = require('mongoose');

const StageSchema = new mongoose.Schema({
  stageName:  { type: String, required: true },      // e.g., "10th Grade", "B.Tech CSE", "Software Engineer"

  // ── Structured fields (what / where / field / year) ────────────────────────
  stageType:  { type: String, default: '' },         // 'school' | 'undergraduate' | 'postgraduate' | 'training' | 'job' | 'senior_role'
  what:       { type: String, default: '' },         // qualification or role title  e.g. "B.Tech Computer Science", "Software Engineer"
  where:      { type: String, default: '' },         // institution or company        e.g. "IIT Hyderabad", "Wells Fargo"
  field:      { type: String, default: '' },         // subject / industry            e.g. "Computer Science", "Finance"
  year:       { type: String, default: '' },         // year or range                 e.g. "2010", "2010–2014"

  // ── Supporting fields ───────────────────────────────────────────────────────
  skills:     [{ type: String }],                    // skills gained at this stage
  suggestions:{ type: String, default: '' },         // advice for others at this stage

  // ── Legacy / collector-submitted fields (kept for backward compat) ─────────
  education:        { type: String, default: '' },
  experience:       { type: String, default: '' },
  livingConditions: { type: String, default: '' },
  helpReceived:     { type: String, default: '' },
  ageRange:         { type: String, default: '' },
});

const TransitionSchema = new mongoose.Schema({
  fromStage: { type: String, required: true },
  toStage: { type: String, required: true },
  optionsAvailable: [{ type: String }],               // alternatives that could have been taken
  reasonChosen: { type: String, default: '' },        // why this path was chosen
  mistakes: { type: String, default: '' },            // regrets / mistakes
  advice: { type: String, default: '' },              // advice for others at this transition
});

// ── O*NET Skill entry ─────────────────────────────────────────────────────────
const OnetSkillSchema = new mongoose.Schema({
  skillName:   { type: String, required: true },      // e.g., "Critical Thinking"
  onetCode:    { type: String, default: '' },         // e.g., "2.A.1.b"
  description: { type: String, default: '' },         // O*NET skill description
});

const CareerPathSchema = new mongoose.Schema(
  {
    // ════════════════════════════════════
    // CAREER INFORMATION (from form meta)
    // ════════════════════════════════════
    title: { type: String, required: true, trim: true },          // e.g., "Software Engineer"
    category: { type: String, required: true, trim: true },       // e.g., "Engineering & Tech"
    description: { type: String, default: '' },                    // Career overview/summary

    // ════════════════════════════════════
    // SUBMITTER PERSONAL INFO (from form personal section)
    // ════════════════════════════════════
    submitterName: { type: String, default: '' },                  // Name of person sharing path
    submitterEmail: { type: String, default: '' },                 // Contact email
    submitterGender: { type: String, default: '' },                // Male, Female, Non-binary, etc.
    submitterEducationHistory: { type: String, default: '' },      // e.g., "10th → 12th MPC → B.Tech CSE"
    submitterSkills: [{ type: String }],                           // All skills (comma-separated in form)
    submitterBackground: { type: String, default: '' },            // Rural, Urban, Semi-Urban, Tribal
    submitterEconomicStatus: { type: String, default: '' },        // Poor, Middle, Rich (childhood)

    // ════════════════════════════════════
    // JOURNEY STRUCTURE
    // ════════════════════════════════════
    stages: [StageSchema],                                         // Major stages of career journey
    transitions: [TransitionSchema],                               // Decision points between stages

    // ════════════════════════════════════
    // O*NET SKILLS (Phase 3)
    // ════════════════════════════════════
    onetSkills: [OnetSkillSchema],                                 // O*NET skill codes for this career
    wikidataId: { type: String, default: '' },                     // Wikidata ID (for seeded bio paths)

    // ════════════════════════════════════
    // METADATA
    // ════════════════════════════════════
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    isSeeded: { type: Boolean, default: false },                   // true for auto-seeded data
    seedKey: { type: String, default: '' },                        // unique key for dataset imports

    // Moderation
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    moderationNote: { type: String, default: '' },
    moderatorFeedback: { type: String, default: '' },  // Detailed feedback from moderator review
  },
  { timestamps: true }
);

// Text index for full-text search
CareerPathSchema.index({
  title: 'text',
  category: 'text',
  description: 'text',
});

module.exports = mongoose.model('CareerPath', CareerPathSchema);
