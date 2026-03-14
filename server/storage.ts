import { db } from "./db";
import { 
  players, analysts, mockDrafts, mockDraftPicks, adpHistory, odds,
  type Player, type InsertPlayer,
  type Analyst, type InsertAnalyst,
  type MockDraft, type InsertMockDraft,
  type MockDraftPick, type InsertMockDraftPick,
  type AdpHistory, type InsertAdpHistory,
  type Odds, type InsertOdds
} from "@shared/schema";
import { eq, desc, asc } from "drizzle-orm";

export interface IStorage {
  getPlayers(): Promise<(Player & { currentAdp?: number, trend?: 'up' | 'down' | 'flat' })[]>;
  getPlayer(id: number): Promise<Player | undefined>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  
  getAnalysts(): Promise<Analyst[]>;
  createAnalyst(analyst: InsertAnalyst): Promise<Analyst>;

  getPlayerAdpHistory(playerId: number): Promise<AdpHistory[]>;
  getPlayerOddsHistory(playerId: number): Promise<Odds[]>;
  getPlayerRankings(playerId: number): Promise<Array<{ sourceName: string, analystId?: number | null, pickNumber: number, publishedAt?: string }>>;
  
  getMockDrafts(): Promise<MockDraft[]>;
  createMockDraft(mockDraft: InsertMockDraft): Promise<MockDraft>;
  createMockDraftPick(pick: InsertMockDraftPick): Promise<MockDraftPick>;
  createMockDraftPicks(picks: InsertMockDraftPick[]): Promise<MockDraftPick[]>;
  addAdpHistory(history: InsertAdpHistory): Promise<AdpHistory>;
  addOddsHistory(entry: InsertOdds): Promise<Odds>;
}

export class DatabaseStorage implements IStorage {
  async getPlayers(): Promise<(Player & { currentAdp?: number, trend?: 'up' | 'down' | 'flat' })[]> {
    const allPlayers = await db.select().from(players);
    const enrichedPlayers = await Promise.all(allPlayers.map(async (player) => {
      const history = await db.select()
        .from(adpHistory)
        .where(eq(adpHistory.playerId, player.id))
        .orderBy(desc(adpHistory.date))
        .limit(2);
        
      let currentAdp = undefined;
      let trend: 'up' | 'down' | 'flat' = 'flat';
      
      if (history.length > 0) {
        currentAdp = Number(history[0].adpValue);
        if (history.length > 1) {
          const prevAdp = Number(history[1].adpValue);
          if (currentAdp < prevAdp) trend = 'up';
          else if (currentAdp > prevAdp) trend = 'down';
        }
      }
      
      return { ...player, currentAdp, trend };
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
    return await db.select().from(analysts).orderBy(desc(analysts.huddleScore5Year));
  }

  async createAnalyst(analyst: InsertAnalyst): Promise<Analyst> {
    const [created] = await db.insert(analysts).values(analyst as any).returning();
    return created;
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

  async createMockDraftPick(pick: InsertMockDraftPick): Promise<MockDraftPick> {
    const [created] = await db.insert(mockDraftPicks).values(pick).returning();
    return created;
  }

  async createMockDraftPicks(picks: InsertMockDraftPick[]): Promise<MockDraftPick[]> {
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
}

export const storage = new DatabaseStorage();
