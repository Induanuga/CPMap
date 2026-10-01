const express = require('express');
const router = express.Router();
const careerGraphService = require('../services/careerGraphService');
const { protect, requireRole } = require('../middleware/auth');
const { isConnected, isAura } = require('../config/neo4j');
const { FIELD_ORDER } = require('../services/careerGraphService');

router.get('/health', (req, res) => {
  res.json({ neo4j: isConnected() ? 'connected' : 'disconnected', mode: isAura ? 'aura' : 'local' });
});

// CPMAP graph search: SEARCH + RANK (spec-compliant)
// Body: { query: { gender, education, skills, currentJob, ... }, fields?: [...], options?: { thresholds, weights } }
router.post('/search', async (req, res) => {
  try {
    const { query, fields, options } = req.body;
    if (!query || typeof query !== 'object') {
      return res.status(400).json({ error: 'query object is required' });
    }
    const result = await careerGraphService.cpmapSearch(query, fields, options || {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rebuild coalesced graph from all approved MongoDB career paths
router.post('/rebuild', protect, requireRole('admin'), async (req, res) => {
  try {
    const stats = await careerGraphService.rebuildGraph(req.body.options || {});
    res.json({ success: true, message: 'Graph rebuilt', stats });
  } catch (error) {
    if (error.message.includes('already in progress')) {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

router.post('/sync-all', protect, requireRole('admin'), async (req, res) => {
  try {
    const stats = await careerGraphService.rebuildGraph();
    res.json({ success: true, message: 'Sync complete', stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/field-order', (req, res) => {
  res.json({ fields: FIELD_ORDER });
});

router.get('/stats', protect, requireRole('admin', 'moderator'), async (req, res) => {
  try {
    const stats = await careerGraphService.getGraphStats();
    res.json({ stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
