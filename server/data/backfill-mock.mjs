/**
 * backfill-mock.mjs — Seed a historical mock draft from a URL with a known publish date.
 *
 * Usage:
 *   node --env-file=.env server/data/backfill-mock.mjs \
 *     --sourceKey walterfootball_walt \
 *     --url "https://walterfootball.com/mock2026.php" \
 *     --date "2026-02-15" \
 *     --label "Walt 2.0"
 *
 * Options:
 *   --sourceKey   Scraper key (e.g. walterfootball_walt, mcshay_report) — must match SCRAPERS registry
 *   --url         Full URL to the historical mock draft page
 *   --date        ISO publish date (YYYY-MM-DD) — stored as publishedAt
 *   --label       Optional human label appended to sourceName (e.g. "1.0", "Feb 15")
 *   --dry-run     Print what would be inserted without writing to DB
 *   --force       Re-import even if an entry for this source+date already exists
 *
 * The script uses the same HTML parsers as the live scrapers — no separate logic needed.
 * Add all historical URLs for a single source, separated by multiple runs with different --date values.
 */

import pg from 'pg';
import axios from 'axios';
import * as cheerio from 'cheerio';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── CLI argument parsing ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
}
const hasFlag = (name) => args.includes(`--${name}`);

const sourceKey = getArg('sourceKey');
const url       = getArg('url');
const dateStr   = getArg('date');
const label     = getArg('label');
const dryRun    = hasFlag('dry-run');
const force     = hasFlag('force');

if (!sourceKey || !url || !dateStr) {
  console.error('Usage: node backfill-mock.mjs --sourceKey KEY --url URL --date YYYY-MM-DD [--label TEXT] [--dry-run] [--force]');
  process.exit(1);
}

const publishedAt = new Date(dateStr + 'T12:00:00.000Z');
if (isNaN(publishedAt.getTime())) {
  console.error(`Invalid date: ${dateStr}`);
  process.exit(1);
}

// ── Name normalizer ──────────────────────────────────────────────────────────
function normalizeName(name) {
  return name.toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^a-z' ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Player name matching ─────────────────────────────────────────────────────
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
  return players.find(p => normalizeName(p.name).includes(norm) || norm.includes(normalizeName(p.name)));
}

// ── Generic HTML parsers ──────────────────────────────────────────────────────

// WalterFootball Walt — div[data-number]
function parseWalt(html) {
  const $ = cheerio.load(html);
  const picks = [];
  $('div[data-number]').each((_i, el) => {
    const pickNum = parseInt($(el).attr('data-number') ?? '0', 10);
    if (isNaN(pickNum) || pickNum < 1 || pickNum > 300) return;
    const link = $(el).find('strong a').first();
    if (!link.length) return;
    const parts = link.text().trim().split(',').map(s => s.trim());
    const playerName = parts[0];
    if (playerName && playerName.length > 2) {
      picks.push({ pickNumber: pickNum, playerName, position: parts[1] ?? null, college: parts[2] ?? null });
    }
  });
  return picks;
}

// WalterFootball Charlie — div[id^="mockDraftSlot_"]
function parseCharlie(html) {
  const $ = cheerio.load(html);
  const picks = [];
  $("div[id^='mockDraftSlot_']").each((_i, el) => {
    const slotId = $(el).attr('id') ?? '';
    const pickNum = parseInt(slotId.replace('mockDraftSlot_', ''), 10);
    if (isNaN(pickNum) || pickNum < 1 || pickNum > 300) return;
    let playerName = '';
    let position = null, college = null;
    $(el).find('a.report-link').each((_j, anchor) => {
      const text = $(anchor).text().trim();
      if (text && !text.includes('Scouting Report') && text.length > 2 && !playerName) {
        playerName = text;
      }
    });
    if (!playerName) {
      const td = $(el).find("td[style*='font-weight:bold']").first();
      const spans = td.find("span[style*='display:inline-block']");
      if (spans.length >= 2) {
        const parts = $(spans[1]).text().trim().split(',').map(s => s.trim()).filter(Boolean);
        if (parts.length >= 1) playerName = parts[0];
        position = parts[1] ?? null;
        college = parts[2] ?? null;
      }
    }
    if (playerName && playerName.length > 2) {
      picks.push({ pickNumber: pickNum, playerName, position, college });
    }
  });
  return picks;
}

// Generic ordered-list parser (ESPN, CBS, etc.) — picks in a table or list
function parseGenericTable(html) {
  const $ = cheerio.load(html);
  const picks = [];
  // Try standard draft pick tables
  $('table tr').each((_i, el) => {
    const cells = $(el).find('td');
    if (cells.length < 2) return;
    const firstCell = $(cells[0]).text().trim();
    const pickNum = parseInt(firstCell, 10);
    if (isNaN(pickNum) || pickNum < 1 || pickNum > 300) return;
    const nameCell = $(cells[1]).text().trim() || $(cells[2]).text().trim();
    if (nameCell && nameCell.length > 2) {
      picks.push({ pickNumber: pickNum, playerName: nameCell, position: null, college: null });
    }
  });
  return picks;
}

// ── Parser registry — map sourceKey prefixes to parser functions ───────────
function getParser(key) {
  if (key.includes('walterfootball_charlie')) return parseCharlie;
  if (key.includes('walterfootball'))         return parseWalt;
  // Default: try generic table parser
  return parseGenericTable;
}

// ── Fetch HTML ───────────────────────────────────────────────────────────────
async function fetchHtml(targetUrl) {
  const res = await axios.get(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.google.com/',
    },
    timeout: 30000,
    maxRedirects: 10,
  });
  return res.data;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== MockX Historical Backfill ===`);
  console.log(`  sourceKey: ${sourceKey}`);
  console.log(`  url:       ${url}`);
  console.log(`  date:      ${dateStr}`);
  console.log(`  label:     ${label ?? '(none)'}`);
  console.log(`  dry-run:   ${dryRun}`);
  console.log(`  force:     ${force}`);

  // Check if already imported
  if (!force) {
    const existing = await pool.query(
      `SELECT id FROM mock_drafts WHERE source_key = $1 AND DATE(published_at) = $2 LIMIT 1`,
      [sourceKey, dateStr]
    );
    if (existing.rows.length > 0) {
      console.log(`\nAlready imported (id=${existing.rows[0].id}). Use --force to re-import.`);
      await pool.end();
      return;
    }
  }

  // Fetch and parse
  console.log(`\nFetching ${url} ...`);
  const html = await fetchHtml(url);
  const parser = getParser(sourceKey);
  const picks = parser(html);

  console.log(`Parsed ${picks.length} picks`);
  if (picks.length === 0) {
    console.error('No picks found — wrong parser or page changed. Check --sourceKey and the URL.');
    await pool.end();
    process.exit(1);
  }

  if (dryRun) {
    console.log('\n--- DRY RUN: first 10 picks ---');
    picks.slice(0, 10).forEach(p => {
      console.log(`  #${p.pickNumber} ${p.playerName} (${p.position ?? '?'}, ${p.college ?? '?'})`);
    });
    await pool.end();
    return;
  }

  // Load all players from DB
  const playersResult = await pool.query('SELECT id, name FROM players');
  let players = playersResult.rows;

  // Find analyst
  const analystResult = await pool.query(
    'SELECT id FROM analysts WHERE source_key = $1 LIMIT 1', [sourceKey]
  );
  const analystId = analystResult.rows[0]?.id ?? null;

  // Create mock draft entry
  const sourceDateLabel = label ?? new Date(publishedAt).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  const sourceName = `${sourceKey} — ${sourceDateLabel}`;

  // Delete existing if force
  if (force) {
    const del = await pool.query(
      `DELETE FROM mock_drafts WHERE source_key = $1 AND DATE(published_at) = $2 RETURNING id`,
      [sourceKey, dateStr]
    );
    if (del.rows.length > 0) {
      console.log(`Deleted ${del.rows.length} existing entry(ies) for ${sourceKey} on ${dateStr}`);
    }
  }

  const mockResult = await pool.query(
    `INSERT INTO mock_drafts (source_name, source_key, analyst_id, url, board_type, published_at)
     VALUES ($1, $2, $3, $4, 'mock', $5) RETURNING id`,
    [sourceName, sourceKey, analystId, url, publishedAt]
  );
  const mockDraftId = mockResult.rows[0].id;
  console.log(`Created mock_draft id=${mockDraftId}`);

  // Insert picks
  let inserted = 0, notFound = 0;
  const pickRows = [];
  for (const { pickNumber, playerName, position, college } of picks) {
    const matched = matchPlayer(playerName, players);
    if (!matched) {
      // Auto-create player
      const newPlayer = await pool.query(
        `INSERT INTO players (name, position, college) VALUES ($1, $2, $3) RETURNING id, name`,
        [playerName, position ?? null, college ?? null]
      );
      players.push(newPlayer.rows[0]);
      pickRows.push({ playerId: newPlayer.rows[0].id, pickNumber });
      console.log(`  Auto-created: ${playerName}`);
    } else {
      pickRows.push({ playerId: matched.id, pickNumber });
    }
    inserted++;
  }

  if (pickRows.length > 0) {
    const values = pickRows.map((_, i) => `($1, $${i*2+2}, $${i*2+3})`).join(', ');
    const flatParams = [mockDraftId, ...pickRows.flatMap(r => [r.playerId, r.pickNumber])];
    await pool.query(
      `INSERT INTO mock_draft_picks (mock_draft_id, player_id, pick_number) VALUES ${values}`,
      flatParams
    );
  }

  console.log(`\n✓ Inserted ${inserted} picks (${notFound} not found) for ${sourceKey} on ${dateStr}`);

  // Recompute ADP for affected players
  console.log('Recomputing ADP...');
  const affectedIds = [...new Set(pickRows.map(r => r.playerId))];
  for (const playerId of affectedIds) {
    await pool.query(`
      UPDATE players SET current_adp = (
        SELECT ROUND(AVG(mdp.pick_number)::numeric, 2)
        FROM mock_draft_picks mdp
        JOIN mock_drafts md ON md.id = mdp.mock_draft_id
        WHERE mdp.player_id = $1
      ) WHERE id = $1
    `, [playerId]);
  }

  console.log('Done.\n');
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
