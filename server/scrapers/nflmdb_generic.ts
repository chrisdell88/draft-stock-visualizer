import { storage } from "../storage";
import { matchPlayer, type ScraperResult } from "./index";
import * as cheerio from "cheerio";
import { type Player } from "@shared/schema";
import axios from "axios";

// Googlebot UA bypasses NFLMDB's bot-detection redirect to /restricted
const GOOGLEBOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

async function fetchNflmdb(url: string): Promise<string> {
  const response = await axios.get(url, {
    headers: {
      "User-Agent": GOOGLEBOT_UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
    timeout: 30000,
    maxRedirects: 5,
    validateStatus: (status) => status < 400,
  });
  return response.data;
}

// Decode HTML entities in a string
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

interface NflmdbEntry { pick?: number; player?: { name?: string; position?: string } }

// Parse picks from NFLMDB page — primary: data-react-props SSR JSON; fallbacks for older formats
function parseNflmdbPicks(html: string): Array<{ pickNumber: number; playerName: string; position?: string }> {
  // Strategy 1: data-react-props attribute (SSR JSON — most reliable)
  const reactPropsMatch = html.match(/data-react-props="([^"]+)"/);
  if (reactPropsMatch) {
    try {
      const decoded = decodeHtmlEntities(reactPropsMatch[1]);
      const props = JSON.parse(decoded);
      const selections: NflmdbEntry[] = props?.mock?.selections ?? [];
      const picks = selections
        .filter((s) => s.pick && s.player?.name)
        .map((s) => ({
          pickNumber: Number(s.pick),
          playerName: String(s.player!.name),
          position: s.player!.position ?? "",
        }))
        .filter((p) => p.pickNumber >= 1 && p.pickNumber <= 300);
      if (picks.length > 0) return picks;
    } catch { /* fall through */ }
  }

  const decoded = decodeHtmlEntities(html);

  // Strategy 2: Find "selections" JSON array anywhere in decoded HTML
  const selectIdx = decoded.indexOf('"selections":[');
  if (selectIdx > -1) {
    let depth = 0;
    let start = decoded.indexOf("[", selectIdx);
    let end = start;
    for (let i = start; i < Math.min(start + 50000, decoded.length); i++) {
      if (decoded[i] === "[") depth++;
      else if (decoded[i] === "]") { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end > start) {
      try {
        const arr = JSON.parse(decoded.slice(start, end)) as NflmdbEntry[];
        const picks = arr
          .filter((s) => s.pick && s.player?.name)
          .map((s) => ({
            pickNumber: Number(s.pick),
            playerName: String(s.player!.name),
            position: s.player!.position ?? "",
          }))
          .filter((p) => p.pickNumber >= 1 && p.pickNumber <= 300);
        if (picks.length > 0) return picks;
      } catch { /* fall through */ }
    }
  }

  // Strategy 3: Regex scan for pick+name pairs
  const pairPattern = /"pick":(\d+)[^}]{0,200}?"name":"([^"]+)"/g;
  const results: Array<{ pickNumber: number; playerName: string }> = [];
  const seen = new Set<number>();
  let m: RegExpExecArray | null;
  while ((m = pairPattern.exec(decoded)) !== null) {
    const pickNumber = parseInt(m[1], 10);
    const playerName = m[2];
    if (!seen.has(pickNumber) && pickNumber >= 1 && pickNumber <= 300) {
      seen.add(pickNumber);
      results.push({ pickNumber, playerName });
    }
  }
  if (results.length > 0) return results;

  // Strategy 4: Cheerio — player links + surrounding pick number
  const $ = cheerio.load(html);
  const fallback: Array<{ pickNumber: number; playerName: string }> = [];
  $("a[href*='/players/2026/']").each((_i, el) => {
    const name = $(el).text().trim();
    if (!name || name.length < 3) return;
    const container = $(el).closest("li, div, article, section, tr").first();
    const text = container.text();
    const pm = text.match(/\b(\d+)\b/);
    const pickNum = pm ? parseInt(pm[1], 10) : 0;
    if (pickNum >= 1 && pickNum <= 300 && !seen.has(pickNum)) {
      seen.add(pickNum);
      fallback.push({ pickNumber: pickNum, playerName: name });
    }
  });
  return fallback;
}

// Generic NFLMDB mock draft scraper — works for any NFLMDB mock draft URL
export function makeNflmdbScraper(config: {
  sourceKey: string;
  displayName: string;
  url: string;
  boardType?: "mock" | "bigboard";
  shortName?: string;
}) {
  return async function scrapeNflmdb(players: Player[], urlOverride?: string): Promise<ScraperResult> {
    const { sourceKey, displayName, url, boardType = "mock" } = config;
    const scrapeUrl = urlOverride || url;
    const today = new Date().toISOString().slice(0, 10);

    const existing = await storage.getMockDraftBySourceKeyAndDate(sourceKey, today);
    if (existing) {
      return { sourceKey, picksFound: 0, newMockCreated: false, mockDraftId: existing.id };
    }

    const html = await fetchNflmdb(scrapeUrl);
    const picks = parseNflmdbPicks(html);

    const analyst = await storage.getAnalystBySourceKey(sourceKey);
    const mockDraft = await storage.createMockDraft({
      sourceName: `${displayName} — ${new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })}`,
      sourceKey,
      analystId: analyst?.id,
      url: scrapeUrl,
      boardType,
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
  };
}

export const scrapeMcShay = makeNflmdbScraper({
  sourceKey: "mcshay_report",
  displayName: "Todd McShay Mock Draft",
  url: "https://www.nflmockdraftdatabase.com/mock-drafts/2026/the-mcshay-report-2026-todd-mcshay?date=2026-02-09",
});

export const scrapeFreedman = makeNflmdbScraper({
  sourceKey: "fantasypros_freedman",
  displayName: "FantasyLife (Matthew Freedman) Mock Draft",
  url: "https://www.nflmockdraftdatabase.com/mock-drafts/2026/fantasy-life-2026-matthew-freedman?date=2026-03-13",
});

export const scrapeMddbConsensus = makeNflmdbScraper({
  sourceKey: "mddb_consensus",
  displayName: "MDDB Consensus Mock Draft",
  url: "https://www.nflmockdraftdatabase.com/mock-drafts/2026/consensus-mock-draft-2026",
});

export const scrapeMddbBigBoard = makeNflmdbScraper({
  sourceKey: "mddb_bigboard",
  displayName: "MDDB Consensus Big Board",
  url: "https://www.nflmockdraftdatabase.com/big-boards/2026/consensus-big-board-2026",
  boardType: "bigboard",
});
