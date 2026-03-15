import { storage } from "../storage";
import { fetchHtml, matchPlayer } from "./index";
import { db } from "../db";
import { players as playersTable } from "@shared/schema";
import { eq } from "drizzle-orm";

const HEADSHOT_BASE =
  "https://static.www.nfl.com/image/private/t_official/f_auto/league/god-prospect-headshots";

// NFL.com articles that carry prospect headshots
const HEADSHOT_SOURCES = [
  // Jeremiah Top-50 big board — 42 unique prospects (best source)
  "https://www.nfl.com/news/daniel-jeremiah-s-top-50-2026-nfl-draft-prospect-rankings-3-0",
  // Mock draft articles
  "https://www.nfl.com/news/lance-zierlein-2026-nfl-mock-draft-2-0-two-cbs-in-top-five-combine-star-sonny-styles-cracks-top-10",
  "https://www.nfl.com/news/charles-davis-2026-nfl-mock-draft-2-0-cardinals-seahawks-select-notre-dame-rbs-in-round-1",
  "https://www.nfl.com/news/bucky-brooks-2026-nfl-mock-draft-2-0-jets-grab-edge-rusher-receiver-rams-double-dip-on-dbs",
];

// Extract name → headshot URL pairs from an NFL.com article.
// Relies on <img alt="Player Name"> being near a god-prospect-headshots URL.
function extractHeadshotPairs(html: string): Map<string, string> {
  const pairs = new Map<string, string>();
  const seen = new Set<string>();

  const imgPattern = /<img[^>]+alt="([A-Z][a-z]+(?:\s[A-Z][^"]{1,30})?)"[^>]*>/g;
  let m: RegExpExecArray | null;

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

    // Search in a window around the img tag for a headshot UUID
    const start = Math.max(0, m.index - 50);
    const window = html.substring(start, m.index + m[0].length + 400);
    const shot = window.match(/god-prospect-headshots\/([0-9]{4})\/([a-f0-9-]{30,40})/);
    if (shot) {
      pairs.set(name, `${HEADSHOT_BASE}/${shot[1]}/${shot[2]}`);
    }
  }

  return pairs;
}

// Scrape all headshot sources and bulk-update players.image_url
export async function scrapeAllHeadshots(): Promise<{
  scrapedNames: number;
  updated: number;
  alreadyHad: number;
}> {
  const allPlayers = await storage.getPlayers();
  const combined = new Map<string, string>();

  for (const url of HEADSHOT_SOURCES) {
    try {
      const html = await fetchHtml(url);
      const found = extractHeadshotPairs(html);
      for (const [name, imageUrl] of found) {
        if (!combined.has(name)) combined.set(name, imageUrl);
      }
    } catch (err: any) {
      console.warn(`[headshots] Failed to fetch ${url}: ${err?.message}`);
    }
  }

  let updated = 0;
  let alreadyHad = 0;

  for (const [name, imageUrl] of combined) {
    const matched = matchPlayer(name, allPlayers);
    if (!matched) continue;

    if (matched.imageUrl) {
      alreadyHad++;
      continue;
    }

    await db
      .update(playersTable)
      .set({ imageUrl })
      .where(eq(playersTable.id, matched.id));
    matched.imageUrl = imageUrl; // update local copy
    updated++;
  }

  console.log(
    `[headshots] Scraped ${combined.size} names → updated ${updated} players (${alreadyHad} already had headshots)`
  );
  return { scrapedNames: combined.size, updated, alreadyHad };
}
