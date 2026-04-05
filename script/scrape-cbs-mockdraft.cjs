/**
 * scrape-cbs-mockdraft.cjs
 * Attempts to scrape CBS Sports 2026 NFL Mock Drafts by Pete Prisco and Ryan Wilson.
 *
 * Sources:
 *   cbs_prisco  — https://www.cbssports.com/nfl/draft/mock-draft/expert/pete-prisco/
 *   cbs_wilson  — https://www.cbssports.com/nfl/draft/mock-draft/expert/ryan-wilson/
 *
 * NOTE: CBS Sports pages require JavaScript rendering (React SSR with client hydration).
 * Their ContentServer returns HTTP 500 for all direct/server-side requests regardless
 * of user agent. A headless browser (Puppeteer/Playwright) would be required.
 *
 * The page structure when rendered:
 *   - Pick rows likely use data-* attributes or JSON embedded in __INITIAL_STATE__
 *   - Player names, positions, teams visible in rendered DOM
 *
 * This script will attempt the fetch and report the error clearly.
 * If CBS Sports ever makes their content accessible (CDN, RSS, or JSON API),
 * update the parseCbsMockDraft() function below.
 *
 * Usage: node script/scrape-cbs-mockdraft.cjs
 */

const https = require('https');
const { Pool } = require('pg');

const DB_URL = 'process.env.DATABASE_URL';

const SOURCES = [
  {
    sourceKey: 'cbs_prisco',
    displayName: 'CBS Sports (Pete Prisco) Mock Draft',
    url: 'https://www.cbssports.com/nfl/draft/mock-draft/expert/pete-prisco/',
    boardType: 'mock',
  },
  {
    sourceKey: 'cbs_wilson',
    displayName: 'CBS Sports (Ryan Wilson) Mock Draft',
    url: 'https://www.cbssports.com/nfl/draft/mock-draft/expert/ryan-wilson/',
    boardType: 'mock',
  },
];

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

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

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/',
        'Cache-Control': 'no-cache',
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const location = res.headers['location'];
        if (location) {
          resolve(fetchUrl(location.startsWith('http') ? location : `https://${parsedUrl.hostname}${location}`));
          return;
        }
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for URL: ${url} — CBS Sports ContentServer blocks server-side requests. Requires headless browser (Puppeteer/Playwright) to render JavaScript.`));
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

/**
 * Parse CBS Sports mock draft HTML.
 * TODO: Implement when headless browser support is added.
 * Expected structure (based on CBS Sports React app pattern):
 *   - window.__INITIAL_STATE__ or similar JSON blob with pick data
 *   - OR rendered HTML with pick rows containing player names/positions
 *
 * When CBS Sports is accessible, look for:
 *   - data-component="MockDraftPick" or similar
 *   - JSON in <script type="application/json"> or window.__INITIAL_STATE__
 *   - Player name in .player-name, .pick-player-name, or similar selectors
 */
function parseCbsMockDraft(html, sourceKey) {
  const picks = [];

  // Try to extract JSON from window.__INITIAL_STATE__
  const initStateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/);
  if (initStateMatch) {
    try {
      const state = JSON.parse(initStateMatch[1]);
      console.log(`  Found __INITIAL_STATE__ for ${sourceKey}`);
      // Navigate state to find mock draft picks — structure TBD
      const draftData = state?.draft || state?.mockDraft || state?.page?.mockDraft;
      if (draftData && Array.isArray(draftData.picks)) {
        for (const pick of draftData.picks) {
          if (pick.pickNumber && pick.player?.name) {
            picks.push({
              pickNumber: parseInt(pick.pickNumber, 10),
              playerName: pick.player.name,
              position: pick.player.position || null,
              college: pick.player.college || null,
            });
          }
        }
      }
    } catch (e) {
      console.log(`  Failed to parse __INITIAL_STATE__: ${e.message}`);
    }
  }

  // Try JSON-LD structured data
  if (picks.length === 0) {
    const jsonLdMatches = html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
    for (const m of jsonLdMatches) {
      try {
        const data = JSON.parse(m[1]);
        if (data['@type'] === 'ItemList' && Array.isArray(data.itemListElement)) {
          for (const item of data.itemListElement) {
            if (item.position && item.item?.name) {
              picks.push({
                pickNumber: parseInt(item.position, 10),
                playerName: item.item.name,
                position: null,
                college: null,
              });
            }
          }
        }
      } catch (e) {
        // Skip invalid JSON-LD
      }
    }
  }

  return picks;
}

async function main() {
  const pool = new Pool({ connectionString: DB_URL });
  const { rows: players } = await pool.query('SELECT id, name, position, college FROM players ORDER BY id');
  console.log(`Loaded ${players.length} players from DB`);

  const today = new Date().toISOString().slice(0, 10);
  const results = [];

  for (const source of SOURCES) {
    console.log(`\n=== ${source.sourceKey} ===`);

    // Check if already scraped today
    const existing = await pool.query(
      `SELECT md.id, count(mdp.id) AS pick_count
       FROM mock_drafts md
       LEFT JOIN mock_draft_picks mdp ON mdp.mock_draft_id = md.id
       WHERE md.source_key = $1 AND DATE(md.published_at) = $2
       GROUP BY md.id LIMIT 1`,
      [source.sourceKey, today]
    );
    if (existing.rows.length > 0 && parseInt(existing.rows[0].pick_count) >= 30) {
      console.log(`  Already scraped today with ${existing.rows[0].pick_count} picks, skipping`);
      results.push({ sourceKey: source.sourceKey, status: 'already_exists', picks: existing.rows[0].pick_count });
      continue;
    }

    try {
      console.log(`  Fetching: ${source.url}`);
      const html = await fetchUrl(source.url);
      console.log(`  Got ${html.length} bytes`);

      // Check for 2026 content
      if (!html.includes('2026')) {
        console.log(`  WARNING: Page does not contain 2026. Skipping.`);
        results.push({ sourceKey: source.sourceKey, status: 'not_2026' });
        continue;
      }

      const picks = parseCbsMockDraft(html, source.sourceKey);
      if (picks.length === 0) {
        console.log(`  No picks parsed — CBS Sports requires JavaScript rendering.`);
        results.push({ sourceKey: source.sourceKey, status: 'no_picks_js_required' });
        continue;
      }

      const analystRow = await pool.query(
        `SELECT id FROM analysts WHERE source_key = $1 LIMIT 1`,
        [source.sourceKey]
      ).catch(() => ({ rows: [] }));
      const analystId = analystRow.rows[0]?.id || null;

      const sourceName = `${source.displayName} — ${new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })}`;
      const mdResult = await pool.query(
        `INSERT INTO mock_drafts (source_name, source_key, analyst_id, url, board_type, published_at)
         VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id`,
        [sourceName, source.sourceKey, analystId, source.url, source.boardType]
      );
      const mockDraftId = mdResult.rows[0].id;

      const dbPicks = [];
      const unmatched = [];
      for (const { pickNumber, playerName } of picks) {
        const matched = matchPlayer(playerName, players);
        if (matched) dbPicks.push({ mockDraftId, playerId: matched.id, pickNumber });
        else unmatched.push({ pickNumber, playerName });
      }

      if (dbPicks.length > 0) {
        const values = dbPicks.map((p, j) => `($${j * 3 + 1}, $${j * 3 + 2}, $${j * 3 + 3})`).join(', ');
        const params = dbPicks.flatMap(p => [p.mockDraftId, p.playerId, p.pickNumber]);
        await pool.query(`INSERT INTO mock_draft_picks (mock_draft_id, player_id, pick_number) VALUES ${values}`, params);
      }

      console.log(`  Inserted ${dbPicks.length} picks, ${unmatched.length} unmatched`);
      results.push({ sourceKey: source.sourceKey, status: 'ok', mockDraftId, picksInserted: dbPicks.length });

    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      results.push({ sourceKey: source.sourceKey, status: 'error', error: err.message });
    }
  }

  await pool.end();

  console.log('\n=== SUMMARY ===');
  for (const r of results) {
    console.log(JSON.stringify(r));
  }
  console.log('\nNOTE: CBS Sports mock draft pages require a headless browser to render.');
  console.log('To enable: install puppeteer (npm install puppeteer) and update fetchUrl()');
  console.log('to use page.goto() + page.content() instead of direct HTTPS requests.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
