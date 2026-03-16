import { storage } from "../storage";
import { fetchHtml, ensurePlayer, type ScraperResult } from "./index";
import * as cheerio from "cheerio";
import { type Player } from "@shared/schema";

// mockdraftnfl.com uses h2 headings with team name in a link + player on next line:
// <h2>
//   <a href="...">Las Vegas Raiders</a>
//   Fernando Mendoza, QB, Indiana
// </h2>
// Pick number = order of appearance in the article.

interface MDNPick {
  pickNumber: number;
  playerName: string;
  position: string | null;
  college: string | null;
}

function parseMockDraftNfl(html: string): MDNPick[] {
  const $ = cheerio.load(html);
  const picks: MDNPick[] = [];

  $("h2").each((_i, el) => {
    const fullText = $(el).text().trim();
    if (!fullText) return;

    const lines = fullText.split(/\n|\r/).map(l => l.trim()).filter(Boolean);

    // Structure: lines[0] = "1. Las Vegas Raiders", lines[1] = "Fernando Mendoza, QB, Indiana"
    if (lines.length >= 2) {
      const parts = lines[1].split(",").map(s => s.trim());
      const playerName = parts[0] ?? "";
      if (playerName.length > 2) {
        picks.push({
          pickNumber: picks.length + 1,
          playerName,
          position: parts[1] ?? null,
          college: parts[2] ?? null,
        });
      }
    } else {
      const colonIdx = fullText.indexOf(":");
      if (colonIdx > -1) {
        const parts = fullText.slice(colonIdx + 1).trim().split(",").map(s => s.trim());
        const playerName = parts[0] ?? "";
        if (playerName.length > 2) {
          picks.push({
            pickNumber: picks.length + 1,
            playerName,
            position: parts[1] ?? null,
            college: parts[2] ?? null,
          });
        }
      }
    }
  });

  return picks;
}

export async function scrapeMockDraftNfl(players: Player[], urlOverride?: string): Promise<ScraperResult> {
  const sourceKey = "mockdraftnfl";
  const today = new Date().toISOString().slice(0, 10);

  const existing = await storage.getMockDraftBySourceKeyAndDate(sourceKey, today);
  if (existing) {
    const pickCount = await storage.getMockDraftPickCount(existing.id);
    if (pickCount > 0) {
      return { sourceKey, picksFound: pickCount, newMockCreated: false, mockDraftId: existing.id };
    }
    // Existing mock has 0 picks — delete and re-create
  }

  const defaultUrl = "https://www.mockdraftnfl.com/2026/mock/";
  const scrapeUrl = urlOverride || defaultUrl;
  const html = await fetchHtml(scrapeUrl);
  const picks = parseMockDraftNfl(html);

  const analyst = await storage.getAnalystBySourceKey(sourceKey);
  const mockDraft = await storage.createMockDraft({
    sourceName: `MockDraftNFL — ${new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })}`,
    sourceKey,
    analystId: analyst?.id,
    url: scrapeUrl,
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
