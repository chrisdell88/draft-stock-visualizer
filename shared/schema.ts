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
  huddleScore2025: integer("huddle_score_2025"),      // Huddle Report 2025 season score (max ~60)
  huddleScore5Year: numeric("huddle_score_5_year"),   // 5-year average score
  accuracyWeight: numeric("accuracy_weight"),          // Normalized 0-1 weight for consensus calcs
  isConsensus: integer("is_consensus").default(0),    // 1 if this is an aggregated consensus source
  notes: text("notes"),
});

export const mockDrafts = pgTable("mock_drafts", {
  id: serial("id").primaryKey(),
  sourceName: text("source_name").notNull(),
  analystId: integer("analyst_id"),                   // FK to analysts table
  url: text("url"),
  publishedAt: timestamp("published_at").defaultNow(),
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

export const insertPlayerSchema = createInsertSchema(players).omit({ id: true });
export const insertAnalystSchema = createInsertSchema(analysts).omit({ id: true }).extend({
  huddleScore5Year: z.number().optional(),
  accuracyWeight: z.number().optional(),
  isConsensus: z.number().optional(),
  notes: z.string().optional(),
});
export const insertMockDraftSchema = createInsertSchema(mockDrafts).omit({ id: true, publishedAt: true }).extend({
  analystId: z.number().optional(),
});
export const insertMockDraftPickSchema = createInsertSchema(mockDraftPicks).omit({ id: true });
export const insertAdpHistorySchema = createInsertSchema(adpHistory).omit({ id: true }).extend({
  date: z.date().optional(),
});
export const insertOddsSchema = createInsertSchema(odds).omit({ id: true }).extend({
  date: z.date().optional(),
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
