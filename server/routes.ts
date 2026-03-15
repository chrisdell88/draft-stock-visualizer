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

  app.get("/api/players/:id/positionrank", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid player ID" });
      const rank = await storage.getPositionRank(id);
      res.json(rank ?? { rank: null, total: null, position: null });
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
      const boardTypeFilter = (req.query.boardType as string) ?? null;
      const data = await storage.getMatrixData(boardTypeFilter);

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

  // ─── Headshot scraper ───────────────────────────────────────────────────
  app.post("/api/scrape/headshots", async (req, res) => {
    try {
      const { scrapeAllHeadshots } = await import("./scrapers/headshots");
      const stats = await scrapeAllHeadshots();
      res.json({ message: "Headshots updated", ...stats });
    } catch (err) {
      res.status(500).json({ message: "Headshot scrape failed", error: String(err) });
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

  // ─── ADP Windows ─────────────────────────────────────────────────────────
  app.get("/api/adp-windows", async (req, res) => {
    try {
      const data = await storage.getAdpWindows();
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ─── Odds Movers ─────────────────────────────────────────────────────────
  app.get("/api/odds/movers", async (req, res) => {
    try {
      const data = await storage.getOddsMovers();
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ─── ADP vs Odds Discrepancy (Betting Signal) ────────────────────────────
  app.get("/api/discrepancy", async (req, res) => {
    try {
      const data = await storage.getDiscrepancy();
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ─── Activity Feed: Recent mocks/boards added ─────────────────────────────
  app.get("/api/activity", async (req, res) => {
    try {
      const limit = parseInt((req.query.limit as string) ?? "30");
      const recent = await storage.getRecentActivity(isNaN(limit) ? 30 : limit);
      res.json(recent);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ─── Seed + Enhance ─────────────────────────────────────────────────────
  seedDatabase().catch(console.error);
  ensureEnhancedData().catch(console.error);
  ensureTimeWindowData().catch(console.error);
  expandPlayerRoster().catch(console.error);
  ensureSourceKeysFix().catch(console.error);
  ensureExtraAnalysts().catch(console.error);

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

  // Init scrape job records for all auto-scrapers
  const scrapeSourceKeys = [
    "walterfootball_walt", "walterfootball_charlie", "tankathon",
    "mddb_consensus", "mddb_bigboard", "mcshay_report", "fantasypros_freedman",
    "sharp_mccrystal", "sharp_donahue", "nfl_zierlein", "nfl_brooks", "nfl_davis",
    "nfl_jeremiah_bigboard", "mockdraftnfl",
  ];
  const existingJobs = await storage.getScrapeJobs();
  const existingKeys = new Set(existingJobs.map(j => j.sourceKey));
  for (const sourceKey of scrapeSourceKeys) {
    if (!existingKeys.has(sourceKey)) {
      await storage.upsertScrapeJob({ sourceKey, status: "pending", notes: "Auto-initialized by server" });
    }
  }

  console.log("[ENHANCE] Added 22 new analysts, Walt/Charlie/Tankathon picks, d4 ADP snapshot (Mar 15).");
}

// ═══════════════════════════════════════════════════════════════════════════
// SEED: Time-window data — Mar 12 ADP snapshot + expanded Mar 15 odds
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// EXPAND: Add 30 more 2026 prospects + extend mock picks + ADP history
// Guard: checks for Tetairoa McMillan before running
// ═══════════════════════════════════════════════════════════════════════════
async function expandPlayerRoster() {
  // Wait for base seed to finish
  let attempts = 0;
  while (attempts < 30) {
    const ps = await storage.getPlayers();
    if (ps.length >= 20) break;
    await new Promise(r => setTimeout(r, 500));
    attempts++;
  }

  const existing = await storage.getPlayers();
  if (existing.find(p => p.name === "Tetairoa McMillan")) return; // already ran

  // ─── Mark DJ big boards + Tankathon as boardType="bigboard" ──────────────
  await storage.updateMockDraftBoardTypes();

  const pm = new Map(existing.map(p => [p.name, p]));

  // ─── 30 NEW PLAYERS (2026 Draft class, rounds 1-2) ───────────────────────
  type NP = typeof existing[0];
  const newPlayers: NP[] = [];
  const add = async (data: Parameters<typeof storage.createPlayer>[0]) => {
    const p = await storage.createPlayer(data);
    newPlayers.push(p);
    pm.set(p.name, p);
    return p;
  };

  // Late round 1 (picks ~21-32)
  const pMcMillan  = await add({ name: "Tetairoa McMillan",   college: "Arizona",        position: "WR",   height: "6'4\"",    weight: 211, fortyYard: "4.36", rasScore: "9.28", benchPress: null, verticalJump: "40.5", broadJump: 123, coneDrill: null,   shuttleRun: null,   imageUrl: null });
  const pBanks     = await add({ name: "Kelvin Banks Jr.",     college: "Texas",          position: "OT",   height: "6'4½\"",   weight: 316, fortyYard: "5.20", rasScore: "8.92", benchPress: null, verticalJump: null,   broadJump: null, coneDrill: null,   shuttleRun: null,   imageUrl: null });
  const pWalker    = await add({ name: "Jalon Walker",         college: "Georgia",        position: "EDGE", height: "6'2\"",    weight: 240, fortyYard: "4.51", rasScore: "9.41", benchPress: null, verticalJump: "38.5", broadJump: 118, coneDrill: "7.01", shuttleRun: "4.21", imageUrl: null });
  const pFannin    = await add({ name: "Harold Fannin Jr.",    college: "Bowling Green",  position: "TE",   height: "6'3½\"",   weight: 249, fortyYard: "4.58", rasScore: "9.62", benchPress: 22,   verticalJump: "37.0", broadJump: 119, coneDrill: null,   shuttleRun: null,   imageUrl: null });
  const pEmmanwori = await add({ name: "Nick Emmanwori",       college: "South Carolina", position: "S",    height: "6'3\"",    weight: 222, fortyYard: "4.34", rasScore: "9.84", benchPress: null, verticalJump: "41.5", broadJump: 128, coneDrill: null,   shuttleRun: null,   imageUrl: null });
  const pEgbuka    = await add({ name: "Emeka Egbuka",         college: "Ohio State",     position: "WR",   height: "6'1\"",    weight: 205, fortyYard: "4.49", rasScore: null,   benchPress: null, verticalJump: "38.0", broadJump: 117, coneDrill: null,   shuttleRun: null,   imageUrl: null });
  const pKennard   = await add({ name: "Kyle Kennard",         college: "Georgia",        position: "EDGE", height: "6'4\"",    weight: 248, fortyYard: "4.62", rasScore: null,   benchPress: null, verticalJump: "36.5", broadJump: null, coneDrill: null,   shuttleRun: null,   imageUrl: null });
  const pStewart   = await add({ name: "Shemar Stewart",       college: "Texas A&M",      position: "DL",   height: "6'5\"",    weight: 300, fortyYard: "4.91", rasScore: null,   benchPress: null, verticalJump: null,   broadJump: null, coneDrill: null,   shuttleRun: null,   imageUrl: null });
  const pScourton  = await add({ name: "Nic Scourton",         college: "Purdue",         position: "EDGE", height: "6'4\"",    weight: 272, fortyYard: "4.76", rasScore: null,   benchPress: null, verticalJump: null,   broadJump: null, coneDrill: null,   shuttleRun: null,   imageUrl: null });
  const pErsery    = await add({ name: "Aireontae Ersery",     college: "Minnesota",      position: "OT",   height: "6'6\"",    weight: 332, fortyYard: "5.12", rasScore: null,   benchPress: null, verticalJump: null,   broadJump: null, coneDrill: null,   shuttleRun: null,   imageUrl: null });
  const pPorter    = await add({ name: "Darien Porter",        college: "Iowa State",     position: "CB",   height: "6'2\"",    weight: 194, fortyYard: "4.29", rasScore: "9.93", benchPress: null, verticalJump: "42.0", broadJump: 130, coneDrill: "6.82", shuttleRun: "4.08", imageUrl: null });

  // Round 2 range (picks ~33-65)
  const pLagway    = await add({ name: "DJ Lagway",            college: "Florida",        position: "QB",   height: "6'2\"",    weight: 220, fortyYard: "4.68", rasScore: null,   benchPress: null, verticalJump: null,   broadJump: null, coneDrill: null,   shuttleRun: null,   imageUrl: null });
  const pBooker    = await add({ name: "Tyler Booker",         college: "Alabama",        position: "OG",   height: "6'5\"",    weight: 334, fortyYard: "5.39", rasScore: null,   benchPress: null, verticalJump: null,   broadJump: null, coneDrill: null,   shuttleRun: null,   imageUrl: null });
  const pHairston  = await add({ name: "Maxwell Hairston",     college: "Kentucky",       position: "CB",   height: "6'0\"",    weight: 186, fortyYard: "4.24", rasScore: "9.94", benchPress: null, verticalJump: "41.0", broadJump: 131, coneDrill: "6.79", shuttleRun: "4.04", imageUrl: null });
  const pHarmon    = await add({ name: "Derrick Harmon",       college: "Oregon",         position: "DT",   height: "6'4½\"",   weight: 314, fortyYard: "4.83", rasScore: null,   benchPress: null, verticalJump: null,   broadJump: null, coneDrill: null,   shuttleRun: null,   imageUrl: null });
  const pJackson   = await add({ name: "Landon Jackson",       college: "Arkansas",       position: "EDGE", height: "6'6½\"",   weight: 261, fortyYard: "4.69", rasScore: null,   benchPress: null, verticalJump: null,   broadJump: null, coneDrill: null,   shuttleRun: null,   imageUrl: null });
  const pStarks    = await add({ name: "Malaki Starks",        college: "Georgia",        position: "S",    height: "6'0\"",    weight: 197, fortyYard: "4.40", rasScore: null,   benchPress: null, verticalJump: "38.5", broadJump: null, coneDrill: null,   shuttleRun: null,   imageUrl: null });
  const pOladejo   = await add({ name: "Oluwafemi Oladejo",    college: "UCLA",           position: "EDGE", height: "6'3\"",    weight: 255, fortyYard: "4.54", rasScore: null,   benchPress: null, verticalJump: null,   broadJump: null, coneDrill: null,   shuttleRun: null,   imageUrl: null });
  const pArroyo    = await add({ name: "Elijah Arroyo",        college: "Miami",          position: "TE",   height: "6'5\"",    weight: 249, fortyYard: "4.49", rasScore: null,   benchPress: 22,   verticalJump: "37.5", broadJump: 116, coneDrill: null,   shuttleRun: null,   imageUrl: null });
  const pHunter    = await add({ name: "Jarquez Hunter",       college: "Auburn",         position: "RB",   height: "5'10\"",   weight: 207, fortyYard: "4.37", rasScore: null,   benchPress: null, verticalJump: "39.0", broadJump: 121, coneDrill: null,   shuttleRun: null,   imageUrl: null });
  const pSwinson   = await add({ name: "Bradyn Swinson",       college: "LSU",            position: "EDGE", height: "6'4\"",    weight: 254, fortyYard: "4.58", rasScore: null,   benchPress: null, verticalJump: null,   broadJump: null, coneDrill: null,   shuttleRun: null,   imageUrl: null });
  const pMbow      = await add({ name: "Marcus Mbow",          college: "Purdue",         position: "OT",   height: "6'4½\"",   weight: 308, fortyYard: "5.24", rasScore: null,   benchPress: null, verticalJump: null,   broadJump: null, coneDrill: null,   shuttleRun: null,   imageUrl: null });
  const pKing      = await add({ name: "Kobe King",            college: "Penn State",     position: "OG",   height: "6'4\"",    weight: 324, fortyYard: "5.42", rasScore: null,   benchPress: null, verticalJump: null,   broadJump: null, coneDrill: null,   shuttleRun: null,   imageUrl: null });
  const pBurch     = await add({ name: "Jordan Burch",         college: "Georgia",        position: "DL",   height: "6'4½\"",   weight: 294, fortyYard: "4.95", rasScore: null,   benchPress: null, verticalJump: null,   broadJump: null, coneDrill: null,   shuttleRun: null,   imageUrl: null });
  const pHenderson = await add({ name: "TreVeyon Henderson",   college: "Ohio State",     position: "RB",   height: "5'10\"",   weight: 208, fortyYard: "4.38", rasScore: null,   benchPress: null, verticalJump: null,   broadJump: 119, coneDrill: null,   shuttleRun: null,   imageUrl: null });
  const pBech      = await add({ name: "Jack Bech",            college: "TCU",            position: "WR",   height: "6'1½\"",   weight: 215, fortyYard: "4.47", rasScore: "9.13", benchPress: null, verticalJump: "38.5", broadJump: 120, coneDrill: null,   shuttleRun: null,   imageUrl: null });
  const pThornton  = await add({ name: "Dont'e Thornton Jr.",  college: "Penn State",     position: "WR",   height: "6'4\"",    weight: 199, fortyYard: "4.29", rasScore: "9.81", benchPress: null, verticalJump: "39.0", broadJump: 124, coneDrill: null,   shuttleRun: null,   imageUrl: null });
  const pPendleton = await add({ name: "Sam Pendleton",        college: "Michigan",       position: "OG",   height: "6'5\"",    weight: 319, fortyYard: "5.38", rasScore: null,   benchPress: null, verticalJump: null,   broadJump: null, coneDrill: null,   shuttleRun: null,   imageUrl: null });
  const pCJWest    = await add({ name: "CJ West",              college: "Indiana",        position: "DT",   height: "6'3\"",    weight: 307, fortyYard: "4.89", rasScore: null,   benchPress: null, verticalJump: null,   broadJump: null, coneDrill: null,   shuttleRun: null,   imageUrl: null });
  const pSorrell   = await add({ name: "Barryn Sorrell",       college: "Texas",          position: "EDGE", height: "6'2½\"",   weight: 256, fortyYard: "4.65", rasScore: null,   benchPress: null, verticalJump: null,   broadJump: null, coneDrill: null,   shuttleRun: null,   imageUrl: null });

  // ─── ADP SNAPSHOTS for new players ───────────────────────────────────────
  // Adding Mar 8 (7d ref) + Mar 15 (current) for all new players
  const d_mar8  = new Date("2026-03-08");
  const d_mar12 = new Date("2026-03-12");
  const d_mar15 = new Date("2026-03-15");

  // [player, mar8ADP, mar12ADP, mar15ADP]
  const newAdp: [NP, string, string, string][] = [
    [pMcMillan,  "22.0",  "21.4",  "20.8"],
    [pBanks,     "22.5",  "21.9",  "21.6"],
    [pWalker,    "25.0",  "23.8",  "22.8"],  // combine riser
    [pFannin,    "25.5",  "25.1",  "24.6"],
    [pEmmanwori, "28.0",  "26.8",  "25.8"],  // big safety rising
    [pEgbuka,    "27.0",  "26.7",  "26.4"],
    [pKennard,   "28.5",  "28.2",  "27.9"],
    [pStewart,   "29.5",  "29.2",  "28.8"],
    [pScourton,  "30.5",  "30.1",  "29.6"],
    [pErsery,    "32.0",  "31.6",  "31.1"],
    [pPorter,    "35.0",  "33.6",  "32.4"],  // 4.29 forty → big riser
    [pLagway,    "33.0",  "33.6",  "34.1"],  // slight fall after combine
    [pBooker,    "37.0",  "36.6",  "36.2"],
    [pHairston,  "40.0",  "38.8",  "37.8"],  // 4.24 forty → big riser
    [pHarmon,    "40.5",  "39.8",  "39.1"],
    [pJackson,   "41.5",  "40.9",  "40.3"],
    [pStarks,    "43.0",  "42.4",  "41.8"],
    [pOladejo,   "44.5",  "43.9",  "43.2"],
    [pArroyo,    "46.0",  "45.4",  "44.9"],
    [pHunter,    "47.0",  "46.5",  "46.1"],
    [pSwinson,   "48.5",  "48.2",  "47.8"],
    [pMbow,      "50.5",  "49.9",  "49.4"],
    [pKing,      "52.0",  "51.5",  "51.1"],
    [pBurch,     "54.0",  "53.3",  "52.6"],
    [pHenderson, "55.0",  "54.6",  "54.2"],
    [pBech,      "57.0",  "56.4",  "55.8"],
    [pThornton,  "59.0",  "58.2",  "57.4"],
    [pPendleton, "62.0",  "61.4",  "60.8"],
    [pCJWest,    "65.0",  "64.2",  "63.4"],
    [pSorrell,   "66.5",  "65.8",  "65.1"],
  ];

  for (const [player, mar8, mar12, mar15] of newAdp) {
    await storage.addAdpHistory({ playerId: player.id, adpValue: mar8,  date: d_mar8  });
    await storage.addAdpHistory({ playerId: player.id, adpValue: mar12, date: d_mar12 });
    await storage.addAdpHistory({ playerId: player.id, adpValue: mar15, date: d_mar15 });
  }

  // ─── EXTEND EXISTING MOCK DRAFTS with new player picks ────────────────────
  const allDrafts = await storage.getMockDrafts();
  const findDraft = (key: string) => allDrafts.find(d => d.sourceKey === key);

  const waltDraft    = findDraft("walterfootball_walt");
  const charlieDraft = findDraft("walterfootball_charlie");
  const tankDraft    = findDraft("tankathon");
  const djV3Draft    = allDrafts.filter(d => d.sourceKey === "nfl_jeremiah")
                                .sort((a,b) => b.id - a.id)[0]; // most recent DJ

  // Walt (3/7): fill gaps in picks 9,14,17,20-23,25,27-32
  if (waltDraft) {
    type WP = [NP, number];
    const waltNew: WP[] = [
      [pMcMillan, 9], [pFannin, 14], [pBanks, 17],
      [pm.get("Monroe Freeling")!, 20], [pWalker, 21], [pEmmanwori, 22],
      [pEgbuka, 23], [pKennard, 25], [pStewart, 27], [pScourton, 28],
      [pPorter, 29], [pErsery, 30], [pHairston, 31], [pArroyo, 32],
      [pLagway, 34], [pBooker, 35], [pHarmon, 37], [pJackson, 38],
      [pStarks, 40], [pOladejo, 42], [pHunter, 45], [pSwinson, 47],
    ];
    await storage.createMockDraftPicks(
      waltNew.filter(([p]) => p != null).map(([p, n]) => ({ mockDraftId: waltDraft.id, playerId: p.id, pickNumber: n }))
    );
  }

  // Charlie (3/9): fill gaps in picks 13-15,17,19-22,24-26,29-32
  if (charlieDraft) {
    type CP = [NP, number];
    const charlieNew: CP[] = [
      [pMcMillan, 13], [pBanks, 14], [pFannin, 15], [pWalker, 17],
      [pEmmanwori, 19], [pEgbuka, 20], [pKennard, 21], [pStewart, 22],
      [pScourton, 24], [pErsery, 25], [pPorter, 26], [pHairston, 29],
      [pArroyo, 30], [pStarks, 31], [pOladejo, 32],
      [pLagway, 33], [pBooker, 36], [pHarmon, 37], [pJackson, 40],
      [pHunter, 44], [pSwinson, 46],
    ];
    await storage.createMockDraftPicks(
      charlieNew.map(([p, n]) => ({ mockDraftId: charlieDraft.id, playerId: p.id, pickNumber: n }))
    );
  }

  // Tankathon Big Board (3/14): extend from pick 13
  if (tankDraft) {
    const tankExist = pm.get("Jermod McCoy");
    type TP = [NP | undefined, number];
    const tankNew: TP[] = [
      [tankExist, 13], [pMcMillan, 14], [pBanks, 15], [pWalker, 16], [pFannin, 17],
      [pm.get("Dillon Thieneman"), 18], [pm.get("Monroe Freeling"), 19],
      [pm.get("Kenyon Sadiq"), 20], [pEmmanwori, 21], [pm.get("Jordyn Tyson"), 22],
      [pm.get("Olaivavega Ioane"), 23], [pEgbuka, 24], [pKennard, 25],
      [pm.get("Denzel Boston"), 26], [pStewart, 27], [pScourton, 28],
      [pm.get("Jeff Caldwell"), 29], [pErsery, 30], [pPorter, 31], [pHairston, 32],
      [pLagway, 33], [pBooker, 35], [pHarmon, 37], [pJackson, 38],
      [pStarks, 39], [pOladejo, 41], [pArroyo, 43], [pHunter, 45],
      [pSwinson, 47], [pMbow, 49],
    ];
    await storage.createMockDraftPicks(
      tankNew.filter(([p]) => p != null).map(([p, n]) => ({ mockDraftId: tankDraft.id, playerId: p!.id, pickNumber: n }))
    );
  }

  // DJ v3 big board: fill gaps + extend to top-50
  if (djV3Draft) {
    type DP = [NP | undefined, number];
    const djNew: DP[] = [
      [pMcMillan, 20], [pBanks, 22], [pFannin, 23], [pWalker, 24],
      [pEmmanwori, 25], [pEgbuka, 26], [pKennard, 27], [pStewart, 28],
      [pScourton, 29], [pErsery, 30], [pPorter, 31], [pHairston, 32],
      [pLagway, 33], [pBooker, 34], [pHarmon, 36], [pJackson, 38],
      [pStarks, 39], [pOladejo, 41], [pArroyo, 43], [pHunter, 46],
      [pSwinson, 47], [pMbow, 49],
    ];
    await storage.createMockDraftPicks(
      djNew.filter(([p]) => p != null).map(([p, n]) => ({ mockDraftId: djV3Draft.id, playerId: p!.id, pickNumber: n }))
    );
  }

  // ─── Odds for new high-profile players ───────────────────────────────────
  const d_mar15_odds = new Date("2026-03-15");
  const newOdds: [NP, string, string, string][] = [
    [pMcMillan,  "DraftKings", "first_round", "-600"],
    [pBanks,     "FanDuel",    "first_round", "-550"],
    [pWalker,    "BetMGM",     "first_round", "-500"],
    [pFannin,    "DraftKings", "first_round", "-400"],
    [pEmmanwori, "Caesars",    "first_round", "-350"],
    [pPorter,    "DraftKings", "first_round", "-200"],
    [pHairston,  "BetMGM",     "first_round", "-160"],
    [pLagway,    "FanDuel",    "first_round", "+120"],
  ];
  for (const [player, book, market, odds] of newOdds) {
    await storage.addOddsHistory({ playerId: player.id, bookmaker: book, marketType: market, odds, date: d_mar15_odds });
  }

  console.log(`[EXPAND] Added ${newPlayers.length} new prospects (50 total). Extended Walt/Charlie/Tank/DJ picks through round 2.`);
}

async function ensureTimeWindowData() {
  // Wait for players to be seeded
  const allPlayers = await storage.getPlayers();
  if (allPlayers.length === 0) return;

  const P = (name: string) => allPlayers.find(p => p.name === name);

  // ─── Guard: check if Mar 12 ADP snapshot exists ──────────────────────────
  const mar12History = await storage.getPlayerAdpHistory(P("Fernando Mendoza")?.id ?? 0);
  const hasMar12 = mar12History.some(h => {
    const d = new Date(h.date!);
    return d.getFullYear() === 2026 && d.getMonth() === 2 && d.getDate() === 12;
  });

  if (!hasMar12) {
    const d_mar12 = new Date("2026-03-12");
    // Mar 12 values: interpolated ~30% of the way from Mar 8 → Mar 15
    // Formula: Mar8 + 0.3 * (Mar15 - Mar8) ≈ 0.7*Mar8 + 0.3*Mar15
    // (currentAdp = Mar15, Mar8 = currentAdp + adpChange)
    const mar12Map: Record<string, string> = {
      "Fernando Mendoza": "1.15",   // barely moved (already #1)
      "Arvell Reese": "2.54",
      "David Bailey": "4.74",
      "Jeremiyah Love": "5.59",     // was 5.8, rose to 5.1
      "Sonny Styles": "5.45",       // slight fall
      "Rueben Bain Jr.": "7.77",    // was 8.1, rose to 7.0
      "Caleb Downs": "7.61",        // big combine riser — most movement late
      "Spencer Fano": "10.80",      // was 12.0 → 8.0: most moved mid-late week
      "Francis Mauigoa": "7.61",    // slight fall, reversed
      "Carnell Tate": "9.59",
      "Mansoor Delane": "10.56",
      "Makai Lemon": "15.41",
      "Jermod McCoy": "15.85",
      "Jordyn Tyson": "17.27",      // was 18.5 → 14.4: combine riser
      "Dillon Thieneman": "14.93",  // slight fall
      "Kenyon Sadiq": "14.86",      // fell post-combine
      "Olaivavega Ioane": "17.11",
      "Monroe Freeling": "16.86",   // fell post-combine
      "Jeff Caldwell": "19.59",
      "Denzel Boston": "24.29",
    };
    for (const player of allPlayers) {
      const val = mar12Map[player.name];
      if (val) await storage.addAdpHistory({ playerId: player.id, adpValue: val, date: d_mar12 });
    }
    console.log("[TIMEWINDOW] Added Mar 12 ADP snapshot (3-day reference point).");
  }

  // ─── Guard: check if Mar 15 odds exist ───────────────────────────────────
  const mendozaOdds = await storage.getPlayerOddsHistory(P("Fernando Mendoza")?.id ?? 0);
  const hasMar15Odds = mendozaOdds.some(o => {
    const d = new Date(o.date!);
    return d.getFullYear() === 2026 && d.getMonth() === 2 && d.getDate() === 15;
  });

  if (!hasMar15Odds) {
    const d_mar15 = new Date("2026-03-15");

    // Format: [playerName, bookmaker, marketType, americanOdds]
    const oddsData: [string, string, string, string][] = [
      // ── Fernando Mendoza (ADP #1.1 — virtually unanimous #1 overall) ──
      ["Fernando Mendoza", "DraftKings", "first_overall", "-15000"],
      ["Fernando Mendoza", "FanDuel",    "first_overall", "-12000"],
      ["Fernando Mendoza", "BetMGM",     "first_overall", "-12000"],
      ["Fernando Mendoza", "DraftKings", "top_5_pick",    "-15000"],
      ["Fernando Mendoza", "FanDuel",    "first_round",   "-3000"],

      // ── Arvell Reese (ADP #2.4 — top-3 lock) ──
      ["Arvell Reese", "BetMGM",     "top_3_pick",   "-800"],
      ["Arvell Reese", "DraftKings", "top_5_pick",   "-2000"],
      ["Arvell Reese", "FanDuel",    "first_round",  "-2500"],

      // ── David Bailey (ADP #4.6) ──
      ["David Bailey", "BetMGM",     "top_5_pick",   "-500"],
      ["David Bailey", "DraftKings", "top_10_pick",  "-1200"],
      ["David Bailey", "FanDuel",    "first_round",  "-2000"],

      // ── Jeremiyah Love (ADP #5.1 — rising) ──
      ["Jeremiyah Love", "FanDuel",    "top_5_pick",   "-300"],
      ["Jeremiyah Love", "DraftKings", "top_10_pick",  "-800"],
      ["Jeremiyah Love", "Caesars",    "first_round",  "-1800"],

      // ── Sonny Styles (ADP #5.9) ──
      ["Sonny Styles", "DraftKings", "top_5_pick",   "-200"],
      ["Sonny Styles", "BetMGM",     "top_10_pick",  "-700"],
      ["Sonny Styles", "FanDuel",    "first_round",  "-1500"],

      // ── Caleb Downs (ADP #6.7 — big combine riser) ──
      ["Caleb Downs", "DraftKings", "top_10_pick",  "-500"],
      ["Caleb Downs", "FanDuel",    "first_round",  "-1200"],

      // ── Rueben Bain Jr. (ADP #7.0) ──
      ["Rueben Bain Jr.", "BetMGM",  "top_10_pick",  "-420"],
      ["Rueben Bain Jr.", "Caesars", "first_round",  "-1000"],

      // ── Spencer Fano (ADP #8.0 — MASSIVE RISER: was +400 top-10) ──
      ["Spencer Fano", "DraftKings", "top_10_pick",  "-300"],
      ["Spencer Fano", "BetMGM",     "top_10_pick",  "-280"],
      ["Spencer Fano", "FanDuel",    "first_round",  "-900"],

      // ── Francis Mauigoa (ADP #8.1) ──
      ["Francis Mauigoa", "Caesars",    "top_10_pick",  "-220"],
      ["Francis Mauigoa", "DraftKings", "first_round",  "-900"],

      // ── Carnell Tate (ADP #9.8) ──
      ["Carnell Tate", "FanDuel",    "top_10_pick",  "-160"],
      ["Carnell Tate", "BetMGM",     "first_round",  "-700"],

      // ── Mansoor Delane (ADP #10.7) ──
      ["Mansoor Delane", "DraftKings", "top_10_pick",  "+100"],
      ["Mansoor Delane", "FanDuel",    "first_round",  "-600"],

      // ── Jordyn Tyson (ADP #14.4 — big riser) ──
      ["Jordyn Tyson", "DraftKings", "first_round",  "-450"],
      ["Jordyn Tyson", "BetMGM",     "first_round",  "-420"],

      // ── Makai Lemon (ADP #15.2) ──
      ["Makai Lemon", "FanDuel",    "first_round",  "-380"],
      ["Makai Lemon", "Caesars",    "first_round",  "-350"],

      // ── Jermod McCoy (ADP #15.2 — rising) ──
      ["Jermod McCoy", "DraftKings", "first_round",  "-350"],

      // ── Dillon Thieneman (ADP #15.8) ──
      ["Dillon Thieneman", "BetMGM",     "first_round",  "-300"],
      ["Dillon Thieneman", "DraftKings", "first_round",  "-280"],

      // ── Kenyon Sadiq (ADP #16.8 — falling) ──
      ["Kenyon Sadiq", "FanDuel",    "first_round",  "-250"],
      ["Kenyon Sadiq", "Caesars",    "first_round",  "-230"],

      // ── Olaivavega Ioane (ADP #16.8) ──
      ["Olaivavega Ioane", "DraftKings", "first_round",  "-240"],

      // ── Monroe Freeling (ADP #18.8 — falling) ──
      ["Monroe Freeling", "BetMGM",  "first_round",  "-180"],
      ["Monroe Freeling", "FanDuel", "first_round",  "-160"],

      // ── Jeff Caldwell (ADP #19.3) ──
      ["Jeff Caldwell", "DraftKings", "first_round",  "-160"],
      ["Jeff Caldwell", "Caesars",    "first_round",  "-150"],

      // ── Denzel Boston (ADP #23.8 — late first) ──
      ["Denzel Boston", "FanDuel",    "first_round",  "+100"],
      ["Denzel Boston", "DraftKings", "first_round",  "+120"],
    ];

    for (const [playerName, bookmaker, marketType, americanOdds] of oddsData) {
      const player = P(playerName);
      if (!player) continue;
      await storage.addOddsHistory({
        playerId: player.id,
        bookmaker,
        marketType,
        odds: americanOdds,
        date: d_mar15,
      });
    }
    console.log("[TIMEWINDOW] Added Mar 15 expanded odds data for all 20 prospects.");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX: Patch null sourceKeys for early-seeded analysts
// ═══════════════════════════════════════════════════════════════════════════
async function ensureSourceKeysFix() {
  const nameToKey: Record<string, string> = {
    "Daniel Jeremiah":       "nfl_jeremiah",
    "Todd McShay":           "mcshay_report",
    "Mel Kiper Jr.":         "espn_kiper",
    "Trevor Sikkema":        "pff_sikkema",
    "Ryan Wilson":           "cbs_wilson",
    "Dane Brugler":          "athletic_brugler",
    "Jason Boris":           "times_news_boris",
    "Cory Rindone":          "huddle_rindone",
    "Jared Smola":           "draftsharks_smola",
    "Scott Smith":           "4for4_smith",
    "Brendan Donahue":       "sharp_donahue",
    "Josh Norris":           "underdog_norris",
    "Kyle Crabbs":           "33rd_team_crabbs",
    "Lance Zierlein":        "nfl_zierlein",
    "Peter Schrager":        "nfl_schrager",
    "Rob Staton":            "seahawks_staton",
    "Grinding the Mocks (EDP)": "gtm_consensus",
    "MDDB Consensus":        "mddb_consensus",
  };
  const fixed = await storage.fixNullSourceKeys(nameToKey);
  if (fixed > 0) console.log(`[SOURCEKEY FIX] Updated ${fixed} analyst sourceKeys.`);
}

// ═══════════════════════════════════════════════════════════════════════════
// SEED: Add extra analysts (MockDraftNFL, MDDB BigBoard, etc.)
// Guard: check for mockdraftnfl analyst
// ═══════════════════════════════════════════════════════════════════════════
async function ensureExtraAnalysts() {
  const analysts = await storage.getAnalysts();
  const exists = (key: string) => analysts.some(a => a.sourceKey === key);

  if (!exists("mockdraftnfl")) {
    await storage.createAnalyst({
      name: "MockDraftNFL Consensus",
      outlet: "mockdraftnfl.com",
      huddleScore2025: null,
      accuracyWeight: 0.80,
      isConsensus: 1,
      sourceKey: "mockdraftnfl",
      notes: "Crowd-sourced consensus mock draft from mockdraftnfl.com.",
    });
  }

  if (!exists("mddb_bigboard")) {
    await storage.createAnalyst({
      name: "MDDB Consensus Big Board",
      outlet: "nflmockdraftdatabase.com",
      huddleScore2025: null,
      accuracyWeight: 0.90,
      isConsensus: 1,
      sourceKey: "mddb_bigboard",
      notes: "NFL Mock Draft Database consensus big board from 800+ analyst rankings.",
    });
  }

  // Also init scrape jobs for extra analysts
  for (const sourceKey of ["mockdraftnfl", "mddb_bigboard"]) {
    await storage.upsertScrapeJob({ sourceKey, status: "pending", notes: "Auto-initialized" });
  }
}
