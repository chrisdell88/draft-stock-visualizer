/**
 * scrape-nflmdb.js
 * Fetches NFLMDB pages using Googlebot UA (bypasses bot detection),
 * extracts data from data-react-props attribute (SSR JSON),
 * matches players, and inserts into the DB directly via pg.
 *
 * Usage: node script/scrape-nflmdb.cjs
 */

const https = require('https');
const { Pool } = require('pg');

const DB_URL = 'process.env.DATABASE_URL';

const SOURCES = [
  {
    sourceKey: 'fantasypros_freedman',
    displayName: 'FantasyLife (Matthew Freedman) Mock Draft',
    url: 'https://www.nflmockdraftdatabase.com/mock-drafts/2026/fantasy-life-2026-matthew-freedman?date=2026-03-13',
    boardType: 'mock',
  },
  {
    sourceKey: 'mcshay_report',
    displayName: 'Todd McShay Mock Draft',
    url: 'https://www.nflmockdraftdatabase.com/mock-drafts/2026/the-mcshay-report-2026-todd-mcshay?date=2026-02-09',
    boardType: 'mock',
  },
  {
    sourceKey: 'mddb_consensus',
    displayName: 'MDDB Consensus Mock Draft',
    url: 'https://www.nflmockdraftdatabase.com/mock-drafts/2026/consensus-mock-draft-2026',
    boardType: 'mock',
  },
  {
    sourceKey: 'mddb_bigboard',
    displayName: 'MDDB Consensus Big Board',
    // Note: bigboard lives at /big-boards/ path, not /mock-drafts/
    url: 'https://www.nflmockdraftdatabase.com/big-boards/2026/consensus-big-board-2026',
    boardType: 'bigboard',
  },
];

// Googlebot UA bypasses NFLMDB's bot detection redirect to /restricted
const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

function normalizeName(name) {
  return name.toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^a-z' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchPlayer(name, players) {
  const norm = normalizeName(name);
  let match = players.find(p => normalizeName(p.name) === norm);
  if (match) return match;
  const words = norm.split(' ').filter(Boolean);
  if (words.length >= 2) {
    const lastName = words[words.length - 1];
    const firstName = words[0];
    match = players.find(p => {
      const pWords = normalizeName(p.name).split(' ');
      return pWords[pWords.length - 1] === lastName && pWords[0].startsWith(firstName[0]);
    });
    if (match) return match;
  }
  match = players.find(p => normalizeName(p.name).includes(norm) || norm.includes(normalizeName(p.name)));
  return match;
}

function decodeHtmlEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': GOOGLEBOT_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    };

    const req = https.request(options, (res) => {
      // Handle redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        const location = res.headers['location'];
        if (location && location.includes('/restricted')) {
          reject(new Error(`Redirected to /restricted for URL: ${url}`));
          return;
        }
        if (location) {
          resolve(fetchUrl(location));
          return;
        }
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for URL: ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

function parseNflmdbPicks(html) {
  // Extract data-react-props attribute (SSR JSON embedded in page)
  const match = html.match(/data-react-props="([^"]+)"/);
  if (!match) {
    console.log('  No data-react-props found');
    return [];
  }

  const propsDecoded = decodeHtmlEntities(match[1]);
  let props;
  try {
    props = JSON.parse(propsDecoded);
  } catch (e) {
    console.log('  Failed to parse data-react-props JSON:', e.message);
    return [];
  }

  const mock = props.mock || {};
  const selections = mock.selections || [];

  const picks = selections
    .filter(s => s.pick && s.player && s.player.name)
    .map(s => ({
      pickNumber: Number(s.pick),
      playerName: String(s.player.name),
      position: s.player.position || '',
    }))
    .filter(p => p.pickNumber >= 1 && p.pickNumber <= 300);

  console.log(`  data-react-props strategy: found ${picks.length} picks`);
  return picks;
}

async function main() {
  const pool = new Pool({ connectionString: DB_URL });

  // Load all players from DB
  const { rows: players } = await pool.query('SELECT id, name, position, college FROM players ORDER BY id');
  console.log(`Loaded ${players.length} players from DB`);

  const today = new Date().toISOString().slice(0, 10);

  const results = [];

  for (const source of SOURCES) {
    console.log(`\n=== ${source.sourceKey} ===`);

    const minPicks = source.boardType === 'bigboard' ? 50 : 30;

    // Check if already scraped today with sufficient picks
    const existing = await pool.query(
      `SELECT md.id, count(mdp.id) AS pick_count
       FROM mock_drafts md
       LEFT JOIN mock_draft_picks mdp ON mdp.mock_draft_id = md.id
       WHERE md.source_key = $1 AND DATE(md.published_at) = $2
       GROUP BY md.id
       LIMIT 1`,
      [source.sourceKey, today]
    );
    if (existing.rows.length > 0 && parseInt(existing.rows[0].pick_count) >= minPicks) {
      console.log(`  Already scraped today with ${existing.rows[0].pick_count} picks (mock_draft id=${existing.rows[0].id}), skipping`);
      results.push({ sourceKey: source.sourceKey, status: 'already_exists', mockDraftId: existing.rows[0].id });
      continue;
    }
    // Delete any incomplete prior record
    if (existing.rows.length > 0) {
      const oldId = existing.rows[0].id;
      console.log(`  Deleting incomplete prior record id=${oldId} (only ${existing.rows[0].pick_count} picks)`);
      await pool.query('DELETE FROM mock_draft_picks WHERE mock_draft_id = $1', [oldId]);
      await pool.query('DELETE FROM mock_drafts WHERE id = $1', [oldId]);
    }

    try {
      console.log(`  Fetching: ${source.url}`);
      const html = await fetchUrl(source.url);
      console.log(`  Got ${html.length} bytes`);

      const picks = parseNflmdbPicks(html);
      if (picks.length === 0) {
        console.log(`  WARNING: No picks found for ${source.sourceKey}`);
        results.push({ sourceKey: source.sourceKey, status: 'no_picks', picksFound: 0 });
        continue;
      }

      // Get analyst id
      const analystRow = await pool.query(
        `SELECT id FROM analysts WHERE source_key = $1 LIMIT 1`,
        [source.sourceKey]
      );
      const analystId = analystRow.rows[0]?.id || null;

      // Insert mock_draft record
      const sourceName = `${source.displayName} — ${new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })}`;
      const mdResult = await pool.query(
        `INSERT INTO mock_drafts (source_name, source_key, analyst_id, url, board_type, published_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING id`,
        [sourceName, source.sourceKey, analystId, source.url, source.boardType]
      );
      const mockDraftId = mdResult.rows[0].id;
      console.log(`  Created mock_draft id=${mockDraftId}`);

      // Match players and insert picks
      const dbPicks = [];
      const unmatched = [];
      for (const { pickNumber, playerName } of picks) {
        const matched = matchPlayer(playerName, players);
        if (matched) {
          dbPicks.push({ mockDraftId, playerId: matched.id, pickNumber });
        } else {
          unmatched.push({ pickNumber, playerName });
        }
      }

      if (dbPicks.length > 0) {
        // Bulk insert in batches of 100
        const batchSize = 100;
        for (let i = 0; i < dbPicks.length; i += batchSize) {
          const batch = dbPicks.slice(i, i + batchSize);
          const values = batch.map((p, j) => `($${j * 3 + 1}, $${j * 3 + 2}, $${j * 3 + 3})`).join(', ');
          const params = batch.flatMap(p => [p.mockDraftId, p.playerId, p.pickNumber]);
          await pool.query(
            `INSERT INTO mock_draft_picks (mock_draft_id, player_id, pick_number) VALUES ${values}`,
            params
          );
        }
        console.log(`  Inserted ${dbPicks.length} picks`);
      }

      if (unmatched.length > 0) {
        console.log(`  Unmatched (${unmatched.length}): ${unmatched.slice(0, 10).map(u => `#${u.pickNumber} ${u.playerName}`).join(', ')}`);
      }

      results.push({ sourceKey: source.sourceKey, status: 'ok', mockDraftId, picksInserted: dbPicks.length, unmatched: unmatched.length });

    } catch (err) {
      console.error(`  ERROR for ${source.sourceKey}:`, err.message);
      results.push({ sourceKey: source.sourceKey, status: 'error', error: err.message });
    }
  }

  await pool.end();

  console.log('\n=== SUMMARY ===');
  for (const r of results) {
    console.log(JSON.stringify(r));
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
