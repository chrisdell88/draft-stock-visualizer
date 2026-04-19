/**
 * seed-nflmdd-full.mjs — Seed MDDB accuracy scores from full scrape (nflmdd-full.json).
 *
 * Replaces seed-nflmdd.mjs for the full-data import. Differences:
 *   - Reads nflmdd-full.json (produced by scrape-nflmdd-all.mjs)
 *   - Auto-creates missing analysts instead of dropping them (uses upsertAnalyst pattern)
 *   - Dedupes by author.name (lowercased, punctuation-stripped), keeps best score per year
 *   - Filters out generic "Staff" entries
 *   - Computes z-scores per year and recomputes X Scores at the end
 *
 * Run: node server/data/accuracy/seed-nflmdd-full.mjs
 */
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set. Run with dotenv.');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const INPUT_FILE = path.join(__dirname, 'nflmdd-full.json');
const SITE = 'nflmdd';

function normName(s) {
  return (s || '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
}

function parseScore(s) {
  if (typeof s === 'number') return s;
  const m = String(s || '').match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

async function upsertAnalyst(client, name, outlet) {
  const existing = await client.query(
    `SELECT id FROM analysts
     WHERE LOWER(REGEXP_REPLACE(name, '[^a-zA-Z ]', '', 'g')) = LOWER(REGEXP_REPLACE($1, '[^a-zA-Z ]', '', 'g'))
     LIMIT 1`,
    [name]
  );
  if (existing.rows.length) return existing.rows[0].id;
  const inserted = await client.query(
    `INSERT INTO analysts (name, outlet, enabled, board_type) VALUES ($1, $2, 1, 'mock') RETURNING id`,
    [name, outlet || '']
  );
  return inserted.rows[0].id;
}

async function upsertScore(client, analystId, year, score, rank, notes) {
  await client.query(
    `INSERT INTO analyst_accuracy_scores (analyst_id, site, year, raw_score, site_rank, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (analyst_id, site, year) DO UPDATE
       SET raw_score = EXCLUDED.raw_score,
           site_rank = EXCLUDED.site_rank,
           notes = EXCLUDED.notes`,
    [analystId, SITE, year, score, rank, notes]
  );
}

async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`${INPUT_FILE} not found. Run scrape-nflmdd-all.mjs first.`);
  }
  const data = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Wipe existing nflmdd rows so stale data is gone
    const deleted = await client.query(`DELETE FROM analyst_accuracy_scores WHERE site = $1`, [SITE]);
    console.log(`Deleted ${deleted.rowCount} existing nflmdd rows`);

    const years = Object.keys(data).map(Number).filter((y) => !isNaN(y)).sort();
    let totalInserted = 0;
    let totalCreated = 0;

    for (const year of years) {
      const submissions = data[year] || [];
      const byAnalyst = new Map();

      for (const s of submissions) {
        const authorName = (s.author?.name || '').trim();
        if (!authorName) continue;
        if (/^staff$/i.test(authorName)) continue;

        const key = normName(authorName);
        const score = parseScore(s.completion_percentage);
        if (score == null) continue;

        const outlet = (s.name || '').trim();
        const current = byAnalyst.get(key);
        if (!current || score > current.score) {
          byAnalyst.set(key, { name: authorName, outlet, score, place: s.completion_place });
        }
      }

      const scores = [...byAnalyst.values()].map((e) => e.score);
      const mean = scores.reduce((a, b) => a + b, 0) / (scores.length || 1);
      const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / (scores.length || 1);
      const stddev = Math.sqrt(variance);
      console.log(`\n=== ${year}: ${byAnalyst.size} unique analysts (from ${submissions.length} submissions) ===`);
      console.log(`  score distribution: mean=${mean.toFixed(2)} σ=${stddev.toFixed(2)}`);

      const ranked = [...byAnalyst.values()].sort((a, b) => b.score - a.score);
      let rank = 0;
      let prevScore = null;
      let tieCount = 0;

      for (let i = 0; i < ranked.length; i++) {
        const e = ranked[i];
        if (e.score !== prevScore) {
          rank = i + 1;
          prevScore = e.score;
          tieCount = 0;
        } else {
          tieCount++;
        }

        const existingCount = await client.query(
          `SELECT COUNT(*)::int as n FROM analysts WHERE LOWER(REGEXP_REPLACE(name, '[^a-zA-Z ]', '', 'g')) = LOWER(REGEXP_REPLACE($1, '[^a-zA-Z ]', '', 'g'))`,
          [e.name]
        );
        const wasNew = existingCount.rows[0].n === 0;
        const analystId = await upsertAnalyst(client, e.name, e.outlet);
        if (wasNew) totalCreated++;

        await upsertScore(client, analystId, year, e.score, rank, `Best score across ${submissions.filter(s => normName(s.author?.name) === normName(e.name)).length} submission(s)`);
        totalInserted++;
      }
    }

    // Z-score computation
    console.log('\nComputing z-scores per year...');
    const groups = await client.query(
      `SELECT year, AVG(raw_score) as mean, STDDEV(raw_score) as stddev, COUNT(*) as n
       FROM analyst_accuracy_scores WHERE site = $1 GROUP BY year ORDER BY year`,
      [SITE]
    );
    for (const g of groups.rows) {
      if (!g.stddev || parseFloat(g.stddev) === 0) continue;
      await client.query(
        `UPDATE analyst_accuracy_scores
         SET z_score = ROUND(((raw_score::numeric - $1) / $2)::numeric, 4)
         WHERE site = $3 AND year = $4`,
        [parseFloat(g.mean), parseFloat(g.stddev), SITE, g.year]
      );
      console.log(`  ${g.year}: mean=${parseFloat(g.mean).toFixed(2)} σ=${parseFloat(g.stddev).toFixed(2)} n=${g.n}`);
    }

    await client.query('COMMIT');
    console.log(`\n✓ Inserted ${totalInserted} nflmdd score rows (${totalCreated} new analysts created)`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('SEED FAILED:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
