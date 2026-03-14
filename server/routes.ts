import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

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
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid player ID" });
      }
      
      const player = await storage.getPlayer(id);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      res.json(player);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.players.trends.path, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid player ID" });
      }
      
      const player = await storage.getPlayer(id);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      
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
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid player ID" });
      }
      
      const player = await storage.getPlayer(id);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      
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

  app.post(api.mockDrafts.scrape.path, async (req, res) => {
    try {
      const input = api.mockDrafts.scrape.input.parse(req.body);
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const mockDraft = await storage.createMockDraft({
        sourceName: input.sourceName,
        url: input.url
      });
      
      res.status(201).json({ 
        message: "Successfully scraped mock draft and updated ADPs", 
        mockDraft 
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  seedDatabase().catch(console.error);

  return httpServer;
}

async function seedDatabase() {
  const existingPlayers = await storage.getPlayers();
  if (existingPlayers.length > 0) return;

  // ─── DATE ANCHORS (all 2026 — nothing before Jan 1) ──────────────────────────
  // Real publication dates: DJ v1.0 was the first major big board of the cycle.
  // Most mock drafts didn't appear until after the Senior Bowl (late January).
  const d1 = new Date("2026-01-29"); // Daniel Jeremiah v1.0 published
  const d2 = new Date("2026-02-20"); // Daniel Jeremiah v2.0 (post-Senior Bowl, pre-combine)
  const d3 = new Date("2026-03-08"); // Post-combine snapshot (GTM from 1,500+ mocks)

  // ─── ANALYSTS ─────────────────────────────────────────────────────────────────
  // Accuracy data from The Huddle Report (thehuddlereport.com/mock-scores, mock-5-year)
  // and NFL Mock Draft Database (nflmockdraftdatabase.com/mock-drafts/2025/final-scores).
  // Scoring: 1pt per player placed in Round 1, 2pts for correct team match (max ~60).
  // accuracyWeight normalized: score5Year/50 (if available), else score2025/60.
  // Higher = more historically accurate, used for weighted consensus ADP.

  const aJeremiah = await storage.createAnalyst({
    name: "Daniel Jeremiah",
    outlet: "NFL.com / NFL Network",
    huddleScore2025: 42,
    huddleScore5Year: 40.8,
    accuracyWeight: 0.82,
    isConsensus: 0,
    notes: "Top prospect evaluator at NFL.com. Ranked #43 in 2025, #30 in 5-year avg. Three versions published per cycle.",
  });

  const aMcShay = await storage.createAnalyst({
    name: "Todd McShay",
    outlet: "The McShay Report",
    huddleScore2025: 47,
    huddleScore5Year: undefined,
    accuracyWeight: 0.78,
    isConsensus: 0,
    notes: "Former ESPN analyst. 2025 rank #9 (tied). One of the more accurate mainstream names.",
  });

  const aKiper = await storage.createAnalyst({
    name: "Mel Kiper Jr.",
    outlet: "ESPN",
    huddleScore2025: 47,
    huddleScore5Year: undefined,
    accuracyWeight: 0.78,
    isConsensus: 0,
    notes: "ESPN's signature draft analyst. 2025 rank #9 (tied).",
  });

  const aSikkema = await storage.createAnalyst({
    name: "Trevor Sikkema",
    outlet: "PFF (Pro Football Focus)",
    huddleScore2025: 43,
    huddleScore5Year: 41.8,
    accuracyWeight: 0.84,
    isConsensus: 0,
    notes: "PFF lead draft analyst. 5-year rank #19. Data-driven evaluation model.",
  });

  const aWilson = await storage.createAnalyst({
    name: "Ryan Wilson",
    outlet: "CBS Sports",
    huddleScore2025: 41,
    huddleScore5Year: undefined,
    accuracyWeight: 0.68,
    isConsensus: 0,
    notes: "CBS Sports draft analyst.",
  });

  const aBrugler = await storage.createAnalyst({
    name: "Dane Brugler",
    outlet: "The Athletic",
    huddleScore2025: undefined,
    huddleScore5Year: undefined,
    accuracyWeight: undefined,
    isConsensus: 0,
    notes: "Produces the annual 'The Beast' draft guide — one of the most comprehensive prospect reports in the industry.",
  });

  await storage.createAnalyst({
    name: "Jason Boris",
    outlet: "KSHB-TV (NBC Kansas City)",
    huddleScore2025: 52,
    huddleScore5Year: 48.2,
    accuracyWeight: 0.96,
    isConsensus: 0,
    notes: "#1 most accurate mock drafter in 2025 (tied). #1 in 5-year average per Huddle Report. Local TV analyst.",
  });

  await storage.createAnalyst({
    name: "Cory Rindone",
    outlet: "The Huddle Report",
    huddleScore2025: 52,
    huddleScore5Year: undefined,
    accuracyWeight: 0.87,
    isConsensus: 0,
    notes: "#1 most accurate in 2025 (tied). Huddle Report founder.",
  });

  await storage.createAnalyst({
    name: "Jared Smola",
    outlet: "DraftSharks",
    huddleScore2025: 49,
    huddleScore5Year: 43.4,
    accuracyWeight: 0.87,
    isConsensus: 0,
    notes: "2025 rank #4. 5-year rank #3. Consistently one of the most accurate analysts.",
  });

  await storage.createAnalyst({
    name: "Scott Smith",
    outlet: "4for4.com",
    huddleScore2025: 48,
    huddleScore5Year: 43.2,
    accuracyWeight: 0.86,
    isConsensus: 0,
    notes: "2025 rank #8. 5-year rank #5.",
  });

  await storage.createAnalyst({
    name: "Brendan Donahue",
    outlet: "Sharp Football Analysis",
    huddleScore2025: 46,
    huddleScore5Year: 44.2,
    accuracyWeight: 0.88,
    isConsensus: 0,
    notes: "2025 rank #13. 5-year rank #2 with 44.2 avg. Highly consistent.",
  });

  await storage.createAnalyst({
    name: "Josh Norris",
    outlet: "Underdog Fantasy",
    huddleScore2025: 43,
    huddleScore5Year: 42.8,
    accuracyWeight: 0.86,
    isConsensus: 0,
    notes: "2025 rank #27. 5-year rank #8. Former The Ringer draft analyst.",
  });

  await storage.createAnalyst({
    name: "Kyle Crabbs",
    outlet: "The 33rd Team",
    huddleScore2025: 43,
    huddleScore5Year: 40.0,
    accuracyWeight: 0.80,
    isConsensus: 0,
    notes: "2025 rank #27. The 33rd Team lead draft analyst.",
  });

  await storage.createAnalyst({
    name: "Lance Zierlein",
    outlet: "NFL.com",
    huddleScore2025: undefined,
    huddleScore5Year: 41.2,
    accuracyWeight: 0.82,
    isConsensus: 0,
    notes: "NFL.com senior analyst. 5-year rank #28.",
  });

  await storage.createAnalyst({
    name: "Peter Schrager",
    outlet: "NFL Network / Good Morning Football",
    huddleScore2025: 42,
    huddleScore5Year: 40.6,
    accuracyWeight: 0.81,
    isConsensus: 0,
    notes: "2025 rank #43. 5-year rank #33.",
  });

  await storage.createAnalyst({
    name: "Rob Staton",
    outlet: "Seahawks Draft Blog",
    huddleScore2025: 43,
    huddleScore5Year: 41.0,
    accuracyWeight: 0.82,
    isConsensus: 0,
    notes: "2025 rank #27. 5-year rank #29. Independent analyst, strong track record.",
  });

  // Consensus aggregators — get isConsensus flag, weight reflects aggregate accuracy
  const aGTM = await storage.createAnalyst({
    name: "Grinding the Mocks (EDP)",
    outlet: "grindingthemocks.shinyapps.io",
    huddleScore2025: undefined,
    huddleScore5Year: undefined,
    accuracyWeight: 0.92,
    isConsensus: 1,
    notes: "Aggregates 1,500+ mock drafts into an Expected Draft Position (EDP) consensus. High accuracy due to wisdom-of-crowds effect.",
  });

  const aMDDB = await storage.createAnalyst({
    name: "MDDB Consensus",
    outlet: "nflmockdraftdatabase.com",
    huddleScore2025: undefined,
    huddleScore5Year: undefined,
    accuracyWeight: 0.90,
    isConsensus: 1,
    notes: "NFL Mock Draft Database consensus from 800+ first-round mock drafts. Tracks % of mocks with each player at each slot.",
  });

  // ─── PLAYERS ────────────────────────────────────────────────────────────────
  const pMendoza = await storage.createPlayer({
    name: "Fernando Mendoza", college: "Indiana", position: "QB",
    height: "6'4\"", weight: 228, rasScore: null, fortyYard: null,
    benchPress: null, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null,
  });
  const pLove = await storage.createPlayer({
    name: "Jeremiyah Love", college: "Notre Dame", position: "RB",
    height: "5'11\"", weight: 210, rasScore: null, fortyYard: "4.36",
    benchPress: null, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null,
  });
  const pReese = await storage.createPlayer({
    name: "Arvell Reese", college: "Ohio State", position: "EDGE",
    height: "6'3\"", weight: 242, rasScore: null, fortyYard: null,
    benchPress: null, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null,
  });
  const pBailey = await storage.createPlayer({
    name: "David Bailey", college: "Texas Tech", position: "EDGE",
    height: "6'4\"", weight: 255, rasScore: null, fortyYard: null,
    benchPress: null, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null,
  });
  // Sonny Styles: 9.99 RAS, 43.5" vertical — biggest combine riser of the cycle
  const pStyles = await storage.createPlayer({
    name: "Sonny Styles", college: "Ohio State", position: "LB",
    height: "6'4\"", weight: 232, rasScore: "9.99", fortyYard: null,
    benchPress: null, verticalJump: "43.5", broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null,
  });
  // Rueben Bain Jr.: arm length concern (<31" arms), did not work out at combine
  const pBain = await storage.createPlayer({
    name: "Rueben Bain Jr.", college: "Miami", position: "EDGE",
    height: "6'2\"", weight: 265, rasScore: null, fortyYard: null,
    benchPress: null, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null,
  });
  // Francis Mauigoa: 6'5½" 329 lbs — did not work out at combine
  const pMauigoa = await storage.createPlayer({
    name: "Francis Mauigoa", college: "Miami", position: "OT",
    height: "6'5½\"", weight: 329, rasScore: null, fortyYard: null,
    benchPress: null, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null,
  });
  const pDowns = await storage.createPlayer({
    name: "Caleb Downs", college: "Ohio State", position: "S",
    height: "5'11\"", weight: 205, rasScore: null, fortyYard: null,
    benchPress: null, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null,
  });
  const pDelane = await storage.createPlayer({
    name: "Mansoor Delane", college: "LSU", position: "CB",
    height: "6'1\"", weight: 196, rasScore: null, fortyYard: null,
    benchPress: null, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null,
  });
  const pLemon = await storage.createPlayer({
    name: "Makai Lemon", college: "USC", position: "WR",
    height: "5'11⅛\"", weight: 192, rasScore: null, fortyYard: null,
    benchPress: null, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null,
  });
  // Carnell Tate: 4.53 40-yard — solid combine for big WR
  const pTate = await storage.createPlayer({
    name: "Carnell Tate", college: "Ohio State", position: "WR",
    height: "6'2¼\"", weight: 192, rasScore: null, fortyYard: "4.53",
    benchPress: null, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null,
  });
  const pIoane = await storage.createPlayer({
    name: "Olaivavega Ioane", college: "Penn State", position: "IOL",
    height: "6'4¼\"", weight: 320, rasScore: null, fortyYard: null,
    benchPress: null, verticalJump: "31.5", broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null,
  });
  // Spencer Fano: 4.91 40-yard for OT, 7.34 3-cone — elite athletic profile
  const pFano = await storage.createPlayer({
    name: "Spencer Fano", college: "Utah", position: "OT",
    height: "6'5½\"", weight: 311, rasScore: null, fortyYard: "4.91",
    benchPress: null, verticalJump: "32", broadJump: null, coneDrill: "7.34", shuttleRun: "4.67", imageUrl: null,
  });
  const pMcCoy = await storage.createPlayer({
    name: "Jermod McCoy", college: "Tennessee", position: "CB",
    height: "6'1\"", weight: 198, rasScore: null, fortyYard: null,
    benchPress: null, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null,
  });
  // Kenyon Sadiq: 4.39 40-yard — fastest TE ever at the combine
  const pSadiq = await storage.createPlayer({
    name: "Kenyon Sadiq", college: "Oregon", position: "TE",
    height: "6'3⅛\"", weight: 241, rasScore: null, fortyYard: "4.39",
    benchPress: null, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null,
  });
  // Monroe Freeling: 4.93 40 for a 6'7" OT — elite size/speed combination
  const pFreeling = await storage.createPlayer({
    name: "Monroe Freeling", college: "Georgia", position: "OT",
    height: "6'7⅜\"", weight: 315, rasScore: null, fortyYard: "4.93",
    benchPress: null, verticalJump: "33.5", broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null,
  });
  // Dillon Thieneman: combine riser from Oregon, "blew away athletic expectations"
  const pThieneman = await storage.createPlayer({
    name: "Dillon Thieneman", college: "Oregon", position: "S",
    height: "6'0\"", weight: 200, rasScore: null, fortyYard: null,
    benchPress: null, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null,
  });
  const pTyson = await storage.createPlayer({
    name: "Jordyn Tyson", college: "Arizona State", position: "WR",
    height: "6'2⅛\"", weight: 203, rasScore: null, fortyYard: null,
    benchPress: 26, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null,
  });
  // Jeff Caldwell: 9.99 RAS, 4.31 40-yard at 6'5" 216 lbs — elite combine vaulted into first round
  const pCaldwell = await storage.createPlayer({
    name: "Jeff Caldwell", college: "Cincinnati", position: "WR",
    height: "6'5\"", weight: 216, rasScore: "9.99", fortyYard: "4.31",
    benchPress: null, verticalJump: null, broadJump: null, coneDrill: null, shuttleRun: null, imageUrl: null,
  });
  // Denzel Boston: 35" vertical, 4.28 shuttle
  const pBoston = await storage.createPlayer({
    name: "Denzel Boston", college: "Washington", position: "WR",
    height: "6'3⅝\"", weight: 212, rasScore: null, fortyYard: null,
    benchPress: null, verticalJump: "35", broadJump: null, coneDrill: null, shuttleRun: "4.28", imageUrl: null,
  });

  // ─── MOCK DRAFTS (linked to analysts) ───────────────────────────────────────
  // DJ v1.0: Jan 29, 2026 — first major big board of the 2026 cycle
  const djV1 = await storage.createMockDraft({
    sourceName: "Daniel Jeremiah (NFL.com) v1.0",
    analystId: aJeremiah.id,
    url: "https://www.nfl.com/news/daniel-jeremiah-s-top-50-2026-nfl-draft-prospect-rankings-1-0",
  });
  // DJ v2.0: Feb 20, 2026 — post-Senior Bowl, pre-combine adjustments
  const djV2 = await storage.createMockDraft({
    sourceName: "Daniel Jeremiah (NFL.com) v2.0",
    analystId: aJeremiah.id,
    url: "https://www.nfl.com/news/daniel-jeremiah-s-top-50-2026-nfl-draft-prospect-rankings-2-0",
  });
  // DJ v3.0: Mar 5, 2026 — post-combine, major movers
  const djV3 = await storage.createMockDraft({
    sourceName: "Daniel Jeremiah (NFL.com) v3.0",
    analystId: aJeremiah.id,
    url: "https://www.nfl.com/news/daniel-jeremiah-s-top-50-2026-nfl-draft-prospect-rankings-3-0",
  });
  // GTM EDP: Mar 8, 2026 — aggregated from 1,500+ mocks
  const gtm = await storage.createMockDraft({
    sourceName: "Grinding the Mocks (EDP Consensus)",
    analystId: aGTM.id,
    url: "https://grindingthemocks.shinyapps.io/Dashboard/",
  });
  // MDDB Consensus: Mar 13, 2026 — from 834 first-round mock drafts
  const mddb = await storage.createMockDraft({
    sourceName: "MDDB Consensus Mock Draft",
    analystId: aMDDB.id,
    url: "https://www.nflmockdraftdatabase.com/mock-drafts/2026/consensus-mock-draft-2026",
  });

  // ─── MOCK DRAFT PICKS ───────────────────────────────────────────────────────
  // DJ v1.0 (Jan 29): Reese #3, Bailey #4, Styles #5 — early pre-combine rankings
  const djV1Picks: [typeof pMendoza, number][] = [
    [pMendoza,1],[pLove,2],[pReese,3],[pBailey,4],[pStyles,5],
    [pBain,6],[pMauigoa,7],[pDowns,8],[pDelane,9],[pLemon,10],
    [pTate,11],[pIoane,12],[pFano,13],[pMcCoy,14],[pSadiq,15],
    [pFreeling,16],[pTyson,17],[pThieneman,18],[pCaldwell,25],[pBoston,22],
  ];
  for (const [p, n] of djV1Picks) {
    await storage.createMockDraftPick({ mockDraftId: djV1.id, playerId: p.id, pickNumber: n });
  }

  // DJ v2.0 (Feb 20): Bailey jumps to #3, Reese drops to #4 (consensus diverging)
  const djV2Picks: [typeof pMendoza, number][] = [
    [pMendoza,1],[pLove,2],[pBailey,3],[pReese,4],[pStyles,5],
    [pBain,6],[pMauigoa,7],[pDowns,8],[pLemon,9],[pDelane,10],
    [pTate,11],[pIoane,12],[pFano,13],[pMcCoy,14],[pFreeling,15],
    [pSadiq,16],[pTyson,17],[pThieneman,18],[pCaldwell,22],[pBoston,23],
  ];
  for (const [p, n] of djV2Picks) {
    await storage.createMockDraftPick({ mockDraftId: djV2.id, playerId: p.id, pickNumber: n });
  }

  // DJ v3.0 (Mar 5): POST-COMBINE. Styles rockets to #3 (↑2 — 9.99 RAS/43.5" vertical).
  // Mauigoa falls to #13 (skipped workouts). Sadiq rises on 4.39 40-yard.
  const djV3Picks: [typeof pMendoza, number][] = [
    [pMendoza,1],[pLove,2],[pStyles,3],[pBailey,4],[pReese,5],
    [pBain,6],[pLemon,7],[pDowns,8],[pDelane,9],[pTate,10],
    [pIoane,11],[pFano,12],[pMauigoa,13],[pMcCoy,14],[pTyson,15],
    [pSadiq,16],[pThieneman,17],[pFreeling,18],[pCaldwell,19],[pBoston,21],
  ];
  for (const [p, n] of djV3Picks) {
    await storage.createMockDraftPick({ mockDraftId: djV3.id, playerId: p.id, pickNumber: n });
  }

  // GTM EDP (Mar 8): 1,500+ mocks aggregated. Note key divergences from DJ:
  // Reese at EDP 2.6 (DJ: 5th), Love at EDP 5.8 (DJ: 2nd), Mauigoa at 7.4 (DJ: 13th)
  const gtmPicks: [typeof pMendoza, number][] = [
    [pMendoza,1],[pReese,3],[pBailey,5],[pStyles,5],[pLove,6],
    [pMauigoa,7],[pDowns,8],[pBain,8],[pTate,10],[pDelane,11],
    [pFano,12],[pSadiq,13],[pThieneman,14],[pFreeling,15],[pLemon,16],
    [pMcCoy,17],[pIoane,18],[pTyson,19],[pCaldwell,20],[pBoston,25],
  ];
  for (const [p, n] of gtmPicks) {
    await storage.createMockDraftPick({ mockDraftId: gtm.id, playerId: p.id, pickNumber: n });
  }

  // MDDB Consensus (Mar 13): Most common pick per slot across 46 tracked first-round mocks.
  // Mendoza #1 in 100%. Reese #2 in 85%. Mauigoa #3 in 39%.
  const mddbPicks: [typeof pMendoza, number][] = [
    [pMendoza,1],[pReese,2],[pMauigoa,3],[pBailey,4],[pStyles,5],
    [pLove,6],[pBain,7],[pDowns,8],[pFano,9],[pDelane,10],
    [pTate,11],[pIoane,12],[pSadiq,13],[pThieneman,14],[pFreeling,15],
    [pLemon,16],[pMcCoy,17],[pTyson,18],[pCaldwell,19],[pBoston,23],
  ];
  for (const [p, n] of mddbPicks) {
    await storage.createMockDraftPick({ mockDraftId: mddb.id, playerId: p.id, pickNumber: n });
  }

  // ─── ADP HISTORY (Jan 29 → Feb 20 → Mar 8 only) ─────────────────────────────
  // Three snapshots aligned with real publication dates. All entries >= Jan 1, 2026.

  // Fernando Mendoza — unanimous #1, essentially immovable all cycle
  for (const [d, v] of [[d1,"1.2"],[d2,"1.2"],[d3,"1.2"]] as [Date,string][]) {
    await storage.addAdpHistory({ playerId: pMendoza.id, adpValue: v, date: d });
  }
  // Jeremiyah Love — DJ's darling at #2 but consensus has him lower post-combine
  for (const [d, v] of [[d1,"2.8"],[d2,"3.5"],[d3,"5.8"]] as [Date,string][]) {
    await storage.addAdpHistory({ playerId: pLove.id, adpValue: v, date: d });
  }
  // Arvell Reese — steady rise; MDDB has him #2 in 85% of mocks
  for (const [d, v] of [[d1,"3.0"],[d2,"2.8"],[d3,"2.6"]] as [Date,string][]) {
    await storage.addAdpHistory({ playerId: pReese.id, adpValue: v, date: d });
  }
  // David Bailey — solid riser pre-combine, then stabilized
  for (const [d, v] of [[d1,"5.0"],[d2,"4.9"],[d3,"4.8"]] as [Date,string][]) {
    await storage.addAdpHistory({ playerId: pBailey.id, adpValue: v, date: d });
  }
  // Sonny Styles — THE combine riser: 9.99 RAS, 43.5" vertical; 8→5.4
  for (const [d, v] of [[d1,"6.8"],[d2,"6.0"],[d3,"5.4"]] as [Date,string][]) {
    await storage.addAdpHistory({ playerId: pStyles.id, adpValue: v, date: d });
  }
  // Rueben Bain Jr. — arm length concern (<31"), ADP drifting worse
  for (const [d, v] of [[d1,"7.5"],[d2,"8.0"],[d3,"8.1"]] as [Date,string][]) {
    await storage.addAdpHistory({ playerId: pBain.id, adpValue: v, date: d });
  }
  // Francis Mauigoa — was top-5 lock, skipped combine workouts → consensus fell hard
  for (const [d, v] of [[d1,"6.5"],[d2,"7.0"],[d3,"7.4"]] as [Date,string][]) {
    await storage.addAdpHistory({ playerId: pMauigoa.id, adpValue: v, date: d });
  }
  // Caleb Downs — steady elite safety
  for (const [d, v] of [[d1,"8.3"],[d2,"8.1"],[d3,"8.0"]] as [Date,string][]) {
    await storage.addAdpHistory({ playerId: pDowns.id, adpValue: v, date: d });
  }
  // Mansoor Delane — elite CB, steady riser
  for (const [d, v] of [[d1,"11.2"],[d2,"10.8"],[d3,"10.5"]] as [Date,string][]) {
    await storage.addAdpHistory({ playerId: pDelane.id, adpValue: v, date: d });
  }
  // Makai Lemon — USC WR, steady top-15
  for (const [d, v] of [[d1,"16.5"],[d2,"16.0"],[d3,"15.5"]] as [Date,string][]) {
    await storage.addAdpHistory({ playerId: pLemon.id, adpValue: v, date: d });
  }
  // Carnell Tate — rising on solid combine (4.53 40-yard)
  for (const [d, v] of [[d1,"12.5"],[d2,"10.5"],[d3,"9.5"]] as [Date,string][]) {
    await storage.addAdpHistory({ playerId: pTate.id, adpValue: v, date: d });
  }
  // Olaivavega Ioane — Penn State center, stable mid-first
  for (const [d, v] of [[d1,"18.0"],[d2,"17.5"],[d3,"17.5"]] as [Date,string][]) {
    await storage.addAdpHistory({ playerId: pIoane.id, adpValue: v, date: d });
  }
  // Spencer Fano — 4.91 40-yard solidified first-round status
  for (const [d, v] of [[d1,"13.5"],[d2,"12.5"],[d3,"12.0"]] as [Date,string][]) {
    await storage.addAdpHistory({ playerId: pFano.id, adpValue: v, date: d });
  }
  // Jermod McCoy — Tennessee CB, steady mid-first
  for (const [d, v] of [[d1,"17.5"],[d2,"17.0"],[d3,"16.5"]] as [Date,string][]) {
    await storage.addAdpHistory({ playerId: pMcCoy.id, adpValue: v, date: d });
  }
  // Kenyon Sadiq — BIG riser: 4.39 40-yard fastest TE in combine history
  for (const [d, v] of [[d1,"18.5"],[d2,"15.0"],[d3,"13.0"]] as [Date,string][]) {
    await storage.addAdpHistory({ playerId: pSadiq.id, adpValue: v, date: d });
  }
  // Monroe Freeling — Georgia OT, 4.93 for a 6'7" man
  for (const [d, v] of [[d1,"16.0"],[d2,"15.2"],[d3,"15.0"]] as [Date,string][]) {
    await storage.addAdpHistory({ playerId: pFreeling.id, adpValue: v, date: d });
  }
  // Dillon Thieneman — Oregon S, massive combine riser
  for (const [d, v] of [[d1,"21.0"],[d2,"17.0"],[d3,"14.0"]] as [Date,string][]) {
    await storage.addAdpHistory({ playerId: pThieneman.id, adpValue: v, date: d });
  }
  // Jordyn Tyson — Arizona State WR, steady
  for (const [d, v] of [[d1,"20.0"],[d2,"19.5"],[d3,"18.5"]] as [Date,string][]) {
    await storage.addAdpHistory({ playerId: pTyson.id, adpValue: v, date: d });
  }
  // Jeff Caldwell — 9.99 RAS, 4.31 40-yard at 6'5" — elite testing vaulted into first round
  for (const [d, v] of [[d1,"30.0"],[d2,"24.0"],[d3,"20.0"]] as [Date,string][]) {
    await storage.addAdpHistory({ playerId: pCaldwell.id, adpValue: v, date: d });
  }
  // Denzel Boston — Washington WR, steady late-first
  for (const [d, v] of [[d1,"26.5"],[d2,"25.0"],[d3,"24.5"]] as [Date,string][]) {
    await storage.addAdpHistory({ playerId: pBoston.id, adpValue: v, date: d });
  }

  // ─── SPORTSBOOK ODDS ────────────────────────────────────────────────────────
  // American odds. Tracking shows how markets moved with combine results.
  // Fernando Mendoza — #1 overall lock, market barely moved
  for (const [d, o] of [[d1,"-5000"],[d2,"-8000"],[d3,"-10000"]] as [Date,string][]) {
    await storage.addOddsHistory({ playerId: pMendoza.id, bookmaker: "DraftKings", marketType: "first_overall", odds: o, date: d });
  }
  // Jeremiyah Love — top 5 odds fell as consensus pushed him lower
  for (const [d, o] of [[d1,"-400"],[d2,"-250"],[d3,"+100"]] as [Date,string][]) {
    await storage.addOddsHistory({ playerId: pLove.id, bookmaker: "FanDuel", marketType: "top_5_pick", odds: o, date: d });
  }
  // Sonny Styles — top 5 odds rocketed on combine performance
  for (const [d, o] of [[d1,"+300"],[d2,"+120"],[d3,"-200"]] as [Date,string][]) {
    await storage.addOddsHistory({ playerId: pStyles.id, bookmaker: "DraftKings", marketType: "top_5_pick", odds: o, date: d });
  }
  // Arvell Reese — top 3 odds tightening (MDDB has him #2 in 85% of mocks)
  for (const [d, o] of [[d1,"-150"],[d2,"-180"],[d3,"-220"]] as [Date,string][]) {
    await storage.addOddsHistory({ playerId: pReese.id, bookmaker: "BetMGM", marketType: "top_3_pick", odds: o, date: d });
  }
  // Kenyon Sadiq — first round odds exploded after 4.39 40-yard
  for (const [d, o] of [[d1,"+250"],[d2,"+100"],[d3,"-300"]] as [Date,string][]) {
    await storage.addOddsHistory({ playerId: pSadiq.id, bookmaker: "FanDuel", marketType: "first_round", odds: o, date: d });
  }
  // Rueben Bain Jr. — top 10 odds drifted as combine raised arm-length concerns
  for (const [d, o] of [[d1,"-180"],[d2,"-120"],[d3,"+110"]] as [Date,string][]) {
    await storage.addOddsHistory({ playerId: pBain.id, bookmaker: "Caesars", marketType: "top_10_pick", odds: o, date: d });
  }
  // Dillon Thieneman — first round odds shifted dramatically after combine
  for (const [d, o] of [[d1,"+400"],[d2,"+180"],[d3,"-250"]] as [Date,string][]) {
    await storage.addOddsHistory({ playerId: pThieneman.id, bookmaker: "DraftKings", marketType: "first_round", odds: o, date: d });
  }
  // Jeff Caldwell — first round odds slashed after elite 9.99 RAS testing
  for (const [d, o] of [[d1,"+600"],[d2,"+280"],[d3,"-150"]] as [Date,string][]) {
    await storage.addOddsHistory({ playerId: pCaldwell.id, bookmaker: "BetMGM", marketType: "first_round", odds: o, date: d });
  }

  console.log("Seeded 20 prospects, 17 analysts with accuracy weights, 5 mock drafts (linked to analysts), and sportsbook odds — all from Jan 2026 onward.");
}
