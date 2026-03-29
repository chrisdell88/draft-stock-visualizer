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

// WalterFootball Walt pages use div[data-number] for each pick.
// The <strong><a> link text is "Player Name, Pos, College"
// WalterFootball Charlie pages use div[id^="mockDraftSlot_"] with <a class="report-link">
async function parseWalterfootballPage(url: string): Promise<WFPick[]> {
  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    console.warn(`[WF] fetch failed for ${url}:`, err instanceof Error ? err.message : String(err));
    return [];
  }
  const $ = cheerio.load(html);
  const picks: WFPick[] = [];

  // Walt format: div[data-number]
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

  if (picks.length > 0) return picks;

  // Charlie format: div[id^="mockDraftSlot_"] with pick-number span and report-link anchor
  $("div[id^='mockDraftSlot_']").each((_i, el) => {
    const slotId = $(el).attr("id") ?? "";
    const pickNum = parseInt(slotId.replace("mockDraftSlot_", ""), 10);
    if (isNaN(pickNum) || pickNum < 1 || pickNum > 300) return;

    let playerName = "";
    let position: string | null = null;
    let college: string | null = null;

    // Try report-link first (player has a scouting report)
    $(el).find("a.report-link").each((_j, anchor) => {
      const text = $(anchor).text().trim();
      if (text && !text.includes("Scouting Report") && text.length > 2 && !playerName) {
        playerName = text;
      }
    });

    // Fallback: no report-link — player name is plain text in the second span of the td
    // Structure: <span>Team Name:</span><span>Player Name, Pos, College</span>
    if (!playerName) {
      const td = $(el).find("td[style*='font-weight:bold']").first();
      const spans = td.find("span[style*='display:inline-block']");
      if (spans.length >= 2) {
        const playerSpanText = $(spans[1]).text().trim();
        const parts = playerSpanText.split(",").map(s => s.trim()).filter(Boolean);
        if (parts.length >= 1 && parts[0].length > 2) {
          playerName = parts[0];
          position = parts[1] ?? null;
          college = parts[2] ?? null;
        }
      }
    }

    // Position and college from span context when found via report-link
    if (playerName && !position) {
      const td = $(el).find("td[style*='font-weight:bold']").first();
      const spans = td.find("span[style*='display:inline-block']");
      if (spans.length >= 2) {
        const playerSpanText = $(spans[1]).text().trim();
        const parts = playerSpanText.split(",").map(s => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
          position = parts[1] ?? null;
          college = parts[2] ?? null;
        }
      }
    }

    if (playerName && playerName.length > 2) {
      picks.push({ pickNumber: pickNum, playerName, position, college });
    }
  });

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

  // Scrape pages sequentially to avoid rate limiting
  const allPicks: Array<{ pickNumber: number; playerName: string; position?: string | null; college?: string | null }> = [];
  const seenPickNums = new Set<number>();
  for (const url of pageUrls) {
    const pagePicks = await parseWalterfootballPage(url);
    for (const pick of pagePicks) {
      if (!seenPickNums.has(pick.pickNumber)) {
        seenPickNums.add(pick.pickNumber);
        allPicks.push(pick);
      }
    }
    // Delay between pages to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
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
