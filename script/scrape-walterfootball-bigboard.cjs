/**
 * scrape-walterfootball-bigboard.cjs
 * Scrapes the WalterFootball 2026 NFL Draft Big Board.
 * URL: https://walterfootball.com/nfldraftbigboard2026.php
 *
 * Structure: div.divPlayerRanking > div.cellDiv (rank "N.") + div.cellDiv (<b><a>Name</a>, POS, College.</b>)
 *
 * Usage: node script/scrape-walterfootball-bigboard.cjs
 */

const https = require('https');
const { Pool } = require('pg');

const DB_URL = 'process.env.DATABASE_URL';

const SOURCE = {
  sourceKey: 'walterfootball_bigboard',
  displayName: 'WalterFootball Big Board',
  url: 'https://walterfootball.com/nfldraftbigboard2026.php',
  boardType: 'bigboard',
};

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
 * Parse WalterFootball Big Board HTML.
 * Structure per entry:
 *   <div class="divPlayerRanking">
 *     <div class="cellDiv"><b>N.</b></div>
 *     <div class="cellDiv" style="width:93%...">
 *       <b>
 *         [optional: <a href="..." title="...">Player Name</a>,] POS, College.
 *         OR: Player Name, POS, College.   (no link if no scouting report)
 *       </b>
 *       ...
 *     </div>
 *   </div>
 */
function parseWalterBigBoard(html) {
  const picks = [];
  const seen = new Set();

  // Match each divPlayerRanking block
  const blockPattern = /<div class="divPlayerRanking">([\s\S]*?)(?=<div class="divPlayerRanking">|$)/g;
  let blockMatch;

  while ((blockMatch = blockPattern.exec(html)) !== null) {
    const block = blockMatch[1];

    // Extract rank from first cellDiv: <b>N.</b>
    const rankMatch = block.match(/<div class="cellDiv">\s*<b>\s*(\d+)\.\s*<\/b>/);
    if (!rankMatch) continue;
    const rank = parseInt(rankMatch[1], 10);
    if (isNaN(rank) || rank < 1 || rank > 500 || seen.has(rank)) continue;

    let playerName = null;
    let position = null;
    let college = null;

    // Strategy 1: player has a scouting report link
    //   <a href="..." title="Prospect scouting report for NAME">NAME</a>, POS, College.
    const linkMatch = block.match(/<a href="[^"]*"[^>]*title="[^"]*">([^<]+)<\/a>([\s\S]*?)(?=<\/b>)/);
    if (linkMatch) {
      playerName = linkMatch[1].trim();
      const posColText = linkMatch[2];
      const posColMatch = posColText.match(/,\s*([A-Z/]+),\s*([^.<\n]+)/);
      if (posColMatch) {
        position = posColMatch[1].trim() || null;
        college = posColMatch[2].trim().replace(/\.$/, '').trim() || null;
      }
    } else {
      // Strategy 2: no link — name is plain text in the second <b> block
      //   <b>\nPlayer Name,   POS, College.\n</b>
      const allBolds = [...block.matchAll(/<b[^>]*>([\s\S]*?)<\/b>/g)];
      for (const bm of allBolds) {
        const content = bm[1].trim();
        // Skip the rank bold (just "N.")
        if (/^\d+\.$/.test(content)) continue;
        // Clean whitespace and parse "Name, POS, College."
        const cleaned = content.replace(/\s+/g, ' ').trim();
        const parts = cleaned.split(',').map(s => s.trim());
        if (parts.length >= 1 && parts[0].length > 2 && !/^\d/.test(parts[0])) {
          playerName = parts[0];
          position = parts[1] ? parts[1].replace(/[^A-Z/]/g, '') || null : null;
          college = parts[2] ? parts[2].replace(/\.$/, '').trim() || null : null;
          break;
        }
      }
    }

    if (!playerName || playerName.length < 2) continue;

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

  if (existing.rows.length > 0 && parseInt(existing.rows[0].pick_count) >= 20) {
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

  // Verify this is a 2026 page
  if (!html.includes('2026')) {
    console.error('ERROR: Page does not appear to be 2026 draft content. Aborting.');
    await pool.end();
    process.exit(1);
  }

  const picks = parseWalterBigBoard(html);
  console.log(`Parsed ${picks.length} picks`);

  if (picks.length < 5) {
    console.error(`WARNING: Too few picks found (${picks.length}). Check parser. Aborting.`);
    console.log('First 500 chars of HTML body:', html.slice(0, 500));
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
    unmatched.forEach(u => console.log(`  #${u.rank} ${u.playerName} (${u.position || '?'}, ${u.college || '?'})`));
  }

  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify({
    sourceKey: SOURCE.sourceKey,
    status: 'ok',
    mockDraftId,
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
