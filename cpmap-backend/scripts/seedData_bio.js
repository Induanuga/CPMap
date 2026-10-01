/**
 * Phase 2: Biography Career Paths Seeder
 * ========================================
 * Seeds the 250 career paths generated from the labeled biography dataset
 * into MongoDB. Also approves all original hand-crafted seeded paths.
 *
 * Run: node scripts/seedData_bio.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose   = require('mongoose');
const path       = require('path');
const fs         = require('fs');
const CareerPath = require('../models/CareerPath');

const MONGO_URI      = process.env.MONGO_URI || 'mongodb://localhost:27017/cpmap';
const GENERATED_JSON = path.join(__dirname, 'generated_career_paths.json');

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // ── Step 1: Approve all existing hand-crafted seeded paths ──────────────
    const approveResult = await CareerPath.updateMany(
      { isSeeded: true, status: { $ne: 'approved' } },
      { $set: { status: 'approved' } }
    );
    console.log(`✅ Approved ${approveResult.modifiedCount} existing seeded paths`);

    // ── Step 2: Load generated career paths JSON ─────────────────────────────
    if (!fs.existsSync(GENERATED_JSON)) {
      console.error(`❌ Generated JSON not found at: ${GENERATED_JSON}`);
      console.error('   Run: python3 scripts/pipeline_build_career_paths.py first');
      process.exit(1);
    }

    const generatedPaths = JSON.parse(fs.readFileSync(GENERATED_JSON, 'utf-8'));
    console.log(`📖 Loaded ${generatedPaths.length} generated career paths from JSON`);

    // ── Step 3: Upsert each generated career path ────────────────────────────
    let inserted = 0;
    let updated  = 0;
    let errors   = 0;

    for (const cp of generatedPaths) {
      try {
        // Use wikidataId as the unique key to avoid duplicates across runs
        const filter = { wikidataId: cp.wikidataId, isSeeded: true };

        // Strip the wikidataId field from update body (it's in the filter)
        const { wikidataId, ...cpData } = cp;

        const existing = await CareerPath.findOne(filter);
        if (existing) {
          await CareerPath.findByIdAndUpdate(
            existing._id,
            { ...cpData, wikidataId, status: 'approved' },
            { new: true, runValidators: true }
          );
          updated++;
        } else {
          await CareerPath.create({ ...cpData, wikidataId, status: 'approved' });
          inserted++;
        }
      } catch (err) {
        errors++;
        console.error(`  ❌ Error seeding "${cp.title}": ${err.message}`);
      }
    }

    console.log(`\n── Seeding Summary ─────────────────────────────────────`);
    console.log(`   Inserted: ${inserted}`);
    console.log(`   Updated:  ${updated}`);
    console.log(`   Errors:   ${errors}`);

    // ── Step 4: Verification ─────────────────────────────────────────────────
    const totalApproved = await CareerPath.countDocuments({ status: 'approved' });
    const totalSeeded   = await CareerPath.countDocuments({ isSeeded: true });
    const bioSeeded     = await CareerPath.countDocuments({ isSeeded: true, wikidataId: { $ne: '' } });

    console.log(`\n── Database State ──────────────────────────────────────`);
    console.log(`   Total approved paths: ${totalApproved}`);
    console.log(`   Total seeded paths:   ${totalSeeded}`);
    console.log(`   Bio-generated paths:  ${bioSeeded}`);
    console.log(`   (${totalSeeded - bioSeeded} hand-crafted + ${bioSeeded} biography-derived)`);

    await mongoose.disconnect();
    console.log('\n✅ Done. MongoDB disconnected.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Fatal seed error:', err.message);
    process.exit(1);
  }
}

seed();
