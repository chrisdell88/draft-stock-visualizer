import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  college: text("college"),
  position: text("position"),
  height: text("height"),
  weight: integer("weight"),
  rasScore: numeric("ras_score"),
  fortyYard: numeric("forty_yard"),
  benchPress: integer("bench_press"),
  verticalJump: numeric("vertical_jump"),
  broadJump: integer("broad_jump"),
  coneDrill: numeric("cone_drill"),
  shuttleRun: numeric("shuttle_run"),
  imageUrl: text("image_url"),
  comparablePlayer: text("comparable_player"),
  dominatorRating: numeric("dominator_rating"),
  breakoutAge: numeric("breakout_age"),
  playerProfilerUrl: text("player_profiler_url"),
  // Player Profiler enrichment
  age: numeric("age"),
  handSize: text("hand_size"),
  collegeQbrPct: integer("college_qbr_pct"),
  collegeYpaPct: integer("college_ypa_pct"),
  breakoutAgePct: integer("breakout_age_pct"),
});

// Analyst accuracy data sourced from The Huddle Report, FantasyPros, WalterFootball, NFLMDD
export const analysts = pgTable("analysts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  outlet: text("outlet").notNull(),
  huddleScore2025: integer("huddle_score_2025"),
  huddleScore5Year: numeric("huddle_score_5_year"),
  accuracyWeight: numeric("accuracy_weight"),
  isConsensus: integer("is_consensus").default(0),
  sourceKey: text("source_key"),
  scrapeUrl: text("scrape_url"),
  notes: text("notes"),
  enabled: integer("enabled").default(1),
  scraperType: text("scraper_type"),
  boardType: text("board_type").default("mock"),
  // X Score: Z-score normalized composite accuracy across all tracked sites/years
  xScore: numeric("x_score"),                  // composite normalized accuracy score
  xScoreRank: integer("x_score_rank"),         // rank among all tracked analysts
  xScoreSitesCount: integer("x_score_sites_count"), // how many sites contributed
  xScoreLastUpdated: timestamp("x_score_last_updated"),
  tier: integer("tier"),                       // 1 = confirmed high-accuracy, 2 = tracked, 3 = reference
});

export const mockDrafts = pgTable("mock_drafts", {
  id: serial("id").primaryKey(),
  sourceName: text("source_name").notNull(),
  sourceKey: text("source_key"),   // links to analysts.sourceKey / scrapeJobs.sourceKey
  analystId: integer("analyst_id"),
  url: text("url"),
  publishedAt: timestamp("published_at").defaultNow(),
  boardType: text("board_type").default("mock"), // "mock" | "bigboard"
});

export const mockDraftPicks = pgTable("mock_draft_picks", {
  id: serial("id").primaryKey(),
  mockDraftId: integer("mock_draft_id").notNull(),
  playerId: integer("player_id").notNull(),
  pickNumber: integer("pick_number").notNull(),
});

export const adpHistory = pgTable("adp_history", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  adpValue: numeric("adp_value").notNull(),
  date: timestamp("date").defaultNow(),
});

export const odds = pgTable("odds", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  bookmaker: text("bookmaker").notNull(),
  marketType: text("market_type").notNull(),
  odds: text("odds").notNull(),
  date: timestamp("date").defaultNow(),
});

export const scrapeJobs = pgTable("scrape_jobs", {
  id: serial("id").primaryKey(),
  sourceKey: text("source_key").notNull().unique(),
  lastRunAt: timestamp("last_run_at"),
  status: text("status").default("pending"),
  picksFound: integer("picks_found"),
  errorMessage: text("error_message"),
  notes: text("notes"),
});

export const scrapeRuns = pgTable("scrape_runs", {
  id: serial("id").primaryKey(),
  sourceKey: text("source_key").notNull(),
  status: text("status").notNull(),
  picksFound: integer("picks_found"),
  errorMessage: text("error_message"),
  runAt: timestamp("run_at").defaultNow(),
});

// ─── Accuracy / X Score ───────────────────────────────────────────────────────

// One row per analyst × site × year. Raw scores in each site's native units.
// site values: 'thr' | 'fp' | 'wf' | 'nflmdd' | 'gtm'
// thr:    0–96  (1pt correct player, 2pt correct player+team)
// fp:     0–320 (4 sub-categories, 32 picks)
// wf:     0–32  (correct player+team matches)
// nflmdd: 0–100 (percentage, bonuses for exact combos)
// gtm:    weighted Spearman correlation (TBD)
export const analystAccuracyScores = pgTable("analyst_accuracy_scores", {
  id: serial("id").primaryKey(),
  analystId: integer("analyst_id").notNull(),  // FK → analysts.id
  site: text("site").notNull(),                // 'thr' | 'fp' | 'wf' | 'nflmdd' | 'gtm'
  year: integer("year").notNull(),             // 2021–2025+
  rawScore: numeric("raw_score"),              // score in site's native units
  siteRank: integer("site_rank"),              // rank on that site that year
  zScore: numeric("z_score"),                  // computed after all scores loaded
  notes: text("notes"),                        // e.g. "best of 3 submissions"
});

export const insertPlayerSchema = createInsertSchema(players).omit({ id: true });
export const insertAnalystSchema = createInsertSchema(analysts).omit({ id: true }).extend({
  huddleScore5Year: z.number().optional(),
  accuracyWeight: z.number().optional(),
  isConsensus: z.number().optional(),
  sourceKey: z.string().optional(),
  scrapeUrl: z.string().optional(),
  notes: z.string().optional(),
});
export const insertMockDraftSchema = createInsertSchema(mockDrafts).omit({ id: true, publishedAt: true }).extend({
  analystId: z.number().optional(),
  sourceKey: z.string().optional(),
});
export const insertMockDraftPickSchema = createInsertSchema(mockDraftPicks).omit({ id: true });
export const insertAdpHistorySchema = createInsertSchema(adpHistory).omit({ id: true }).extend({
  date: z.date().optional(),
});
export const insertOddsSchema = createInsertSchema(odds).omit({ id: true }).extend({
  date: z.date().optional(),
});
export const insertScrapeJobSchema = createInsertSchema(scrapeJobs).omit({ id: true }).extend({
  lastRunAt: z.date().optional(),
  picksFound: z.number().optional(),
});
export const insertScrapeRunSchema = createInsertSchema(scrapeRuns).omit({ id: true, runAt: true });
export const insertAnalystAccuracyScoreSchema = createInsertSchema(analystAccuracyScores).omit({ id: true }).extend({
  rawScore: z.number().optional(),
  siteRank: z.number().optional(),
  zScore: z.number().optional(),
  notes: z.string().optional(),
});

export type Player = typeof players.$inferSelect;
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;

export type Analyst = typeof analysts.$inferSelect;
export type InsertAnalyst = z.infer<typeof insertAnalystSchema>;

export type MockDraft = typeof mockDrafts.$inferSelect;
export type InsertMockDraft = z.infer<typeof insertMockDraftSchema>;

export type MockDraftPick = typeof mockDraftPicks.$inferSelect;
export type InsertMockDraftPick = z.infer<typeof insertMockDraftPickSchema>;

export type AdpHistory = typeof adpHistory.$inferSelect;
export type InsertAdpHistory = z.infer<typeof insertAdpHistorySchema>;

export type Odds = typeof odds.$inferSelect;
export type InsertOdds = z.infer<typeof insertOddsSchema>;

export type ScrapeJob = typeof scrapeJobs.$inferSelect;
export type InsertScrapeJob = z.infer<typeof insertScrapeJobSchema>;

export type ScrapeRun = typeof scrapeRuns.$inferSelect;
export type InsertScrapeRun = z.infer<typeof insertScrapeRunSchema>;

export type AnalystAccuracyScore = typeof analystAccuracyScores.$inferSelect;
export type InsertAnalystAccuracyScore = z.infer<typeof insertAnalystAccuracyScoreSchema>;
