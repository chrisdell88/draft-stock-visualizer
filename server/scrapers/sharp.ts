import { storage } from "../storage";
import { fetchHtml, ensurePlayer, type ScraperResult } from "./index";
import { type Player } from "@shared/schema";

// Sharp Football Analysis mock drafts use h3 headings with pattern:
// <h3 id="no1">1. Las Vegas Raiders, Top Draft Pick Prediction: Fernando Mendoza, QB, Indiana</h3>
// or similar "Pick Prediction:" format

interface SharpPick {
  pickNumber: number;
  playerName: string;
  position: string | null;
  college: string | null;
}

function parseSharpFootballPicks(html: string): SharpPick[] {
  const picks: SharpPick[] = [];

  // Full pattern: "Top Draft Pick Prediction: Name, Pos, College"
  const fullPattern = /id="no(\d+)"[^>]*>[\s\S]*?(?:Top Draft Pick Prediction|Pick Prediction|Predicted Pick):\s*([^,<]+),\s*([^,<]+),\s*([^<\n]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = fullPattern.exec(html)) !== null) {
    const pickNumber = parseInt(m[1], 10);
    const playerName = m[2].trim().replace(/&amp;/g, "&").replace(/&#039;/g, "'");
    const position = m[3].trim() || null;
    const college = m[4].trim().replace(/<[^>]+>/g, "").trim() || null;
    if (pickNumber >= 1 && pickNumber <= 300 && playerName.length > 2) {
      picks.push({ pickNumber, playerName, position, college });
    }
  }

  if (picks.length > 0) return picks;

  // Fallback: name only (no pos/college)
  const namePattern = /id="no(\d+)"[^>]*>[\s\S]*?(?:Top Draft Pick Prediction|Pick Prediction|Predicted Pick):\s*([^,<]+)/gi;
  while ((m = namePattern.exec(html)) !== null) {
    const pickNumber = parseInt(m[1], 10);
    const playerName = m[2].trim().replace(/&amp;/g, "&").replace(/&#039;/g, "'");
    if (pickNumber >= 1 && pickNumber <= 300 && playerName.length > 2) {
      picks.push({ pickNumber, playerName, position: null, college: null });
    }
  }

  return picks;
}

async function runSharpScraper(
  sourceKey: string,
  displayName: string,
  url: string,
  players: Player[]
): Promise<ScraperResult> {
  const today = new Date().toISOString().slice(0, 10);

  const existing = await storage.getMockDraftBySourceKeyAndDate(sourceKey, today);
  if (existing) {
    const pickCount = await storage.getMockDraftPickCount(existing.id);
    return { sourceKey, picksFound: pickCount, newMockCreated: false, mockDraftId: existing.id };
  }

  const html = await fetchHtml(url);
  const picks = parseSharpFootballPicks(html);

  const analyst = await storage.getAnalystBySourceKey(sourceKey);
  const mockDraft = await storage.createMockDraft({
    sourceName: `${displayName} — ${new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })}`,
    sourceKey,
    analystId: analyst?.id,
    url,
    boardType: "mock",
  });

  const dbPicks: Array<{ mockDraftId: number; playerId: number; pickNumber: number }> = [];
  let currentPlayers = players;
  for (const { pickNumber, playerName, position, college } of picks) {
    const { player, players: updated } = await ensurePlayer(playerName, currentPlayers, position, college);
    currentPlayers = updated;
    dbPicks.push({ mockDraftId: mockDraft.id, playerId: player.id, pickNumber });
  }

  if (dbPicks.length > 0) {
    await storage.createMockDraftPicks(dbPicks);
  }

  return { sourceKey, picksFound: dbPicks.length, newMockCreated: true, mockDraftId: mockDraft.id };
}

export async function scrapeMcCrystal(players: Player[]): Promise<ScraperResult> {
  return runSharpScraper(
    "sharp_mccrystal",
    "Ryan McCrystal (Sharp Football)",
    "https://www.sharpfootballanalysis.com/analysis/2026-nfl-mock-draft-first-round-all-32-teams-ryan-mccrystal/",
    players
  );
}

export async function scrapeDonahue(players: Player[]): Promise<ScraperResult> {
  return runSharpScraper(
    "sharp_donahue",
    "Brendan Donahue (Sharp Football)",
    "https://www.sharpfootballanalysis.com/analysis/2026-nfl-mock-draft-first-round-all-32-teams-brendan-donahue/",
    players
  );
}
