import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { motion } from "framer-motion";
import { Trophy, HelpCircle, ChevronDown, ChevronUp, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
type ScoreRow = { site: string; year: number; rawScore: number | null; siteRank: number | null; zScore: number | null };

type AnalystRow = {
  id: number; name: string; outlet: string;
  xScore: number | null; xScoreRank: number | null; xScoreSitesCount: number | null;
  huddleScore5Year: string | null;
  scores: ScoreRow[];
};

// ─── Site display config ──────────────────────────────────────────────────────
const SITE_META: Record<string, { label: string; color: string; max: number; note: string }> = {
  thr:    { label: "THR",   color: "text-amber-400",   max: 96,  note: "0–96 pts (1pt=player, 2pt=player+team)" },
  fp:     { label: "FP",    color: "text-blue-400",    max: 320, note: "0–320 pts (4 categories × 32 picks)" },
  wf:     { label: "WF",    color: "text-emerald-400", max: 32,  note: "0–32 correct player+team matches" },
  nflmdd: { label: "MDDB",  color: "text-violet-400",  max: 100, note: "NFL Mock Draft Database accuracy %" },
};

// Most recent year first
const YEARS = [2025, 2024, 2023, 2022, 2021];

// ─── Score cell ───────────────────────────────────────────────────────────────
function ScoreCell({ score, site }: { score: ScoreRow | undefined; site: string }) {
  if (!score?.rawScore) return <td className="px-3 py-2 text-center text-white/20 text-xs">—</td>;
  const meta = SITE_META[site];
  const pct = Math.round((score.rawScore / meta.max) * 100);
  const z = score.zScore ?? 0;
  const color = z >= 1.5 ? "text-emerald-400" : z >= 0.5 ? "text-green-400" : z >= -0.5 ? "text-white/70" : "text-red-400";
  const rank = score.siteRank;
  return (
    <td className="px-3 py-2 text-center" title={`Score: ${Math.round(score.rawScore)}/${meta.max} (${pct}%) · Z: ${z.toFixed(2)}`}>
      <span className={cn("text-xs font-mono font-medium", color)}>
        {rank ? `#${rank}` : `${Math.round(score.rawScore)}`}
      </span>
    </td>
  );
}

// ─── X Score badge ────────────────────────────────────────────────────────────
function XBadge({ score, rank }: { score: number | null; rank: number | null }) {
  if (!score) return <span className="text-white/20 text-xs">—</span>;
  const color = score >= 1.2 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
    : score >= 0.6 ? "bg-green-500/20 text-green-400 border-green-500/30"
    : score >= 0 ? "bg-white/5 text-white/60 border-white/10"
    : "bg-red-500/10 text-red-400 border-red-500/20";
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-mono font-bold", color)}>
      {rank && <span className="text-white/40 font-normal">#{rank}</span>}
      {score.toFixed(3)}
    </span>
  );
}

// ─── Sortable header ──────────────────────────────────────────────────────────
function SortTh({ col, label, currentKey, dir, onSort, className }: {
  col: string; label: string; currentKey: string; dir: "asc" | "desc";
  onSort: (k: string) => void; className?: string;
}) {
  const active = currentKey === col;
  return (
    <th
      className={cn("px-3 py-2.5 text-left cursor-pointer select-none hover:text-white transition-colors group", className)}
      onClick={() => onSort(col)}
    >
      <span className="flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider">
        {label}
        <span className={cn("text-[10px]", active ? "text-primary" : "text-white/20 group-hover:text-white/40")}>
          {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </span>
    </th>
  );
}

// ─── Ratings Key Modal ────────────────────────────────────────────────────────
function RatingsKeyModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0d1117] border border-white/10 rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">Column Key</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-2">
            <span className="font-mono font-bold text-amber-400">THR</span>
            <span className="text-white/60">The Huddle Report — annual mock draft scorecard tracking correct player + team picks (0–96 pts). Gold standard since 2001.</span>
            <span className="font-mono font-bold text-blue-400">FP</span>
            <span className="text-white/60">FantasyPros Mock Draft Accuracy — scores analysts across 4 categories × 32 picks (0–320 pts).</span>
            <span className="font-mono font-bold text-emerald-400">WF</span>
            <span className="text-white/60">WalterFootball Mock Draft Results — counts correct player + team matches (0–32).</span>
            <span className="font-mono font-bold text-white/60">NFLMDD</span>
            <span className="text-white/60">NFL Mock Draft Database — consensus aggregator of 500–1,500+ individual mock drafts.</span>
            <span className="font-mono font-bold text-white/60">X Score</span>
            <span className="text-white/60">Z-score composite across THR, FP, and WF · weighted by site quality · min 2 site-years. Higher = more consistently accurate than the field.</span>
            <span className="font-mono font-bold text-white/60">#Rank</span>
            <span className="text-white/60">Site-year rank (e.g. #1 = best score that year on that site). Shown when available; raw score shown otherwise.</span>
            <span className="font-mono font-bold text-white/60">%</span>
            <span className="text-white/60">Percentage of max possible score for that site-year.</span>
            <span className="font-mono font-bold text-white/60">Yrs</span>
            <span className="text-white/60">Number of site-year data points included in the X Score calculation.</span>
          </div>
          <div className="pt-3 border-t border-white/8 text-white/30 font-mono text-[10px]">
            Minimum 2 site-years required for ranking.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Accuracy() {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showRatingsKey, setShowRatingsKey] = useState(false);
  const [sortKey, setSortKey] = useState<string>("xScoreRank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [search, setSearch] = useState("");
  const [selectedAnalyst, setSelectedAnalyst] = useState<AnalystRow | null>(null);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const { data: analysts = [], isLoading } = useQuery<AnalystRow[]>({
    queryKey: ["/api/accuracy/leaderboard"],
    queryFn: () => fetch("/api/accuracy/leaderboard?minYears=2").then(r => r.json()),
  });

  // Count analysts tracked per site in 2025
  const siteCounts = useMemo(() => {
    if (!analysts.length) return { thr: 0, fp: 0, wf: 0 };
    return {
      thr: analysts.filter(a => a.scores.some(s => s.site === "thr" && s.year === 2025)).length,
      fp:  analysts.filter(a => a.scores.some(s => s.site === "fp"  && s.year === 2025)).length,
      wf:  analysts.filter(a => a.scores.some(s => s.site === "wf"  && s.year === 2025)).length,
    };
  }, [analysts]);

  // Build display rows
  const rows = useMemo(() => {
    return analysts
      .filter(a => a.xScore !== null)
      .map((a, i) => ({
        id: a.id,
        name: a.name,
        outlet: a.outlet,
        xScore: a.xScore,
        xScoreRank: a.xScoreRank ?? i + 1,
        siteYears: a.xScoreSitesCount ?? 0,
        // Convenience accessors for sort
        thr25: a.scores.find(s => s.site === "thr" && s.year === 2025)?.rawScore ?? null,
        fp25:  a.scores.find(s => s.site === "fp"  && s.year === 2025)?.rawScore ?? null,
        wf25:  a.scores.find(s => s.site === "wf"  && s.year === 2025)?.rawScore ?? null,
        vaRow: a,
      }));
  }, [analysts]);

  // Filter by search
  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r => r.name.toLowerCase().includes(q) || r.outlet.toLowerCase().includes(q));
  }, [rows, search]);

  // Sort
  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows].sort((a, b) => {
      let av: string | number | null;
      let bv: string | number | null;
      switch (sortKey) {
        case "name":    av = a.name;    bv = b.name;    break;
        case "outlet":  av = a.outlet;  bv = b.outlet;  break;
        case "thr25":   av = a.thr25;   bv = b.thr25;   break;
        case "fp25":    av = a.fp25;    bv = b.fp25;    break;
        case "wf25":    av = a.wf25;    bv = b.wf25;    break;
        case "xScore":  av = a.xScore;  bv = b.xScore;  break;
        default:        av = a.xScoreRank; bv = b.xScoreRank;
      }
      // Nulls always last
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const na = av as number, nb = bv as number;
      return sortDir === "asc" ? na - nb : nb - na;
    });
    return sorted;
  }, [filteredRows, sortKey, sortDir]);

  const displayRows = showAll ? sortedRows : sortedRows.slice(0, 30);

  function getScore(vaRow: AnalystRow, site: string, year: number): ScoreRow | undefined {
    return vaRow.scores.find(s => s.site === site && s.year === year);
  }

  return (
    <Layout>
      {showRatingsKey && <RatingsKeyModal onClose={() => setShowRatingsKey(false)} />}

      <div className="p-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Trophy className="w-6 h-6 text-amber-400" />
              <h1 className="text-2xl font-bold text-white tracking-tight">Analyst Accuracy Rankings</h1>
              <button
                onClick={() => setShowRatingsKey(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-md border border-white/10 text-[11px] text-white/40 hover:text-white/70 hover:border-white/20 transition-all bg-white/3 font-mono"
                title="Column key"
              >
                <HelpCircle className="w-3 h-3" />
                Ratings Key
              </button>
            </div>
            <p className="text-sm text-white/50 max-w-xl">
              X Score composite weighted by The Huddle Report, FantasyPros &amp; WalterFootball · 2021–2025
            </p>
          </div>
        </div>

        {/* Abbreviation legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-5 text-[11px] font-mono text-white/40">
          <span className="text-white/25 uppercase tracking-wider text-[10px]">Key:</span>
          <span><span className="text-amber-400 font-bold">THR</span> = The Huddle Report</span>
          <span><span className="text-blue-400 font-bold">FP</span> = FantasyPros</span>
          <span><span className="text-emerald-400 font-bold">WF</span> = WalterFootball</span>
          <span><span className="text-white/50 font-bold">NFLMDD</span> = NFL Mock Draft Database</span>
          <span className="text-white/25">· Cells show site rank (#1 = best) with % of max score</span>
        </div>

        {/* Site legend with analyst counts */}
        <div className="flex flex-wrap gap-3 mb-6">
          {Object.entries(SITE_META).map(([key, meta]) => (
            <div key={key} className="flex items-center gap-1.5 bg-white/3 border border-white/8 rounded-lg px-3 py-1.5">
              <span className={cn("text-xs font-mono font-bold", meta.color)}>{meta.label}</span>
              <span className="text-[11px] text-white/40">{meta.note}</span>
              {siteCounts[key as keyof typeof siteCounts] > 0 && (
                <span className="text-[10px] text-white/25 font-mono ml-1">
                  · {siteCounts[key as keyof typeof siteCounts]} analysts tracked (2025)
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Search bar */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search analyst or outlet..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full max-w-sm bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 font-mono focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
          />
        </div>

        {/* Main table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-white/30 text-sm">Computing X Scores...</div>
        ) : sortedRows.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-white/30 text-sm">No data available.</div>
        ) : (
          <div className="bg-card border border-white/8 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8 bg-white/2 text-white/40">
                    <th className="px-4 py-2.5 text-left text-[11px] font-mono uppercase tracking-wider w-12">#</th>
                    <SortTh col="name"       label="Analyst"   currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4" />
                    <SortTh col="outlet"     label="Outlet"    currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                    <SortTh col="xScoreRank" label="X Score"   currentKey={sortKey} dir={sortDir} onSort={handleSort}
                      className="text-center"
                    />
                    {/* THR year columns */}
                    {YEARS.map(yr => (
                      <th key={`thr-${yr}`} className="px-3 py-2.5 text-center text-[11px] font-mono text-amber-400/50 uppercase tracking-wider whitespace-nowrap">
                        THR {String(yr).slice(2)}
                      </th>
                    ))}
                    {/* FP year columns */}
                    {YEARS.map(yr => (
                      <th key={`fp-${yr}`} className="px-3 py-2.5 text-center text-[11px] font-mono text-blue-400/50 uppercase tracking-wider whitespace-nowrap">
                        FP {String(yr).slice(2)}
                      </th>
                    ))}
                    {/* WF year columns */}
                    {YEARS.map(yr => (
                      <th key={`wf-${yr}`} className="px-3 py-2.5 text-center text-[11px] font-mono text-emerald-400/50 uppercase tracking-wider whitespace-nowrap">
                        WF {String(yr).slice(2)}
                      </th>
                    ))}
                    {/* MDDB year columns */}
                    {YEARS.map(yr => (
                      <th key={`nflmdd-${yr}`} className="px-3 py-2.5 text-center text-[11px] font-mono text-violet-400/50 uppercase tracking-wider whitespace-nowrap">
                        MDDB {String(yr).slice(2)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, i) => {
                    const va = row.vaRow;
                    return (
                      <motion.tr
                        key={row.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.015 }}
                        className={cn(
                          "border-b border-white/5 transition-colors",
                          i < 3 ? "bg-amber-500/5" : "hover:bg-white/3"
                        )}
                      >
                        <td className="px-4 py-3 text-center">
                          <span className={cn(
                            "text-sm font-bold font-mono",
                            i === 0 ? "text-amber-400" : i === 1 ? "text-white/70" : i === 2 ? "text-orange-400/70" : "text-white/30"
                          )}>
                            {row.xScoreRank}
                          </span>
                        </td>
                        <td
                          className="px-3 py-2 font-medium text-white text-sm cursor-pointer hover:text-primary transition-colors"
                          onClick={() => setSelectedAnalyst(va)}
                        >
                          {row.name}
                        </td>
                        <td className="px-3 py-2 text-xs text-white/40 font-mono">{row.outlet}</td>
                        <td className="px-4 py-3 text-center">
                          <XBadge score={row.xScore} rank={row.xScoreRank} />
                        </td>
                        {/* THR scores */}
                        {YEARS.map(yr => (
                          <ScoreCell key={`thr-${yr}`} score={getScore(va, 'thr', yr)} site="thr" />
                        ))}
                        {/* FP scores */}
                        {YEARS.map(yr => (
                          <ScoreCell key={`fp-${yr}`} score={getScore(va, 'fp', yr)} site="fp" />
                        ))}
                        {/* WF scores */}
                        {YEARS.map(yr => (
                          <ScoreCell key={`wf-${yr}`} score={getScore(va, 'wf', yr)} site="wf" />
                        ))}
                        {/* MDDB scores */}
                        {YEARS.map(yr => (
                          <ScoreCell key={`nflmdd-${yr}`} score={getScore(va, 'nflmdd', yr)} site="nflmdd" />
                        ))}
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {sortedRows.length > 30 && (
              <div className="p-4 border-t border-white/5 text-center">
                <button
                  onClick={() => setShowAll(v => !v)}
                  className="flex items-center gap-2 mx-auto text-sm text-white/50 hover:text-white transition-colors"
                >
                  {showAll ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {showAll ? "Show Top 30" : `Show All ${sortedRows.length} Analysts`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Methodology note */}
        <div className="mt-6 p-4 bg-white/2 border border-white/6 rounded-xl text-xs text-white/40 font-mono space-y-1">
          <p>X SCORE METHODOLOGY: For each site × year group, compute z = (score − μ) / σ. X Score = mean(z) across all site-years with data.</p>
          <p>SOURCES: The Huddle Report (2021–2025) · FantasyPros Mock Draft Accuracy (2021–2025) · WalterFootball Mock Draft Results (2021–2025)</p>
          <p>MINIMUM: 2 site-years required for ranking. Single-year performances excluded to reduce noise.</p>
        </div>
      </div>

      {/* Analyst detail modal */}
      {selectedAnalyst && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setSelectedAnalyst(null)}>
          <div className="bg-[#0d1117] border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-white">{selectedAnalyst.name}</h3>
                <p className="text-xs text-muted-foreground font-mono">{selectedAnalyst.outlet}</p>
              </div>
              <button onClick={() => setSelectedAnalyst(null)} className="text-white/40 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            {selectedAnalyst.xScore && (
              <div className="mb-4 p-3 bg-white/5 rounded-xl border border-white/10 flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-mono">Overall X Score</span>
                <XBadge score={selectedAnalyst.xScore} rank={selectedAnalyst.xScoreRank} />
              </div>
            )}
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-white/40 font-mono mb-2">Year-by-Year Breakdown</p>
              {YEARS.flatMap(year =>
                Object.keys(SITE_META).map(site => {
                  const sc = selectedAnalyst.scores.find(s => s.site === site && s.year === year);
                  if (!sc?.rawScore) return null;
                  const meta = SITE_META[site];
                  return (
                    <div key={`${site}-${year}`} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                      <span className="text-xs text-white/60 font-mono">{meta.label} {year}</span>
                      <div className="flex items-center gap-2">
                        {sc.siteRank && <span className="text-[10px] text-white/40 font-mono">#{sc.siteRank}</span>}
                        <span className="text-xs font-mono font-bold text-white">{Math.round(sc.rawScore)}/{meta.max}</span>
                      </div>
                    </div>
                  );
                }).filter(Boolean)
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
