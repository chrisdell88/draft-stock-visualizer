import { storage } from "../storage";
import { fetchHtml, matchPlayer, type ScraperResult } from "./index";
import { type Player } from "@shared/schema";
import { db } from "../db";
import { players as playersTable } from "@shared/schema";
import { eq } from "drizzle-orm";

// NFL.com mock draft articles contain prospect headshots via:
// alt="Player Name" + nearby "god-prospect-headshots/{year}/{uuid}" URL
// The sequential order of unique player names = pick order

const HEADSHOT_BASE = "https://static.www.nfl.com/image/private/t_official/f_auto/league/god-prospect-headshots";

function parseNflcomArticle(html: string): Array<{
  playerName: string;
  headshotUrl: string | null;
}> {
  const results: Array<{ playerName: string; headshotUrl: string | null }> = [];
  const seen = new Set<string>();

  // Find all instances of alt="Name" near a god-prospect-headshots URL
  // Scan through the HTML looking for picture elements with prospect headshots
  const chunks = html.split(/god-prospect-headshots\//);

  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    // Extract year/uuid from start of chunk: "2023/32004d45-..."
    const uuidMatch = chunk.match(/^([0-9]{4})\/([a-f0-9-]{30,40})/);
    if (!uuidMatch) continue;

    const year = uuidMatch[1];
    const uuid = uuidMatch[2];
    const headshotUrl = `${HEADSHOT_BASE}/${year}/${uuid}`;

    // Look backward in previous chunk for alt="Name"
    const prevChunk = chunks[i - 1];
    const altMatch = prevChunk.match(/alt="([^"]+)"[^>]*>?\s*$/);
    if (!altMatch) {
      // Try looking forward in current chunk
      const fwdAlt = chunk.match(/alt="([^"]+)"/);
      if (!fwdAlt) continue;
      const name = fwdAlt[1];
      if (name && name.length > 3 && !name.startsWith("NFL") && !name.includes("Logo") && !seen.has(name)) {
        seen.add(name);
        results.push({ playerName: name, headshotUrl });
      }
      continue;
    }

    const name = altMatch[1];
    if (name && name.length > 3 && !name.startsWith("NFL") && !name.includes("Logo") && !name.includes("Team") && !seen.has(name)) {
      seen.add(name);
      results.push({ playerName: name, headshotUrl });
    }
  }

  return results;
}

async function runNflcomScraper(
  sourceKey: string,
  displayName: string,
  url: string,
  allPlayers: Player[]
): Promise<ScraperResult> {
  const today = new Date().toISOString().slice(0, 10);

  const existing = await storage.getMockDraftBySourceKeyAndDate(sourceKey, today);
  if (existing) {
    return { sourceKey, picksFound: 0, newMockCreated: false, mockDraftId: existing.id };
  }

  const html = await fetchHtml(url);
  const entries = parseNflcomArticle(html);

  const analyst = await storage.getAnalystBySourceKey(sourceKey);
  const mockDraft = await storage.createMockDraft({
    sourceName: `${displayName} — ${new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })}`,
    sourceKey,
    analystId: analyst?.id,
    url,
    boardType: "mock",
  });

  const dbPicks: Array<{ mockDraftId: number; playerId: number; pickNumber: number }> = [];
  let pickNum = 1;

  for (const { playerName, headshotUrl } of entries) {
    const matched = matchPlayer(playerName, allPlayers);
    if (matched) {
      dbPicks.push({ mockDraftId: mockDraft.id, playerId: matched.id, pickNumber: pickNum });

      // Update player headshot if they don't have one yet
      if (headshotUrl && !matched.imageUrl) {
        await db.update(playersTable)
          .set({ imageUrl: headshotUrl })
          .where(eq(playersTable.id, matched.id));
        // Update local copy so we don't re-write
        matched.imageUrl = headshotUrl;
      }

      pickNum++;
    }
  }

  if (dbPicks.length > 0) {
    await storage.createMockDraftPicks(dbPicks);
  }

  return { sourceKey, picksFound: dbPicks.length, newMockCreated: true, mockDraftId: mockDraft.id };
}

export async function scrapeZierlein(players: Player[]): Promise<ScraperResult> {
  return runNflcomScraper(
    "nfl_zierlein",
    "Lance Zierlein (NFL.com)",
    "https://www.nfl.com/news/lance-zierlein-2026-nfl-mock-draft-2-0-two-cbs-in-top-five-combine-star-sonny-styles-cracks-top-10",
    players
  );
}

export async function scrapeBrooks(players: Player[]): Promise<ScraperResult> {
  return runNflcomScraper(
    "nfl_brooks",
    "Bucky Brooks (NFL.com)",
    "https://www.nfl.com/news/bucky-brooks-2026-nfl-mock-draft-2-0-jets-grab-edge-rusher-receiver-rams-double-dip-on-dbs",
    players
  );
}

export async function scrapeDavis(players: Player[]): Promise<ScraperResult> {
  return runNflcomScraper(
    "nfl_davis",
    "Charles Davis (NFL.com)",
    "https://www.nfl.com/news/charles-davis-2026-nfl-mock-draft-2-0-cardinals-seahawks-select-notre-dame-rbs-in-round-1",
    players
  );
}
