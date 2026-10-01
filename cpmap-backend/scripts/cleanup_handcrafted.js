/**
 * Cleanup: Remove all non-biography career paths
 * Keeps only the 250 biography-derived paths (those with a wikidataId).
 * Run: node scripts/cleanup_handcrafted.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose   = require('mongoose');
const CareerPath = require('../models/CareerPath');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const before = await CareerPath.countDocuments();

  // Delete anything without a real wikidataId
  const result = await CareerPath.deleteMany({
    $or: [
      { wikidataId: { $exists: false } },
      { wikidataId: null },
      { wikidataId: '' },
    ],
  });

  const after = await CareerPath.countDocuments();

  console.log(`Deleted ${result.deletedCount} paths`);
  console.log(`Before: ${before}  →  After: ${after}`);

  // Final state
  const approved  = await CareerPath.countDocuments({ status: 'approved' });
  const withOnet  = await CareerPath.countDocuments({ 'onetSkills.0': { $exists: true } });
  const categories = await CareerPath.aggregate([
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort:  { count: -1 } },
  ]);
  console.log('\n── Final DB State ──────────────────────────────');
  console.log(`Total:    ${after}`);
  console.log(`Approved: ${approved}`);
  console.log(`With O*NET skills: ${withOnet}`);
  console.log('\nCategories:');
  categories.forEach(c => console.log(`  ${c._id}: ${c.count}`));

  await mongoose.disconnect();
  process.exit(0);
}).catch(err => { console.error(err.message); process.exit(1); });
