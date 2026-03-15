import { useRoute } from "wouter";
import { usePlayer, usePlayerTrends, usePlayerRankings } from "@/hooks/use-players";
import { useQuery } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { format } from "date-fns";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { Loader2, ArrowLeft, Ruler, Scale, Activity, BarChart2, Trophy, TrendingUp, TrendingDown, Target, Award } from "lucide-react";
import { Link } from "wouter";
import { useMemo } from "react";

// ── Helpers ────────────────────────────────────────────────────────────────
function americanToProb(oddsStr: string): number {
  const n = parseInt(oddsStr, 10);
  if (isNaN(n)) return 50;
  return n < 0
    ? Math.round((-n / (-n + 100)) * 100 * 10) / 10
    : Math.round((100 / (n + 100)) * 100 * 10) / 10;
}

function marketLabel(mt: string): string {
  const map: Record<string, string> = {
    first_overall: "#1 Overall",
    top_3_pick: "Top 3 Pick",
    top_5_pick: "Top 5 Pick",
    top_10_pick: "Top 10 Pick",
    first_round: "First Round",
  };
  return map[mt] ?? mt;
}

// Comprehensive source key → short name map
const SOURCE_SHORT: Record<string, string> = {
  nfl_jeremiah:          "DJ",
  mcshay_report:         "McShay",
  espn_kiper:            "Kiper",
  pff_sikkema:           "PFF",
  cbs_wilson:            "Wilson",
  athletic_brugler:      "Brugler",
  times_news_boris:      "Boris",
  huddle_rindone:        "Rindone",
  draftsharks_smola:     "Smola",
  "4for4_smith":         "Smith",
  sharp_donahue:         "Donahue",
  underdog_norris:       "Norris",
  "33rd_team_crabbs":    "Crabbs",
  nfl_zierlein:          "Zierlein",
  nfl_schrager:          "Schrager",
  seahawks_staton:       "Staton",
  gtm_consensus:         "GTM",
  mddb_consensus:        "MDDB",
  walterfootball_walt:   "Walt",
  walterfootball_charlie:"Charlie",
  tankathon:             "Tankathon",
  espn_reid:             "Reid",
  espn_miller:           "Miller",
  espn_yates:            "Yates",
  si_breer:              "Breer",
  blueprint_dell:        "Dell",
  nfl_brooks:            "Brooks",
  nfl_davis:             "Davis",
  nfl_band:              "Band",
  underdog_winks:        "Winks",
  sharp_mccrystal:       "McCrystal",
  den_allbright:         "Allbright",
  athletic_staff:        "Athletic",
  athletic_standig:      "Standig",
  athletic_feldman:      "Feldman",
  etr_daigle:            "ETR",
  etr_silva:             "Silva",
  ita_amico:             "ITA",
  fantasypros_freedman:  "FP",
  fantasy_law_guarisco:  "FLG",
  br_scouts:             "B/R",
};

const SOURCE_COLORS: string[] = [
  "#60a5fa","#34d399","#f59e0b","#a78bfa","#f472b6",
  "#fb923c","#38bdf8","#4ade80","#fbbf24","#c084fc",
  "#e879f9","#2dd4bf","#f87171","#94a3b8",
];

function getShortName(sourceKey: string | null | undefined, sourceName: string): string {
  if (sourceKey && SOURCE_SHORT[sourceKey]) return SOURCE_SHORT[sourceKey];
  // Fallback: parse from sourceName
  const nameParts = sourceName.split(/[\s(—]/);
  return nameParts[0].slice(0, 8);
}

// ── Position badge color ───────────────────────────────────────────────────
const POS_COLOR: Record<string, string> = {
  QB: "#f59e0b", RB: "#34d399", WR: "#60a5fa", TE: "#a78bfa",
  OT: "#fb923c", OG: "#fb923c", IOL: "#fb923c", C: "#fb923c",
  EDGE: "#f472b6", DL: "#f472b6", DT: "#f472b6",
  LB: "#38bdf8", CB: "#4ade80", S: "#4ade80",
};

export default function PlayerDetail() {
  const [, params] = useRoute("/players/:id");
  const id = parseInt(params?.id || "0");

  const { data: player, isLoading: playerLoading } = usePlayer(id);
  const { data: trends, isLoading: trendsLoading } = usePlayerTrends(id);
  const { data: rankings, isLoading: rankingsLoading } = usePlayerRankings(id);
  const { data: posRank } = useQuery<{ rank: number | null; total: number | null; position: string | null }>({
    queryKey: [`/api/players/${id}/positionrank`],
    enabled: id > 0,
  });

  // ── ADP trend chart data ──────────────────────────────────────────────────
  const adpChartData = useMemo(() => {
    if (!trends?.adp?.length) return [];
    return trends.adp.map(entry => ({
      date: entry.date ? format(new Date(entry.date), "MMM d") : "–",
      adp: Number(entry.adpValue),
    }));
  }, [trends]);

  // ── Odds chart data ───────────────────────────────────────────────────────
  const oddsChartData = useMemo(() => {
    if (!trends?.odds?.length) return [];
    const dateMap = new Map<string, any>();
    trends.odds.forEach(entry => {
      const d = entry.date ? format(new Date(entry.date), "MMM d") : "–";
      if (!dateMap.has(d)) dateMap.set(d, { date: d });
      const key = `prob_${entry.marketType}`;
      if (!dateMap.get(d)[key]) {
        dateMap.get(d)[key] = americanToProb(entry.odds);
      }
    });
    return Array.from(dateMap.values());
  }, [trends]);

  const oddsMarkets = useMemo(() => {
    if (!trends?.odds?.length) return [];
    return Array.from(new Set(trends.odds.map(e => e.marketType)));
  }, [trends]);

  // ── ADP trend stats ───────────────────────────────────────────────────────
  const currentAdp = adpChartData.length > 0 ? adpChartData[adpChartData.length - 1].adp : null;
  const prevAdp    = adpChartData.length > 1 ? adpChartData[adpChartData.length - 2].adp : null;
  const trend      = currentAdp && prevAdp ? (currentAdp < prevAdp ? "up" : currentAdp > prevAdp ? "down" : "flat") : "flat";
  const totalChange = adpChartData.length >= 2
    ? adpChartData[0].adp - adpChartData[adpChartData.length - 1].adp
    : null;

  // ── Rankings split: mock drafts vs big boards ─────────────────────────────
  const sortedRankings = useMemo(() => {
    if (!rankings) return [];
    return [...rankings].sort((a, b) => a.pickNumber - b.pickNumber);
  }, [rankings]);

  const mockRankings = useMemo(() => sortedRankings.filter(r => r.boardType !== "bigboard"), [sortedRankings]);
  const boardRankings = useMemo(() => sortedRankings.filter(r => r.boardType === "bigboard"), [sortedRankings]);

  // High / Low consensus from all rankings
  const highOn = sortedRankings.length > 0 ? sortedRankings[0] : null;
  const lowOn  = sortedRankings.length > 0 ? sortedRankings[sortedRankings.length - 1] : null;
  const avgPick = sortedRankings.length > 0
    ? Math.round((sortedRankings.reduce((s, r) => s + r.pickNumber, 0) / sortedRankings.length) * 10) / 10
    : null;

  if (playerLoading || !player) {
    return (
      <Layout>
        <div className="h-[60vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" data-testid="loading-spinner" />
        </div>
      </Layout>
    );
  }

  const posColor = POS_COLOR[player.position ?? ""] ?? "#94a3b8";

  const combineStats = [
    { label: "40-Yard",    value: player.fortyYard    ? `${Number(player.fortyYard).toFixed(2)}s`    : null },
    { label: "Vertical",   value: player.verticalJump ? `${player.verticalJump}"`                    : null },
    { label: "Bench",      value: player.benchPress   ? `${player.benchPress} reps`                  : null },
    { label: "3-Cone",     value: player.coneDrill    ? `${Number(player.coneDrill).toFixed(2)}s`    : null },
    { label: "Shuttle",    value: player.shuttleRun   ? `${Number(player.shuttleRun).toFixed(2)}s`   : null },
    { label: "Broad Jump", value: player.broadJump    ? `${player.broadJump}"`                       : null },
  ].filter(s => s.value !== null);

  return (
    <Layout>
      {/* Back link */}
      <div className="mb-6">
        <Link href="/players" data-testid="link-back-to-board" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to Board
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* ── LEFT COLUMN ──────────────────────────────────────────────── */}
        <div className="lg:col-span-1 space-y-5">

          {/* Identity Card */}
          <div className="glass-card rounded-2xl p-6 relative overflow-hidden" data-testid="player-identity-card">
            <div className="absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl -mr-12 -mt-12 pointer-events-none"
                 style={{ backgroundColor: `${posColor}20` }} />

            <div className="flex flex-col items-center text-center">
              {player.imageUrl ? (
                <img src={player.imageUrl} alt={player.name}
                     className="w-28 h-28 rounded-full object-cover border-4 border-white/10 shadow-xl mb-4" />
              ) : (
                <div className="w-28 h-28 rounded-full border-2 border-white/10 flex items-center justify-center font-display text-4xl font-bold mb-4 shadow-xl"
                     style={{ background: `linear-gradient(135deg, ${posColor}30, ${posColor}10)`, borderColor: `${posColor}40`, color: posColor }}>
                  {player.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                </div>
              )}
              <h1 className="text-2xl font-display font-bold text-white" data-testid="text-player-name">{player.name}</h1>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs font-mono font-bold rounded-full px-3 py-0.5"
                      style={{ backgroundColor: `${posColor}20`, color: posColor, border: `1px solid ${posColor}40` }}
                      data-testid="text-player-position">
                  {player.position}
                </span>
                <span className="text-xs text-muted-foreground">{player.college}</span>
              </div>
            </div>

            {/* Key Stats Row */}
            <div className="grid grid-cols-3 gap-2 mt-6">
              <div className="bg-white/5 rounded-xl p-3 border border-white/10 flex flex-col items-center text-center">
                <p className="text-[10px] text-muted-foreground uppercase font-mono mb-1">ADP</p>
                <p className="font-bold text-white font-mono text-lg" data-testid="text-current-adp">
                  {currentAdp !== null ? currentAdp.toFixed(1) : "–"}
                </p>
                {trend !== "flat" && (
                  <span className={`text-xs font-mono ${trend === "up" ? "text-emerald-400" : "text-red-400"}`}>
                    {trend === "up" ? "▲" : "▼"}
                  </span>
                )}
              </div>
              <div className="bg-white/5 rounded-xl p-3 border border-white/10 flex flex-col items-center text-center">
                <p className="text-[10px] text-muted-foreground uppercase font-mono mb-1">RAS</p>
                <p className="font-bold font-mono text-lg" style={{ color: player.rasScore ? (Number(player.rasScore) >= 9 ? "#4ade80" : Number(player.rasScore) >= 7 ? "#f59e0b" : "#94a3b8") : "#94a3b8" }}
                   data-testid="text-ras-score">
                  {player.rasScore ? Number(player.rasScore).toFixed(2) : "–"}
                </p>
              </div>
              <div className="bg-white/5 rounded-xl p-3 border border-white/10 flex flex-col items-center text-center">
                <p className="text-[10px] text-muted-foreground uppercase font-mono mb-1">Pos Rank</p>
                <p className="font-bold text-white font-mono text-lg" data-testid="text-position-rank">
                  {posRank?.rank ? `#${posRank.rank}` : "–"}
                </p>
                {posRank?.total && posRank.rank && (
                  <span className="text-[10px] text-muted-foreground font-mono">of {posRank.total}</span>
                )}
              </div>
            </div>

            {/* Height / Weight */}
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="bg-white/5 rounded-xl p-3 border border-white/10 flex items-center gap-3">
                <Ruler className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground font-mono">Height</p>
                  <p className="font-mono text-white text-sm font-semibold" data-testid="text-height">{player.height || "–"}</p>
                </div>
              </div>
              <div className="bg-white/5 rounded-xl p-3 border border-white/10 flex items-center gap-3">
                <Scale className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground font-mono">Weight</p>
                  <p className="font-mono text-white text-sm font-semibold" data-testid="text-weight">{player.weight ? `${player.weight} lbs` : "–"}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Combine Measurables */}
          {combineStats.length > 0 && (
            <div className="glass-card rounded-2xl p-5" data-testid="combine-stats-card">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-white text-sm uppercase tracking-wider font-mono">Combine</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {combineStats.map(stat => (
                  <div key={stat.label} className="bg-white/5 rounded-lg p-2 border border-white/5"
                       data-testid={`stat-${stat.label.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}>
                    <p className="text-[10px] text-muted-foreground font-mono mb-0.5">{stat.label}</p>
                    <p className="text-sm font-mono font-bold text-white">{stat.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* High / Low Consensus */}
          {sortedRankings.length >= 2 && (
            <div className="glass-card rounded-2xl p-5" data-testid="consensus-card">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-white text-sm uppercase tracking-wider font-mono">Analyst Consensus</h3>
              </div>
              <div className="space-y-3">
                {avgPick && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground font-mono">Avg Pick</span>
                    <span className="font-mono font-bold text-white text-sm">#{avgPick}</span>
                  </div>
                )}
                {highOn && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-emerald-400" />Highest On
                    </span>
                    <div className="text-right">
                      <span className="font-mono font-bold text-emerald-400 text-sm">#{highOn.pickNumber}</span>
                      <span className="text-[10px] text-muted-foreground font-mono ml-2">{getShortName(highOn.sourceKey, highOn.sourceName)}</span>
                    </div>
                  </div>
                )}
                {lowOn && lowOn !== highOn && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                      <TrendingDown className="w-3 h-3 text-red-400" />Lowest On
                    </span>
                    <div className="text-right">
                      <span className="font-mono font-bold text-red-400 text-sm">#{lowOn.pickNumber}</span>
                      <span className="text-[10px] text-muted-foreground font-mono ml-2">{getShortName(lowOn.sourceKey, lowOn.sourceName)}</span>
                    </div>
                  </div>
                )}
                {highOn && lowOn && lowOn !== highOn && (
                  <div className="flex justify-between items-center pt-2 border-t border-white/10">
                    <span className="text-xs text-muted-foreground font-mono">Spread</span>
                    <span className="font-mono font-bold text-amber-400 text-sm">
                      #{highOn.pickNumber}–#{lowOn.pickNumber} ({lowOn.pickNumber - highOn.pickNumber} picks)
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Mock Draft Rankings */}
          {!rankingsLoading && mockRankings.length > 0 && (
            <div className="glass-card rounded-2xl p-5" data-testid="mock-rankings-card">
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-4 h-4 text-amber-400" />
                <h3 className="font-semibold text-white text-sm uppercase tracking-wider font-mono">Mock Drafts</h3>
              </div>
              <div className="space-y-1.5">
                {mockRankings.map((r, i) => {
                  const short = getShortName(r.sourceKey, r.sourceName);
                  const color = SOURCE_COLORS[i % SOURCE_COLORS.length];
                  return (
                    <div key={`${r.sourceKey}-${r.pickNumber}`} className="flex justify-between items-center py-1.5 border-b border-white/5 last:border-0"
                         data-testid={`mock-rank-${short.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}>
                      <span className="text-xs font-mono" style={{ color }}>{short}</span>
                      <span className="text-sm font-mono font-bold text-white">#{r.pickNumber}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Big Board Rankings */}
          {!rankingsLoading && boardRankings.length > 0 && (
            <div className="glass-card rounded-2xl p-5" data-testid="bigboard-rankings-card">
              <div className="flex items-center gap-2 mb-3">
                <Award className="w-4 h-4 text-violet-400" />
                <h3 className="font-semibold text-white text-sm uppercase tracking-wider font-mono">Big Boards</h3>
              </div>
              <div className="space-y-1.5">
                {boardRankings.map((r, i) => {
                  const short = getShortName(r.sourceKey, r.sourceName);
                  const color = ["#a78bfa","#c084fc","#8b5cf6","#7c3aed"][i % 4];
                  return (
                    <div key={`${r.sourceKey}-${r.pickNumber}`} className="flex justify-between items-center py-1.5 border-b border-white/5 last:border-0"
                         data-testid={`board-rank-${short.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}>
                      <span className="text-xs font-mono" style={{ color }}>{short}</span>
                      <span className="text-sm font-mono font-bold text-white">#{r.pickNumber}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN ─────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">

          {/* ADP Trend Chart (gradient area) */}
          <div className="glass-card rounded-2xl p-6" data-testid="adp-trend-card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-primary" />
                <h2 className="text-lg font-display font-semibold text-white">Consensus ADP Trend</h2>
              </div>
              <div className="flex items-center gap-3">
                {totalChange !== null && Math.abs(totalChange) > 0.2 && (
                  <span className={`text-sm font-mono font-bold ${totalChange > 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {totalChange > 0 ? "▲" : "▼"} {Math.abs(totalChange).toFixed(1)} pick
                    {Math.abs(totalChange) !== 1 ? "s" : ""} {totalChange > 0 ? "risen" : "fallen"}
                  </span>
                )}
                <span className="text-xs text-muted-foreground font-mono">GTM EDP</span>
              </div>
            </div>

            {trendsLoading ? (
              <div className="h-[240px] flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : adpChartData.length > 0 ? (
              <div className="h-[240px] w-full" data-testid="chart-adp-trend">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={adpChartData} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                    <defs>
                      <linearGradient id="adpGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                    <XAxis dataKey="date" stroke="rgba(255,255,255,0.2)"
                           tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: "var(--font-mono)" }}
                           tickMargin={8} />
                    <YAxis reversed={true} stroke="rgba(255,255,255,0.2)"
                           tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: "var(--font-mono)" }}
                           tickFormatter={v => `#${v}`} domain={["dataMin - 1", "dataMax + 1"]} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "rgba(255,255,255,0.12)", borderRadius: "8px", color: "white", fontFamily: "var(--font-mono)", fontSize: "12px" }}
                      formatter={(v: any) => [`#${Number(v).toFixed(1)}`, "ADP"]}
                    />
                    <Area type="monotone" dataKey="adp" stroke="hsl(var(--primary))" strokeWidth={2.5}
                          fill="url(#adpGrad)"
                          dot={{ r: 5, fill: "hsl(var(--background))", stroke: "hsl(var(--primary))", strokeWidth: 2 }}
                          activeDot={{ r: 7, fill: "hsl(var(--primary))" }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[240px] flex items-center justify-center text-muted-foreground border border-dashed border-white/10 rounded-xl text-sm font-mono">
                No ADP history available
              </div>
            )}
          </div>

          {/* Analyst Divergence Bars */}
          {!rankingsLoading && sortedRankings.length > 1 && (
            <div className="glass-card rounded-2xl p-6" data-testid="drafter-comparison-card">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-primary" />
                <h2 className="text-lg font-display font-semibold text-white">Analyst Divergence</h2>
                <span className="text-xs text-muted-foreground font-mono ml-auto">where each source has this player</span>
              </div>
              <div className="space-y-2.5">
                {sortedRankings.map((r, i) => {
                  const short = getShortName(r.sourceKey, r.sourceName);
                  const color = r.boardType === "bigboard" ? "#a78bfa" : SOURCE_COLORS[i % SOURCE_COLORS.length];
                  const maxPick = Math.max(...sortedRankings.map(x => x.pickNumber), 32);
                  const pct = Math.max(5, Math.round((1 - (r.pickNumber - 1) / maxPick) * 100));
                  return (
                    <div key={`${r.sourceKey}-${r.pickNumber}`}
                         data-testid={`bar-${short.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}>
                      <div className="flex justify-between text-xs font-mono mb-1">
                        <span style={{ color }}>
                          {short}
                          {r.boardType === "bigboard" && (
                            <span className="ml-1 text-[9px] text-violet-400 uppercase">board</span>
                          )}
                        </span>
                        <span className="text-white font-bold">Pick #{r.pickNumber}</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700"
                             style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sportsbook Odds Chart */}
          {!trendsLoading && oddsChartData.length > 0 && oddsMarkets.length > 0 && (
            <div className="glass-card rounded-2xl p-6" data-testid="odds-chart-card">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-lg font-display font-semibold text-white">Sportsbook Implied Probability</h2>
                </div>
                <span className="text-xs text-muted-foreground font-mono">American odds → %</span>
              </div>
              <div className="h-[220px] w-full" data-testid="chart-odds">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={oddsChartData} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                    <XAxis dataKey="date" stroke="rgba(255,255,255,0.2)"
                           tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: "var(--font-mono)" }} />
                    <YAxis stroke="rgba(255,255,255,0.2)"
                           tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: "var(--font-mono)" }}
                           tickFormatter={v => `${v}%`} domain={[0, 100]} />
                    <ReferenceLine y={50} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "rgba(255,255,255,0.12)", borderRadius: "8px", color: "white", fontFamily: "var(--font-mono)", fontSize: "12px" }}
                      formatter={(v: any, name: string) => [`${Number(v).toFixed(1)}%`, name]}
                    />
                    <Legend wrapperStyle={{ paddingTop: "12px", fontFamily: "var(--font-mono)", fontSize: "11px" }} />
                    {oddsMarkets.map((mt, i) => {
                      const colors = ["#34d399","#60a5fa","#f59e0b","#f472b6","#a78bfa"];
                      return (
                        <Line key={mt} type="monotone" dataKey={`prob_${mt}`} name={marketLabel(mt)}
                              stroke={colors[i % colors.length]} strokeWidth={2}
                              dot={{ r: 4, fill: "hsl(var(--background))", strokeWidth: 2 }}
                              activeDot={{ r: 6 }} connectNulls />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
