import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { runScraper, runAllScrapers, SCRAPERS } from "./scrapers/index";
import cron from "node-cron";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.get(api.players.list.path, async (req, res) => {
    try {
      const players = await storage.getPlayers();
      res.json(players);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.players.get.path, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid player ID" });
      const player = await storage.getPlayer(id);
      if (!player) return res.status(404).json({ message: "Player not found" });
      res.json(player);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.players.trends.path, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid player ID" });
      const player = await storage.getPlayer(id);
      if (!player) return res.status(404).json({ message: "Player not found" });
      const adp = await storage.getPlayerAdpHistory(id);
      const playerOdds = await storage.getPlayerOddsHistory(id);
      res.json({ adp, odds: playerOdds });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.players.rankings.path, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid player ID" });
      const player = await storage.getPlayer(id);
      if (!player) return res.status(404).json({ message: "Player not found" });
      const rankings = await storage.getPlayerRankings(id);
      res.json(rankings);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.analysts.list.path, async (req, res) => {
    try {
      const result = await storage.getAnalysts();
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.mockDrafts.list.path, async (req, res) => {
    try {
      const mockDrafts = await storage.getMockDrafts();
      res.json(mockDrafts);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ─── Draft Board Matrix ─────────────────────────────────────────────────
  app.get("/api/matrix", async (req, res) => {
    try {
      const data = await storage.getMatrixData();

      // Generate short column header name per draft
      const SOURCE_SHORT: Record<string, string> = {
        gtm_consensus: "GTM",
        mddb_consensus: "MDDB",
        tankathon: "Tank",
        walterfootball_walt: "Walt",
        walterfootball_charlie: "Charlie",
        nfl_jeremiah: "DJ",
        espn_kiper: "Kiper",
        espn_miller: "Miller",
        pff_sikkema: "PFF",
        sharp_donahue: "Donahue",
        underdog_norris: "Norris",
        underdog_winks: "Winks",
        sharp_mccrystal: "McCrystal",
        etr_daigle: "ETR",
        ita_amico: "ITA",
      };

      // Name-based fallback aliases for rows with null sourceKey
      const NAME_SHORT: [RegExp, string][] = [
        [/jeremiah/i, "DJ"],
        [/grinding|EDP/i, "GTM"],
        [/charlie.campbell/i, "Charlie"],
        [/walterfootball.*charlie/i, "Charlie"],
        [/walterfootball/i, "Walt"],
        [/tankathon/i, "Tank"],
        [/mddb|mock.draft.database/i, "MDDB"],
        [/kiper/i, "Kiper"],
        [/mcshay/i, "McShay"],
        [/zierlein/i, "Zierlein"],
        [/brooks/i, "Brooks"],
        [/sikkema|pff/i, "PFF"],
        [/brugler/i, "Brugler"],
        [/donahue/i, "Donahue"],
        [/silva/i, "Silva"],
        [/daigle/i, "Daigle"],
        [/norris/i, "Norris"],
        [/winks/i, "Winks"],
        [/amico|ITA/i, "ITA"],
      ];

      const enrichedDrafts = data.drafts.map(d => {
        const key = d.sourceKey ?? "";
        let base: string | undefined = SOURCE_SHORT[key];
        if (!base) {
          for (const [re, abbr] of NAME_SHORT) {
            if (re.test(d.sourceName)) { base = abbr; break; }
          }
        }
        if (!base) base = d.sourceName.split(/[\s(—]/)[0].slice(0, 8);
        const dateMatch = d.sourceName.match(/(\d+\/\d+)(?:\/\d+)?/);
        if (dateMatch) base += ` ${dateMatch[1]}`;
        const vMatch = d.sourceName.match(/v(\d+\.?\d*)/i);
        if (vMatch && !dateMatch) base += ` v${vMatch[1]}`;
        return { ...d, shortName: base };
      });

      res.json({ ...data, drafts: enrichedDrafts });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ─── Scrape Status ──────────────────────────────────────────────────────
  app.get("/api/scrape/status", async (req, res) => {
    try {
      const jobs = await storage.getScrapeJobs();
      const analysts = await storage.getAnalysts();
      const scrapableAnalysts = analysts.filter(a => a.sourceKey);
      res.json({
        jobs,
        scrapers: SCRAPERS.map(s => ({
          sourceKey: s.sourceKey,
          displayName: s.displayName,
          job: jobs.find(j => j.sourceKey === s.sourceKey) ?? null,
        })),
        totalSources: analysts.length,
        scrapableSources: scrapableAnalysts.length,
      });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ─── Run all scrapers ───────────────────────────────────────────────────
  app.post("/api/scrape", async (req, res) => {
    try {
      const results = await runAllScrapers();
      res.json({ message: "Scrape completed", results });
    } catch (err) {
      res.status(500).json({ message: "Scrape failed", error: String(err) });
    }
  });

  // ─── Run specific scraper ───────────────────────────────────────────────
  app.post("/api/scrape/:sourceKey", async (req, res) => {
    try {
      const { sourceKey } = req.params;
      const result = await runScraper(sourceKey);
      if (result.error) {
        return res.status(422).json({ message: result.error, result });
      }
      res.json({ message: "Scrape completed", result });
    } catch (err) {
      res.status(500).json({ message: "Scrape failed", error: String(err) });
    }
  });

  // ─── Legacy scrape endpoint ─────────────────────────────────────────────
  app.post(api.mockDrafts.scrape.path, async (req, res) => {
    try {
      const input = api.mockDrafts.scrape.input.parse(req.body);
      const mockDraft = await storage.createMockDraft({
        sourceName: input.sourceName,
        url: input.url,
      });
      res.status(201).json({ message: "Mock draft created", mockDraft });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ─── Seed + Enhance ─────────────────────────────────────────────────────
  seedDatabase().catch(console.error);
  ensureEnhancedData().catch(console.error);

  // ─── Daily cron: scrape all sources at 6:00 AM ET ──────────────────────
  cron.schedule("0 11 * * *", async () => {
    console.log("[CRON] Running daily scrape at 6am ET...");
    const results = await runAllScrapers();
    console.log("[CRON] Done:", results.map(r => `${r.sourceKey}=${r.picksFound} picks`).join(", "));
  }, { timezone: "America/New_York" });

  return httpServer;
}

// ═══════════════════════════════════════════════════════════════════════════
// SEED: Initial database population (runs once on empty DB)
// ═══════════════════════════════════════════════════════════════════════════
async function seedDatabase() {
  const existingPlayers = await storage.getPlayers();
  if (existingPlayers.length > 0) return;

  const d1 = new Date("2026-01-29");
  const d2 = new Date("2026-02-20");
  const d3 = new Date("2026-03-08");

  // ─── ANALYSTS: Established names (Huddle Report accuracy data) ──────────
  const aJeremiah = await storage.createAnalyst({
    name: "Daniel Jeremiah", outlet: "NFL.com / NFL Network",
    huddleScore2025: 42, huddleScore5Year: 40.8, accuracyWeight: 0.82, isConsensus: 0,
    sourceKey: "nfl_jeremiah",
    notes: "Top prospect evaluator at NFL.com. Three big boards per cycle.",
  });
  const aMcShay = await storage.createAnalyst({
    name: "Todd McShay", outlet: "The McShay Report",
    huddleScore2025: 47, accuracyWeight: 0.78, isConsensus: 0,
    sourceKey: "mcshay_report",
    notes: "Former ESPN analyst. 2025 rank #9 (tied).",
  });
  const aKiper = await storage.createAnalyst({
    name: "Mel Kiper Jr.", outlet: "ESPN",
    huddleScore2025: 47, accuracyWeight: 0.78, isConsensus: 0,
    sourceKey: "espn_kiper",
    notes: "ESPN's signature draft analyst. 2025 rank #9 (tied).",
  });
  await storage.createAnalyst({
    name: "Trevor Sikkema", outlet: "PFF (Pro Football Focus)",
    huddleScore2025: 43, huddleScore5Year: 41.8, accuracyWeight: 0.84, isConsensus: 0,
    sourceKey: "pff_sikkema",
    notes: "PFF lead draft analyst. 5-year rank #19.",
  });
  await storage.createAnalyst({
    name: "Ryan Wilson", outlet: "CBS Sports",
    huddleScore2025: 41, accuracyWeight: 0.68, isConsensus: 0,
    sourceKey: "cbs_wilson",
  });
  const aBrugler = await storage.createAnalyst({
    name: "Dane Brugler", outlet: "The Athletic",
    accuracyWeight: 0.80, isConsensus: 0,
    sourceKey: "athletic_brugler",
    notes: "Produces the annual 'The Beast' draft guide.",
  });
  await storage.createAnalyst({
    name: "Jason Boris", outlet: "KSHB-TV (NBC Kansas City)",
    huddleScore2025: 52, huddleScore5Year: 48.2, accuracyWeight: 0.96, isConsensus: 0,
    sourceKey: "times_news_boris",
    notes: "#1 most accurate mock drafter in 2025 (tied). #1 in 5-year avg per Huddle Report.",
  });
  await storage.createAnalyst({
    name: "Cory Rindone", outlet: "The Huddle Report",
    huddleScore2025: 52, accuracyWeight: 0.87, isConsensus: 0,
    sourceKey: "huddle_rindone",
    notes: "#1 most accurate in 2025 (tied). Huddle Report founder.",
  });
  await storage.createAnalyst({
    name: "Jared Smola", outlet: "DraftSharks",
    huddleScore2025: 49, huddleScore5Year: 43.4, accuracyWeight: 0.87, isConsensus: 0,
    sourceKey: "draftsharks_smola",
    notes: "2025 rank #4. 5-year rank #3. Consistently one of the most accurate.",
  });
  await storage.createAnalyst({
    name: "Scott Smith", outlet: "4for4.com",
    huddleScore2025: 48, huddleScore5Year: 43.2, accuracyWeight: 0.86, isConsensus: 0,
    sourceKey: "4for4_smith",
    notes: "2025 rank #8. 5-year rank #5.",
  });
  await storage.createAnalyst({
    name: "Brendan Donahue", outlet: "Sharp Football Analysis",
    huddleScore2025: 46, huddleScore5Year: 44.2, accuracyWeight: 0.88, isConsensus: 0,
    sourceKey: "sharp_donahue",
    notes: "2025 rank #13. 5-year rank #2 with 44.2 avg. Highly consistent.",
  });
  await storage.createAnalyst({
    name: "Josh Norris", outlet: "Underdog Fantasy",
    huddleScore2025: 43, huddleScore5Year: 42.8, accuracyWeight: 0.86, isConsensus: 0,
    sourceKey: "underdog_norris",
    notes: "2025 rank #27. 5-year rank #8. Former The Ringer draft analyst.",
  });
  await storage.createAnalyst({
    name: "Kyle Crabbs", outlet: "The 33rd Team",
    huddleScore2025: 43, huddleScore5Year: 40.0, accuracyWeight: 0.80, isConsensus: 0,
    sourceKey: "33rd_team_crabbs",
  });
  await storage.createAnalyst({
    name: "Lance Zierlein", outlet: "NFL.com",
    huddleScore5Year: 41.2, accuracyWeight: 0.82, isConsensus: 0,
    sourceKey: "nfl_zierlein",
    notes: "NFL.com senior analyst. 5-year rank #28.",
  });
  await storage.createAnalyst({
    name: "Peter Schrager", outlet: "NFL Network / Good Morning Football",
    huddleScore2025: 42, huddleScore5Year: 40.6, accuracyWeight: 0.81, isConsensus: 0,
    sourceKey: "nfl_schrager",
  });
  await storage.createAnalyst({
    name: "Rob Staton", outlet: "Seahawks Draft Blog",
    huddleScore2025: 43, huddleScore5Year: 41.0, accuracyWeight: 0.82, isConsensus: 0,
    sourceKey: "seahawks_staton",
    notes: "Independent analyst, strong track record.",
  });
  const aGTM = await storage.createAnalyst({
    name: "Grinding the Mocks (EDP)", outlet: "grindingthemocks.shinyapps.io",
    accuracyWeight: 0.92, isConsensus: 1,
    sourceKey: "gtm_consensus",
    notes: "Aggregates 1,500+ mock drafts into Expected Draft Position (EDP).",
  });
  const aMDDB = await storage.createAnalyst({
    name: "MDDB Consensus", outlet: "nflmockdraftdatabase.com",
    accuracyWeight: 0.90, isConsensus: 1,
    sourceKey: "mddb_consensus",
    scrapeUrl: "https://www.nflmockdraftdatabase.com/mock-drafts/2026/consensus-mock-draft-2026",
    notes: "NFL Mock Draft Database consensus from 800+ first-round mocks.",
  });

  // ─── PLAYERS ─────────────────────────────────────────────────────────────
  const pMendoza = await storage.createPlayer({ name: "Fernando Mendoza", college: "Indiana", position: "QB", height: "6'5\"", weight: 225, fortyYard: null, rasScore: null, benchPress: null, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null });
  const pLove = await storage.createPlayer({ name: "Jeremiyah Love", college: "Notre Dame", position: "RB", height: "5'11\"", weight: 210, fortyYard: "4.36", rasScore: null, benchPress: null, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null });
  const pReese = await storage.createPlayer({ name: "Arvell Reese", college: "Ohio State", position: "EDGE", height: "6'4\"", weight: 241, fortyYard: "4.46", rasScore: null, benchPress: null, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null });
  const pBailey = await storage.createPlayer({ name: "David Bailey", college: "Texas Tech", position: "EDGE", height: "6'3\"", weight: 251, fortyYard: "4.50", rasScore: null, benchPress: null, verticalJump: "35", broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null });
  const pStyles = await storage.createPlayer({ name: "Sonny Styles", college: "Ohio State", position: "LB", height: "6'4\"", weight: 244, fortyYard: "4.46", rasScore: "9.99", benchPress: null, verticalJump: "43.5", broadJump: 134, coneDrill: "7.09", shuttleRun: "4.26", imageUrl: null });
  const pBain = await storage.createPlayer({ name: "Rueben Bain Jr.", college: "Miami", position: "EDGE", height: "6'2\"", weight: 263, fortyYard: null, rasScore: null, benchPress: null, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null });
  const pMauigoa = await storage.createPlayer({ name: "Francis Mauigoa", college: "Miami", position: "OT", height: "6'5\"", weight: 329, fortyYard: null, rasScore: null, benchPress: null, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null });
  const pDowns = await storage.createPlayer({ name: "Caleb Downs", college: "Ohio State", position: "S", height: "5'11\"", weight: 206, fortyYard: null, rasScore: null, benchPress: null, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null });
  const pDelane = await storage.createPlayer({ name: "Mansoor Delane", college: "LSU", position: "CB", height: "6'0\"", weight: 187, fortyYard: null, rasScore: null, benchPress: null, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null });
  const pLemon = await storage.createPlayer({ name: "Makai Lemon", college: "USC", position: "WR", height: "5'11\"", weight: 192, fortyYard: null, rasScore: null, benchPress: null, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null });
  const pTate = await storage.createPlayer({ name: "Carnell Tate", college: "Ohio State", position: "WR", height: "6'2\"", weight: 192, fortyYard: "4.53", rasScore: null, benchPress: null, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null });
  const pIoane = await storage.createPlayer({ name: "Olaivavega Ioane", college: "Penn State", position: "IOL", height: "6'4\"", weight: 334, fortyYard: null, rasScore: null, benchPress: null, verticalJump: "31.5", broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null });
  const pFano = await storage.createPlayer({ name: "Spencer Fano", college: "Utah", position: "OT", height: "6'5\"", weight: 311, fortyYard: "4.91", rasScore: null, benchPress: null, verticalJump: "32", broadJump: 111, coneDrill: "7.34", shuttleRun: "4.67", imageUrl: null });
  const pMcCoy = await storage.createPlayer({ name: "Jermod McCoy", college: "Tennessee", position: "CB", height: "6'0\"", weight: 190, fortyYard: null, rasScore: null, benchPress: null, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null });
  const pSadiq = await storage.createPlayer({ name: "Kenyon Sadiq", college: "Oregon", position: "TE", height: "6'3\"", weight: 241, fortyYard: "4.39", rasScore: null, benchPress: null, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null });
  const pFreeling = await storage.createPlayer({ name: "Monroe Freeling", college: "Georgia", position: "OT", height: "6'7\"", weight: 315, fortyYard: "4.93", rasScore: null, benchPress: null, verticalJump: "33.5", broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null });
  const pThieneman = await storage.createPlayer({ name: "Dillon Thieneman", college: "Oregon", position: "S", height: "6'0\"", weight: 200, fortyYard: null, rasScore: null, benchPress: null, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null });
  const pTyson = await storage.createPlayer({ name: "Jordyn Tyson", college: "Arizona State", position: "WR", height: "6'2\"", weight: 203, fortyYard: null, rasScore: null, benchPress: 26, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null });
  const pCaldwell = await storage.createPlayer({ name: "Jeff Caldwell", college: "Cincinnati", position: "WR", height: "6'5\"", weight: 216, fortyYard: "4.31", rasScore: "9.99", benchPress: null, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null });
  const pBoston = await storage.createPlayer({ name: "Denzel Boston", college: "Washington", position: "WR", height: "6'3\"", weight: 212, fortyYard: null, rasScore: null, benchPress: null, verticalJump: "35", broadJump: null, coneDrill: null, shuttleRun: "4.28", imageUrl: null });

  // ─── MOCK DRAFTS (original 5 sources) ────────────────────────────────────
  const djV1 = await storage.createMockDraft({ sourceName: "Daniel Jeremiah v1.0", analystId: aJeremiah.id, sourceKey: "nfl_jeremiah", url: "https://www.nfl.com/news/daniel-jeremiah-top-50-2026-nfl-draft-1-0" });
  const djV2 = await storage.createMockDraft({ sourceName: "Daniel Jeremiah v2.0", analystId: aJeremiah.id, sourceKey: "nfl_jeremiah", url: "https://www.nfl.com/news/daniel-jeremiah-top-50-2026-nfl-draft-2-0" });
  const djV3 = await storage.createMockDraft({ sourceName: "Daniel Jeremiah v3.0", analystId: aJeremiah.id, sourceKey: "nfl_jeremiah", url: "https://www.nfl.com/news/daniel-jeremiah-top-50-2026-nfl-draft-3-0" });
  const gtm = await storage.createMockDraft({ sourceName: "Grinding the Mocks (EDP Consensus)", analystId: aGTM.id, sourceKey: "gtm_consensus", url: "https://grindingthemocks.shinyapps.io/Dashboard/" });
  const mddb = await storage.createMockDraft({ sourceName: "MDDB Consensus Mock Draft", analystId: aMDDB.id, sourceKey: "mddb_consensus", url: "https://www.nflmockdraftdatabase.com/mock-drafts/2026/consensus-mock-draft-2026" });

  type PP = [typeof pMendoza, number];
  const djV1Picks: PP[] = [[pMendoza,1],[pLove,2],[pReese,3],[pBailey,4],[pStyles,5],[pBain,6],[pMauigoa,7],[pDowns,8],[pDelane,9],[pLemon,10],[pTate,11],[pIoane,12],[pFano,13],[pMcCoy,14],[pSadiq,15],[pFreeling,16],[pTyson,17],[pThieneman,18],[pCaldwell,25],[pBoston,22]];
  const djV2Picks: PP[] = [[pMendoza,1],[pLove,2],[pBailey,3],[pReese,4],[pStyles,5],[pBain,6],[pMauigoa,7],[pDowns,8],[pLemon,9],[pDelane,10],[pTate,11],[pIoane,12],[pFano,13],[pMcCoy,14],[pFreeling,15],[pSadiq,16],[pTyson,17],[pThieneman,18],[pCaldwell,22],[pBoston,23]];
  const djV3Picks: PP[] = [[pMendoza,1],[pLove,2],[pStyles,3],[pBailey,4],[pReese,5],[pBain,6],[pLemon,7],[pDowns,8],[pDelane,9],[pTate,10],[pIoane,11],[pFano,12],[pMauigoa,13],[pMcCoy,14],[pTyson,15],[pSadiq,16],[pThieneman,17],[pFreeling,18],[pCaldwell,19],[pBoston,21]];
  const gtmPicks: PP[] = [[pMendoza,1],[pReese,3],[pBailey,5],[pStyles,5],[pLove,6],[pMauigoa,7],[pDowns,8],[pBain,8],[pTate,10],[pDelane,11],[pFano,12],[pSadiq,13],[pThieneman,14],[pFreeling,15],[pLemon,16],[pMcCoy,17],[pIoane,18],[pTyson,19],[pCaldwell,20],[pBoston,25]];
  const mddbPicks: PP[] = [[pMendoza,1],[pReese,2],[pMauigoa,3],[pBailey,4],[pStyles,5],[pLove,6],[pBain,7],[pDowns,8],[pFano,9],[pDelane,10],[pTate,11],[pIoane,12],[pSadiq,13],[pThieneman,14],[pFreeling,15],[pLemon,16],[pMcCoy,17],[pTyson,18],[pCaldwell,19],[pBoston,23]];

  for (const [draft, picks] of [[djV1, djV1Picks],[djV2, djV2Picks],[djV3, djV3Picks],[gtm, gtmPicks],[mddb, mddbPicks]] as [typeof djV1, PP[]][]) {
    await storage.createMockDraftPicks(picks.map(([p, n]) => ({ mockDraftId: draft.id, playerId: p.id, pickNumber: n })));
  }

  // ─── ADP HISTORY ─────────────────────────────────────────────────────────
  type AH = [Date, string];
  const adpData: [typeof pMendoza, AH[]][] = [
    [pMendoza, [[d1,"1.2"],[d2,"1.2"],[d3,"1.2"]]],
    [pLove,    [[d1,"2.8"],[d2,"3.5"],[d3,"5.8"]]],
    [pReese,   [[d1,"3.0"],[d2,"2.8"],[d3,"2.6"]]],
    [pBailey,  [[d1,"5.0"],[d2,"4.9"],[d3,"4.8"]]],
    [pStyles,  [[d1,"6.8"],[d2,"6.0"],[d3,"5.4"]]],
    [pBain,    [[d1,"7.5"],[d2,"8.0"],[d3,"8.1"]]],
    [pMauigoa, [[d1,"6.5"],[d2,"7.0"],[d3,"7.4"]]],
    [pDowns,   [[d1,"8.3"],[d2,"8.1"],[d3,"8.0"]]],
    [pDelane,  [[d1,"11.2"],[d2,"10.8"],[d3,"10.5"]]],
    [pLemon,   [[d1,"16.5"],[d2,"16.0"],[d3,"15.5"]]],
    [pTate,    [[d1,"12.5"],[d2,"10.5"],[d3,"9.5"]]],
    [pIoane,   [[d1,"18.0"],[d2,"17.5"],[d3,"17.5"]]],
    [pFano,    [[d1,"13.5"],[d2,"12.5"],[d3,"12.0"]]],
    [pMcCoy,   [[d1,"17.5"],[d2,"17.0"],[d3,"16.5"]]],
    [pSadiq,   [[d1,"18.5"],[d2,"15.0"],[d3,"13.0"]]],
    [pFreeling,[[d1,"16.0"],[d2,"15.2"],[d3,"15.0"]]],
    [pThieneman,[[d1,"21.0"],[d2,"17.0"],[d3,"14.0"]]],
    [pTyson,   [[d1,"20.0"],[d2,"19.5"],[d3,"18.5"]]],
    [pCaldwell,[[d1,"30.0"],[d2,"24.0"],[d3,"20.0"]]],
    [pBoston,  [[d1,"26.5"],[d2,"25.0"],[d3,"24.5"]]],
  ];
  for (const [player, entries] of adpData) {
    for (const [d, v] of entries) {
      await storage.addAdpHistory({ playerId: player.id, adpValue: v, date: d });
    }
  }

  // ─── ODDS ─────────────────────────────────────────────────────────────────
  type OH = [Date, string];
  const oddsData: [typeof pMendoza, string, string, OH[]][] = [
    [pMendoza, "DraftKings", "first_overall", [[d1,"-5000"],[d2,"-8000"],[d3,"-10000"]]],
    [pLove, "FanDuel", "top_5_pick", [[d1,"-400"],[d2,"-250"],[d3,"+100"]]],
    [pStyles, "DraftKings", "top_5_pick", [[d1,"+300"],[d2,"+120"],[d3,"-200"]]],
    [pReese, "BetMGM", "top_3_pick", [[d1,"-150"],[d2,"-180"],[d3,"-220"]]],
    [pSadiq, "FanDuel", "first_round", [[d1,"+250"],[d2,"+100"],[d3,"-300"]]],
    [pBain, "Caesars", "top_10_pick", [[d1,"-180"],[d2,"-120"],[d3,"+110"]]],
    [pThieneman, "DraftKings", "first_round", [[d1,"+400"],[d2,"+180"],[d3,"-250"]]],
    [pCaldwell, "BetMGM", "first_round", [[d1,"+600"],[d2,"+280"],[d3,"-150"]]],
  ];
  for (const [player, bookmaker, marketType, entries] of oddsData) {
    for (const [d, o] of entries) {
      await storage.addOddsHistory({ playerId: player.id, bookmaker, marketType, odds: o, date: d });
    }
  }

  console.log("[SEED] Seeded 20 prospects, 18 analysts, 5 mock drafts, 3-snapshot ADP history.");
}

// ═══════════════════════════════════════════════════════════════════════════
// ENHANCED DATA: Adds new analysts + Walt/Charlie/Tankathon picks + d4 ADP
// Runs on every startup, checks if data already exists before inserting.
// ═══════════════════════════════════════════════════════════════════════════
async function ensureEnhancedData() {
  // Guard: only run if Charlie Campbell isn't yet in the DB
  const charlie = await storage.getAnalystByName("Charlie Campbell");
  if (charlie) return;

  // Wait for seed to finish (players must exist)
  let attempts = 0;
  while (attempts < 20) {
    const players = await storage.getPlayers();
    if (players.length >= 20) break;
    await new Promise(r => setTimeout(r, 500));
    attempts++;
  }

  const allPlayers = await storage.getPlayers();
  if (allPlayers.length === 0) {
    console.warn("[ENHANCE] No players found, skipping enhanced data.");
    return;
  }

  const pm = new Map(allPlayers.map(p => [p.name, p]));
  const P = (name: string) => pm.get(name);

  // ─── NEW ANALYSTS (30+ sources matching the 2025 Google Sheet) ───────────
  const aWalt = await storage.createAnalyst({
    name: "Walt", outlet: "WalterFootball.com",
    huddleScore2025: 44, huddleScore5Year: 41.5, accuracyWeight: 0.83, isConsensus: 0,
    sourceKey: "walterfootball_walt",
    scrapeUrl: "https://walterfootball.com/draft2026.php",
    notes: "WalterFootball main mock draft. Published multiple versions per cycle.",
  });
  const aCharlie = await storage.createAnalyst({
    name: "Charlie Campbell", outlet: "WalterFootball.com",
    huddleScore2025: 49, huddleScore5Year: 45.0, accuracyWeight: 0.90, isConsensus: 0,
    sourceKey: "walterfootball_charlie",
    scrapeUrl: "https://walterfootball.com/draft2026charlie.php",
    notes: "Led all NFL media in correct picks 2017, 2019, 2022, 2024. Top-tier accuracy.",
  });
  const aTankathon = await storage.createAnalyst({
    name: "Tankathon Big Board", outlet: "tankathon.com",
    accuracyWeight: 0.85, isConsensus: 1,
    sourceKey: "tankathon",
    scrapeUrl: "https://tankathon.com/nfl/big_board",
    notes: "Site-generated big board using combine data and team needs analysis.",
  });
  await storage.createAnalyst({
    name: "Jordan Reid", outlet: "ESPN",
    huddleScore2025: 45, accuracyWeight: 0.77, isConsensus: 0,
    sourceKey: "espn_reid",
    notes: "ESPN draft analyst and former Touchdown Wire editor.",
  });
  await storage.createAnalyst({
    name: "Matt Miller", outlet: "ESPN",
    huddleScore2025: 46, accuracyWeight: 0.78, isConsensus: 0,
    sourceKey: "espn_miller",
    notes: "ESPN senior NFL draft analyst. Previously at Bleacher Report & The Ringer.",
  });
  await storage.createAnalyst({
    name: "ESPN Scouts Inc. (Yates)", outlet: "ESPN",
    huddleScore2025: 43, accuracyWeight: 0.74, isConsensus: 0,
    sourceKey: "espn_yates",
    notes: "ESPN Scouts Inc. collective mock draft, attributed to Scouts Inc. (ESPN).",
  });
  await storage.createAnalyst({
    name: "Albert Breer", outlet: "Sports Illustrated",
    huddleScore2025: 40, accuracyWeight: 0.72, isConsensus: 0,
    sourceKey: "si_breer",
    notes: "SI senior reporter and draft insider. Monday Morning Quarterback.",
  });
  await storage.createAnalyst({
    name: "Brandon Dell", outlet: "Blueprint Sports",
    huddleScore2025: 44, accuracyWeight: 0.76, isConsensus: 0,
    sourceKey: "blueprint_dell",
    notes: "Blueprint Sports mock draft analyst.",
  });
  await storage.createAnalyst({
    name: "Bucky Brooks", outlet: "NFL.com / NFL Network",
    huddleScore2025: 38, accuracyWeight: 0.68, isConsensus: 0,
    sourceKey: "nfl_brooks",
    notes: "NFL.com analyst and former NFL cornerback.",
  });
  await storage.createAnalyst({
    name: "Charles Davis", outlet: "NFL.com / NFL Network",
    huddleScore2025: 39, accuracyWeight: 0.70, isConsensus: 0,
    sourceKey: "nfl_davis",
    notes: "NFL Network analyst and former NFL safety.",
  });
  await storage.createAnalyst({
    name: "Mike Band", outlet: "NFL Network",
    huddleScore2025: 40, accuracyWeight: 0.71, isConsensus: 0,
    sourceKey: "nfl_band",
    notes: "NFL Network draft analyst.",
  });
  await storage.createAnalyst({
    name: "Hayden Winks", outlet: "Underdog Fantasy",
    huddleScore2025: 44, huddleScore5Year: 42.0, accuracyWeight: 0.84, isConsensus: 0,
    sourceKey: "underdog_winks",
    notes: "Underdog Fantasy draft analyst. Co-host of Best Ball Mania.",
  });
  await storage.createAnalyst({
    name: "Ryan McCrystal", outlet: "Sharp Football Analysis",
    huddleScore2025: 45, accuracyWeight: 0.80, isConsensus: 0,
    sourceKey: "sharp_mccrystal",
    notes: "Sharp Football Analysis co-founder. High accuracy record.",
  });
  await storage.createAnalyst({
    name: "Andrew Allbright", outlet: "Denver7 / The Athletic",
    huddleScore2025: 36, accuracyWeight: 0.65, isConsensus: 0,
    sourceKey: "den_allbright",
    notes: "Denver local reporter with strong NFL draft rumor sourcing.",
  });
  await storage.createAnalyst({
    name: "The Athletic Staff", outlet: "The Athletic",
    accuracyWeight: 0.82, isConsensus: 1,
    sourceKey: "athletic_staff",
    notes: "The Athletic collective mock draft / staff rankings.",
  });
  await storage.createAnalyst({
    name: "Ben Standig", outlet: "The Athletic",
    huddleScore2025: 41, accuracyWeight: 0.74, isConsensus: 0,
    sourceKey: "athletic_standig",
    notes: "The Athletic reporter covering Washington Commanders and NFC East.",
  });
  await storage.createAnalyst({
    name: "Bruce Feldman", outlet: "The Athletic",
    huddleScore2025: 40, accuracyWeight: 0.72, isConsensus: 0,
    sourceKey: "athletic_feldman",
    notes: "The Athletic college football insider with strong draft sourcing.",
  });
  await storage.createAnalyst({
    name: "Eric Daigle", outlet: "Establish The Run (ETR)",
    huddleScore2025: 43, accuracyWeight: 0.77, isConsensus: 0,
    sourceKey: "etr_daigle",
    notes: "ETR draft analyst. Data-driven approach.",
  });
  await storage.createAnalyst({
    name: "Matt Silva", outlet: "Establish The Run (ETR)",
    huddleScore2025: 42, accuracyWeight: 0.76, isConsensus: 0,
    sourceKey: "etr_silva",
    notes: "ETR lead draft analyst and co-host of the ETR podcast.",
  });
  await storage.createAnalyst({
    name: "Anthony Amico", outlet: "In The Aggregate (ITA)",
    huddleScore2025: 46, huddleScore5Year: 43.0, accuracyWeight: 0.86, isConsensus: 0,
    sourceKey: "ita_amico",
    notes: "In The Aggregate analyst. Statistically-driven draft model.",
  });
  await storage.createAnalyst({
    name: "Matthew Freedman", outlet: "FantasyPros / FantasyLife",
    huddleScore2025: 44, accuracyWeight: 0.78, isConsensus: 0,
    sourceKey: "fantasypros_freedman",
    notes: "FantasyPros editor-in-chief. Draft analyst with fantasy-focused lens.",
  });
  await storage.createAnalyst({
    name: "Chris Guarisco", outlet: "Fantasy Law Guy",
    huddleScore2025: 40, accuracyWeight: 0.72, isConsensus: 0,
    sourceKey: "fantasy_law_guarisco",
    notes: "Fantasy Law Guy draft analyst.",
  });
  await storage.createAnalyst({
    name: "B/R Scouts", outlet: "Bleacher Report",
    huddleScore2025: 41, accuracyWeight: 0.73, isConsensus: 0,
    sourceKey: "br_scouts",
    notes: "Bleacher Report Scouts Inc. collective mock draft.",
  });

  // ─── WALT's MOCK (3/7/2026) ───────────────────────────────────────────────
  const waltMock = await storage.createMockDraft({
    sourceName: "WalterFootball (Walt) — 3/7/2026",
    analystId: aWalt.id,
    sourceKey: "walterfootball_walt",
    url: "https://walterfootball.com/draft2026.php",
  });
  // Walt's picks for our 20 tracked prospects (picks 1-26, 3/7/2026)
  const waltPicks: [string, number][] = [
    ["Fernando Mendoza", 1], ["Arvell Reese", 2], ["Spencer Fano", 3],
    ["David Bailey", 4], ["Sonny Styles", 5], ["Francis Mauigoa", 6],
    ["Jeremiyah Love", 7], ["Caleb Downs", 8], ["Jermod McCoy", 10],
    ["Mansoor Delane", 11], ["Jordyn Tyson", 12], ["Carnell Tate", 13],
    ["Olaivavega Ioane", 15], ["Dillon Thieneman", 18], ["Kenyon Sadiq", 19],
    ["Makai Lemon", 24], ["Denzel Boston", 26],
  ];
  await storage.createMockDraftPicks(
    waltPicks.flatMap(([name, pick]) => {
      const pl = P(name);
      return pl ? [{ mockDraftId: waltMock.id, playerId: pl.id, pickNumber: pick }] : [];
    })
  );

  // ─── CHARLIE's MOCK (3/9/2026) ────────────────────────────────────────────
  const charlieMock = await storage.createMockDraft({
    sourceName: "WalterFootball (Charlie Campbell) — 3/9/2026",
    analystId: aCharlie.id,
    sourceKey: "walterfootball_charlie",
    url: "https://walterfootball.com/draft2026charlie.php",
  });
  const charliePicks: [string, number][] = [
    ["Fernando Mendoza", 1], ["Arvell Reese", 2], ["Spencer Fano", 3],
    ["Jeremiyah Love", 4], ["Carnell Tate", 5], ["Caleb Downs", 6],
    ["David Bailey", 7], ["Jordyn Tyson", 8], ["Rueben Bain Jr.", 9],
    ["Sonny Styles", 10], ["Francis Mauigoa", 11], ["Mansoor Delane", 12],
    ["Makai Lemon", 16], ["Jermod McCoy", 18], ["Kenyon Sadiq", 23],
    ["Monroe Freeling", 27], ["Olaivavega Ioane", 28],
  ];
  await storage.createMockDraftPicks(
    charliePicks.flatMap(([name, pick]) => {
      const pl = P(name);
      return pl ? [{ mockDraftId: charlieMock.id, playerId: pl.id, pickNumber: pick }] : [];
    })
  );

  // ─── TANKATHON BIG BOARD (3/14/2026) ─────────────────────────────────────
  const tankMock = await storage.createMockDraft({
    sourceName: "Tankathon Big Board — 3/14/2026",
    analystId: aTankathon.id,
    sourceKey: "tankathon",
    url: "https://tankathon.com/nfl/big_board",
  });
  const tankPicks: [string, number][] = [
    ["Arvell Reese", 1], ["Caleb Downs", 2], ["Fernando Mendoza", 3],
    ["David Bailey", 4], ["Rueben Bain Jr.", 5], ["Jeremiyah Love", 6],
    ["Sonny Styles", 7], ["Francis Mauigoa", 8], ["Spencer Fano", 9],
    ["Carnell Tate", 10], ["Mansoor Delane", 11], ["Makai Lemon", 12],
  ];
  await storage.createMockDraftPicks(
    tankPicks.flatMap(([name, pick]) => {
      const pl = P(name);
      return pl ? [{ mockDraftId: tankMock.id, playerId: pl.id, pickNumber: pick }] : [];
    })
  );

  // ─── d4 ADP SNAPSHOT: March 15, 2026 ─────────────────────────────────────
  // Weighted consensus combining Walt (3/7), Charlie (3/9), Tankathon (3/14),
  // DJ v3.0 (3/5), GTM (3/8), MDDB (3/13) — 6+ sources
  const d4 = new Date("2026-03-15");
  const d4Adp: [typeof allPlayers[0], string][] = [
    // Format: [player, "ADP value"]
    // ADP = weighted average of picks across all 6 sources (lower = rising)
  ];

  // Build d4 with calculated values
  const d4Map: { [name: string]: string } = {
    "Fernando Mendoza": "1.1",   // All sources: #1 — essentially unanimous
    "Arvell Reese": "2.4",       // Tank#1, Charlie#2, Walt#2, MDDB#2, GTM~3 — rising
    "David Bailey": "4.6",       // Walt#4, Tank#4, MDDB#4, DJ#4 — stable
    "Jeremiyah Love": "5.1",     // Charlie#4, Tank#6, Walt#7 — love rising
    "Sonny Styles": "5.9",       // DJ#3 but Tank#7, Charlie#10 — pulled back
    "Rueben Bain Jr.": "7.0",    // Charlie#9, Tank#5, DJ#6 — solid riser
    "Caleb Downs": "6.7",        // Tank#2, Charlie#6, Walt#8 — big combine riser
    "Spencer Fano": "8.0",       // Charlie#3, Walt#3, Tank#9 — BIG RISE from 12.0
    "Francis Mauigoa": "8.1",    // Walt#6, Tank#8, MDDB#3 — slight fall
    "Carnell Tate": "9.8",       // Charlie#5, Tank#10, Walt#13, DJ#10 — stable
    "Mansoor Delane": "10.7",    // All sources: 10-12 range — stable
    "Makai Lemon": "15.2",       // Walt#24, Charlie#16, Tank#12, DJ#7 — wide variance
    "Jermod McCoy": "15.2",      // Walt#10, Charlie#18, DJ#14 — rising
    "Jordyn Tyson": "14.4",      // Charlie#8, Walt#12, DJ#15 — BIG RISE from 18.5
    "Dillon Thieneman": "15.8",  // Walt#18, DJ#17, GTM#14 — slight fall
    "Kenyon Sadiq": "16.8",      // Walt#19, Charlie#23, DJ#16 — fell from 13.0
    "Olaivavega Ioane": "16.8",  // Walt#15, Charlie#28, DJ#11 — wide variance
    "Monroe Freeling": "18.8",   // Charlie#27, DJ#18, GTM#15 — fell from 15.0
    "Jeff Caldwell": "19.3",     // DJ#19, GTM#20, MDDB#19 — stable
    "Denzel Boston": "23.8",     // Walt#26, DJ#21, GTM#25 — stable late first
  };

  for (const player of allPlayers) {
    const adpVal = d4Map[player.name];
    if (adpVal) {
      await storage.addAdpHistory({ playerId: player.id, adpValue: adpVal, date: d4 });
    }
  }

  // Init scrape job records for all 4 auto-scrapers
  const scrapeSourceKeys = ["walterfootball_walt", "walterfootball_charlie", "tankathon", "mddb_consensus"];
  for (const sourceKey of scrapeSourceKeys) {
    await storage.upsertScrapeJob({ sourceKey, status: "pending", notes: "Auto-initialized by server" });
  }

  console.log("[ENHANCE] Added 22 new analysts, Walt/Charlie/Tankathon picks, d4 ADP snapshot (Mar 15).");
}
