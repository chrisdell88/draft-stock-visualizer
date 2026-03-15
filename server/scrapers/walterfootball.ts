import { storage } from "../storage";
import { fetchHtml, matchPlayer, type ScraperResult } from "./index";
import * as cheerio from "cheerio";
import { type Player } from "@shared/schema";

// WalterFootball pages use div.player-info[data-number] for each pick.
// Each div has data-number = pick number, and contains a <strong><a> with player text.
async function parseWalterfootballPage(url: string): Promise<Array<{ pickNumber: number; playerName: string }>> {
  let html: string;
  try {
    html = await fetchHtml(url);
  } catch {
    return [];
  }
  const $ = cheerio.load(html);
  const picks: Array<{ pickNumber: number; playerName: string }> = [];

  // Primary: div.player-info with data-number attribute
  $("div[data-number]").each((_i, el) => {
    const pickNum = parseInt($(el).attr("data-number") ?? "0", 10);
    if (isNaN(pickNum) || pickNum < 1 || pickNum > 300) return;

    // Look for strong > a (the player link) or just strong text
    let playerName = "";
    const link = $(el).find("strong a").first();
    if (link.length) {
      const text = link.text().trim();
      const commaIdx = text.indexOf(",");
      playerName = commaIdx > -1 ? text.slice(0, commaIdx).trim() : text;
    } else {
      // Fallback: strong text with "Team: Player, Pos, College" format
      const strong = $(el).find("strong").first().text().trim();
      const colonIdx = strong.indexOf(":");
      if (colonIdx > -1) {
        const afterColon = strong.slice(colonIdx + 1).trim();
        const commaIdx = afterColon.indexOf(",");
        playerName = commaIdx > -1 ? afterColon.slice(0, commaIdx).trim() : afterColon;
      }
    }

    if (playerName && playerName.length > 2) {
      picks.push({ pickNumber: pickNum, playerName });
    }
  });

  // Fallback: table row approach (some older page formats)
  if (picks.length === 0) {
    $("table tr").each((_i, row) => {
      const cells = $(row).find("td");
      if (cells.length < 3) return;
      const pickNumText = $(cells[0]).text().trim().replace(".", "");
      const pickNum = parseInt(pickNumText, 10);
      if (isNaN(pickNum) || pickNum < 1 || pickNum > 300) return;
      const thirdCell = $(cells[2]).text().trim();
      const colonIdx = thirdCell.indexOf(":");
      if (colonIdx < 0) return;
      const afterColon = thirdCell.slice(colonIdx + 1).trim();
      const commaIdx = afterColon.indexOf(",");
      const playerName = commaIdx > -1 ? afterColon.slice(0, commaIdx).trim() : afterColon;
      if (playerName && playerName.length > 2) picks.push({ pickNumber: pickNum, playerName });
    });
  }

  return picks;
}

// Runs Walt or Charlie scraper for all available pages (rounds 1-3)
async function runWalterfootball(
  sourceKey: string,
  displayName: string,
  analystSourceKey: string,
  pageUrls: string[],
  players: Player[]
): Promise<ScraperResult> {
  const today = new Date().toISOString().slice(0, 10);

  const existing = await storage.getMockDraftBySourceKeyAndDate(sourceKey, today);
  if (existing) {
    return { sourceKey, picksFound: 0, newMockCreated: false, mockDraftId: existing.id };
  }

  // Scrape all pages in parallel
  const pagePickArrays = await Promise.all(pageUrls.map(u => parseWalterfootballPage(u)));
  const allPicks: Array<{ pickNumber: number; playerName: string }> = [];
  const seenPickNums = new Set<number>();
  for (const pagePicks of pagePickArrays) {
    for (const pick of pagePicks) {
      if (!seenPickNums.has(pick.pickNumber)) {
        seenPickNums.add(pick.pickNumber);
        allPicks.push(pick);
      }
    }
  }

  const analyst = await storage.getAnalystBySourceKey(analystSourceKey);
  const mockDraft = await storage.createMockDraft({
    sourceName: `${displayName} — ${new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })}`,
    sourceKey,
    analystId: analyst?.id,
    url: pageUrls[0],
    boardType: "mock",
  });

  const dbPicks: Array<{ mockDraftId: number; playerId: number; pickNumber: number }> = [];
  for (const { pickNumber, playerName } of allPicks) {
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

export async function scrapeWalterfootballWalt(players: Player[]): Promise<ScraperResult> {
  return runWalterfootball(
    "walterfootball_walt",
    "WalterFootball (Walt)",
    "walterfootball_walt",
    [
      "https://walterfootball.com/draft2026.php",
      "https://walterfootball.com/draft2026_1.php",
      "https://walterfootball.com/draft2026_2.php",
      "https://walterfootball.com/draft2026_3.php",
    ],
    players
  );
}

export async function scrapeWalterfootballCharlie(players: Player[]): Promise<ScraperResult> {
  return runWalterfootball(
    "walterfootball_charlie",
    "WalterFootball (Charlie Campbell)",
    "walterfootball_charlie",
    [
      "https://walterfootball.com/draft2026charlie.php",
      "https://walterfootball.com/draft2026charlie_1.php",
      "https://walterfootball.com/draft2026charlie_2.php",
      "https://walterfootball.com/draft2026charlie_3.php",
    ],
    players
  );
}
