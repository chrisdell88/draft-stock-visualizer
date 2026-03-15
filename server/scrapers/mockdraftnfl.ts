import { storage } from "../storage";
import { fetchHtml, matchPlayer, type ScraperResult } from "./index";
import * as cheerio from "cheerio";
import { type Player } from "@shared/schema";

// mockdraftnfl.com uses h2 headings with team name in a link + player on next line:
// <h2>
//   <a href="...">Las Vegas Raiders</a>
//   Fernando Mendoza, QB, Indiana
// </h2>
// Pick number = order of appearance in the article.

function parseMockDraftNfl(html: string): Array<{ pickNumber: number; playerName: string }> {
  const $ = cheerio.load(html);
  const picks: Array<{ pickNumber: number; playerName: string }> = [];

  $("h2").each((_i, el) => {
    const fullText = $(el).text().trim();
    if (!fullText) return;

    // Split on newlines to get separate lines
    const lines = fullText.split(/\n|\r/).map(l => l.trim()).filter(Boolean);

    // Structure: lines[0] = "1. Las Vegas Raiders", lines[1] = "Fernando Mendoza, QB, Indiana"
    if (lines.length >= 2) {
      const playerLine = lines[1];
      const commaIdx = playerLine.indexOf(",");
      const playerName = commaIdx > -1 ? playerLine.slice(0, commaIdx).trim() : playerLine.trim();
      if (playerName && playerName.length > 2) {
        picks.push({ pickNumber: picks.length + 1, playerName });
      }
    } else {
      // Fallback: single-line h2 that might be "N. Team: PlayerName, Pos"
      const colonIdx = fullText.indexOf(":");
      if (colonIdx > -1) {
        const after = fullText.slice(colonIdx + 1).trim();
        const commaIdx = after.indexOf(",");
        const playerName = commaIdx > -1 ? after.slice(0, commaIdx).trim() : after;
        if (playerName && playerName.length > 2) {
          picks.push({ pickNumber: picks.length + 1, playerName });
        }
      }
    }
  });

  return picks;
}

export async function scrapeMockDraftNfl(players: Player[]): Promise<ScraperResult> {
  const sourceKey = "mockdraftnfl";
  const today = new Date().toISOString().slice(0, 10);

  const existing = await storage.getMockDraftBySourceKeyAndDate(sourceKey, today);
  if (existing) {
    const pickCount = await storage.getMockDraftPickCount(existing.id);
    if (pickCount > 0) {
      return { sourceKey, picksFound: 0, newMockCreated: false, mockDraftId: existing.id };
    }
    // Existing mock has 0 picks — delete and re-create
  }

  const html = await fetchHtml("https://www.mockdraftnfl.com/2026/mock/");
  const picks = parseMockDraftNfl(html);

  const analyst = await storage.getAnalystBySourceKey(sourceKey);
  const mockDraft = await storage.createMockDraft({
    sourceName: `MockDraftNFL — ${new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })}`,
    sourceKey,
    analystId: analyst?.id,
    url: "https://www.mockdraftnfl.com/2026/mock/",
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
