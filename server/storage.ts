import { db } from "./db";
import {
  players, analysts, mockDrafts, mockDraftPicks, adpHistory, odds, scrapeJobs, scrapeRuns,
  analystAccuracyScores,
  type Player, type InsertPlayer,
  type Analyst, type InsertAnalyst,
  type MockDraft, type InsertMockDraft,
  type MockDraftPick, type InsertMockDraftPick,
  type AdpHistory, type InsertAdpHistory,
  type Odds, type InsertOdds,
  type ScrapeJob, type InsertScrapeJob,
  type ScrapeRun,
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
  fixNullSourceKeys(nameToKey: Record<string, string>): Promise<number>;
  getMockDraftPickCount(mockDraftId: number): Promise<number>;

  getPlayerAdpHistory(playerId: number): Promise<AdpHistory[]>;
  getPlayerOddsHistory(playerId: number): Promise<Odds[]>;
  getPlayerRankings(playerId: number): Promise<Array<{ sourceName: string, sourceKey?: string | null, boardType?: string | null, analystId?: number | null, pickNumber: number, publishedAt?: string }>>;
  getPositionRank(playerId: number): Promise<{ rank: number; total: number; position: string | null } | null>;
  updateMockDraftBoardTypes(): Promise<void>;
  
  getMockDrafts(): Promise<MockDraft[]>;
  createMockDraft(mockDraft: InsertMockDraft): Promise<MockDraft>;
  createMockDraftPick(pick: InsertMockDraftPick): Promise<MockDraftPick>;
  createMockDraftPicks(picks: InsertMockDraftPick[]): Promise<MockDraftPick[]>;
  getMockDraftBySourceKeyAndDate(sourceKey: string, dateStr: string): Promise<MockDraft | undefined>;
  
  addAdpHistory(history: InsertAdpHistory): Promise<AdpHistory>;
  addOddsHistory(entry: InsertOdds): Promise<Odds>;
  
  getScrapeJobs(): Promise<ScrapeJob[]>;
  upsertScrapeJob(job: Partial<InsertScrapeJob> & { sourceKey: string }): Promise<ScrapeJob>;

  getDiscrepancy(): Promise<Array<{
    playerId: number; playerName: string; position: string | null;
    currentAdp: number; impliedPick: number; discrepancy: number;
    signal: "bullish" | "bearish" | "neutral"; oddsMarkets: string[];
  }>>;
  getRecentActivity(limit?: number): Promise<MockDraft[]>;

  synthesizeAdpFromPicks(): Promise<{ playersUpdated: number; totalPlayers: number }>;
  clearPlaceholderOdds(): Promise<number>;

  updateAnalyst(id: number, data: Partial<InsertAnalyst>): Promise<Analyst | null>;
  updatePlayer(id: number, data: Partial<InsertPlayer>): Promise<Player | null>;
  getScrapeLogs(limit?: number): Promise<ScrapeJob[]>;
  logScrapeRun(sourceKey: string, status: string, picksFound?: number, errorMessage?: string): Promise<ScrapeRun>;
  getScrapeRunHistory(limit?: number): Promise<ScrapeRun[]>;

  getAccuracyLeaderboard(minSiteYears?: number): Promise<AccuracyRow[]>;
}

export type AccuracyRow = {
  id: number; name: string; outlet: string;
  xScore: number | null; xScoreRank: number | null; xScoreSitesCount: number | null;
  huddleScore5Year: string | null;
  scores: Array<{ site: string; year: number; rawScore: number | null; siteRank: number | null; zScore: number | null }>;
};

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

  async fixNullSourceKeys(nameToKey: Record<string, string>): Promise<number> {
    const all = await db.select().from(analysts);
    let fixed = 0;
    for (const analyst of all) {
      if (analyst.sourceKey) continue;
      const key = nameToKey[analyst.name];
      if (key) {
        await db.update(analysts).set({ sourceKey: key }).where(eq(analysts.id, analyst.id));
        fixed++;
      }
    }
    return fixed;
  }

  async getMockDraftPickCount(mockDraftId: number): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(mockDraftPicks)
      .where(eq(mockDraftPicks.mockDraftId, mockDraftId));
    return row?.count ?? 0;
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
    const entryDate = entry.date ? new Date(entry.date as any) : new Date();
    const dateStr = entryDate.toISOString().slice(0, 10);
    const dayStart = new Date(dateStr + "T00:00:00.000Z");
    const dayEnd = new Date(dateStr + "T23:59:59.999Z");

    const existing = await db.select().from(odds)
      .where(and(
        eq(odds.playerId, entry.playerId),
        eq(odds.bookmaker, entry.bookmaker),
        eq(odds.marketType, entry.marketType),
        gte(odds.date, dayStart),
        lte(odds.date, dayEnd),
      ))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db.update(odds)
        .set({ odds: entry.odds } as any)
        .where(eq(odds.id, existing[0].id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(odds).values(entry as any).returning();
    return created;
  }

  async getPlayerRankings(playerId: number): Promise<Array<{ sourceName: string, sourceKey?: string | null, boardType?: string | null, analystId?: number | null, pickNumber: number, publishedAt?: string }>> {
    const rankings = await db.select({
      sourceName: mockDrafts.sourceName,
      sourceKey: mockDrafts.sourceKey,
      boardType: mockDrafts.boardType,
      analystId: mockDrafts.analystId,
      pickNumber: mockDraftPicks.pickNumber,
      publishedAt: mockDrafts.publishedAt,
    })
    .from(mockDraftPicks)
    .innerJoin(mockDrafts, eq(mockDraftPicks.mockDraftId, mockDrafts.id))
    .where(eq(mockDraftPicks.playerId, playerId))
    .orderBy(desc(mockDrafts.publishedAt));

    // Deduplicate: keep only the most recent pick per sourceKey
    const seen = new Set<string>();
    const deduped: typeof rankings = [];
    for (const r of rankings) {
      const key = r.sourceKey ?? r.sourceName;
      if (!seen.has(key)) { seen.add(key); deduped.push(r); }
    }
    
    return deduped.map(r => ({
      sourceName: r.sourceName,
      sourceKey: r.sourceKey,
      boardType: r.boardType,
      analystId: r.analystId,
      pickNumber: r.pickNumber,
      publishedAt: r.publishedAt ? r.publishedAt.toISOString() : undefined,
    }));
  }

  async getPositionRank(playerId: number): Promise<{ rank: number; total: number; position: string | null } | null> {
    const player = await this.getPlayer(playerId);
    if (!player?.position) return null;
    const enriched = await this.getPlayers();
    const samePos = enriched.filter(p => p.position === player.position && p.currentAdp != null);
    samePos.sort((a, b) => (a.currentAdp ?? 99) - (b.currentAdp ?? 99));
    const rank = samePos.findIndex(p => p.id === playerId) + 1;
    return rank > 0 ? { rank, total: samePos.length, position: player.position } : null;
  }

  async updateMockDraftBoardTypes(): Promise<void> {
    // DJ big boards and Tankathon are talent rankings, not team-based mock drafts
    await db.update(mockDrafts).set({ boardType: "bigboard" } as any)
      .where(eq(mockDrafts.sourceKey, "nfl_jeremiah"));
    await db.update(mockDrafts).set({ boardType: "bigboard" } as any)
      .where(eq(mockDrafts.sourceKey, "tankathon"));
  }

  async getScrapeJobs(): Promise<ScrapeJob[]> {
    return await db.select().from(scrapeJobs).orderBy(asc(scrapeJobs.sourceKey));
  }

  async getAdpWindows(): Promise<Array<{
    id: number;
    name: string;
    position: string | null;
    college: string | null;
    currentAdp: number | null;
    change3d: number | null;
    change7d: number | null;
    change30d: number | null;
  }>> {
    const allPlayers = await db.select().from(players);
    const allHistory = await db.select().from(adpHistory).orderBy(desc(adpHistory.date));

    const historyByPlayer = new Map<number, (typeof allHistory)>();
    for (const h of allHistory) {
      if (!historyByPlayer.has(h.playerId)) historyByPlayer.set(h.playerId, []);
      historyByPlayer.get(h.playerId)!.push(h);
    }

    return allPlayers.map(player => {
      const history = historyByPlayer.get(player.id) ?? [];
      if (history.length === 0) return { ...player, currentAdp: null, change3d: null, change7d: null, change30d: null };

      const currentAdp = Number(history[0].adpValue);
      const currentDateMs = new Date(history[0].date!).getTime();

      const findChange = (daysAgo: number, toleranceDays: number): number | null => {
        const targetMs = currentDateMs - daysAgo * 86400000;
        const toleranceMs = toleranceDays * 86400000;
        let best: (typeof history)[0] | null = null;
        let bestDiff = Infinity;
        for (const h of history.slice(1)) {
          const hMs = new Date(h.date!).getTime();
          const diff = Math.abs(hMs - targetMs);
          if (diff <= toleranceMs && diff < bestDiff) { bestDiff = diff; best = h; }
        }
        return best ? Math.round((Number(best.adpValue) - currentAdp) * 10) / 10 : null;
      };

      return {
        ...player,
        currentAdp,
        change3d:  findChange(3, 3),
        change7d:  findChange(7, 5),
        change30d: findChange(23, 12),
      };
    });
  }

  async getOddsMovers(): Promise<Array<{
    playerId: number;
    playerName: string;
    position: string | null;
    bookmaker: string;
    marketType: string;
    currentOdds: string;
    prevOdds: string;
    currentProb: number;
    prevProb: number;
    change: number;
  }>> {
    const allPlayers = await db.select().from(players);
    const allOdds = await db.select().from(odds).orderBy(desc(odds.date));

    const playerMap = new Map(allPlayers.map(p => [p.id, p]));

    const grouped = new Map<string, (typeof allOdds)>();
    for (const o of allOdds) {
      const key = `${o.playerId}_${o.bookmaker}_${o.marketType}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(o);
    }

    const americanToProb = (s: string): number => {
      const n = parseInt(s, 10);
      if (isNaN(n)) return 50;
      return Math.round((n < 0 ? (-n / (-n + 100)) : (100 / (n + 100))) * 1000) / 10;
    };

    const movers: Array<{
      playerId: number; playerName: string; position: string | null; bookmaker: string;
      marketType: string; currentOdds: string; prevOdds: string;
      currentProb: number; prevProb: number; change: number;
    }> = [];

    for (const [, entries] of grouped.entries()) {
      if (entries.length < 2) continue;
      const cur = entries[0]; const prev = entries[1];
      const player = playerMap.get(cur.playerId);
      if (!player) continue;
      const cp = americanToProb(cur.odds), pp = americanToProb(prev.odds);
      movers.push({
        playerId: cur.playerId, playerName: player.name, position: player.position,
        bookmaker: cur.bookmaker, marketType: cur.marketType,
        currentOdds: cur.odds, prevOdds: prev.odds,
        currentProb: cp, prevProb: pp,
        change: Math.round((cp - pp) * 10) / 10,
      });
    }

    return movers.sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 12);
  }

  async getMatrixData(boardTypeFilter?: string | null): Promise<{
    players: (Player & { currentAdp?: number; trend?: string; adpChange?: number })[];
    drafts: (typeof mockDrafts.$inferSelect)[];
    analysts: (typeof analysts.$inferSelect)[];
    picks: Record<number, Record<number, number>>; // picks[playerId][draftId] = pickNumber
  }> {
    const draftsQuery = boardTypeFilter
      ? db.select().from(mockDrafts).where(eq(mockDrafts.boardType, boardTypeFilter)).orderBy(desc(mockDrafts.publishedAt))
      : db.select().from(mockDrafts).orderBy(desc(mockDrafts.publishedAt));

    const [allPlayers, allDrafts, allAnalysts, allPicks] = await Promise.all([
      this.getPlayers(),
      draftsQuery,
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

  async getDiscrepancy(): Promise<Array<{
    playerId: number; playerName: string; position: string | null;
    currentAdp: number; impliedPick: number; discrepancy: number;
    signal: "bullish" | "bearish" | "neutral"; oddsMarkets: string[];
  }>> {
    const allPlayers = await this.getPlayers();
    const allOdds = await db.select().from(odds).orderBy(desc(odds.date));

    const playerMarkets = new Map<number, Map<string, string>>();
    for (const o of allOdds) {
      if (!playerMarkets.has(o.playerId)) playerMarkets.set(o.playerId, new Map());
      const pm = playerMarkets.get(o.playerId)!;
      if (!pm.has(o.marketType)) pm.set(o.marketType, o.odds);
    }

    const amToProb = (s: string): number => {
      const n = parseInt(s, 10);
      if (isNaN(n)) return 0;
      return n < 0 ? -n / (-n + 100) : 100 / (n + 100);
    };

    const BUCKET_MARKETS = ["first_overall","top_3_pick","top_5_pick","top_10_pick","first_round"];

    const results: Array<{
      playerId: number; playerName: string; position: string | null;
      currentAdp: number; impliedPick: number; discrepancy: number;
      signal: "bullish" | "bearish" | "neutral"; oddsMarkets: string[];
    }> = [];

    for (const player of allPlayers) {
      if (!player.currentAdp) continue;
      const pid = player.id;
      const pm = playerMarkets.get(pid);
      if (!pm || pm.size === 0) continue;

      const activeMarkets = [...pm.keys()];

      const pickProbs: Array<{ pick: number; prob: number }> = [];
      for (const [mkt, oddsStr] of pm.entries()) {
        const pickMatch = mkt.match(/(?:pick|number|#|no)_?(\d+)$/i);
        if (pickMatch) {
          pickProbs.push({ pick: parseInt(pickMatch[1]), prob: amToProb(oddsStr) });
        }
      }

      let impliedPick: number;

      if (pickProbs.length > 0) {
        let modeledProb = 0, weightedSum = 0;
        for (const { pick, prob } of pickProbs) {
          weightedSum += pick * prob;
          modeledProb += prob;
        }
        const unmodeledProb = Math.max(0, 1 - modeledProb);
        const tailPick = 40;
        impliedPick = weightedSum + unmodeledProb * tailPick;
      } else {
        const hasBuckets = BUCKET_MARKETS.some(m => pm.has(m));
        if (!hasBuckets) continue;

        const p1   = amToProb(pm.get("first_overall") ?? "+100000");
        const p3   = Math.max(p1, amToProb(pm.get("top_3_pick")   ?? "+100000"));
        const p5   = Math.max(p3, amToProb(pm.get("top_5_pick")   ?? "+100000"));
        const p10  = Math.max(p5, amToProb(pm.get("top_10_pick")  ?? "+100000"));
        const p1st = Math.max(p10, amToProb(pm.get("first_round") ?? "+100000"));

        impliedPick =
          p1 * 1 +
          (p3  - p1)  * 2.5 +
          (p5  - p3)  * 4   +
          (p10 - p5)  * 8   +
          (p1st - p10) * 18 +
          (1 - p1st)  * 35;
      }

      const discrepancy = Math.round((player.currentAdp - impliedPick) * 10) / 10;
      const signal: "bullish" | "bearish" | "neutral" =
        discrepancy > 1.5 ? "bullish" :
        discrepancy < -1.5 ? "bearish" : "neutral";

      results.push({
        playerId: pid, playerName: player.name, position: player.position,
        currentAdp: player.currentAdp,
        impliedPick: Math.round(impliedPick * 10) / 10,
        discrepancy,
        signal,
        oddsMarkets: activeMarkets,
      });
    }

    return results.sort((a, b) => Math.abs(b.discrepancy) - Math.abs(a.discrepancy));
  }

  async getRecentActivity(limit = 30): Promise<MockDraft[]> {
    return db.select().from(mockDrafts).orderBy(desc(mockDrafts.publishedAt)).limit(limit);
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

  async synthesizeAdpFromPicks(): Promise<{ playersUpdated: number; totalPlayers: number }> {
    const allPlayers = await db.select().from(players);
    const allPicks = await db.select().from(mockDraftPicks);

    const picksByPlayer = new Map<number, number[]>();
    for (const pick of allPicks) {
      if (!picksByPlayer.has(pick.playerId)) picksByPlayer.set(pick.playerId, []);
      picksByPlayer.get(pick.playerId)!.push(pick.pickNumber);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);

    let updated = 0;
    for (const player of allPlayers) {
      const picks = picksByPlayer.get(player.id);
      if (!picks || picks.length === 0) continue;

      let sum = 0;
      for (const pickNum of picks) {
        sum += pickNum;
      }
      const consensusAdp = sum / picks.length;
      if (consensusAdp <= 0) continue;

      const adpStr = (Math.round(consensusAdp * 10) / 10).toFixed(1);

      const existingHistory = await db.select().from(adpHistory)
        .where(eq(adpHistory.playerId, player.id))
        .orderBy(desc(adpHistory.date));

      const hasToday = existingHistory.some(h => {
        if (!h.date) return false;
        return h.date.toISOString().slice(0, 10) === todayStr;
      });

      if (hasToday) {
        await db.update(adpHistory)
          .set({ adpValue: adpStr } as any)
          .where(and(
            eq(adpHistory.playerId, player.id),
            gte(adpHistory.date, new Date(todayStr + "T00:00:00.000Z")),
            lte(adpHistory.date, new Date(todayStr + "T23:59:59.999Z"))
          ));
      } else {
        await db.insert(adpHistory).values({
          playerId: player.id,
          adpValue: adpStr,
          date: today,
        } as any);
      }
      updated++;
    }

    console.log(`[ADP SYNTHESIS] Updated consensus ADP for ${updated}/${allPlayers.length} players.`);
    return { playersUpdated: updated, totalPlayers: allPlayers.length };
  }

  async updateAnalyst(id: number, data: Partial<InsertAnalyst>): Promise<Analyst | null> {
    const rows = await db.update(analysts)
      .set(data as typeof analysts.$inferInsert)
      .where(eq(analysts.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async updatePlayer(id: number, data: Partial<InsertPlayer>): Promise<Player | null> {
    const rows = await db.update(players)
      .set(data as typeof players.$inferInsert)
      .where(eq(players.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async getScrapeLogs(limit = 50): Promise<ScrapeJob[]> {
    return await db.select().from(scrapeJobs).orderBy(desc(scrapeJobs.lastRunAt)).limit(limit);
  }

  async logScrapeRun(sourceKey: string, status: string, picksFound?: number, errorMessage?: string): Promise<ScrapeRun> {
    const [run] = await db.insert(scrapeRuns).values({
      sourceKey,
      status,
      picksFound: picksFound ?? null,
      errorMessage: errorMessage ?? null,
    }).returning();
    return run;
  }

  async getScrapeRunHistory(limit = 50): Promise<ScrapeRun[]> {
    return await db.select().from(scrapeRuns).orderBy(desc(scrapeRuns.runAt)).limit(limit);
  }

  async clearPlaceholderOdds(): Promise<number> {
    const seededDates = [
      new Date("2026-01-29"),
      new Date("2026-02-20"),
      new Date("2026-03-08"),
      new Date("2026-03-15"),
    ];

    let totalRemoved = 0;
    for (const d of seededDates) {
      const dayStart = new Date(d.toISOString().slice(0, 10) + "T00:00:00.000Z");
      const dayEnd = new Date(d.toISOString().slice(0, 10) + "T23:59:59.999Z");
      const result = await db.delete(odds)
        .where(and(gte(odds.date, dayStart), lte(odds.date, dayEnd)))
        .returning();
      totalRemoved += result.length;
    }

    if (totalRemoved > 0) {
      console.log(`[ODDS CLEANUP] Removed ${totalRemoved} placeholder odds rows from seeded dates.`);
    }
    return totalRemoved;
  }

  async getAccuracyLeaderboard(minSiteYears = 2): Promise<AccuracyRow[]> {
    // Get analysts with enough data, ordered by X Score
    const rows = await db.execute(sql`
      SELECT
        a.id, a.name, a.outlet,
        a.x_score::float as "xScore",
        a.x_score_rank as "xScoreRank",
        a.x_score_sites_count as "xScoreSitesCount",
        a.huddle_score_5_year as "huddleScore5Year",
        COALESCE(
          json_agg(
            json_build_object(
              'site', s.site,
              'year', s.year,
              'rawScore', s.raw_score::float,
              'siteRank', s.site_rank,
              'zScore', s.z_score::float
            ) ORDER BY s.site, s.year
          ) FILTER (WHERE s.id IS NOT NULL),
          '[]'
        ) as scores
      FROM analysts a
      LEFT JOIN analyst_accuracy_scores s ON s.analyst_id = a.id
      WHERE a.x_score IS NOT NULL
        AND a.x_score_sites_count >= ${minSiteYears}
      GROUP BY a.id, a.name, a.outlet, a.x_score, a.x_score_rank, a.x_score_sites_count, a.huddle_score_5_year
      ORDER BY a.x_score DESC NULLS LAST
      LIMIT 100
    `);
    return rows.rows as AccuracyRow[];
  }
}

export const storage = new DatabaseStorage();
