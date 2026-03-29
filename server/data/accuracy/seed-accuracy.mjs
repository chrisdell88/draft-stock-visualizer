/**
 * seed-accuracy.mjs
 * Seeds analyst_accuracy_scores from scraped CSV files (THR + FantasyPros + WalterFootball)
 * Run: node server/data/accuracy/seed-accuracy.mjs
 *
 * SITE NATIVE SCORING SCALES:
 *   thr:    0–96  (1pt = right player in R1; 2pts = right player + right team)
 *   fp:     0–320 (4 sub-categories × 32 picks; max 10pts/pick)
 *   wf:     0–32  (correct player+team matches out of 32 picks)
 *   nflmdd: 0–100 (% accuracy; bonuses for exact team+pos+player combos)
 *
 * Z-SCORE NORMALIZATION (X Score):
 *   For each site × year group: z = (score - mean) / stddev
 *   X Score = average z-score across all sites where analyst has data
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set. Run with dotenv.');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function parseTSV(filepath) {
  if (!fs.existsSync(filepath)) return null;
  const lines = fs.readFileSync(filepath, 'utf8').trim().split('\n');
  const headers = lines[0].split('\t');
  return lines.slice(1).map(line => {
    const vals = line.split('\t');
    return Object.fromEntries(headers.map((h, i) => [h, vals[i]]));
  });
}

function parseCSV(filepath) {
  if (!fs.existsSync(filepath)) return null;
  const lines = fs.readFileSync(filepath, 'utf8').trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    return Object.fromEntries(headers.map((h, i) => [h.trim(), vals[i]?.trim()]));
  });
}

// Normalize analyst name: "Jason Boris - Times News /" → { name: "Jason Boris", outlet: "Times News" }
function parseAnalystName(raw) {
  const clean = raw.replace(/\s*[\/\\*]+\s*$/, '').trim();
  const dashIdx = clean.lastIndexOf(' - ');
  if (dashIdx === -1) return { name: clean, outlet: '' };
  return { name: clean.substring(0, dashIdx).trim(), outlet: clean.substring(dashIdx + 3).trim() };
}

// Get or create analyst record, return id
async function upsertAnalyst(client, name, outlet) {
  const existing = await client.query(
    'SELECT id FROM analysts WHERE LOWER(name) = LOWER($1) LIMIT 1', [name]
  );
  if (existing.rows.length) return existing.rows[0].id;
  const inserted = await client.query(
    'INSERT INTO analysts (name, outlet, enabled, board_type) VALUES ($1, $2, 1, $3) RETURNING id',
    [name, outlet, 'mock']
  );
  return inserted.rows[0].id;
}

async function upsertScore(client, analystId, site, year, rawScore, siteRank, notes = null) {
  await client.query(`
    INSERT INTO analyst_accuracy_scores (analyst_id, site, year, raw_score, site_rank, notes)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (analyst_id, site, year) DO UPDATE
      SET raw_score = EXCLUDED.raw_score,
          site_rank = EXCLUDED.site_rank,
          notes = EXCLUDED.notes
  `, [analystId, site, year, rawScore ?? null, siteRank ?? null, notes]);
}

// ─── Z-SCORE COMPUTATION ─────────────────────────────────────────────────────

async function computeZScores(client) {
  console.log('\nComputing z-scores per site × year...');
  const groups = await client.query(`
    SELECT site, year,
           AVG(raw_score::numeric) as mean,
           STDDEV(raw_score::numeric) as stddev,
           COUNT(*) as n
    FROM analyst_accuracy_scores
    WHERE raw_score IS NOT NULL
    GROUP BY site, year
    ORDER BY site, year
  `);

  for (const g of groups.rows) {
    if (!g.stddev || parseFloat(g.stddev) === 0) continue;
    await client.query(`
      UPDATE analyst_accuracy_scores
      SET z_score = ROUND(((raw_score::numeric - $1) / $2)::numeric, 4)
      WHERE site = $3 AND year = $4 AND raw_score IS NOT NULL
    `, [g.mean, g.stddev, g.site, g.year]);
    console.log(`  ${g.site} ${g.year}: n=${g.n}, mean=${parseFloat(g.mean).toFixed(1)}, σ=${parseFloat(g.stddev).toFixed(1)}`);
  }
}

// Compute composite X Score for each analyst (avg z across all site-years)
async function computeXScores(client) {
  console.log('\nComputing X Scores (composite avg z-score)...');
  await client.query(`
    UPDATE analysts a
    SET
      x_score = sub.avg_z,
      x_score_sites_count = sub.site_count,
      x_score_last_updated = NOW()
    FROM (
      SELECT
        analyst_id,
        ROUND(AVG(z_score)::numeric, 4) as avg_z,
        COUNT(DISTINCT site || year::text) as site_count
      FROM analyst_accuracy_scores
      WHERE z_score IS NOT NULL
      GROUP BY analyst_id
    ) sub
    WHERE a.id = sub.analyst_id
  `);

  // Rank analysts by X Score
  await client.query(`
    UPDATE analysts a
    SET x_score_rank = sub.rnk
    FROM (
      SELECT id, RANK() OVER (ORDER BY x_score DESC NULLS LAST) as rnk
      FROM analysts WHERE x_score IS NOT NULL
    ) sub
    WHERE a.id = sub.id
  `);

  const top = await client.query(`
    SELECT name, outlet, x_score, x_score_rank, x_score_sites_count
    FROM analysts WHERE x_score IS NOT NULL
    ORDER BY x_score DESC LIMIT 20
  `);
  console.log('\n=== TOP 20 BY X SCORE ===');
  top.rows.forEach(r => console.log(`  #${r.x_score_rank} ${r.name} (${r.outlet}) — X: ${r.x_score} [${r.x_score_sites_count} site-years]`));
}

// ─── SEED THR DATA ────────────────────────────────────────────────────────────

async function seedTHR(client) {
  console.log('\n--- Seeding THR 5-year data ---');
  const data = parseCSV(path.join(__dirname, 'thr-5year.csv'));
  if (!data) { console.log('SKIP: thr-5year.csv not found'); return; }

  let count = 0;
  for (const row of data) {
    const { name, outlet } = parseAnalystName(row['2025 KING of the HILL'] || '');
    if (!name) continue;
    const analystId = await upsertAnalyst(client, name, outlet);

    const yearMap = { 2025: row['25'], 2024: row['24'], 2023: row['23'], 2022: row['22'], 2021: row['21'] };
    const rank5yr = parseInt(row['RANK']);

    for (const [year, scoreStr] of Object.entries(yearMap)) {
      const score = parseFloat(scoreStr);
      if (!isNaN(score) && score > 0) {
        await upsertScore(client, analystId, 'thr', parseInt(year), score, null);
        count++;
      }
    }
    // Store 5-year avg in huddle_score_5_year
    const avg5yr = parseFloat(row['5 YR']);
    if (!isNaN(avg5yr)) {
      await client.query(
        'UPDATE analysts SET huddle_score_5_year = $1 WHERE id = $2',
        [avg5yr, analystId]
      );
    }
  }
  console.log(`  Inserted ${count} THR score rows`);
}

// ─── SEED FANTASYPROS DATA ────────────────────────────────────────────────────

async function seedFantasyPros(client) {
  console.log('\n--- Seeding FantasyPros data ---');
  let total = 0;
  for (const year of [2021, 2022, 2023, 2024, 2025]) {
    const data = parseTSV(path.join(__dirname, `fp-${year}.tsv`));
    if (!data) { console.log(`  SKIP: fp-${year}.tsv not found`); continue; }
    let count = 0;
    for (const row of data) {
      const raw = row['Analyst'] || '';
      const { name, outlet } = parseAnalystName(raw);
      if (!name) continue;
      const totalScore = parseFloat(row['Total']);
      const rank = parseInt(row['Rank']);
      if (isNaN(totalScore)) continue;
      const analystId = await upsertAnalyst(client, name, outlet);
      await upsertScore(client, analystId, 'fp', year, totalScore, rank);
      count++;
    }
    console.log(`  ${year}: ${count} rows`);
    total += count;
  }
  console.log(`  Total FP rows: ${total}`);
}

// ─── SEED WALTERFOOTBALL 2025 ─────────────────────────────────────────────────
// Hardcoded from confirmed scraped data (WalterFootball plain HTML)
// Scale: 0–32 correct player+team matches out of 32 picks

async function seedWalterFootball(client) {
  console.log('\n--- Seeding WalterFootball 2025 ---');
  const wf2025 = [
    { rank: 1,  name: 'Jacob Camenker',       outlet: 'USA Today',           score: 10 },
    { rank: 1,  name: 'Todd McShay',           outlet: 'The McShay Report',   score: 10 },
    { rank: 3,  name: 'Charlie Campbell',      outlet: 'Walter Football',     score: 9  },
    { rank: 3,  name: 'Walter Cherepinsky',    outlet: 'Walter Football',     score: 9  },
    { rank: 3,  name: 'Danny Kelly',           outlet: 'The Ringer',          score: 9  },
    { rank: 3,  name: 'Matt Miller',           outlet: 'ESPN',                score: 9  },
    { rank: 3,  name: 'Josh Norris',           outlet: 'Underdog Fantasy',    score: 9  },
    { rank: 3,  name: 'Pete Prisco',           outlet: 'CBS Sports',          score: 9  },
    { rank: 9,  name: 'Jonathan Jones',        outlet: 'CBS Sports',          score: 8  },
    { rank: 9,  name: 'Trevor Sikkema',        outlet: 'PFF',                 score: 8  },
    { rank: 9,  name: 'Ben Wasley',            outlet: 'The Fantasy First Down', score: 8 },
    { rank: 12, name: 'Albert Breer',          outlet: 'Sports Illustrated',  score: 7  },
    { rank: 12, name: 'Daniel Jeremiah',       outlet: 'NFL Network',         score: 7  },
    { rank: 12, name: 'Peter Schrager',        outlet: 'NFL Network',         score: 7  },
    { rank: 12, name: 'Matt Youmans',          outlet: 'VSIN',                score: 7  },
    { rank: 16, name: 'Dane Brugler',          outlet: 'The Athletic',        score: 6  },
    { rank: 16, name: 'Eric Edholm',           outlet: 'NFL.com',             score: 6  },
    { rank: 16, name: 'Tony Pauline',          outlet: 'Pro Football Network',score: 6  },
    { rank: 16, name: 'Chad Reuter',           outlet: 'NFL.com',             score: 6  },
    { rank: 16, name: 'R.J. White',            outlet: 'CBS Sports',          score: 6  },
    { rank: 21, name: 'Bucky Brooks',          outlet: 'NFL.com',             score: 5  },
    { rank: 21, name: 'Mike Florio',           outlet: 'ProFootballTalk',     score: 5  },
    { rank: 21, name: 'Jason La Canfora',      outlet: 'Washington Post',     score: 5  },
    { rank: 21, name: 'Ryan Wilson',           outlet: 'CBS Sports',          score: 5  },
    { rank: 21, name: 'Lance Zierlein',        outlet: 'NFL.com',             score: 5  },
    { rank: 26, name: 'Cris Collinsworth',     outlet: 'PFF',                 score: 4  },
    { rank: 26, name: 'Charles Davis',         outlet: 'NFL.com',             score: 4  },
    { rank: 26, name: 'Shane Hallam',          outlet: 'Draft Sharks',        score: 4  },
    { rank: 26, name: 'Jimmy Kempski',         outlet: 'Philly Voice',        score: 4  },
    { rank: 26, name: 'Thor Nystrom',          outlet: 'Fantasy Life',        score: 4  },
    { rank: 26, name: 'Evan Silva',            outlet: 'Establish The Run',   score: 4  },
    { rank: 32, name: 'Mel Kiper Jr.',         outlet: 'ESPN',                score: 3  },
    { rank: 32, name: 'Rob Rang',              outlet: 'Fox Sports',          score: 3  },
    { rank: 32, name: 'Chris Trapasso',        outlet: 'CBS Sports',          score: 3  },
  ];

  let count = 0;
  for (const entry of wf2025) {
    const analystId = await upsertAnalyst(client, entry.name, entry.outlet);
    await upsertScore(client, analystId, 'wf', 2025, entry.score, entry.rank);
    count++;
  }
  console.log(`  WalterFootball 2025: ${count} rows`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await seedTHR(client);
  await seedFantasyPros(client);
  await seedWalterFootball(client);
  await computeZScores(client);
  await computeXScores(client);
  await client.query('COMMIT');
  console.log('\n✓ Seed complete.');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('SEED FAILED:', err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
