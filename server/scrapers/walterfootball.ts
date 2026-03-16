import { storage } from "../storage";
import { fetchHtml, ensurePlayer, type ScraperResult } from "./index";
import * as cheerio from "cheerio";
import { type Player } from "@shared/schema";

interface WFPick {
  pickNumber: number;
  playerName: string;
  position: string | null;
  college: string | null;
}

// WalterFootball pages use div[data-number] for each pick.
// The <strong><a> link text is "Player Name, Pos, College"
async function parseWalterfootballPage(url: string): Promise<WFPick[]> {
  let html: string;
  try {
    html = await fetchHtml(url);
  } catch {
    return [];
  }
  const $ = cheerio.load(html);
  const picks: WFPick[] = [];

  $("div[data-number]").each((_i, el) => {
    const pickNum = parseInt($(el).attr("data-number") ?? "0", 10);
    if (isNaN(pickNum) || pickNum < 1 || pickNum > 300) return;

    let playerName = "";
    let position: string | null = null;
    let college: string | null = null;

    const link = $(el).find("strong a").first();
    if (link.length) {
      const parts = link.text().trim().split(",").map(s => s.trim());
      playerName = parts[0] ?? "";
      position = parts[1] ?? null;
      college = parts[2] ?? null;
    } else {
      const strong = $(el).find("strong").first().text().trim();
      const colonIdx = strong.indexOf(":");
      if (colonIdx > -1) {
        const parts = strong.slice(colonIdx + 1).trim().split(",").map(s => s.trim());
        playerName = parts[0] ?? "";
        position = parts[1] ?? null;
        college = parts[2] ?? null;
      }
    }

    if (playerName && playerName.length > 2) {
      picks.push({ pickNumber: pickNum, playerName, position, college });
    }
  });

  // Fallback: table row approach for older page formats
  if (picks.length === 0) {
    $("table tr").each((_i, row) => {
      const cells = $(row).find("td");
      if (cells.length < 3) return;
      const pickNum = parseInt($(cells[0]).text().trim().replace(".", ""), 10);
      if (isNaN(pickNum) || pickNum < 1 || pickNum > 300) return;
      const thirdCell = $(cells[2]).text().trim();
      const colonIdx = thirdCell.indexOf(":");
      if (colonIdx < 0) return;
      const parts = thirdCell.slice(colonIdx + 1).trim().split(",").map(s => s.trim());
      const playerName = parts[0] ?? "";
      if (playerName.length > 2) {
        picks.push({ pickNumber: pickNum, playerName, position: parts[1] ?? null, college: parts[2] ?? null });
      }
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
    const pickCount = await storage.getMockDraftPickCount(existing.id);
    return { sourceKey, picksFound: pickCount, newMockCreated: false, mockDraftId: existing.id };
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
  let currentPlayers = players;
  for (const { pickNumber, playerName, position, college } of allPicks) {
    const { player, players: updated } = await ensurePlayer(playerName, currentPlayers, position, college);
    currentPlayers = updated;
    dbPicks.push({ mockDraftId: mockDraft.id, playerId: player.id, pickNumber });
  }

  if (dbPicks.length > 0) {
    await storage.createMockDraftPicks(dbPicks);
  }

  return { sourceKey, picksFound: dbPicks.length, newMockCreated: true, mockDraftId: mockDraft.id };
}

export async function scrapeWalterfootballWalt(players: Player[], urlOverride?: string): Promise<ScraperResult> {
  const defaultUrls = [
    "https://walterfootball.com/draft2026.php",
    "https://walterfootball.com/draft2026_1.php",
    "https://walterfootball.com/draft2026_2.php",
    "https://walterfootball.com/draft2026_3.php",
  ];
  return runWalterfootball(
    "walterfootball_walt",
    "WalterFootball (Walt)",
    "walterfootball_walt",
    urlOverride ? [urlOverride] : defaultUrls,
    players
  );
}

export async function scrapeWalterfootballCharlie(players: Player[], urlOverride?: string): Promise<ScraperResult> {
  const defaultUrls = [
    "https://walterfootball.com/draft2026charlie.php",
    "https://walterfootball.com/draft2026charlie_1.php",
    "https://walterfootball.com/draft2026charlie_2.php",
    "https://walterfootball.com/draft2026charlie_3.php",
  ];
  return runWalterfootball(
    "walterfootball_charlie",
    "WalterFootball (Charlie Campbell)",
    "walterfootball_charlie",
    urlOverride ? [urlOverride] : defaultUrls,
    players
  );
}
