import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import Layout from "@/components/Layout";
import { usePlayers } from "@/hooks/use-players";
import { useQuery } from "@tanstack/react-query";
import { PlayerCard } from "@/components/PlayerCard";
import { format } from "date-fns";
import {
  Activity, Loader2, TrendingUp, TrendingDown, ArrowRight,
  Users, Wifi, BarChart3, Zap, Clock, DollarSign,
  Bell, X, ExternalLink, AlertTriangle, CheckCircle2,
  Minus, ChevronRight, Gauge, Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Analyst = {
  id: number; name: string; outlet: string;
  accuracyWeight: string | null; isConsensus: number | null; sourceKey: string | null;
};

type AdpWindowPlayer = {
  id: number; name: string; position: string | null; college: string | null;
  currentAdp: number | null;
  change3d: number | null; change7d: number | null; change30d: number | null;
};

type OddsMover = {
  playerId: number; playerName: string; position: string | null;
  bookmaker: string; marketType: string;
  currentOdds: string; prevOdds: string;
  currentProb: number; prevProb: number; change: number;
};

type DiscrepancyRow = {
  playerId: number; playerName: string; position: string | null;
  currentAdp: number; impliedPick: number; discrepancy: number;
  signal: "bullish" | "bearish" | "neutral"; oddsMarkets: string[];
};

type ActivityItem = {
  id: number; sourceName: string; shortName: string | null;
  boardType: string | null; publishedAt: string | null; url: string | null;
};

type Window = "3d" | "7d" | "30d";

const WINDOW_LABELS: Record<Window, string> = { "3d": "3 Days", "7d": "7 Days", "30d": "30 Days" };

// ─── Market Type labels ───────────────────────────────────────────────────────
const MARKET_LABEL: Record<string, string> = {
  first_overall: "#1 Overall", top_3_pick: "Top 3", top_5_pick: "Top 5",
  top_10_pick: "Top 10", first_round: "1st Rd",
};

type XLeader = {
  id: number; name: string; outlet: string;
  xScore: number; xScoreRank: number; xScoreSitesCount: number;
};

// ─── Scrolling Market Ticker ──────────────────────────────────────────────────
function MarketTicker({ players }: { players: ReturnType<typeof usePlayers>["data"] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  if (!players?.length) return null;
  const sorted = [...players].sort((a, b) => (a.currentAdp ?? 99) - (b.currentAdp ?? 99));
  const items = [...sorted, ...sorted];
  return (
    <div className="overflow-hidden border-y border-white/5 bg-black/30 py-2.5 relative select-none" data-testid="market-ticker">
      <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-black/80 to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-black/80 to-transparent z-10 pointer-events-none" />
      <div ref={trackRef} className="flex gap-0 whitespace-nowrap" style={{ animation: "ticker-scroll 55s linear infinite" }}>
        {items.map((p, idx) => {
          const change = p.adpChange ?? 0;
          const isUp = change > 0.2; const isDown = change < -0.2;
          return (
            <span key={idx} className="inline-flex items-center gap-2 px-4 text-xs font-mono border-r border-white/5" data-testid={`ticker-item-${p.id}`}>
              <span className="text-white font-semibold">{p.name.split(" ").slice(-1)[0].toUpperCase()}</span>
              <span className={cn("font-bold", isUp ? "text-stock-up" : isDown ? "text-stock-down" : "text-muted-foreground")}>
                #{p.currentAdp?.toFixed(1)}
              </span>
              {isUp && <span className="text-stock-up">▲{change.toFixed(1)}</span>}
              {isDown && <span className="text-stock-down">▼{Math.abs(change).toFixed(1)}</span>}
              {!isUp && !isDown && <span className="text-muted-foreground">—</span>}
            </span>
          );
        })}
      </div>
      <style>{`@keyframes ticker-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>
    </div>
  );
}

// ─── Window Selector ──────────────────────────────────────────────────────────
function WindowSelector({ value, onChange }: { value: Window; onChange: (w: Window) => void }) {
  return (
    <div className="flex items-center gap-1 bg-black/40 rounded-lg p-0.5 border border-white/10">
      {(["3d", "7d", "30d"] as Window[]).map(w => (
        <button
          key={w}
          onClick={() => onChange(w)}
          data-testid={`window-tab-${w}`}
          className={cn(
            "px-2.5 py-1 rounded-md text-[10px] font-mono font-bold transition-all",
            value === w
              ? "bg-primary text-black shadow-sm"
              : "text-muted-foreground hover:text-white"
          )}
        >
          {w.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

// ─── Mover Row (window-aware) ─────────────────────────────────────────────────
function MoverRow({ player, rank, type, change }: {
  player: AdpWindowPlayer; rank: number; type: "up" | "down"; change: number;
}) {
  const abs = Math.abs(change);
  const isUp = type === "up";
  return (
    <Link href={`/players/${player.id}`}>
      <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/3 hover:bg-white/7 transition-all border border-white/3 hover:border-white/10 cursor-pointer group" data-testid={`mover-row-${player.id}`}>
        <div className="flex items-center gap-3">
          <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0", isUp ? "bg-stock-up/15 text-stock-up" : "bg-stock-down/15 text-stock-down")}>
            {rank}
          </div>
          <div>
            <p className="font-semibold text-white text-sm group-hover:text-primary transition-colors leading-tight">{player.name}</p>
            <p className="text-xs text-muted-foreground">{player.position} · {player.college}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className={cn("font-mono text-base font-bold leading-tight", isUp ? "text-stock-up" : "text-stock-down")}>
              #{player.currentAdp?.toFixed(1)}
            </p>
            <p className={cn("text-[10px] font-mono flex items-center gap-0.5 justify-end", isUp ? "text-stock-up" : "text-stock-down")}>
              {isUp ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
              {isUp ? "+" : "-"}{abs.toFixed(1)} spots
            </p>
          </div>
          <div className={cn("w-1 h-10 rounded-full opacity-60", isUp ? "bg-stock-up" : "bg-stock-down")} />
        </div>
      </div>
    </Link>
  );
}

// ─── Odds Mover Row ───────────────────────────────────────────────────────────
function OddsMoverRow({ mover, rank }: { mover: OddsMover; rank: number }) {
  const isUp = mover.change > 0;
  const abs = Math.abs(mover.change);

  return (
    <Link href={`/players/${mover.playerId}`}>
      <div className="flex items-center justify-between p-3 rounded-xl bg-white/3 hover:bg-white/6 border border-white/3 hover:border-white/10 transition-all cursor-pointer group" data-testid={`odds-mover-${mover.playerId}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={cn("w-5 h-5 rounded text-[9px] font-bold font-mono flex items-center justify-center shrink-0", isUp ? "bg-stock-up/15 text-stock-up" : "bg-stock-down/15 text-stock-down")}>
            {rank}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white group-hover:text-primary transition-colors truncate leading-tight">{mover.playerName}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-[9px] font-mono bg-primary/15 text-primary px-1.5 py-0.5 rounded">{MARKET_LABEL[mover.marketType] ?? mover.marketType}</span>
              <span className="text-[9px] font-mono text-muted-foreground">{mover.bookmaker}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <div className="text-right">
            <div className="flex items-center gap-1 justify-end font-mono text-[10px]">
              <span className="text-muted-foreground">{mover.prevOdds}</span>
              <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/40" />
              <span className={cn("font-bold", isUp ? "text-stock-up" : "text-stock-down")}>{mover.currentOdds}</span>
            </div>
            <p className={cn("text-[10px] font-mono font-bold text-right mt-0.5", isUp ? "text-stock-up" : "text-stock-down")}>
              {isUp ? "+" : ""}{mover.change.toFixed(1)}% implied
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ─── Position Summary ─────────────────────────────────────────────────────────
function PositionSummary({ players }: { players: NonNullable<ReturnType<typeof usePlayers>["data"]> }) {
  const positions = ["QB", "RB", "WR", "TE", "OT", "IOL", "EDGE", "LB", "S", "CB"];
  const posCounts = positions.map(pos => {
    const group = players.filter(p => p.position === pos);
    const avgAdp = group.length ? group.reduce((s, p) => s + (p.currentAdp ?? 30), 0) / group.length : 0;
    const rising = group.filter(p => (p.adpChange ?? 0) > 0.2).length;
    return { pos, count: group.length, avgAdp: Math.round(avgAdp * 10) / 10, rising };
  }).filter(p => p.count > 0);
  return (
    <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
      {posCounts.map(({ pos, count, avgAdp, rising }) => (
        <div key={pos} className="bg-card/40 border border-white/5 rounded-xl p-3 text-center" data-testid={`position-card-${pos}`}>
          <p className="text-xs font-bold text-primary font-mono">{pos}</p>
          <p className="text-lg font-bold text-white font-mono">{count}</p>
          <p className="text-[10px] text-muted-foreground">~#{avgAdp} avg</p>
          {rising > 0 && <p className="text-[10px] text-stock-up">↑{rising} rising</p>}
        </div>
      ))}
    </div>
  );
}

// ─── Discrepancy Card ─────────────────────────────────────────────────────────
function DiscrepancyCard({ row, rank }: { row: DiscrepancyRow; rank: number }) {
  const bullish = row.signal === "bullish";
  const bearish = row.signal === "bearish";
  return (
    <Link href={`/players/${row.playerId}`}>
      <div
        className={cn(
          "flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer group",
          bullish ? "bg-stock-up/5 border-stock-up/20 hover:bg-stock-up/10" :
          bearish ? "bg-stock-down/5 border-stock-down/20 hover:bg-stock-down/10" :
                    "bg-white/3 border-white/5 hover:bg-white/6"
        )}
        data-testid={`discrepancy-card-${row.playerId}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={cn(
            "w-5 h-5 rounded text-[9px] font-bold font-mono flex items-center justify-center shrink-0",
            bullish ? "bg-stock-up/15 text-stock-up" : bearish ? "bg-stock-down/15 text-stock-down" : "bg-white/10 text-muted-foreground"
          )}>
            {rank}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white group-hover:text-primary transition-colors truncate leading-tight">
              {row.playerName}
            </p>
            <p className="text-[10px] text-muted-foreground font-mono">{row.position}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 ml-2">
          {/* ADP vs implied */}
          <div className="text-right">
            <div className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground justify-end">
              <span>ADP <span className="text-white font-bold">#{row.currentAdp.toFixed(1)}</span></span>
              <span className="opacity-40">·</span>
              <span>Implied <span className={cn("font-bold", bullish ? "text-stock-up" : bearish ? "text-stock-down" : "text-white")}>#{row.impliedPick.toFixed(1)}</span></span>
            </div>
            <p className={cn(
              "text-xs font-mono font-bold text-right mt-0.5",
              bullish ? "text-stock-up" : bearish ? "text-stock-down" : "text-muted-foreground"
            )}>
              {bullish ? "+" : ""}{row.discrepancy.toFixed(1)} spot gap
            </p>
          </div>

          {/* Signal icon */}
          {bullish && <CheckCircle2 className="w-4 h-4 text-stock-up shrink-0" />}
          {bearish && <AlertTriangle className="w-4 h-4 text-stock-down shrink-0" />}
          {!bullish && !bearish && <Minus className="w-4 h-4 text-muted-foreground/40 shrink-0" />}
        </div>
      </div>
    </Link>
  );
}

// ─── Activity Drawer ──────────────────────────────────────────────────────────
function ActivityDrawer({ open, onClose, items, loading }: {
  open: boolean; onClose: () => void;
  items: ActivityItem[]; loading: boolean;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
            onClick={onClose}
          />
          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full max-w-sm bg-[hsl(var(--card))] border-l border-white/10 z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
              <div>
                <h3 className="text-base font-display font-semibold text-white flex items-center gap-2">
                  <Bell className="w-4 h-4 text-primary" />Activity Feed
                </h3>
                <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                  Recently scraped mocks &amp; big boards
                </p>
              </div>
              <button
                onClick={onClose}
                data-testid="btn-close-activity"
                className="p-2 rounded-lg hover:bg-white/10 transition-colors text-muted-foreground hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm font-mono">No recent activity</p>
                </div>
              ) : items.map(item => {
                const isMock = item.boardType === "mock";
                return (
                  <div
                    key={item.id}
                    className="flex items-start justify-between p-3 rounded-xl bg-white/3 border border-white/5 hover:bg-white/6 transition-colors"
                    data-testid={`activity-item-${item.id}`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className={cn(
                        "text-[9px] font-bold font-mono px-1.5 py-0.5 rounded shrink-0 mt-0.5",
                        isMock ? "bg-primary/20 text-primary" : "bg-violet-500/20 text-violet-400"
                      )}>
                        {isMock ? "MOCK" : "BB"}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate leading-tight">{item.sourceName}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {item.shortName && <span className="mr-1.5 text-white/60">{item.shortName}</span>}
                          {item.publishedAt ? format(new Date(item.publishedAt), "MMM d, yyyy") : "Unknown date"}
                        </p>
                      </div>
                    </div>
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noreferrer"
                        className="text-muted-foreground hover:text-primary transition-colors shrink-0 ml-2 mt-0.5">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-white/10 shrink-0">
              <Link href="/mock-drafts">
                <div className="flex items-center justify-center gap-2 text-xs text-primary font-mono hover:underline cursor-pointer" onClick={onClose}>
                  View Full Matrix <ChevronRight className="w-3 h-3" />
                </div>
              </Link>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Source Coverage Bar ──────────────────────────────────────────────────────
function SourceCoverage({ analysts }: { analysts: Analyst[] }) {
  const total = analysts.length;
  const withSource = analysts.filter(a => a.sourceKey).length;
  const consensus = analysts.filter(a => a.isConsensus).length;
  const pct = total ? Math.round((withSource / total) * 100) : 0;
  return (
    <div className="bg-card/50 border border-white/5 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-mono flex items-center gap-2">
          <Wifi className="w-3 h-3 text-stock-up" />Source Coverage
        </p>
        <Link href="/sources">
          <span className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1">View All <ArrowRight className="w-3 h-3" /></span>
        </Link>
      </div>
      <div className="flex items-end gap-4">
        <div><p className="text-3xl font-bold font-mono text-white">{total}</p><p className="text-xs text-muted-foreground">Total sources</p></div>
        <div><p className="text-xl font-bold font-mono text-stock-up">{withSource}</p><p className="text-xs text-muted-foreground">Auto-scraped</p></div>
        <div><p className="text-xl font-bold font-mono text-blue-400">{consensus}</p><p className="text-xs text-muted-foreground">Consensus</p></div>
      </div>
      <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-stock-up to-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-muted-foreground font-mono">{pct}% of sources have auto-scrape configured</p>
    </div>
  );
}

// ─── X Score Leaders ──────────────────────────────────────────────────────────
function XScoreLeaders({ leaders }: { leaders: XLeader[] }) {
  const medals = ["text-amber-400", "text-slate-300", "text-orange-400"];
  return (
    <div className="bg-card/50 border border-white/5 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" />
          Analyst X Score Leaders
        </h3>
        <Link href="/accuracy">
          <span className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1 font-mono">
            Full Leaderboard <ArrowRight className="w-3 h-3" />
          </span>
        </Link>
      </div>
      <div className="space-y-2">
        {leaders.map((a, i) => {
          const color = i < 3
            ? (i === 0 ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
              : i === 1 ? "bg-white/10 text-white/70 border-white/20"
              : "bg-orange-500/15 text-orange-400 border-orange-500/25")
            : "bg-white/5 text-white/50 border-white/10";
          return (
            <div key={a.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
              <div className="flex items-center gap-3 min-w-0">
                <span className={cn("text-[10px] font-bold font-mono w-5 text-center shrink-0", medals[i] ?? "text-white/30")}>
                  #{a.xScoreRank}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate leading-tight">{a.name}</p>
                  <p className="text-[10px] text-white/40 font-mono truncate">{a.outlet}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <span className="text-[10px] text-white/30 font-mono">{a.xScoreSitesCount} yrs</span>
                <span className={cn("inline-flex items-center px-2 py-0.5 rounded border text-xs font-mono font-bold", color)}>
                  {a.xScore.toFixed(3)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[10px] text-white/25 font-mono">
        Z-score composite · THR + FantasyPros + WalterFootball · 2021–2025
      </p>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { data: players, isLoading } = usePlayers();
  const { data: analysts = [] } = useQuery<Analyst[]>({ queryKey: ["/api/analysts"] });
  const { data: xLeaders = [] } = useQuery<XLeader[]>({
    queryKey: ["/api/accuracy/leaderboard"],
    queryFn: () => fetch("/api/accuracy/leaderboard?minYears=2").then(r => r.json()),
    select: (d: any[]) => d.slice(0, 5),
  });
  const { data: windowData = [], isLoading: windowLoading } = useQuery<AdpWindowPlayer[]>({ queryKey: ["/api/adp-windows"] });
  const { data: oddsMovers = [], isLoading: oddsLoading } = useQuery<OddsMover[]>({ queryKey: ["/api/odds/movers"] });
  const { data: discrepancy = [], isLoading: discrepancyLoading } = useQuery<DiscrepancyRow[]>({ queryKey: ["/api/discrepancy"] });
  const [activityOpen, setActivityOpen] = useState(false);
  const { data: activityItems = [], isLoading: activityLoading } = useQuery<ActivityItem[]>({
    queryKey: ["/api/activity"],
    enabled: activityOpen,
  });

  const [activeWindow, setActiveWindow] = useState<Window>("30d");

  const sorted = [...(players ?? [])].sort((a, b) => (a.currentAdp ?? 99) - (b.currentAdp ?? 99));
  const topProspects = sorted.slice(0, 6);

  // Window-aware movers from /api/adp-windows
  const getChange = (p: AdpWindowPlayer): number | null => {
    return activeWindow === "3d" ? p.change3d : activeWindow === "7d" ? p.change7d : p.change30d;
  };

  const withChange = windowData.filter(p => getChange(p) !== null && Math.abs(getChange(p)!) > 0.1);
  const topRisers = [...withChange].filter(p => (getChange(p) ?? 0) > 0).sort((a, b) => (getChange(b) ?? 0) - (getChange(a) ?? 0)).slice(0, 5);
  const topFallers = [...withChange].filter(p => (getChange(p) ?? 0) < 0).sort((a, b) => (getChange(a) ?? 0) - (getChange(b) ?? 0)).slice(0, 5);

  const totalRising = (players ?? []).filter(p => (p.adpChange ?? 0) > 0.2).length;
  const totalFalling = (players ?? []).filter(p => (p.adpChange ?? 0) < -0.2).length;

  const oddsGainers = oddsMovers.filter(o => o.change > 0);
  const oddsDroppers = oddsMovers.filter(o => o.change < 0);

  const bullishSignals = discrepancy.filter(r => r.signal === "bullish").slice(0, 5);
  const bearishSignals = discrepancy.filter(r => r.signal === "bearish").slice(0, 5);

  if (isLoading) {
    return (
      <Layout>
        <div className="h-[60vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Market Ticker */}
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-8 md:-mt-12 mb-8">
        <MarketTicker players={players} />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-10">

        {/* Header */}
        <header>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-2 h-2 rounded-full bg-stock-up animate-pulse shadow-[0_0_8px_hsl(var(--stock-up))]" />
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-mono">Market Open · Live Data</p>
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-2">2026 NFL Draft</h1>
          <p className="text-muted-foreground max-w-2xl text-sm">
            ADP based on {analysts.length}+ analyst mock drafts. Updated daily from WalterFootball, Tankathon, MDDB, and 25+ individual sources.
          </p>
        </header>

        {/* Stats Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Prospects Tracked", value: players?.length ?? 0, icon: Users, color: "text-primary" },
            { label: "Analyst Sources", value: analysts.length, icon: BarChart3, color: "text-blue-400" },
            { label: "Rising (7d)", value: totalRising, icon: TrendingUp, color: "text-stock-up" },
            { label: "Falling (7d)", value: totalFalling, icon: TrendingDown, color: "text-stock-down" },
          ].map(({ label, value, icon: Icon, color }, i) => (
            <motion.div key={label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="bg-card/50 border border-white/5 rounded-xl p-4 flex items-center gap-3" data-testid={`stat-card-${label.toLowerCase().replace(/ /g, '-')}`}>
              <div className={cn("p-2 rounded-lg bg-white/5", color)}><Icon className="w-4 h-4" /></div>
              <div>
                <p className={cn("text-2xl font-bold font-mono", color)}>{value}</p>
                <p className="text-xs text-muted-foreground leading-tight">{label}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ── Biggest Movers (window-aware) ──────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-display font-semibold text-white">Biggest Movers</h2>
              {windowLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-mono">Window:</span>
              <WindowSelector value={activeWindow} onChange={setActiveWindow} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gainers */}
            <section className="glass-card p-6 rounded-2xl border-l-4 border-l-[hsl(var(--stock-up))]">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-display font-semibold text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-stock-up" />Biggest Gainers
                </h3>
                <span className="text-[10px] uppercase tracking-widest text-stock-up font-mono bg-stock-up/10 px-2 py-0.5 rounded-full">
                  {WINDOW_LABELS[activeWindow]}
                </span>
              </div>
              {!windowLoading && topRisers.length > 0 ? (
                <div className="space-y-2">
                  {topRisers.map((player, i) => (
                    <MoverRow key={player.id} player={player} rank={i + 1} type="up" change={getChange(player) ?? 0} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm font-mono">No data for {WINDOW_LABELS[activeWindow]} window</p>
                </div>
              )}
            </section>

            {/* Fallers */}
            <section className="glass-card p-6 rounded-2xl border-l-4 border-l-[hsl(var(--stock-down))]">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-display font-semibold text-white flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-stock-down" />Biggest Fallers
                </h3>
                <span className="text-[10px] uppercase tracking-widest text-stock-down font-mono bg-stock-down/10 px-2 py-0.5 rounded-full">
                  {WINDOW_LABELS[activeWindow]}
                </span>
              </div>
              {!windowLoading && topFallers.length > 0 ? (
                <div className="space-y-2">
                  {topFallers.map((player, i) => (
                    <MoverRow key={player.id} player={player} rank={i + 1} type="down" change={getChange(player) ?? 0} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm font-mono">No data for {WINDOW_LABELS[activeWindow]} window</p>
                </div>
              )}
            </section>
          </div>
        </div>

        {/* ── Sportsbook Odds Movers ─────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-display font-semibold text-white flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-amber-400" />
              Sportsbook Line Movement
            </h2>
            <Link href="/players">
              <span className="text-xs text-primary hover:text-primary/80 transition-colors cursor-pointer flex items-center gap-1 font-mono">
                All Players <ArrowRight className="w-3 h-3" />
              </span>
            </Link>
          </div>

          {oddsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : oddsMovers.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Shortening odds = market getting more confident */}
              <section className="glass-card p-5 rounded-2xl border-l-4 border-l-amber-500/60">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-stock-up" />Shortening (More Likely)
                  </h3>
                  <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-mono">implied prob ↑</span>
                </div>
                <div className="space-y-1.5">
                  {oddsGainers.slice(0, 5).map((m, i) => <OddsMoverRow key={`${m.playerId}-${m.marketType}-${m.bookmaker}`} mover={m} rank={i + 1} />)}
                  {oddsGainers.length === 0 && <p className="text-sm text-muted-foreground text-center py-4 font-mono">No line movement</p>}
                </div>
              </section>

              {/* Lengthening odds = market getting less confident */}
              <section className="glass-card p-5 rounded-2xl border-l-4 border-l-red-500/40">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <TrendingDown className="w-3.5 h-3.5 text-stock-down" />Lengthening (Less Likely)
                  </h3>
                  <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-mono">implied prob ↓</span>
                </div>
                <div className="space-y-1.5">
                  {oddsDroppers.slice(0, 5).map((m, i) => <OddsMoverRow key={`${m.playerId}-${m.marketType}-${m.bookmaker}`} mover={m} rank={i + 1} />)}
                  {oddsDroppers.length === 0 && <p className="text-sm text-muted-foreground text-center py-4 font-mono">No line movement</p>}
                </div>
              </section>
            </div>
          ) : (
            <div className="glass-card rounded-2xl p-8 text-center text-muted-foreground border border-white/5">
              <DollarSign className="w-8 h-8 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-mono">Odds data loading — check back shortly</p>
            </div>
          )}
        </div>

        {/* ── ADP vs Odds Signals ───────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-display font-semibold text-white flex items-center gap-2">
                <Gauge className="w-4 h-4 text-primary" />
                ADP vs Odds Signals
              </h2>
              {discrepancyLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
            </div>
            <p className="text-[10px] text-muted-foreground font-mono hidden sm:block">
              Sportsbook implied pick vs analyst consensus ADP
            </p>
          </div>

          {!discrepancyLoading && discrepancy.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Bullish: odds say they go earlier than ADP */}
              <section className="glass-card p-5 rounded-2xl border-l-4 border-l-[hsl(var(--stock-up))]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-stock-up" />Bullish — Odds Beat ADP
                  </h3>
                  <span className="text-[9px] uppercase tracking-widest text-stock-up font-mono bg-stock-up/10 px-2 py-0.5 rounded-full">
                    Market favors earlier
                  </span>
                </div>
                <div className="space-y-1.5">
                  {bullishSignals.length > 0
                    ? bullishSignals.map((row, i) => <DiscrepancyCard key={row.playerId} row={row} rank={i + 1} />)
                    : <p className="text-sm text-muted-foreground text-center py-4 font-mono">No bullish signals</p>}
                </div>
              </section>

              {/* Bearish: odds say they go later than ADP */}
              <section className="glass-card p-5 rounded-2xl border-l-4 border-l-[hsl(var(--stock-down))]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-stock-down" />Bearish — ADP Beats Odds
                  </h3>
                  <span className="text-[9px] uppercase tracking-widest text-stock-down font-mono bg-stock-down/10 px-2 py-0.5 rounded-full">
                    Market favors later
                  </span>
                </div>
                <div className="space-y-1.5">
                  {bearishSignals.length > 0
                    ? bearishSignals.map((row, i) => <DiscrepancyCard key={row.playerId} row={row} rank={i + 1} />)
                    : <p className="text-sm text-muted-foreground text-center py-4 font-mono">No bearish signals</p>}
                </div>
              </section>
            </div>
          ) : !discrepancyLoading ? (
            <div className="glass-card rounded-2xl p-8 text-center text-muted-foreground border border-white/5">
              <Gauge className="w-8 h-8 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-mono">No odds data available — signals generate once sportsbook odds are seeded</p>
            </div>
          ) : null}
        </div>

        {/* ── Position Breakdown + Source Coverage + X Score ─────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            <h2 className="text-sm uppercase tracking-widest text-muted-foreground font-mono flex items-center gap-2">
              <Zap className="w-3 h-3 text-primary" />Position Breakdown
            </h2>
            <PositionSummary players={players ?? []} />
          </div>
          <div>
            <h2 className="text-sm uppercase tracking-widest text-muted-foreground font-mono flex items-center gap-2 mb-3">
              <Wifi className="w-3 h-3 text-stock-up" />Live Sources
            </h2>
            <SourceCoverage analysts={analysts} />
          </div>
        </div>

        {/* ── Analyst X Score Leaders ─────────────────────────────────────── */}
        {xLeaders.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <XScoreLeaders leaders={xLeaders} />
            <div className="bg-card/30 border border-white/5 rounded-2xl p-5 flex flex-col justify-center">
              <p className="text-[11px] uppercase tracking-widest text-white/30 font-mono mb-3">About X Score</p>
              <p className="text-sm text-white/60 leading-relaxed mb-4">
                X Score is a Z-score normalized composite accuracy ranking across three independent tracking sites — The Huddle Report, FantasyPros, and WalterFootball — spanning 2021–2025. Higher is better. Minimum 2 site-years required to qualify.
              </p>
              <div className="flex flex-wrap gap-2">
                {["The Huddle Report", "FantasyPros", "WalterFootball"].map(s => (
                  <span key={s} className="text-[10px] font-mono px-2 py-1 bg-white/5 border border-white/8 rounded text-white/40">{s}</span>
                ))}
              </div>
              <Link href="/accuracy">
                <div className="mt-4 inline-flex items-center gap-2 text-xs text-primary font-mono hover:underline cursor-pointer">
                  <Trophy className="w-3 h-3" />View Full Leaderboard →
                </div>
              </Link>
            </div>
          </div>
        )}

        {/* ── Top Prospects Grid ─────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-display font-semibold text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Top Board — Round 1
            </h2>
            <Link href="/players">
              <span className="text-xs text-primary hover:text-primary/80 transition-colors cursor-pointer flex items-center gap-1 font-mono">
                View All <ArrowRight className="w-3 h-3" />
              </span>
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {topProspects.map((player, i) => (
              <motion.div key={player.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                <PlayerCard player={player} index={i} />
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── Floating Activity Feed Button ─────────────────────────────── */}
      <button
        onClick={() => setActivityOpen(true)}
        data-testid="btn-activity-feed"
        className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-3 bg-primary text-black rounded-full shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all font-semibold text-sm hover:scale-105"
      >
        <Bell className="w-4 h-4" />
        <span className="hidden sm:inline">Activity</span>
        {activityItems.length > 0 && (
          <span className="flex h-5 w-5 items-center justify-center bg-black/20 rounded-full text-[10px] font-bold">
            {activityItems.length}
          </span>
        )}
      </button>

      {/* ── Activity Drawer ───────────────────────────────────────────── */}
      <ActivityDrawer
        open={activityOpen}
        onClose={() => setActivityOpen(false)}
        items={activityItems}
        loading={activityLoading}
      />
    </Layout>
  );
}
