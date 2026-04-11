/**
 * Recompute X Scores with updated site weights.
 * Site weights: all = 1x, WF = 0.5x (no longer favoring THR/FP over each other)
 * Year weights: 2025=3, 2024=2, 2023=1.5, 2022=1, 2021=0.75
 * Qualification: must have at least 1 score from 2025
 */

import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SITE_W = { thr: 1, fp: 1, wf: 0.5, nflmdd: 1, thr_bigboard: 1 };
const YEAR_W = { 2025: 3, 2024: 2, 2023: 1.5, 2022: 1, 2021: 0.75 };

async function main() {
  const client = await pool.connect();
  try {
    // Pull all z-scores
    const { rows: scores } = await client.query(`
      SELECT analyst_id, site, year, z_score
      FROM analyst_accuracy_scores
      WHERE z_score IS NOT NULL
    `);

    // Group by analyst
    const byAnalyst = {};
    for (const row of scores) {
      if (!byAnalyst[row.analyst_id]) byAnalyst[row.analyst_id] = [];
      byAnalyst[row.analyst_id].push({
        site: row.site,
        year: Number(row.year),
        z: Number(row.z_score),
      });
    }

    // Compute weighted X-score per analyst
    const results = [];
    for (const [analystId, entries] of Object.entries(byAnalyst)) {
      const has2025 = entries.some(e => e.year === 2025);
      if (!has2025) continue; // must have 2025 to qualify

      let wSum = 0, wTotal = 0;
      for (const e of entries) {
        const sw = SITE_W[e.site] ?? 1;
        const yw = YEAR_W[e.year] ?? 1;
        const w = sw * yw;
        wSum += e.z * w;
        wTotal += w;
      }
      const xScore = wTotal > 0 ? Math.round((wSum / wTotal) * 10000) / 10000 : null;
      if (xScore !== null) {
        results.push({ analystId: Number(analystId), xScore, siteCount: entries.length });
      }
    }

    // Sort descending to assign ranks
    results.sort((a, b) => b.xScore - a.xScore);

    // Write to DB in a transaction
    await client.query('BEGIN');

    for (let i = 0; i < results.length; i++) {
      const { analystId, xScore, siteCount } = results[i];
      const rank = i + 1;
      await client.query(
        `UPDATE analysts SET x_score = $1, x_score_rank = $2, x_score_sites_count = $3, x_score_last_updated = NOW() WHERE id = $4`,
        [xScore, rank, siteCount, analystId]
      );
    }

    // Null out analysts who no longer qualify
    await client.query(`
      UPDATE analysts SET x_score = NULL, x_score_rank = NULL, x_score_last_updated = NOW()
      WHERE id NOT IN (${results.map(r => r.analystId).join(',')})
        AND x_score IS NOT NULL
    `);

    await client.query('COMMIT');

    console.log(`\n✓ Updated ${results.length} analysts\n`);
    console.log('=== TOP 20 ===');
    results.slice(0, 20).forEach((r, i) => {
      console.log(`  #${i + 1} analystId=${r.analystId} X=${r.xScore} [${r.siteCount} site-yrs]`);
    });

    // Show Chris Dell specifically
    const chris = results.find(r => r.analystId === 428);
    const chrisRank = results.findIndex(r => r.analystId === 428) + 1;
    if (chris) {
      console.log(`\n=== Chris Dell ===`);
      console.log(`  Rank: #${chrisRank} of ${results.length}`);
      console.log(`  X-Score: ${chris.xScore}`);
    }

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
