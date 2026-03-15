import { storage } from "../storage";
import { fetchHtml, matchPlayer, type ScraperResult } from "./index";
import { type Player } from "@shared/schema";

// Sharp Football Analysis mock drafts use h3 headings with pattern:
// <h3 id="no1">1. Las Vegas Raiders, Top Draft Pick Prediction: Fernando Mendoza, QB, Indiana</h3>
// or similar "Pick Prediction:" format

function parseSharpFootballPicks(html: string): Array<{ pickNumber: number; playerName: string }> {
  const picks: Array<{ pickNumber: number; playerName: string }> = [];

  // Primary pattern: "Top Draft Pick Prediction: Name, Pos, College"
  const predPattern = /id="no(\d+)"[^>]*>[\s\S]*?(?:Top Draft Pick Prediction|Pick Prediction|Predicted Pick):\s*([^,<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = predPattern.exec(html)) !== null) {
    const pickNumber = parseInt(m[1], 10);
    const playerName = m[2].trim().replace(/&amp;/g, "&").replace(/&#039;/g, "'");
    if (pickNumber >= 1 && pickNumber <= 300 && playerName.length > 2) {
      picks.push({ pickNumber, playerName });
    }
  }

  if (picks.length > 0) return picks;

  // Fallback: h3 id="noN" with "N. Team, Prediction: Player, Pos, College"
  const h3Pattern = /id="no(\d+)"[^>]*>(\d+)\.\s[^,]+,\s+(?:Top Draft Pick Prediction|Pick|Selection):\s*([^,<]+)/gi;
  while ((m = h3Pattern.exec(html)) !== null) {
    const pickNumber = parseInt(m[1], 10);
    const playerName = m[3].trim();
    if (pickNumber >= 1 && pickNumber <= 300 && playerName.length > 2) {
      picks.push({ pickNumber, playerName });
    }
  }

  if (picks.length > 0) return picks;

  // Broader fallback: any h3 with "noN" id and player name
  const broadPattern = /<h3[^>]+id="no(\d+)"[^>]*>([^<]*)<\/h3>/gi;
  while ((m = broadPattern.exec(html)) !== null) {
    const pickNumber = parseInt(m[1], 10);
    const text = m[2];
    // Try to find player name after last ": " or ". "
    const colonIdx = text.lastIndexOf(":");
    if (colonIdx > -1) {
      const after = text.slice(colonIdx + 1).trim();
      const commaIdx = after.indexOf(",");
      const playerName = commaIdx > -1 ? after.slice(0, commaIdx).trim() : after;
      if (pickNumber >= 1 && pickNumber <= 300 && playerName.length > 2) {
        picks.push({ pickNumber, playerName });
      }
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
    return { sourceKey, picksFound: 0, newMockCreated: false, mockDraftId: existing.id };
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
  for (const { pickNumber, playerName } of picks) {
    const matched = matchPlayer(playerName, players);
    if (matched) {
      dbPicks.push({ mockDraftId: mockDraft.id, playerId: matched.id, pickNumber });
    }
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
