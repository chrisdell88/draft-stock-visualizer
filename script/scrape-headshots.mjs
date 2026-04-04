/**
 * scrape-headshots.mjs
 * Fetches NFL.com articles that contain prospect headshots and updates
 * the players.image_url column for any players currently missing it.
 *
 * Usage: node --env-file=.env script/scrape-headshots.mjs
 */

import https from "https";
import { Pool } from "pg";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL not set — run with --env-file=.env");
  process.exit(1);
}

const pool = new Pool({ connectionString: DB_URL });

const HEADSHOT_BASE =
  "https://static.www.nfl.com/image/private/t_official/f_auto/league/god-prospect-headshots";

// NFL.com articles that carry 2026 prospect headshots
const HEADSHOT_SOURCES = [
  "https://www.nfl.com/news/daniel-jeremiah-s-top-50-2026-nfl-draft-prospect-rankings-3-0",
  "https://www.nfl.com/news/lance-zierlein-2026-nfl-mock-draft-2-0-two-cbs-in-top-five-combine-star-sonny-styles-cracks-top-10",
  "https://www.nfl.com/news/charles-davis-2026-nfl-mock-draft-2-0-cardinals-seahawks-select-notre-dame-rbs-in-round-1",
  "https://www.nfl.com/news/bucky-brooks-2026-nfl-mock-draft-2-0-jets-grab-edge-rusher-receiver-rams-double-dip-on-dbs",
];

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
        timeout: 20000,
      },
      (res) => {
        // Follow redirects (up to 5)
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          return fetchHtml(res.headers.location).then(resolve).catch(reject);
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

/**
 * Extract name → headshot URL pairs from an NFL.com article HTML.
 * Looks for <img alt="Player Name"> near god-prospect-headshots URLs.
 */
function extractHeadshotPairs(html) {
  const pairs = new Map();
  const seen = new Set();
  const imgPattern =
    /<img[^>]+alt="([A-Z][a-z]+(?:\s[A-Z][^"]{1,30})?)"[^>]*>/g;
  let m;

  while ((m = imgPattern.exec(html)) !== null) {
    const name = m[1].trim();
    if (
      seen.has(name) ||
      name.length < 4 ||
      /NFL|Logo|Author|Team|Image|Icon/i.test(name)
    ) {
      continue;
    }
    seen.add(name);

    const start = Math.max(0, m.index - 50);
    const window = html.substring(start, m.index + m[0].length + 400);
    const shot = window.match(
      /god-prospect-headshots\/([0-9]{4})\/([a-f0-9-]{30,40})/
    );
    if (shot) {
      pairs.set(name, `${HEADSHOT_BASE}/${shot[1]}/${shot[2]}`);
    }
  }

  // Fallback: scan all headshot UUID occurrences and find nearby alt text
  if (pairs.size === 0) {
    const chunks = html.split(/god-prospect-headshots\//);
    for (let i = 1; i < chunks.length; i++) {
      const chunk = chunks[i];
      const uuidMatch = chunk.match(/^([0-9]{4})\/([a-f0-9-]{30,40})/);
      if (!uuidMatch) continue;
      const headshotUrl = `${HEADSHOT_BASE}/${uuidMatch[1]}/${uuidMatch[2]}`;
      const prevChunk = chunks[i - 1];
      const altMatch = prevChunk.match(/alt="([^"]+)"[^>]*>?\s*$/);
      const name =
        altMatch?.[1] ?? chunk.match(/alt="([^"]+)"/)?.[1];
      if (
        name &&
        name.length > 3 &&
        !name.startsWith("NFL") &&
        !name.includes("Logo") &&
        !name.includes("Team") &&
        !seen.has(name)
      ) {
        seen.add(name);
        pairs.set(name, headshotUrl);
      }
    }
  }

  return pairs;
}

async function main() {
  // Load all players from DB
  const { rows: players } = await pool.query(
    "SELECT id, name, image_url FROM players ORDER BY id"
  );
  console.log(
    `[headshots] Loaded ${players.length} players. ${players.filter((p) => p.image_url).length} already have image_url.`
  );

  const combined = new Map();

  for (const url of HEADSHOT_SOURCES) {
    console.log(`[headshots] Fetching ${url}`);
    try {
      const html = await fetchHtml(url);
      const found = extractHeadshotPairs(html);
      console.log(`  → found ${found.size} name+headshot pairs`);
      for (const [name, imageUrl] of found) {
        if (!combined.has(name)) combined.set(name, imageUrl);
      }
    } catch (err) {
      console.warn(`  → FAILED: ${err.message}`);
    }
  }

  console.log(`\n[headshots] Total unique scraped names: ${combined.size}`);

  let updated = 0;
  let alreadyHad = 0;
  let noMatch = 0;

  for (const [name, imageUrl] of combined) {
    const matched = matchPlayer(name, players);
    if (!matched) {
      noMatch++;
      continue;
    }
    if (matched.image_url) {
      alreadyHad++;
      continue;
    }
    await pool.query("UPDATE players SET image_url = $1 WHERE id = $2", [
      imageUrl,
      matched.id,
    ]);
    matched.image_url = imageUrl; // prevent re-update if same name appears again
    updated++;
    console.log(`  ✓ Updated: ${matched.name}`);
  }

  console.log(`\n[headshots] Done.`);
  console.log(`  Updated:     ${updated}`);
  console.log(`  Already had: ${alreadyHad}`);
  console.log(`  No match:    ${noMatch}`);

  pool.end();
}

main().catch((err) => {
  console.error("[headshots] Fatal error:", err.message);
  pool.end();
  process.exit(1);
});
