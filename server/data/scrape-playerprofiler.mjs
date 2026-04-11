/**
 * scrape-playerprofiler.mjs — Scrape Player Profiler for age, hand size, and
 * percentile stats (College QBR, YPA, Breakout Age) for all tracked players.
 *
 * Uses the gstack headless browser (required for AngularJS-rendered pages).
 *
 * Run: node --env-file=.env server/data/scrape-playerprofiler.mjs
 * Options:
 *   --player "Name"  Only scrape one player by name
 *   --limit N        Stop after N players (for testing)
 *   --dry-run        Print slugs + URLs without scraping
 *   --regen-urls     Regenerate all player_profiler_url slugs (even ones already set)
 */

import pg from 'pg';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name) => { const i = args.indexOf(`--${name}`); return i !== -1 ? args[i + 1] ?? null : null; };
const hasFlag = (name) => args.includes(`--${name}`);

const singlePlayer = getArg('player');
const limitN       = getArg('limit') ? parseInt(getArg('limit')) : null;
const dryRun       = hasFlag('dry-run');
const regenUrls    = hasFlag('regen-urls');

// ── Browse binary path ────────────────────────────────────────────────────────
const BROWSE = path.join(os.homedir(), '.claude/skills/gstack/browse/dist/browse');

// ── Name → Player Profiler URL slug ──────────────────────────────────────────
function nameToSlug(name) {
  return name
    .toLowerCase()
    .replace(/[''`]/g, '')         // remove apostrophes
    .replace(/\./g, '')            // remove dots (Jr., Sr.)
    .replace(/[^a-z0-9\s-]/g, '') // remove special chars
    .replace(/\s+/g, '-')         // spaces → hyphens
    .replace(/-+/g, '-')          // collapse double hyphens
    .replace(/-(jr|sr|ii|iii|iv|v)$/, '') // remove suffix
    .trim();
}

function ppUrl(name) {
  return `https://www.playerprofiler.com/nfl/${nameToSlug(name)}/`;
}

// ── Run a browse command, return stdout ──────────────────────────────────────
async function browse(...cmds) {
  try {
    const { stdout } = await execFileAsync(BROWSE, cmds, { timeout: 20000 });
    return stdout.trim();
  } catch (err) {
    return '';
  }
}

// ── Parse Player Profiler page data ──────────────────────────────────────────
async function scrapePlayerProfiler(url) {
  // Navigate
  await browse('goto', url);
  await browse('wait', '--networkidle');

  // Extract core stats
  const raw = await browse('js',
    `JSON.stringify(Array.from(document.querySelectorAll('.player-page__core-stat, .player-page__key-stats-grid')).map(el => el.textContent.replace(/\\s+/g,' ').trim().slice(0,200)).filter(x=>x))`
  );

  if (!raw) return null;

  let items;
  try { items = JSON.parse(raw); } catch { return null; }

  const data = {};

  for (const item of items) {
    // Height
    const heightM = item.match(/Height\s+([\d']+" *[\d"]*)/);
    if (heightM) data.height = heightM[1].trim();

    // Weight
    const weightM = item.match(/Weight\s+(\d+)\s*lbs/);
    if (weightM) data.weight = parseInt(weightM[1]);

    // Hand Size (store as text like "9\"")
    const handM = item.match(/Hand Size\s+([\d.]+)["″]/);
    if (handM) data.handSize = `${handM[1]}"`;

    // Age
    const ageM = item.match(/Age\s+([\d.]+)/);
    if (ageM) data.age = parseFloat(ageM[1]);

    // College QBR: "90.3 (97th) College QBR"
    const qbrM = item.match(/([\d.]+)\s*\((\d+)(?:st|nd|rd|th)\)\s*College QBR/);
    if (qbrM) { data.collegeQbrRaw = parseFloat(qbrM[1]); data.collegeQbrPct = parseInt(qbrM[2]); }

    // College YPA: "9.3 (85th) College YPA"
    const ypaM = item.match(/([\d.]+)\s*\((\d+)(?:st|nd|rd|th)\)\s*College YPA/);
    if (ypaM) { data.collegeYpaRaw = parseFloat(ypaM[1]); data.collegeYpaPct = parseInt(ypaM[2]); }

    // Breakout Age: "19.9 (69th) Breakout Age"
    const baM = item.match(/([\d.]+)\s*\((\d+)(?:st|nd|rd|th)\)\s*Breakout Age/);
    if (baM) { data.breakoutAge = parseFloat(baM[1]); data.breakoutAgePct = parseInt(baM[2]); }

    // Dominator Rating: look for percentile in key-stats grid
    const domM = item.match(/([\d.]+)\s*\((\d+)(?:st|nd|rd|th)\)\s*Dominator/i);
    if (domM) { data.dominatorRating = parseFloat(domM[1]); }
  }

  return Object.keys(data).length > 0 ? data : null;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  let players;
  if (singlePlayer) {
    const r = await pool.query(`SELECT * FROM players WHERE LOWER(name) LIKE $1 LIMIT 5`, [`%${singlePlayer.toLowerCase()}%`]);
    players = r.rows;
  } else {
    const r = await pool.query('SELECT * FROM players ORDER BY id ASC');
    players = r.rows;
  }

  if (limitN) players = players.slice(0, limitN);

  console.log(`\n=== Player Profiler Scraper: ${players.length} players ===\n`);

  let updated = 0, skipped = 0, notFound = 0;

  for (const player of players) {
    const url = player.player_profiler_url && !regenUrls
      ? player.player_profiler_url
      : ppUrl(player.name);

    console.log(`[${player.id}] ${player.name} → ${url}`);

    if (dryRun) continue;

    // Set PP URL if not set
    if (!player.player_profiler_url || regenUrls) {
      await pool.query('UPDATE players SET player_profiler_url = $1 WHERE id = $2', [url, player.id]);
    }

    const data = await scrapePlayerProfiler(url);

    if (!data) {
      console.log(`  ✗ No data (page not found or private)`);
      notFound++;
      // Brief delay before next request
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }

    // Build update
    const fields = [];
    const vals = [];
    let idx = 1;

    if (data.handSize  !== undefined) { fields.push(`hand_size = $${idx++}`);          vals.push(data.handSize); }
    if (data.age       !== undefined) { fields.push(`age = $${idx++}`);                vals.push(data.age); }
    if (data.collegeQbrPct !== undefined) { fields.push(`college_qbr_pct = $${idx++}`);vals.push(data.collegeQbrPct); }
    if (data.collegeYpaPct !== undefined) { fields.push(`college_ypa_pct = $${idx++}`);vals.push(data.collegeYpaPct); }
    if (data.breakoutAge !== undefined) { fields.push(`breakout_age = $${idx++}`);     vals.push(data.breakoutAge); }
    if (data.breakoutAgePct !== undefined) { fields.push(`breakout_age_pct = $${idx++}`); vals.push(data.breakoutAgePct); }
    if (data.dominatorRating !== undefined) { fields.push(`dominator_rating = $${idx++}`); vals.push(data.dominatorRating); }

    if (fields.length > 0) {
      vals.push(player.id);
      await pool.query(`UPDATE players SET ${fields.join(', ')} WHERE id = $${idx}`, vals);
      console.log(`  ✓ Updated: ${JSON.stringify(data)}`);
      updated++;
    } else {
      console.log(`  ~ No parseable data`);
      skipped++;
    }

    // Polite delay between requests
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n=== Done: ${updated} updated, ${skipped} no data, ${notFound} not found ===`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
