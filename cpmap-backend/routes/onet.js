/**
 * O*NET API proxy routes
 * ─────────────────────
 * Exposes a thin proxy so the frontend can query O*NET occupations
 * without embedding the API key in client code.
 *
 * Routes:
 *   GET /api/onet/occupations          – paginated list of all occupations
 *   GET /api/onet/occupations/search   – keyword search (?keyword=lawyer)
 */

const express = require('express');
const https   = require('https');
const router  = express.Router();
const protect = require('../middleware/auth');

const ONET_BASE = 'api-v2.onetcenter.org';
const API_KEY   = process.env.ONET_API_KEY;

/**
 * Perform a GET request to the O*NET Web Services API.
 * @param {string} path  – e.g. '/online/occupations?keyword=lawyer'
 * @returns {Promise<object>} parsed JSON body
 */
function onetGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: ONET_BASE,
      path,
      method:  'GET',
      headers: {
        'X-API-Key': API_KEY,
        'Accept':    'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`O*NET responded with ${res.statusCode}: ${raw}`));
        }
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(new Error('Failed to parse O*NET response'));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('O*NET request timed out'));
    });
    req.end();
  });
}

// ─── GET /api/onet/occupations ────────────────────────────────────────────────
// Returns a paginated list of all O*NET occupations.
// Query params: start (default 1), end (default 100)
router.get('/occupations', protect, async (req, res) => {
  try {
    const start = parseInt(req.query.start, 10) || 1;
    const end   = parseInt(req.query.end,   10) || 100;
    const path  = `/online/occupations?language=EN&start=${start}&end=${end}`;
    const data  = await onetGet(path);

    const occupations = (data.occupation || []).map((o) => ({
      code:  o.code,
      title: o.title,
    }));

    res.json({
      total:       data.total       || occupations.length,
      start:       data.start       || start,
      end:         data.end         || end,
      occupations,
    });
  } catch (err) {
    console.error('O*NET occupations error:', err.message);
    res.status(502).json({ message: 'Failed to fetch occupations from O*NET.', error: err.message });
  }
});

// ─── GET /api/onet/occupations/search ────────────────────────────────────────
// Keyword search against O*NET occupations.
// Query params: keyword (required)
router.get('/occupations/search', protect, async (req, res) => {
  const { keyword } = req.query;
  if (!keyword || !keyword.trim()) {
    return res.status(400).json({ message: 'keyword query parameter is required.' });
  }

  try {
    const encoded = encodeURIComponent(keyword.trim());
    const path    = `/online/occupations?language=EN&keyword=${encoded}`;
    const data    = await onetGet(path);

    const occupations = (data.occupation || []).map((o) => ({
      code:  o.code,
      title: o.title,
    }));

    res.json({ keyword, count: occupations.length, occupations });
  } catch (err) {
    console.error('O*NET search error:', err.message);
    res.status(502).json({ message: 'Failed to search O*NET occupations.', error: err.message });
  }
});

module.exports = router;
