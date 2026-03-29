/**
 * seed-nflmdd.mjs — Seeds NFLMDD historical accuracy scores (2021-2024)
 * Source: nflmockdraftdatabase.com page 1 (top 27 per year)
 * Methodology: per-submission scoring; use best score per analyst per year.
 * Run: node --env-file=.env server/data/accuracy/seed-nflmdd.mjs
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const data = JSON.parse(readFileSync(path.join(__dirname, 'nflmdd-historical.json'), 'utf8'));

// Name normalization for matching to DB
function normName(s) {
  return s.toLowerCase().replace(/[^a-z ]/g, '').trim();
}

// Group entries by analyst name, take best score per year
function bestByAnalyst(entries) {
  const map = new Map();
  for (const e of entries) {
    const key = normName(e.name);
    if (!map.has(key) || e.score > map.get(key).score) {
      map.set(key, e);
    }
  }
  return Array.from(map.values());
}

// Find analyst in DB by name (fuzzy)
async function findAnalyst(name) {
  const norm = normName(name);
  const words = norm.split(' ').filter(w => w.length > 2);
  if (words.length === 0) return null;

  // Try exact match first
  const exact = await pool.query(
    `SELECT id, name FROM analysts WHERE LOWER(REGEXP_REPLACE(name, '[^a-zA-Z ]', '', 'g')) = $1 LIMIT 1`,
    [norm]
  );
  if (exact.rows.length > 0) return exact.rows[0];

  // Try last name + first name word match
  const lastName = words[words.length - 1];
  const firstName = words[0];
  const partial = await pool.query(
    `SELECT id, name FROM analysts
     WHERE LOWER(name) LIKE $1 AND LOWER(name) LIKE $2 LIMIT 1`,
    [`%${lastName}%`, `%${firstName}%`]
  );
  if (partial.rows.length > 0) return partial.rows[0];

  // Last name only
  const byLast = await pool.query(
    `SELECT id, name FROM analysts WHERE LOWER(name) LIKE $1 LIMIT 1`,
    [`%${lastName}%`]
  );
  if (byLast.rows.length > 0) return byLast.rows[0];

  return null;
}

async function main() {
  const years = [2021, 2022, 2023, 2024];
  let totalInserted = 0;
  let notFound = [];

  for (const year of years) {
    const entries = data[String(year)] || [];
    const best = bestByAnalyst(entries.filter(e => e.name !== 'Staff'));

    console.log(`\n=== ${year}: ${best.length} unique analysts ===`);

    const yearScores = [];

    for (const entry of best) {
      const analyst = await findAnalyst(entry.name);
      if (!analyst) {
        notFound.push(`${year}: ${entry.name} (${entry.outlet}) ${entry.score}%`);
        continue;
      }
      yearScores.push({ analystId: analyst.id, name: analyst.name, score: entry.score });
    }

    if (yearScores.length === 0) continue;

    // Compute z-scores for this year's group
    const scores = yearScores.map(s => s.score);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / scores.length;
    const stddev = Math.sqrt(variance);
    console.log(`  z-scores: mean=${mean.toFixed(2)} σ=${stddev.toFixed(2)}`);

    for (const s of yearScores) {
      const zScore = stddev > 0 ? Math.round(((s.score - mean) / stddev) * 10000) / 10000 : 0;

      await pool.query(`
        INSERT INTO analyst_accuracy_scores (analyst_id, site, year, raw_score, z_score, notes)
        VALUES ($1, 'nflmdd', $2, $3, $4, 'Best score from page 1; per-submission site')
        ON CONFLICT (analyst_id, site, year) DO UPDATE
          SET raw_score = EXCLUDED.raw_score, z_score = EXCLUDED.z_score
      `, [s.analystId, year, s.score, zScore]);

      totalInserted++;
      console.log(`  #${yearScores.indexOf(s)+1} ${s.name}: ${s.score}% z=${zScore.toFixed(3)}`);
    }
  }

  console.log(`\n=== INSERTED ${totalInserted} NFLMDD rows ===`);

  if (notFound.length > 0) {
    console.log('\nNot found in DB:');
    notFound.forEach(n => console.log(' ', n));
  }

  // Recompute X Scores for all affected analysts
  console.log('\nRecomputing X Scores...');
  const affected = await pool.query(
    `SELECT DISTINCT analyst_id FROM analyst_accuracy_scores WHERE site = 'nflmdd'`
  );

  for (const { analyst_id } of affected.rows) {
    const res = await pool.query(
      `SELECT AVG(z_score)::numeric as avg_z, COUNT(*) as n
       FROM analyst_accuracy_scores WHERE analyst_id = $1 AND z_score IS NOT NULL`,
      [analyst_id]
    );
    const { avg_z, n } = res.rows[0];
    if (avg_z !== null) {
      await pool.query(
        `UPDATE analysts SET x_score = ROUND($1, 4), x_score_sites_count = $2, x_score_last_updated = NOW() WHERE id = $3`,
        [avg_z, n, analyst_id]
      );
    }
  }

  // Fix ranks — only qualified analysts (>=2 site-years)
  await pool.query(`
    UPDATE analysts a
    SET x_score_rank = ranked.rn
    FROM (
      SELECT id, RANK() OVER (ORDER BY x_score DESC) as rn
      FROM analysts
      WHERE x_score IS NOT NULL AND x_score_sites_count >= 2
    ) ranked
    WHERE a.id = ranked.id
  `);

  // Print top 15
  const top = await pool.query(`
    SELECT name, outlet, x_score, x_score_rank, x_score_sites_count
    FROM analysts WHERE x_score IS NOT NULL AND x_score_sites_count >= 2
    ORDER BY x_score DESC LIMIT 15
  `);
  console.log('\n=== UPDATED TOP 15 ===');
  for (const r of top.rows) {
    console.log(`  #${r.x_score_rank} ${r.name} (${r.outlet}) X=${r.x_score} [${r.x_score_sites_count} yrs]`);
  }

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
