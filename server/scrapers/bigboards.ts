import { storage } from "../storage";
import { fetchHtml, ensurePlayer, matchPlayer, type ScraperResult } from "./index";
import * as cheerio from "cheerio";
import { type Player } from "@shared/schema";

interface BigBoardEntry {
  rank: number;
  playerName: string;
  position: string | null;
  college: string | null;
}

function makeBigBoardScraper(config: {
  sourceKey: string;
  displayName: string;
  defaultUrl: string;
  boardType?: "bigboard" | "mock";
  parse: (html: string) => BigBoardEntry[];
}) {
  return async function scrapeBigBoard(players: Player[], urlOverride?: string): Promise<ScraperResult> {
    const { sourceKey, displayName, defaultUrl, boardType = "bigboard" } = config;
    const scrapeUrl = urlOverride || defaultUrl;
    const today = new Date().toISOString().slice(0, 10);

    const existing = await storage.getMockDraftBySourceKeyAndDate(sourceKey, today);
    if (existing) {
      return { sourceKey, picksFound: 0, newMockCreated: false, mockDraftId: existing.id };
    }

    const html = await fetchHtml(scrapeUrl);
    const entries = config.parse(html);

    const analyst = await storage.getAnalystBySourceKey(sourceKey);
    const mockDraft = await storage.createMockDraft({
      sourceName: `${displayName} — ${new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })}`,
      sourceKey,
      analystId: analyst?.id,
      url: scrapeUrl,
      boardType,
    });

    const dbPicks: Array<{ mockDraftId: number; playerId: number; pickNumber: number }> = [];
    let currentPlayers = players;

    for (const entry of entries) {
      const result = await ensurePlayer(entry.playerName, currentPlayers, entry.position, entry.college);
      currentPlayers = result.players;
      dbPicks.push({ mockDraftId: mockDraft.id, playerId: result.player.id, pickNumber: entry.rank });
    }

    if (dbPicks.length > 0) {
      await storage.createMockDraftPicks(dbPicks);
    }

    return { sourceKey, picksFound: dbPicks.length, newMockCreated: true, mockDraftId: mockDraft.id };
  };
}

function parseDraftTek(html: string): BigBoardEntry[] {
  const $ = cheerio.load(html);
  const entries: BigBoardEntry[] = [];
  const seen = new Set<number>();

  $("table tr, .player-row, .prospect-row").each((_i, el) => {
    const text = $(el).text().trim();
    const cells = $(el).find("td");
    if (cells.length >= 2) {
      const rankText = cells.eq(0).text().trim();
      const rank = parseInt(rankText, 10);
      if (isNaN(rank) || rank < 1 || rank > 300 || seen.has(rank)) return;

      let nameText = cells.eq(1).text().trim();
      let position: string | null = null;
      let college: string | null = null;

      if (cells.length >= 3) {
        position = cells.eq(2).text().trim().replace(/[^A-Z/]/gi, "").toUpperCase() || null;
      }
      if (cells.length >= 4) {
        college = cells.eq(3).text().trim() || null;
      }

      const commaMatch = nameText.match(/^(.+?),\s*([A-Z]{1,4})/);
      if (commaMatch && !position) {
        nameText = commaMatch[1].trim();
        position = commaMatch[2];
      }

      if (nameText.length > 2) {
        seen.add(rank);
        entries.push({ rank, playerName: nameText, position, college });
      }
    }
  });

  if (entries.length === 0) {
    const linePattern = /(\d{1,3})\.\s+([A-Z][a-z]+(?:\s[A-Z][a-z'-]+)+)(?:,?\s*([A-Z]{1,4}))?(?:,?\s*(.+?))?(?:\n|$)/g;
    let m: RegExpExecArray | null;
    while ((m = linePattern.exec(html)) !== null) {
      const rank = parseInt(m[1], 10);
      if (rank >= 1 && rank <= 300 && !seen.has(rank) && m[2].length > 2) {
        seen.add(rank);
        entries.push({
          rank,
          playerName: m[2].trim(),
          position: m[3]?.trim()?.toUpperCase() || null,
          college: m[4]?.trim() || null,
        });
      }
    }
  }

  return entries.sort((a, b) => a.rank - b.rank);
}

function parsePfnBigBoard(html: string): BigBoardEntry[] {
  const $ = cheerio.load(html);
  const entries: BigBoardEntry[] = [];
  const seen = new Set<number>();

  $(".big-board-row, .player-card, .prospect-card, article.player, [class*='prospect'], [class*='player-rank']").each((_i, el) => {
    const text = $(el).text();
    const rankMatch = text.match(/(?:^|\s)(\d{1,3})(?:\.|st|nd|rd|th|\s)/);
    if (!rankMatch) return;
    const rank = parseInt(rankMatch[1], 10);
    if (rank < 1 || rank > 300 || seen.has(rank)) return;

    const nameEl = $(el).find("a, h3, h4, .player-name, .prospect-name, strong").first();
    let name = nameEl.text().trim();
    if (!name || name.length < 3) return;

    name = name.replace(/^\d+\.\s*/, "").trim();

    const posEl = $(el).find(".position, .pos, [class*='position']").first();
    const position = posEl.text().trim().toUpperCase() || null;

    const schoolEl = $(el).find(".school, .college, [class*='school'], [class*='college']").first();
    const college = schoolEl.text().trim() || null;

    seen.add(rank);
    entries.push({ rank, playerName: name, position, college });
  });

  if (entries.length === 0) {
    const tables = $("table");
    tables.each((_ti, table) => {
      $(table).find("tr").each((_ri, row) => {
        const cells = $(row).find("td");
        if (cells.length < 2) return;
        const rank = parseInt(cells.eq(0).text().trim(), 10);
        if (isNaN(rank) || rank < 1 || rank > 300 || seen.has(rank)) return;

        const nameText = cells.eq(1).text().trim();
        if (nameText.length < 3) return;

        const position = cells.length >= 3 ? cells.eq(2).text().trim().toUpperCase() || null : null;
        const college = cells.length >= 4 ? cells.eq(3).text().trim() || null : null;

        seen.add(rank);
        entries.push({ rank, playerName: nameText, position, college });
      });
    });
  }

  return entries.sort((a, b) => a.rank - b.rank);
}

function parseNflDraftBuzz(html: string): BigBoardEntry[] {
  const $ = cheerio.load(html);
  const entries: BigBoardEntry[] = [];
  const seen = new Set<number>();

  $("table").each((_ti, table) => {
    $(table).find("tr").each((_ri, row) => {
      const cells = $(row).find("td");
      if (cells.length < 2) return;
      const rank = parseInt(cells.eq(0).text().trim(), 10);
      if (isNaN(rank) || rank < 1 || rank > 300 || seen.has(rank)) return;

      let nameText = cells.eq(1).text().trim();
      let position: string | null = null;
      let college: string | null = null;

      if (cells.length >= 3) {
        const posText = cells.eq(2).text().trim();
        if (posText.match(/^[A-Z]{1,4}$/)) position = posText;
      }
      if (cells.length >= 4) {
        college = cells.eq(3).text().trim() || null;
      }

      const commaMatch = nameText.match(/^(.+?),\s*([A-Z]{1,4})/);
      if (commaMatch && !position) {
        nameText = commaMatch[1].trim();
        position = commaMatch[2];
      }

      if (nameText.length > 2) {
        seen.add(rank);
        entries.push({ rank, playerName: nameText, position, college });
      }
    });
  });

  if (entries.length === 0) {
    const listPattern = /(\d{1,3})\.\s*([A-Z][a-z]+(?:\s(?:Jr\.|Sr\.|III|II|IV|[A-Z][a-z'-]+))+)/g;
    let m: RegExpExecArray | null;
    while ((m = listPattern.exec(html)) !== null) {
      const rank = parseInt(m[1], 10);
      if (rank >= 1 && rank <= 300 && !seen.has(rank)) {
        seen.add(rank);
        entries.push({ rank, playerName: m[2].trim(), position: null, college: null });
      }
    }
  }

  return entries.sort((a, b) => a.rank - b.rank);
}

function parseDraftNetwork(html: string): BigBoardEntry[] {
  const $ = cheerio.load(html);
  const entries: BigBoardEntry[] = [];
  const seen = new Set<number>();

  $("[class*='player'], [class*='prospect'], [class*='ranking'], article, .card").each((_i, el) => {
    const text = $(el).text();
    const rankMatch = text.match(/(?:^|\s|#)(\d{1,3})(?:\.|st|nd|rd|th|\s)/);
    if (!rankMatch) return;
    const rank = parseInt(rankMatch[1], 10);
    if (rank < 1 || rank > 200 || seen.has(rank)) return;

    const nameEl = $(el).find("h2, h3, h4, a[href*='player'], a[href*='prospect'], .player-name, strong").first();
    let name = nameEl.text().trim();
    if (!name || name.length < 3) return;
    name = name.replace(/^\d+\.\s*/, "").replace(/\s*\d+$/, "").trim();

    const posEl = $(el).find(".position, .pos, span[class*='pos']").first();
    const position = posEl.text().trim().toUpperCase() || null;

    const schoolEl = $(el).find(".school, .college, span[class*='school']").first();
    const college = schoolEl.text().trim() || null;

    seen.add(rank);
    entries.push({ rank, playerName: name, position, college });
  });

  if (entries.length === 0) {
    $("table tr").each((_i, row) => {
      const cells = $(row).find("td");
      if (cells.length < 2) return;
      const rank = parseInt(cells.eq(0).text().trim(), 10);
      if (isNaN(rank) || rank < 1 || rank > 200 || seen.has(rank)) return;
      const name = cells.eq(1).text().trim();
      if (name.length < 3) return;
      const pos = cells.length >= 3 ? cells.eq(2).text().trim().toUpperCase() || null : null;
      const col = cells.length >= 4 ? cells.eq(3).text().trim() || null : null;
      seen.add(rank);
      entries.push({ rank, playerName: name, position: pos, college: col });
    });
  }

  return entries.sort((a, b) => a.rank - b.rank);
}

function parseGenericBigBoard(html: string): BigBoardEntry[] {
  const $ = cheerio.load(html);
  const entries: BigBoardEntry[] = [];
  const seen = new Set<number>();

  $("table").each((_ti, table) => {
    $(table).find("tr").each((_ri, row) => {
      const cells = $(row).find("td");
      if (cells.length < 2) return;
      const rank = parseInt(cells.eq(0).text().trim(), 10);
      if (isNaN(rank) || rank < 1 || rank > 300 || seen.has(rank)) return;

      let nameText = cells.eq(1).text().trim();
      if (nameText.length < 3) return;

      let position: string | null = null;
      let college: string | null = null;

      if (cells.length >= 3) {
        const t = cells.eq(2).text().trim();
        if (t.match(/^[A-Z]{1,5}$/)) position = t;
        else if (t.length > 0) college = t;
      }
      if (cells.length >= 4) {
        college = cells.eq(3).text().trim() || college;
      }

      const commaMatch = nameText.match(/^(.+?),\s*([A-Z]{1,5})(?:,\s*(.+))?$/);
      if (commaMatch) {
        nameText = commaMatch[1].trim();
        if (!position) position = commaMatch[2];
        if (!college && commaMatch[3]) college = commaMatch[3].trim();
      }

      seen.add(rank);
      entries.push({ rank, playerName: nameText, position, college });
    });
  });

  if (entries.length === 0) {
    const olItems = $("ol li");
    olItems.each((i, el) => {
      const text = $(el).text().trim();
      const rank = i + 1;
      const nameMatch = text.match(/^(?:\d+\.\s*)?([A-Z][a-z]+(?:\s(?:Jr\.|Sr\.|III|II|IV|[A-Z][a-z'-]+))+)/);
      if (nameMatch && !seen.has(rank)) {
        seen.add(rank);
        entries.push({ rank, playerName: nameMatch[1].trim(), position: null, college: null });
      }
    });
  }

  return entries.sort((a, b) => a.rank - b.rank);
}

export const scrapeDraftTek = makeBigBoardScraper({
  sourceKey: "drafttek_bigboard",
  displayName: "DraftTek Big Board",
  defaultUrl: "https://www.drafttek.com/2026-NFL-Draft-Big-Board/Top-NFL-Draft-Prospects-2026-Page-1.asp",
  parse: parseDraftTek,
});

export const scrapePfnBigBoard = makeBigBoardScraper({
  sourceKey: "pfn_bigboard",
  displayName: "Pro Football Network Big Board",
  defaultUrl: "https://www.profootballnetwork.com/2026-nfl-draft-big-board-prospect-rankings/",
  parse: parsePfnBigBoard,
});

export const scrapeNflDraftBuzz = makeBigBoardScraper({
  sourceKey: "nfldraftbuzz_bigboard",
  displayName: "NFL Draft Buzz Big Board",
  defaultUrl: "https://www.nfldraftbuzz.com/positions/BPA/2026",
  parse: parseNflDraftBuzz,
});

export const scrapeDraftNetwork = makeBigBoardScraper({
  sourceKey: "tdn_bigboard",
  displayName: "The Draft Network Big Board",
  defaultUrl: "https://thedraftnetwork.com/2026-nfl-draft-big-board-rankings",
  parse: parseDraftNetwork,
});

export const scrapeDraftWire = makeBigBoardScraper({
  sourceKey: "draftwire_bigboard",
  displayName: "Draft Wire (USA Today) Big Board",
  defaultUrl: "https://draftwire.usatoday.com/2026-nfl-draft-rankings/",
  parse: parseGenericBigBoard,
});

export const scrapeWalterBigBoard = makeBigBoardScraper({
  sourceKey: "walterfootball_bigboard",
  displayName: "WalterFootball Big Board",
  defaultUrl: "https://walterfootball.com/draft2026bigboard.php",
  parse: parseDraftTek,
});

export const scrapeNfldraftRankings = makeBigBoardScraper({
  sourceKey: "nfldraft_rankings",
  displayName: "NFLDraft Rankings Big Board",
  defaultUrl: "https://nfldraft.theringer.com/",
  parse: parseGenericBigBoard,
});

export const scrapeSportingNewsBigBoard = makeBigBoardScraper({
  sourceKey: "sportingnews_bigboard",
  displayName: "Sporting News Big Board",
  defaultUrl: "https://www.sportingnews.com/us/nfl/news/nfl-draft-big-board-2026-top-prospects",
  parse: parseGenericBigBoard,
});
