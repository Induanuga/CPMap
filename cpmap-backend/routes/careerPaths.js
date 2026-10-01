const express    = require('express');
const router     = express.Router();
const CareerPath = require('../models/CareerPath');
const User       = require('../models/User');
const protect    = require('../middleware/auth');
const { requireRole, optionalAuth } = require('../middleware/auth');
const { recommendCareersPaths } = require('../recommendation/careerRecommender');

// ─── GET /api/career-paths/search (protected) ────────────────
// Only searches APPROVED career paths (requires valid JWT per NFR 7.2)
router.get('/search', protect, async (req, res) => {
  try {
    const { education, skills, background, economic, currentRole } = req.query;

    const parseList = (val) =>
      val ? val.split(',').map((s) => s.trim()).filter(Boolean) : [];

    const userQuery = {
      education:      education    || '',
      currentRole:    currentRole  || '',   // e.g. "Fresher", "Junior Developer", "10th student"
      background:     background   || '',
      economicStatus: economic     || '',
      skills:         parseList(skills),
    };

    // Only approved paths are used for search
    const allCareers = await CareerPath.find({ status: 'approved' });
    if (allCareers.length === 0) {
      return res.json({ count: 0, results: [] });
    }

    const recommendationResult = await recommendCareersPaths(userQuery, allCareers);

    if (!recommendationResult.success) {
      return res.status(500).json({
        message: 'Error during semantic search',
        error: recommendationResult.error
      });
    }

    const results = recommendationResult.results.map((scored) => ({
      _id:               scored._id,
      title:             scored.title,
      category:          scored.category,
      description:       scored.description,
      stages:            scored.stages,
      transitions:       scored.transitions,
      onetSkills:        scored.onetSkills || [],
      finalScore:        scored.finalScore,
      stageScores:       scored.stageScores,
      matchedStageIndex: scored.matchedStageIndex,
      matchedStage:      scored.matchedStage,
      nextStage:         scored.nextStage,
      matchedSkills:     scored.matchedSkills,
      explanation:       scored.explanation,
    }));

    res.json({ count: results.length, results });
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ message: 'Server error during search.' });
  }
});

// ─── GET /api/career-paths (protected) – list approved paths ─────────────────
router.get('/', protect, async (req, res) => {
  try {
    const paths = await CareerPath.find({ status: 'approved' })
      .select('title category description targetEducation targetBackground')
      .limit(50);
    res.json(paths);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// ─── POST /api/career-paths/submit (user or collector) ───────────────────────
// Submitted paths start as 'pending' — awaiting moderator approval
router.post('/submit', protect, requireRole('user', 'collector', 'admin'), async (req, res) => {
  try {
    const {
      title, category, description,
      submitterName, submitterEmail, submitterGender,
      submitterEducationHistory, submitterSkills,
      submitterBackground, submitterEconomicStatus,
      stages, transitions,
    } = req.body;

    if (!title || !stages || stages.length === 0) {
      return res.status(400).json({ message: 'Title and at least one stage are required.' });
    }

    const careerPath = await CareerPath.create({
      title,
      category:                category               || 'Other',
      description,
      submitterName:           submitterName           || '',
      submitterEmail:          submitterEmail          || '',
      submitterGender:         submitterGender         || '',
      submitterEducationHistory: submitterEducationHistory || '',
      submitterSkills:         submitterSkills         || [],
      submitterBackground:     submitterBackground     || '',
      submitterEconomicStatus: submitterEconomicStatus || '',
      stages,
      transitions:             transitions             || [],
      submittedBy:             req.user.id,
      isSeeded:                false,
      status:                  'pending',
    });

    res.status(201).json({
      message: 'Career path submitted successfully. It will be visible after moderator approval.',
      careerPath: { id: careerPath._id, title: careerPath.title, status: careerPath.status },
    });
  } catch (err) {
    console.error('Submit error:', err.message);
    res.status(500).json({ message: 'Server error during submission.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// MODERATOR ROUTES
// ════════════════════════════════════════════════════════════════════════════

// GET /api/career-paths/moderation-queue — all paths for moderator review (all statuses)
// Supports ?status=pending|approved|rejected filter
router.get('/moderation-queue', protect, requireRole('moderator', 'admin'), async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status && ['pending', 'approved', 'rejected'].includes(status)
      ? { status }
      : {};
    const paths = await CareerPath.find(filter)
      .populate('submittedBy', 'name email role')
      .populate('moderatedBy', 'name email')
      .sort({ createdAt: -1 });
    res.json({ count: paths.length, paths });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// PATCH /api/career-paths/:id/moderate — approve or reject a path
router.patch('/:id/moderate', protect, requireRole('moderator', 'admin'), async (req, res) => {
  try {
    const { status, moderationNote, moderatorFeedback } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be "approved" or "rejected".' });
    }

    const updateData = {
      status,
      moderatedBy: req.user.id,
      moderationNote: moderationNote || '',
    };

    // If rejecting with feedback, save it
    if (status === 'rejected' && moderatorFeedback) {
      updateData.moderatorFeedback = moderatorFeedback;
    }

    const path = await CareerPath.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!path) return res.status(404).json({ message: 'Career path not found.' });

    // Sync to Neo4j graph on approval; remove on rejection
    if (status === 'approved') {
      const { syncAllToNeo4j } = require('../utils/neo4jSync');
      syncAllToNeo4j().catch((err) =>
        console.error('Neo4j rebuild failed after approval:', err.message)
      );
    } else if (status === 'rejected') {
      const { syncAllToNeo4j } = require('../utils/neo4jSync');
      syncAllToNeo4j().catch((err) =>
        console.error('Neo4j rebuild failed after rejection:', err.message)
      );
    }

    res.json({ message: `Career path ${status}.`, path: { id: path._id, title: path.title, status: path.status } });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ════════════════════════════════════════════════════════════════════════════

// GET /api/career-paths/admin/all — all paths regardless of status
router.get('/admin/all', protect, requireRole('admin'), async (req, res) => {
  try {
    const paths = await CareerPath.find({})
      .populate('submittedBy', 'name email role')
      .populate('moderatedBy', 'name email')
      .sort({ createdAt: -1 });
    res.json({ count: paths.length, paths });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/career-paths/admin/:id — delete any path
router.delete('/admin/:id', protect, requireRole('admin'), async (req, res) => {
  try {
    const path = await CareerPath.findByIdAndDelete(req.params.id);
    if (!path) return res.status(404).json({ message: 'Career path not found.' });

    const { syncAllToNeo4j } = require('../utils/neo4jSync');
    syncAllToNeo4j().catch((err) =>
      console.error('Neo4j rebuild failed after delete:', err.message)
    );

    res.json({ message: 'Career path deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/career-paths/admin/users — list all users
router.get('/admin/users', protect, requireRole('admin'), async (req, res) => {
  try {
    const users = await User.find({}).select('-password').sort({ createdAt: -1 });
    res.json({ count: users.length, users });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// PATCH /api/career-paths/admin/users/:id/role — change a user's role
router.patch('/admin/users/:id/role', protect, requireRole('admin'), async (req, res) => {
  try {
    const { role } = req.body;
    const VALID_ROLES = ['user', 'collector', 'moderator', 'admin'];
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ message: 'Invalid role.' });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ message: `Role updated to ${role}.`, user });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/career-paths/admin/users/:id — delete a user
router.delete('/admin/users/:id', protect, requireRole('admin'), async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ message: 'User deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// ─── GET /api/career-paths/submissions/my-submissions (user/collector/admin) ──────────────
// Fetch all submissions created by the logged-in user/collector with pagination
router.get('/submissions/my-submissions', protect, requireRole('user', 'collector', 'admin'), async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    // Get total count
    const totalCount = await CareerPath.countDocuments({ submittedBy: req.user.id });

    // Fetch paginated submissions
    const submissions = await CareerPath.find({ submittedBy: req.user.id })
      .populate('moderatedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      count: submissions.length,
      totalCount,
      page,
      totalPages,
      limit,
      submissions: submissions.map((sub) => ({
        _id: sub._id,
        title: sub.title,
        createdAt: sub.createdAt,
        status: sub.status,
        moderationNote: sub.moderationNote || '',
        moderatorFeedback: sub.moderatorFeedback || '',
        moderatedBy: sub.moderatedBy,
        category: sub.category,
      })),
    });
  } catch (err) {
    console.error('My submissions fetch error:', err.message);
    res.status(500).json({ message: 'Server error fetching submissions.' });
  }
});

// ─── GET /api/career-paths/:id ───────────────────────────────────
// Approved paths are publicly viewable; pending paths require staff or owner
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const path = await CareerPath.findById(req.params.id)
      .populate('submittedBy', 'name email role')
      .populate('moderatedBy', 'name email');

    if (!path) {
      return res.status(404).json({ message: 'Career path not found.' });
    }

    const userRole = req.user?.role;
    const userId = req.user?.id;

    const isApproved = path.status === 'approved';
    const isStaff = userRole && ['admin', 'moderator'].includes(userRole);
    const isOwner = userId && path.submittedBy && (
      path.submittedBy._id ? path.submittedBy._id.toString() === userId.toString() : path.submittedBy.toString() === userId.toString()
    );

    if (isApproved || isStaff || isOwner) {
      return res.json({ path });
    }

    return res.status(403).json({ message: 'Access denied to this career path.' });
  } catch (err) {
    console.error('Career path fetch error:', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
