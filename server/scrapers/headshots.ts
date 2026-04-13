import { storage } from "../storage";
import { fetchHtml } from "./index";
import { db } from "../db";
import { players as playersTable } from "@shared/schema";
import { eq } from "drizzle-orm";

// Convert a player name to a Player Profiler URL slug
// e.g. "A'Mauri Washington" → "amauri-washington"
// e.g. "Rueben Bain Jr." → "rueben-bain-jr"
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/'/g, "")           // remove apostrophes
    .replace(/\./g, "")          // remove periods
    .replace(/[^a-z0-9\s-]/g, "") // remove other special chars
    .trim()
    .replace(/\s+/g, "-");       // spaces to hyphens
}

// Fetch headshot URL from Player Profiler for a single player
async function fetchPlayerProfilerHeadshot(name: string): Promise<string | null> {
  const slug = toSlug(name);
  const url = `https://www.playerprofiler.com/nfl/${slug}/`;
  try {
    const html = await fetchHtml(url);
    // Primary: schema markup image
    const schemaMatch = html.match(/"image"\s*:\s*"(https:[^"]+playerprofiler\.com\/wp-content\/uploads\/[^"]+\.(?:png|jpg|jpeg|webp))"/i);
    if (schemaMatch) return schemaMatch[1];
    // Fallback: og:image meta tag
    const ogMatch = html.match(/property="og:image"\s+content="([^"]+)"/i)
      || html.match(/content="([^"]+)"\s+property="og:image"/i);
    if (ogMatch && ogMatch[1].includes("playerprofiler")) return ogMatch[1];
    // Fallback: any wp-content upload matching player slug
    const wpMatch = html.match(new RegExp(`https:[^"']+wp-content/uploads/[^"']+${slug.split('-')[0]}[^"']*\\.(?:png|jpg|jpeg|webp)`, 'i'));
    if (wpMatch) return wpMatch[0];
    return null;
  } catch {
    return null;
  }
}

// Scrape Player Profiler headshots for all players in the DB
export async function scrapeAllHeadshots(): Promise<{
  scrapedNames: number;
  updated: number;
  alreadyHad: number;
  failed: string[];
}> {
  const allPlayers = await storage.getPlayers();
  let updated = 0;
  let alreadyHad = 0;
  const failed: string[] = [];

  for (const player of allPlayers) {
    if (player.imageUrl) {
      alreadyHad++;
      continue;
    }
    const imageUrl = await fetchPlayerProfilerHeadshot(player.name);
    if (imageUrl) {
      await db.update(playersTable).set({ imageUrl }).where(eq(playersTable.id, player.id));
      console.log(`[headshots] ✓ ${player.name}`);
      updated++;
    } else {
      console.warn(`[headshots] ✗ No headshot found for ${player.name}`);
      failed.push(player.name);
    }
  }

  console.log(`[headshots] Done: ${updated} updated, ${alreadyHad} already had, ${failed.length} failed`);
  return { scrapedNames: allPlayers.length, updated, alreadyHad, failed };
}
