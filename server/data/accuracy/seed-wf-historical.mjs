// Seed WalterFootball 2021-2024 accuracy data (scraped from mockdraftresults2024.php)
// Scale: correct player+team matches out of 32 picks
import pg from 'pg';
const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const WF_DATA = {
  2024: [
    { rank: 1,  name: 'Charlie Campbell',    outlet: 'Walter Football',      score: 13 },
    { rank: 2,  name: 'Peter Schrager',       outlet: 'NFL Network',          score: 11 },
    { rank: 2,  name: 'Ben Wasley',           outlet: 'The Fantasy First Down',score: 11 },
    { rank: 4,  name: 'Jacob Camenker',       outlet: 'USA Today',            score: 10 },
    { rank: 5,  name: 'Albert Breer',         outlet: 'Sports Illustrated',   score: 9  },
    { rank: 5,  name: 'Bucky Brooks',         outlet: 'NFL.com',              score: 9  },
    { rank: 5,  name: 'Jason La Canfora',     outlet: 'Washington Post',      score: 9  },
    { rank: 8,  name: 'Charles Davis',        outlet: 'NFL.com',              score: 8  },
    { rank: 8,  name: 'Daniel Jeremiah',      outlet: 'NFL Network',          score: 8  },
    { rank: 8,  name: 'Matt Miller',          outlet: 'ESPN',                 score: 8  },
    { rank: 8,  name: 'Trevor Sikkema',       outlet: 'PFF',                  score: 8  },
    { rank: 8,  name: 'Lance Zierlein',       outlet: 'NFL.com',              score: 8  },
    { rank: 13, name: 'Dane Brugler',         outlet: 'The Athletic',         score: 7  },
    { rank: 13, name: 'Walter Cherepinsky',   outlet: 'Walter Football',      score: 7  },
    { rank: 13, name: 'Eric Edholm',          outlet: 'NFL.com',              score: 7  },
    { rank: 13, name: 'Tony Pauline',         outlet: 'Pro Football Network', score: 7  },
    { rank: 13, name: 'Ryan Wilson',          outlet: 'CBS Sports',           score: 7  },
    { rank: 18, name: 'Mike Florio',          outlet: 'ProFootballTalk',      score: 6  },
    { rank: 18, name: 'Jimmy Kempski',        outlet: 'Philly Voice',         score: 6  },
    { rank: 18, name: 'Josh Norris',          outlet: 'Underdog Fantasy',     score: 6  },
    { rank: 18, name: 'Chad Reuter',          outlet: 'NFL.com',              score: 6  },
    { rank: 18, name: 'Rob Rang',             outlet: 'Fox Sports',           score: 6  },
    { rank: 23, name: 'Cris Collinsworth',    outlet: 'PFF',                  score: 5  },
    { rank: 23, name: 'Pete Prisco',          outlet: 'CBS Sports',           score: 5  },
    { rank: 23, name: 'Thor Nystrom',         outlet: 'Fantasy Life',         score: 5  },
    { rank: 23, name: 'Chris Trapasso',       outlet: 'CBS Sports',           score: 5  },
    { rank: 23, name: 'Matt Youmans',         outlet: 'VSIN',                 score: 5  },
    { rank: 28, name: 'Will Brinson',         outlet: 'CBS Sports',           score: 4  },
    { rank: 28, name: 'Kyle Crabbs',          outlet: 'The 33rd Team',        score: 4  },
    { rank: 28, name: 'Shane Hallam',         outlet: 'Draft Sharks',         score: 4  },
    { rank: 28, name: 'R.J. White',           outlet: 'CBS Sports',           score: 4  },
  ],
  2023: [
    { rank: 1,  name: 'Walter Cherepinsky',   outlet: 'Walter Football',      score: 8  },
    { rank: 1,  name: 'Daniel Jeremiah',      outlet: 'NFL Network',          score: 8  },
    { rank: 3,  name: 'Jacob Camenker',       outlet: 'USA Today',            score: 7  },
    { rank: 3,  name: 'Charlie Campbell',     outlet: 'Walter Football',      score: 7  },
    { rank: 3,  name: 'Lance Zierlein',       outlet: 'NFL.com',              score: 7  },
    { rank: 6,  name: 'Shane Hallam',         outlet: 'Draft Sharks',         score: 6  },
    { rank: 6,  name: 'Todd McShay',          outlet: 'ESPN',                 score: 6  },
    { rank: 6,  name: 'Trevor Sikkema',       outlet: 'PFF',                  score: 6  },
    { rank: 9,  name: 'Dane Brugler',         outlet: 'The Athletic',         score: 5  },
    { rank: 9,  name: 'Cris Collinsworth',    outlet: 'PFF',                  score: 5  },
    { rank: 9,  name: 'Charles Davis',        outlet: 'NFL.com',              score: 5  },
    { rank: 9,  name: 'Josh Norris',          outlet: 'Underdog Fantasy',     score: 5  },
    { rank: 9,  name: 'Pete Prisco',          outlet: 'CBS Sports',           score: 5  },
    { rank: 9,  name: 'R.J. White',           outlet: 'CBS Sports',           score: 5  },
    { rank: 9,  name: 'Ryan Wilson',          outlet: 'CBS Sports',           score: 5  },
    { rank: 16, name: 'Kyle Crabbs',          outlet: 'The 33rd Team',        score: 4  },
    { rank: 16, name: 'Jason La Canfora',     outlet: 'Washington Post',      score: 4  },
    { rank: 16, name: 'Jimmy Kempski',        outlet: 'Philly Voice',         score: 4  },
    { rank: 16, name: 'Tony Pauline',         outlet: 'Pro Football Network', score: 4  },
    { rank: 16, name: 'Rob Rang',             outlet: 'Fox Sports',           score: 4  },
    { rank: 21, name: 'Albert Breer',         outlet: 'Sports Illustrated',   score: 3  },
    { rank: 21, name: 'Will Brinson',         outlet: 'CBS Sports',           score: 3  },
    { rank: 21, name: 'Mike Florio',          outlet: 'ProFootballTalk',      score: 3  },
    { rank: 21, name: 'Matt Miller',          outlet: 'ESPN',                 score: 3  },
    { rank: 21, name: 'Thor Nystrom',         outlet: 'Fantasy Life',         score: 3  },
    { rank: 21, name: 'Peter Schrager',       outlet: 'NFL Network',          score: 3  },
    { rank: 21, name: 'Evan Silva',           outlet: 'Establish The Run',    score: 3  },
    { rank: 21, name: 'Chris Trapasso',       outlet: 'CBS Sports',           score: 3  },
    { rank: 21, name: 'Matt Youmans',         outlet: 'VSIN',                 score: 3  },
    { rank: 30, name: 'Eric Edholm',          outlet: 'NFL.com',              score: 2  },
    { rank: 30, name: 'Mel Kiper Jr.',        outlet: 'ESPN',                 score: 2  },
    { rank: 30, name: 'Chad Reuter',          outlet: 'NFL.com',              score: 2  },
    { rank: 33, name: 'Bucky Brooks',         outlet: 'NFL.com',              score: 1  },
  ],
  2022: [
    { rank: 1,  name: 'Charlie Campbell',     outlet: 'Walter Football',      score: 11 },
    { rank: 2,  name: 'Eric Edholm',          outlet: 'NFL.com',              score: 10 },
    { rank: 3,  name: 'Dane Brugler',         outlet: 'The Athletic',         score: 9  },
    { rank: 3,  name: 'Matt Youmans',         outlet: 'VSIN',                 score: 9  },
    { rank: 5,  name: 'Albert Breer',         outlet: 'Sports Illustrated',   score: 8  },
    { rank: 5,  name: 'Walter Cherepinsky',   outlet: 'Walter Football',      score: 8  },
    { rank: 5,  name: 'Daniel Jeremiah',      outlet: 'NFL Network',          score: 8  },
    { rank: 5,  name: 'Thor Nystrom',         outlet: 'Fantasy Life',         score: 8  },
    { rank: 5,  name: 'R.J. White',           outlet: 'CBS Sports',           score: 8  },
    { rank: 10, name: 'Jacob Camenker',       outlet: 'USA Today',            score: 7  },
    { rank: 10, name: 'Jimmy Kempski',        outlet: 'Philly Voice',         score: 7  },
    { rank: 10, name: 'Mel Kiper Jr.',        outlet: 'ESPN',                 score: 7  },
    { rank: 13, name: 'Kyle Crabbs',          outlet: 'The 33rd Team',        score: 6  },
    { rank: 13, name: 'Charles Davis',        outlet: 'NFL.com',              score: 6  },
    { rank: 13, name: 'Shane Hallam',         outlet: 'Draft Sharks',         score: 6  },
    { rank: 13, name: 'Jason La Canfora',     outlet: 'Washington Post',      score: 6  },
    { rank: 13, name: 'Tony Pauline',         outlet: 'Pro Football Network', score: 6  },
    { rank: 13, name: 'Peter Schrager',       outlet: 'NFL Network',          score: 6  },
    { rank: 13, name: 'Chris Trapasso',       outlet: 'CBS Sports',           score: 6  },
    { rank: 13, name: 'Ryan Wilson',          outlet: 'CBS Sports',           score: 6  },
    { rank: 13, name: 'Lance Zierlein',       outlet: 'NFL.com',              score: 6  },
    { rank: 22, name: 'Jon Ledyard',          outlet: 'The Draft Network',    score: 5  },
    { rank: 22, name: 'Todd McShay',          outlet: 'ESPN',                 score: 5  },
    { rank: 22, name: 'Josh Norris',          outlet: 'Underdog Fantasy',     score: 5  },
    { rank: 22, name: 'Evan Silva',           outlet: 'Establish The Run',    score: 5  },
    { rank: 26, name: 'Will Brinson',         outlet: 'CBS Sports',           score: 4  },
    { rank: 26, name: 'Bucky Brooks',         outlet: 'NFL.com',              score: 4  },
    { rank: 26, name: 'Cris Collinsworth',    outlet: 'PFF',                  score: 4  },
    { rank: 26, name: 'Mike Florio',          outlet: 'ProFootballTalk',      score: 4  },
    { rank: 26, name: 'Pete Prisco',          outlet: 'CBS Sports',           score: 4  },
    { rank: 26, name: 'Rob Rang',             outlet: 'Fox Sports',           score: 4  },
    { rank: 26, name: 'Trevor Sikkema',       outlet: 'PFF',                  score: 4  },
    { rank: 33, name: 'Chad Reuter',          outlet: 'NFL.com',              score: 3  },
    { rank: 34, name: 'Matt Miller',          outlet: 'ESPN',                 score: 1  },
  ],
  2021: [
    { rank: 1,  name: 'Josh Norris',          outlet: 'Underdog Fantasy',     score: 15 },
    { rank: 2,  name: 'Charlie Campbell',     outlet: 'Walter Football',      score: 13 },
    { rank: 2,  name: 'Dane Brugler',         outlet: 'The Athletic',         score: 13 },
    { rank: 4,  name: 'Trevor Sikkema',       outlet: 'PFF',                  score: 12 },
    { rank: 4,  name: 'Ryan Wilson',          outlet: 'CBS Sports',           score: 12 },
    { rank: 6,  name: 'Jacob Camenker',       outlet: 'USA Today',            score: 11 },
    { rank: 6,  name: 'Walter Cherepinsky',   outlet: 'Walter Football',      score: 11 },
    { rank: 6,  name: 'Charles Davis',        outlet: 'NFL.com',              score: 11 },
    { rank: 6,  name: 'Evan Silva',           outlet: 'Establish The Run',    score: 11 },
    { rank: 10, name: 'Todd McShay',          outlet: 'ESPN',                 score: 10 },
    { rank: 10, name: 'Chris Trapasso',       outlet: 'CBS Sports',           score: 10 },
    { rank: 10, name: 'R.J. White',           outlet: 'CBS Sports',           score: 10 },
    { rank: 13, name: 'Albert Breer',         outlet: 'Sports Illustrated',   score: 9  },
    { rank: 13, name: 'Kyle Crabbs',          outlet: 'The 33rd Team',        score: 9  },
    { rank: 13, name: 'Lance Zierlein',       outlet: 'NFL.com',              score: 9  },
    { rank: 16, name: 'Jon Ledyard',          outlet: 'The Draft Network',    score: 8  },
    { rank: 17, name: 'Will Brinson',         outlet: 'CBS Sports',           score: 7  },
    { rank: 17, name: 'Mel Kiper Jr.',        outlet: 'ESPN',                 score: 7  },
    { rank: 17, name: 'Jason La Canfora',     outlet: 'Washington Post',      score: 7  },
    { rank: 17, name: 'Joe Marino',           outlet: 'The Draft Network',    score: 7  },
    { rank: 17, name: 'Pete Prisco',          outlet: 'CBS Sports',           score: 7  },
    { rank: 22, name: 'Daniel Jeremiah',      outlet: 'NFL Network',          score: 6  },
    { rank: 22, name: 'Tony Pauline',         outlet: 'Pro Football Network', score: 6  },
    { rank: 24, name: 'Bucky Brooks',         outlet: 'NFL.com',              score: 5  },
    { rank: 24, name: 'Thor Nystrom',         outlet: 'Fantasy Life',         score: 5  },
    { rank: 24, name: 'Rob Rang',             outlet: 'Fox Sports',           score: 5  },
    { rank: 24, name: 'Chad Reuter',          outlet: 'NFL.com',              score: 5  },
    { rank: 24, name: 'Peter Schrager',       outlet: 'NFL Network',          score: 5  },
    { rank: 29, name: 'Cris Collinsworth',    outlet: 'PFF',                  score: 4  },
    { rank: 29, name: 'Mike Florio',          outlet: 'ProFootballTalk',      score: 4  },
  ],
};

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

async function upsertScore(client, analystId, site, year, rawScore, siteRank) {
  await client.query(`
    INSERT INTO analyst_accuracy_scores (analyst_id, site, year, raw_score, site_rank)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (analyst_id, site, year) DO UPDATE
      SET raw_score = EXCLUDED.raw_score, site_rank = EXCLUDED.site_rank
  `, [analystId, site, year, rawScore, siteRank]);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  let total = 0;
  for (const [year, entries] of Object.entries(WF_DATA)) {
    for (const e of entries) {
      const id = await upsertAnalyst(client, e.name, e.outlet);
      await upsertScore(client, id, 'wf', parseInt(year), e.score, e.rank);
      total++;
    }
    console.log(`WF ${year}: ${entries.length} rows`);
  }

  // Recompute z-scores for wf site
  const groups = await client.query(`
    SELECT site, year, AVG(raw_score::numeric) as mean, STDDEV(raw_score::numeric) as stddev
    FROM analyst_accuracy_scores WHERE site = 'wf' GROUP BY site, year
  `);
  for (const g of groups.rows) {
    if (!g.stddev || parseFloat(g.stddev) === 0) continue;
    await client.query(`
      UPDATE analyst_accuracy_scores
      SET z_score = ROUND(((raw_score::numeric - $1) / $2)::numeric, 4)
      WHERE site = $3 AND year = $4 AND raw_score IS NOT NULL
    `, [g.mean, g.stddev, g.site, g.year]);
    console.log(`  z-scores: wf ${g.year} mean=${parseFloat(g.mean).toFixed(1)} σ=${parseFloat(g.stddev).toFixed(1)}`);
  }

  // Recompute X Scores
  await client.query(`
    UPDATE analysts a SET
      x_score = sub.avg_z,
      x_score_sites_count = sub.n,
      x_score_last_updated = NOW()
    FROM (
      SELECT analyst_id,
        ROUND(AVG(z_score)::numeric, 4) as avg_z,
        COUNT(DISTINCT site || year::text) as n
      FROM analyst_accuracy_scores WHERE z_score IS NOT NULL
      GROUP BY analyst_id
    ) sub WHERE a.id = sub.analyst_id
  `);
  await client.query(`
    UPDATE analysts a SET x_score_rank = sub.rnk
    FROM (SELECT id, RANK() OVER (ORDER BY x_score DESC NULLS LAST) as rnk FROM analysts WHERE x_score IS NOT NULL) sub
    WHERE a.id = sub.id
  `);

  await client.query('COMMIT');

  const top = await client.query(`
    SELECT name, outlet, x_score, x_score_rank, x_score_sites_count as yrs
    FROM analysts WHERE x_score IS NOT NULL AND x_score_sites_count >= 2
    ORDER BY x_score DESC LIMIT 20
  `);
  console.log('\n=== UPDATED TOP 20 (min 2 site-years) ===');
  top.rows.forEach(r => console.log(`  #${r.x_score_rank} ${r.name} (${r.outlet}) X=${r.x_score} [${r.yrs} yrs]`));
  console.log(`\nTotal rows inserted: ${total}`);
} catch(err) {
  await client.query('ROLLBACK');
  console.error('FAILED:', err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
