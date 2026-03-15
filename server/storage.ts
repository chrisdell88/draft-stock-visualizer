import { db } from "./db";
import { 
  players, analysts, mockDrafts, mockDraftPicks, adpHistory, odds, scrapeJobs,
  type Player, type InsertPlayer,
  type Analyst, type InsertAnalyst,
  type MockDraft, type InsertMockDraft,
  type MockDraftPick, type InsertMockDraftPick,
  type AdpHistory, type InsertAdpHistory,
  type Odds, type InsertOdds,
  type ScrapeJob, type InsertScrapeJob,
} from "@shared/schema";
import { eq, desc, asc, and, gte, lte, sql } from "drizzle-orm";

export interface IStorage {
  getPlayers(): Promise<(Player & { currentAdp?: number, trend?: 'up' | 'down' | 'flat', adpChange?: number })[]>;
  getPlayer(id: number): Promise<Player | undefined>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  
  getAnalysts(): Promise<Analyst[]>;
  createAnalyst(analyst: InsertAnalyst): Promise<Analyst>;
  getAnalystByName(name: string): Promise<Analyst | undefined>;
  getAnalystBySourceKey(sourceKey: string): Promise<Analyst | undefined>;

  getPlayerAdpHistory(playerId: number): Promise<AdpHistory[]>;
  getPlayerOddsHistory(playerId: number): Promise<Odds[]>;
  getPlayerRankings(playerId: number): Promise<Array<{ sourceName: string, analystId?: number | null, pickNumber: number, publishedAt?: string }>>;
  
  getMockDrafts(): Promise<MockDraft[]>;
  createMockDraft(mockDraft: InsertMockDraft): Promise<MockDraft>;
  createMockDraftPick(pick: InsertMockDraftPick): Promise<MockDraftPick>;
  createMockDraftPicks(picks: InsertMockDraftPick[]): Promise<MockDraftPick[]>;
  getMockDraftBySourceKeyAndDate(sourceKey: string, dateStr: string): Promise<MockDraft | undefined>;
  
  addAdpHistory(history: InsertAdpHistory): Promise<AdpHistory>;
  addOddsHistory(entry: InsertOdds): Promise<Odds>;
  
  getScrapeJobs(): Promise<ScrapeJob[]>;
  upsertScrapeJob(job: Partial<InsertScrapeJob> & { sourceKey: string }): Promise<ScrapeJob>;
}

export class DatabaseStorage implements IStorage {
  async getPlayers(): Promise<(Player & { currentAdp?: number, trend?: 'up' | 'down' | 'flat', adpChange?: number })[]> {
    const allPlayers = await db.select().from(players);
    const enrichedPlayers = await Promise.all(allPlayers.map(async (player) => {
      const history = await db.select()
        .from(adpHistory)
        .where(eq(adpHistory.playerId, player.id))
        .orderBy(desc(adpHistory.date))
        .limit(3);
        
      let currentAdp = undefined;
      let trend: 'up' | 'down' | 'flat' = 'flat';
      let adpChange = 0;
      
      if (history.length > 0) {
        currentAdp = Number(history[0].adpValue);
        if (history.length > 1) {
          const prevAdp = Number(history[1].adpValue);
          adpChange = prevAdp - currentAdp; // positive = rising (lower ADP = better)
          if (adpChange > 0.2) trend = 'up';
          else if (adpChange < -0.2) trend = 'down';
        }
      }
      
      return { ...player, currentAdp, trend, adpChange };
    }));
    
    return enrichedPlayers;
  }

  async getPlayer(id: number): Promise<Player | undefined> {
    const [player] = await db.select().from(players).where(eq(players.id, id));
    return player;
  }
  
  async createPlayer(player: InsertPlayer): Promise<Player> {
    const [created] = await db.insert(players).values(player).returning();
    return created;
  }

  async getAnalysts(): Promise<Analyst[]> {
    return await db.select().from(analysts).orderBy(desc(analysts.accuracyWeight));
  }

  async createAnalyst(analyst: InsertAnalyst): Promise<Analyst> {
    const [created] = await db.insert(analysts).values(analyst as any).returning();
    return created;
  }

  async getAnalystByName(name: string): Promise<Analyst | undefined> {
    const [analyst] = await db.select().from(analysts).where(eq(analysts.name, name));
    return analyst;
  }

  async getAnalystBySourceKey(sourceKey: string): Promise<Analyst | undefined> {
    const [analyst] = await db.select().from(analysts).where(eq(analysts.sourceKey, sourceKey));
    return analyst;
  }

  async getPlayerAdpHistory(playerId: number): Promise<AdpHistory[]> {
    return await db.select().from(adpHistory).where(eq(adpHistory.playerId, playerId)).orderBy(asc(adpHistory.date));
  }

  async getPlayerOddsHistory(playerId: number): Promise<Odds[]> {
    return await db.select().from(odds).where(eq(odds.playerId, playerId)).orderBy(asc(odds.date));
  }

  async getMockDrafts(): Promise<MockDraft[]> {
    return await db.select().from(mockDrafts).orderBy(desc(mockDrafts.publishedAt));
  }

  async createMockDraft(mockDraft: InsertMockDraft): Promise<MockDraft> {
    const [created] = await db.insert(mockDrafts).values(mockDraft).returning();
    return created;
  }

  async getMockDraftBySourceKeyAndDate(sourceKey: string, dateStr: string): Promise<MockDraft | undefined> {
    // dateStr format: "YYYY-MM-DD"
    const startOfDay = new Date(dateStr + "T00:00:00.000Z");
    const endOfDay = new Date(dateStr + "T23:59:59.999Z");
    const [draft] = await db.select().from(mockDrafts)
      .where(and(
        eq(mockDrafts.sourceKey, sourceKey),
        gte(mockDrafts.publishedAt, startOfDay),
        lte(mockDrafts.publishedAt, endOfDay),
      ))
      .limit(1);
    return draft;
  }

  async createMockDraftPick(pick: InsertMockDraftPick): Promise<MockDraftPick> {
    const [created] = await db.insert(mockDraftPicks).values(pick).returning();
    return created;
  }

  async createMockDraftPicks(picks: InsertMockDraftPick[]): Promise<MockDraftPick[]> {
    if (picks.length === 0) return [];
    return await db.insert(mockDraftPicks).values(picks).returning();
  }

  async addAdpHistory(history: InsertAdpHistory): Promise<AdpHistory> {
    const [created] = await db.insert(adpHistory).values(history as any).returning();
    return created;
  }

  async addOddsHistory(entry: InsertOdds): Promise<Odds> {
    const [created] = await db.insert(odds).values(entry as any).returning();
    return created;
  }

  async getPlayerRankings(playerId: number): Promise<Array<{ sourceName: string, analystId?: number | null, pickNumber: number, publishedAt?: string }>> {
    const rankings = await db.select({
      sourceName: mockDrafts.sourceName,
      analystId: mockDrafts.analystId,
      pickNumber: mockDraftPicks.pickNumber,
      publishedAt: mockDrafts.publishedAt,
    })
    .from(mockDraftPicks)
    .innerJoin(mockDrafts, eq(mockDraftPicks.mockDraftId, mockDrafts.id))
    .where(eq(mockDraftPicks.playerId, playerId))
    .orderBy(desc(mockDrafts.publishedAt));
    
    return rankings.map(r => ({
      sourceName: r.sourceName,
      analystId: r.analystId,
      pickNumber: r.pickNumber,
      publishedAt: r.publishedAt ? r.publishedAt.toISOString() : undefined,
    }));
  }

  async getScrapeJobs(): Promise<ScrapeJob[]> {
    return await db.select().from(scrapeJobs).orderBy(asc(scrapeJobs.sourceKey));
  }

  async getMatrixData(): Promise<{
    players: (Player & { currentAdp?: number; trend?: string; adpChange?: number })[];
    drafts: (typeof mockDrafts.$inferSelect)[];
    analysts: (typeof analysts.$inferSelect)[];
    picks: Record<number, Record<number, number>>; // picks[playerId][draftId] = pickNumber
  }> {
    const [allPlayers, allDrafts, allAnalysts, allPicks] = await Promise.all([
      this.getPlayers(),
      db.select().from(mockDrafts).orderBy(desc(mockDrafts.publishedAt)),
      db.select().from(analysts).orderBy(desc(analysts.accuracyWeight)),
      db.select().from(mockDraftPicks),
    ]);

    const picksMatrix: Record<number, Record<number, number>> = {};
    for (const pick of allPicks) {
      if (!picksMatrix[pick.playerId]) picksMatrix[pick.playerId] = {};
      picksMatrix[pick.playerId][pick.mockDraftId] = pick.pickNumber;
    }

    return { players: allPlayers, drafts: allDrafts, analysts: allAnalysts, picks: picksMatrix };
  }

  async upsertScrapeJob(job: Partial<InsertScrapeJob> & { sourceKey: string }): Promise<ScrapeJob> {
    const existing = await db.select().from(scrapeJobs).where(eq(scrapeJobs.sourceKey, job.sourceKey)).limit(1);
    if (existing.length > 0) {
      const [updated] = await db.update(scrapeJobs)
        .set({ ...job, lastRunAt: job.lastRunAt ?? new Date() } as any)
        .where(eq(scrapeJobs.sourceKey, job.sourceKey))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(scrapeJobs).values({ ...job, lastRunAt: job.lastRunAt ?? new Date() } as any).returning();
      return created;
    }
  }
}

export const storage = new DatabaseStorage();
