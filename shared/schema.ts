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
});

// Analyst accuracy data sourced from The Huddle Report and FantasyPros
export const analysts = pgTable("analysts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  outlet: text("outlet").notNull(),
  huddleScore2025: integer("huddle_score_2025"),
  huddleScore5Year: numeric("huddle_score_5_year"),
  accuracyWeight: numeric("accuracy_weight"),
  isConsensus: integer("is_consensus").default(0),
  sourceKey: text("source_key"),   // machine key, e.g. "walterfootball_charlie"
  scrapeUrl: text("scrape_url"),   // URL to scrape for auto-updates
  notes: text("notes"),
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

// Tracks automated scraping runs per source
export const scrapeJobs = pgTable("scrape_jobs", {
  id: serial("id").primaryKey(),
  sourceKey: text("source_key").notNull().unique(),
  lastRunAt: timestamp("last_run_at"),
  status: text("status").default("pending"),  // 'pending'|'running'|'success'|'error'
  picksFound: integer("picks_found"),
  errorMessage: text("error_message"),
  notes: text("notes"),
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
