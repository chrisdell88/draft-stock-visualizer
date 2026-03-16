import axios from "axios";
import * as cheerio from "cheerio";
import { storage } from "../storage";
import { type Player } from "@shared/schema";

// ─── Player Name Matching ────────────────────────────────────────────────────

function normalizeName(name: string): string {
  return name.toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^a-z' ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Match an incoming name (from scrape) to an existing player in our DB
export function matchPlayer(name: string, playerList: Player[]): Player | undefined {
  const norm = normalizeName(name);
  // Exact match
  let match = playerList.find(p => normalizeName(p.name) === norm);
  if (match) return match;
  // Last name only (for cases like "Arvell Reese" → "Reese")
  const words = norm.split(" ").filter(Boolean);
  if (words.length >= 2) {
    const lastName = words[words.length - 1];
    const firstName = words[0];
    match = playerList.find(p => {
      const pWords = normalizeName(p.name).split(" ");
      return pWords[pWords.length - 1] === lastName && pWords[0].startsWith(firstName[0]);
    });
    if (match) return match;
  }
  // Partial substring match
  match = playerList.find(p => normalizeName(p.name).includes(norm) || norm.includes(normalizeName(p.name)));
  return match;
}

// Ensure a player exists — match first, auto-create with pos/college if not found.
// Returns the player and the (potentially expanded) player list for subsequent calls.
export async function ensurePlayer(
  name: string,
  players: Player[],
  position?: string | null,
  college?: string | null
): Promise<{ player: Player; created: boolean; players: Player[] }> {
  const matched = matchPlayer(name, players);
  if (matched) return { player: matched, created: false, players };

  const newPlayer = await storage.createPlayer({
    name,
    position: position ?? null,
    college: college ?? null,
  });

  const updated = [...players, newPlayer];
  console.log(`[ensurePlayer] Auto-created: ${name} (${position ?? "?"}, ${college ?? "?"})`);
  return { player: newPlayer, created: true, players: updated };
}

// ─── HTTP Fetch ────────────────────────────────────────────────────────────

export async function fetchHtml(url: string): Promise<string> {
  const response = await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://www.google.com/",
    },
    timeout: 25000,
    maxRedirects: 10,
  });
  return response.data;
}

// ─── Scraper Registry ─────────────────────────────────────────────────────

export interface ScraperResult {
  sourceKey: string;
  picksFound: number;
  newMockCreated: boolean;
  mockDraftId?: number;
  error?: string;
}

export interface ScraperModule {
  sourceKey: string;
  displayName: string;
  run(players: Player[], urlOverride?: string): Promise<ScraperResult>;
}

import { scrapeWalterfootballWalt, scrapeWalterfootballCharlie } from "./walterfootball";
import { scrapeTankathon } from "./tankathon";
import { scrapeMddbConsensus, scrapeMddbBigBoard, scrapeMcShay, scrapeFreedman } from "./nflmdb_generic";
import { scrapeMcCrystal, scrapeDonahue } from "./sharp";
import { scrapeZierlein, scrapeBrooks, scrapeDavis, scrapeJeremiahBigBoard } from "./nflcom";
import { scrapeMockDraftNfl } from "./mockdraftnfl";
import {
  scrapeDraftTek, scrapePfnBigBoard, scrapeNflDraftBuzz,
  scrapeDraftNetwork, scrapeDraftWire, scrapeWalterBigBoard,
  scrapeNfldraftRankings, scrapeSportingNewsBigBoard,
} from "./bigboards";

export const SCRAPERS: ScraperModule[] = [
  { sourceKey: "walterfootball_walt",    displayName: "WalterFootball (Walt)",             run: scrapeWalterfootballWalt },
  { sourceKey: "walterfootball_charlie", displayName: "WalterFootball (Charlie Campbell)",  run: scrapeWalterfootballCharlie },
  { sourceKey: "tankathon",             displayName: "Tankathon Big Board",                run: scrapeTankathon },
  { sourceKey: "mddb_consensus",        displayName: "MDDB Consensus Mock Draft",           run: scrapeMddbConsensus },
  { sourceKey: "mddb_bigboard",         displayName: "MDDB Consensus Big Board",            run: scrapeMddbBigBoard },
  { sourceKey: "mcshay_report",         displayName: "Todd McShay Mock Draft",              run: scrapeMcShay },
  { sourceKey: "fantasypros_freedman",  displayName: "FantasyLife (Freedman)",              run: scrapeFreedman },
  { sourceKey: "sharp_mccrystal",       displayName: "Ryan McCrystal (Sharp Football)",     run: scrapeMcCrystal },
  { sourceKey: "sharp_donahue",         displayName: "Brendan Donahue (Sharp Football)",    run: scrapeDonahue },
  { sourceKey: "nfl_zierlein",          displayName: "Lance Zierlein (NFL.com)",            run: scrapeZierlein },
  { sourceKey: "nfl_brooks",            displayName: "Bucky Brooks (NFL.com)",              run: scrapeBrooks },
  { sourceKey: "nfl_davis",             displayName: "Charles Davis (NFL.com)",             run: scrapeDavis },
  { sourceKey: "nfl_jeremiah_bigboard", displayName: "Daniel Jeremiah Top-50 (NFL.com)",   run: scrapeJeremiahBigBoard },
  { sourceKey: "mockdraftnfl",          displayName: "MockDraftNFL Consensus",              run: scrapeMockDraftNfl },
];

// ─── Run a single scraper ────────────────────────────────────────────────

export async function runScraper(sourceKey: string): Promise<ScraperResult> {
  const scraper = SCRAPERS.find(s => s.sourceKey === sourceKey);
  if (!scraper) {
    return { sourceKey, picksFound: 0, newMockCreated: false, error: `Unknown scraper: ${sourceKey}` };
  }
  
  await storage.upsertScrapeJob({ sourceKey, status: "running" });
  
  const analysts = await storage.getAnalysts();
  const analyst = analysts.find(a => a.sourceKey === sourceKey)
    || analysts.find(a => a.sourceKey && sourceKey.startsWith(a.sourceKey));
  const urlOverride = analyst?.scrapeUrl ?? undefined;
  
  try {
    const allPlayers = await storage.getPlayers();
    const result = await scraper.run(allPlayers, urlOverride);
    
    await storage.upsertScrapeJob({
      sourceKey,
      status: "success",
      picksFound: result.picksFound,
      errorMessage: null,
      lastRunAt: new Date(),
    });
    await storage.logScrapeRun(sourceKey, "success", result.picksFound);
    
    return result;
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await storage.upsertScrapeJob({
      sourceKey,
      status: "error",
      errorMessage,
      lastRunAt: new Date(),
    });
    await storage.logScrapeRun(sourceKey, "error", 0, errorMessage);
    return { sourceKey, picksFound: 0, newMockCreated: false, error: errorMessage };
  }
}

// ─── Run all scrapers ────────────────────────────────────────────────────

export async function runAllScrapers(): Promise<ScraperResult[]> {
  const analysts = await storage.getAnalysts();
  const enabledKeys = new Set(
    analysts.filter(a => a.enabled !== 0 && a.sourceKey).map(a => a.sourceKey!)
  );

  const results: ScraperResult[] = [];
  for (const scraper of SCRAPERS) {
    if (enabledKeys.size > 0 && !enabledKeys.has(scraper.sourceKey)) {
      results.push({ sourceKey: scraper.sourceKey, picksFound: 0, newMockCreated: false, error: "Disabled" });
      continue;
    }
    const result = await runScraper(scraper.sourceKey);
    results.push(result);
  }
  return results;
}

export { cheerio };
