/**
 * scrape-tankathon-bigboard.cjs
 * Scrapes the Tankathon 2026 NFL Draft Big Board as a bigboard entry.
 *
 * URL: https://tankathon.com/nfl/big_board
 * Source key: tankathon_bigboard (separate from existing 'tankathon' mock-type entry)
 *
 * The page renders player data server-side in the HTML.
 * Structure per row:
 *   <div class="mock-row nfl" data-pos="POS">
 *     <div class="mock-row-pick-number">N</div>
 *     <div class="mock-row-logo">...</div>
 *     <div class="mock-row-player">
 *       <a href="/nfl/players/slug">
 *         <div class="mock-row-name">Player Name</div>
 *         <div class="mock-row-school-position">POS | College</div>
 *       </a>
 *     </div>
 *   </div>
 *
 * Date check: page has <time datetime="YYYY-MM-DDTHH:mm:ss..."> for last-updated-at.
 * Requires 2026 date.
 *
 * Usage: node script/scrape-tankathon-bigboard.cjs
 */

const https = require('https');
const { Pool } = require('pg');

const DB_URL = 'process.env.DATABASE_URL';

const SOURCE = {
  sourceKey: 'tankathon_bigboard',
  displayName: 'Tankathon Big Board',
  url: 'https://tankathon.com/nfl/big_board',
  boardType: 'bigboard',
};

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

/**
 * Extract the last-updated date from the page.
 * Looks for: <time datetime="2026-MM-DDTHH:mm:ss...">
 */
function extractPageDate(html) {
  const m = html.match(/datetime="(\d{4}-\d{2}-\d{2})T/);
  return m ? m[1] : null;
}

/**
 * Parse Tankathon big board HTML.
 * Extracts all mock-row nfl entries with rank, name, position, college.
 */
function parseTankathonBigBoard(html) {
  const picks = [];
  const seen = new Set();

  // Match each mock-row nfl block
  const rowPattern = /<div class="mock-row nfl"([^>]*)>([\s\S]*?)(?=<div class="mock-row nfl"|<\/div>\s*<\/div>\s*<\/div>\s*<\/div>|$)/g;
  let rowMatch;

  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const attrs = rowMatch[1];
    const block = rowMatch[2];

    // Get pick number
    const pickMatch = block.match(/class="mock-row-pick-number">(\d+)<\/div>/);
    if (!pickMatch) continue;
    const rank = parseInt(pickMatch[1], 10);
    if (isNaN(rank) || rank < 1 || rank > 1000 || seen.has(rank)) continue;

    // Get player name
    const nameMatch = block.match(/class="mock-row-name">([^<]+)<\/div>/);
    if (!nameMatch) continue;
    const playerName = nameMatch[1].trim();
    if (!playerName || playerName.length < 2) continue;

    // Get position from data-pos attribute on the row or from mock-row-school-position
    let position = null;
    const dataPosMatch = attrs.match(/data-pos="([^"]+)"/);
    if (dataPosMatch) {
      position = dataPosMatch[1].trim() || null;
    }

    // Get college from mock-row-school-position: "POS | College "
    let college = null;
    const schoolPosMatch = block.match(/class="mock-row-school-position">([^<]+)<\/div>/);
    if (schoolPosMatch) {
      const schoolPosText = schoolPosMatch[1].trim();
      const parts = schoolPosText.split('|');
      if (parts.length >= 2) {
        if (!position) position = parts[0].trim() || null;
        college = parts[1].trim() || null;
      }
    }

    seen.add(rank);
    picks.push({ rank, playerName, position, college });
  }

  return picks.sort((a, b) => a.rank - b.rank);
}

async function main() {
  const pool = new Pool({ connectionString: DB_URL });

  // Load all players
  const { rows: players } = await pool.query('SELECT id, name, position, college FROM players ORDER BY id');
  console.log(`Loaded ${players.length} players from DB`);

  const today = new Date().toISOString().slice(0, 10);

  // Check if already scraped today with sufficient picks
  const existing = await pool.query(
    `SELECT md.id, count(mdp.id) AS pick_count
     FROM mock_drafts md
     LEFT JOIN mock_draft_picks mdp ON mdp.mock_draft_id = md.id
     WHERE md.source_key = $1 AND DATE(md.published_at) = $2
     GROUP BY md.id
     LIMIT 1`,
    [SOURCE.sourceKey, today]
  );

  if (existing.rows.length > 0 && parseInt(existing.rows[0].pick_count) >= 50) {
    console.log(`Already scraped today with ${existing.rows[0].pick_count} picks (mock_draft id=${existing.rows[0].id}), skipping`);
    await pool.end();
    return;
  }

  // Delete any incomplete prior record for today
  if (existing.rows.length > 0) {
    const oldId = existing.rows[0].id;
    console.log(`Deleting incomplete prior record id=${oldId} (only ${existing.rows[0].pick_count} picks)`);
    await pool.query('DELETE FROM mock_draft_picks WHERE mock_draft_id = $1', [oldId]);
    await pool.query('DELETE FROM mock_drafts WHERE id = $1', [oldId]);
  }

  console.log(`Fetching: ${SOURCE.url}`);
  const html = await fetchUrl(SOURCE.url);
  console.log(`Got ${html.length} bytes`);

  // Verify 2026 date
  const pageDate = extractPageDate(html);
  console.log(`Page last-updated date: ${pageDate || 'unknown'}`);
  if (pageDate && !pageDate.startsWith('2026')) {
    console.error(`ERROR: Page date is ${pageDate}, not 2026. Aborting.`);
    await pool.end();
    process.exit(1);
  }
  if (!pageDate && !html.includes('2026')) {
    console.error('ERROR: Page does not appear to be 2026 draft content. Aborting.');
    await pool.end();
    process.exit(1);
  }

  const picks = parseTankathonBigBoard(html);
  console.log(`Parsed ${picks.length} picks`);

  if (picks.length < 30) {
    console.error(`WARNING: Too few picks found (${picks.length}). Check parser. Aborting.`);
    await pool.end();
    process.exit(1);
  }

  // Get analyst id if exists
  const analystRow = await pool.query(
    `SELECT id FROM analysts WHERE source_key = $1 LIMIT 1`,
    [SOURCE.sourceKey]
  ).catch(() => ({ rows: [] }));
  const analystId = analystRow.rows[0]?.id || null;

  // Insert mock_draft record
  const sourceName = `${SOURCE.displayName} — ${new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })}`;
  const mdResult = await pool.query(
    `INSERT INTO mock_drafts (source_name, source_key, analyst_id, url, board_type, published_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING id`,
    [sourceName, SOURCE.sourceKey, analystId, SOURCE.url, SOURCE.boardType]
  );
  const mockDraftId = mdResult.rows[0].id;
  console.log(`Created mock_draft id=${mockDraftId}`);

  // Match players and insert picks
  const dbPicks = [];
  const unmatched = [];

  for (const { rank, playerName, position, college } of picks) {
    const matched = matchPlayer(playerName, players);
    if (matched) {
      dbPicks.push({ mockDraftId, playerId: matched.id, pickNumber: rank });
    } else {
      unmatched.push({ rank, playerName, position, college });
    }
  }

  if (dbPicks.length > 0) {
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
    console.log(`Inserted ${dbPicks.length} picks`);
  }

  if (unmatched.length > 0) {
    console.log(`Unmatched (${unmatched.length}):`);
    unmatched.slice(0, 20).forEach(u => console.log(`  #${u.rank} ${u.playerName} (${u.position || '?'}, ${u.college || '?'})`));
    if (unmatched.length > 20) console.log(`  ... and ${unmatched.length - 20} more`);
  }

  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify({
    sourceKey: SOURCE.sourceKey,
    status: 'ok',
    mockDraftId,
    pageDate,
    picksFound: picks.length,
    picksInserted: dbPicks.length,
    unmatched: unmatched.length
  }, null, 2));

  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
