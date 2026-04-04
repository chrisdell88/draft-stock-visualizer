/**
 * scrape-ras.mjs
 * Fetches RAS (Relative Athletic Score) data for NFL draft prospects
 * from ras.football and updates players.ras_score in the DB.
 *
 * The RAS site uses a Ninja Tables WordPress plugin that loads data via AJAX.
 * This script fetches the page to get the current nonce, then calls the
 * AJAX endpoint to retrieve the full player list.
 *
 * Usage: node --env-file=.env script/scrape-ras.mjs
 */

import https from "https";
import { Pool } from "pg";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL not set — run with --env-file=.env");
  process.exit(1);
}

const pool = new Pool({ connectionString: DB_URL });

const RAS_PAGE_URL = "https://ras.football/2025-nfl-draft-class/";
const RAS_AJAX_BASE =
  "https://ras.football/wp-admin/admin-ajax.php?action=wp_ajax_ninja_tables_public_action";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function fetchUrl(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": BROWSER_UA,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          ...opts.headers,
        },
        timeout: 30000,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchUrl(res.headers.location, opts).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}

/**
 * Parse the Ninja Tables config from the page HTML to get table_id and nonce.
 * Returns { tableId, nonce } or null if not found.
 */
function parseNinjaTablesConfig(html) {
  // Look for ninja_table_public_nonce in the data_request_url
  const nonceMatch = html.match(/ninja_table_public_nonce=([a-f0-9]+)/);
  const tableIdMatch = html.match(/table_id=(\d+)/);
  if (!nonceMatch || !tableIdMatch) return null;
  return { tableId: tableIdMatch[1], nonce: nonceMatch[1] };
}

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^a-z' ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchPlayer(name, players) {
  const norm = normalizeName(name);
  let match = players.find((p) => normalizeName(p.name) === norm);
  if (match) return match;

  const words = norm.split(" ").filter(Boolean);
  if (words.length >= 2) {
    const lastName = words[words.length - 1];
    const firstName = words[0];
    match = players.find((p) => {
      const pw = normalizeName(p.name).split(" ");
      return (
        pw[pw.length - 1] === lastName &&
        pw[0].startsWith(firstName[0])
      );
    });
    if (match) return match;
  }

  match = players.find(
    (p) =>
      normalizeName(p.name).includes(norm) ||
      norm.includes(normalizeName(p.name))
  );
  return match;
}

async function main() {
  // Load all players
  const { rows: players } = await pool.query(
    "SELECT id, name, ras_score FROM players ORDER BY id"
  );
  console.log(
    `[ras] Loaded ${players.length} players. ${
      players.filter((p) => p.ras_score !== null).length
    } already have ras_score.`
  );

  // Step 1: Fetch the RAS page to extract nonce + table_id
  console.log(`[ras] Fetching ${RAS_PAGE_URL} for table config...`);
  let html;
  try {
    html = await fetchUrl(RAS_PAGE_URL);
  } catch (err) {
    console.error(`[ras] Failed to fetch RAS page: ${err.message}`);
    // Try alternative URL formats
    const alternateUrls = [
      "https://ras.football/2026-prospects/",
      "https://ras.football/2026-nfl-draft-class/",
    ];
    for (const altUrl of alternateUrls) {
      console.log(`[ras] Trying alternate URL: ${altUrl}`);
      try {
        html = await fetchUrl(altUrl);
        console.log(`[ras] Success with: ${altUrl}`);
        break;
      } catch (e) {
        console.warn(`  → 404: ${altUrl}`);
      }
    }
    if (!html) {
      console.error("[ras] No RAS page accessible. The 2026 draft class page may not exist yet.");
      console.log("[ras] Note: ras.football typically publishes the new draft class page after the NFL Combine.");
      pool.end();
      return;
    }
  }

  const config = parseNinjaTablesConfig(html);
  if (!config) {
    console.error("[ras] Could not parse Ninja Tables config from page HTML.");
    console.log("[ras] The page may have changed structure. Check ras.football manually.");
    pool.end();
    return;
  }

  console.log(
    `[ras] Found table config: table_id=${config.tableId}, nonce=${config.nonce}`
  );

  // Step 2: Fetch the AJAX data endpoint
  const ajaxUrl = `${RAS_AJAX_BASE}&table_id=${config.tableId}&target_action=get-all-data&default_sorting=old_first&skip_rows=0&limit_rows=0&ninja_table_public_nonce=${config.nonce}`;
  console.log(`[ras] Fetching AJAX data from table ${config.tableId}...`);

  let rawData;
  try {
    const body = await fetchUrl(ajaxUrl, {
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        Referer: RAS_PAGE_URL,
      },
    });
    rawData = JSON.parse(body);
  } catch (err) {
    console.error(`[ras] Failed to fetch/parse AJAX data: ${err.message}`);
    pool.end();
    return;
  }

  if (!Array.isArray(rawData) || rawData.length === 0) {
    console.error("[ras] AJAX returned empty or non-array data.");
    pool.end();
    return;
  }

  console.log(`[ras] Retrieved ${rawData.length} player records from RAS.`);

  // Step 3: Match and update
  let updated = 0;
  let alreadyHad = 0;
  let noMatch = 0;
  let noScore = 0;

  for (const row of rawData) {
    const name = row["PLAYER_NAME"];
    // RAS score is stored as "ROUND(RAS,2)" key
    const rasScore = row["ROUND(RAS,2)"];

    if (!name) continue;
    if (rasScore === null || rasScore === undefined || rasScore === "") {
      noScore++;
      continue;
    }

    const score = parseFloat(rasScore);
    if (isNaN(score)) {
      noScore++;
      continue;
    }

    const matched = matchPlayer(name, players);
    if (!matched) {
      noMatch++;
      continue;
    }

    if (matched.ras_score !== null && matched.ras_score !== undefined) {
      alreadyHad++;
      continue;
    }

    await pool.query("UPDATE players SET ras_score = $1 WHERE id = $2", [
      score,
      matched.id,
    ]);
    matched.ras_score = score;
    updated++;
    console.log(`  ✓ ${matched.name}: RAS ${score}`);
  }

  console.log(`\n[ras] Done.`);
  console.log(`  Updated:       ${updated}`);
  console.log(`  Already had:   ${alreadyHad}`);
  console.log(`  No match in DB: ${noMatch}`);
  console.log(`  No RAS score:  ${noScore}`);

  pool.end();
}

main().catch((err) => {
  console.error("[ras] Fatal error:", err.message);
  pool.end();
  process.exit(1);
});
