import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { motion } from "framer-motion";
import { Trophy, Info, ChevronDown, ChevronUp, ToggleLeft, ToggleRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
type ScoreRow = { site: string; year: number; rawScore: number | null; siteRank: number | null; zScore: number | null };

type AnalystRow = {
  id: number; name: string; outlet: string;
  xScore: number | null; xScoreRank: number | null; xScoreSitesCount: number | null;
  huddleScore5Year: string | null;
  scores: ScoreRow[];
};

type XBRow = { id: number; name: string; outlet: string; n: number; x_thr15: number; rank_b: number };

// ─── Site display config ──────────────────────────────────────────────────────
const SITE_META: Record<string, { label: string; color: string; max: number; note: string }> = {
  thr:    { label: "THR",   color: "text-amber-400",  max: 96,  note: "0–96 pts (1pt=player, 2pt=player+team)" },
  fp:     { label: "FP",    color: "text-blue-400",   max: 320, note: "0–320 pts (4 categories × 32 picks)" },
  wf:     { label: "WF",    color: "text-emerald-400", max: 32, note: "0–32 correct player+team matches" },
  nflmdd: { label: "MFDB",  color: "text-purple-400", max: 100, note: "0–100% accuracy score" },
};

const YEARS = [2021, 2022, 2023, 2024, 2025];

// ─── Score cell ───────────────────────────────────────────────────────────────
function ScoreCell({ score, site }: { score: ScoreRow | undefined; site: string }) {
  if (!score?.rawScore) return <td className="px-3 py-2 text-center text-white/20 text-xs">—</td>;
  const meta = SITE_META[site];
  const pct = Math.round((score.rawScore / meta.max) * 100);
  const z = score.zScore ?? 0;
  const color = z >= 1.5 ? "text-emerald-400" : z >= 0.5 ? "text-green-400" : z >= -0.5 ? "text-white/70" : "text-red-400";
  return (
    <td className="px-3 py-2 text-center" title={`Z: ${z.toFixed(2)} | Rank: #${score.siteRank ?? '?'}`}>
      <span className={cn("text-xs font-mono font-medium", color)}>
        {Math.round(score.rawScore)}
        <span className="text-white/30 text-[10px]"> ({pct}%)</span>
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Accuracy() {
  const [versionB, setVersionB] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const { data: vaData, isLoading: vaLoading } = useQuery<AnalystRow[]>({
    queryKey: ["/api/accuracy/leaderboard"],
    queryFn: () => fetch("/api/accuracy/leaderboard?minYears=2").then(r => r.json()),
  });

  const { data: vbData, isLoading: vbLoading } = useQuery<XBRow[]>({
    queryKey: ["/api/accuracy/leaderboard/xb"],
    queryFn: () => fetch("/api/accuracy/leaderboard/xb").then(r => r.json()),
    enabled: versionB,
  });

  const loading = versionB ? vbLoading : vaLoading;

  // Build display rows — either Version A or Version B
  const rows: Array<{ id: number; name: string; outlet: string; xScore: number; rank: number; siteYears: number; vaRow?: AnalystRow }> = [];

  if (!versionB && vaData) {
    vaData.forEach((a, i) => {
      if (a.xScore !== null) rows.push({ id: a.id, name: a.name, outlet: a.outlet, xScore: a.xScore, rank: a.xScoreRank ?? i + 1, siteYears: a.xScoreSitesCount ?? 0, vaRow: a });
    });
  } else if (versionB && vbData) {
    vbData.forEach(r => rows.push({ id: r.id, name: r.name, outlet: r.outlet, xScore: r.x_thr15, rank: r.rank_b, siteYears: r.n }));
  }

  const displayRows = showAll ? rows : rows.slice(0, 30);

  // For a given analyst get their scores organized by site+year
  function getScore(vaRow: AnalystRow, site: string, year: number): ScoreRow | undefined {
    return vaRow.scores.find(s => s.site === site && s.year === year);
  }

  return (
    <Layout>
      <div className="p-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8 gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Trophy className="w-6 h-6 text-amber-400" />
              <h1 className="text-2xl font-bold text-white tracking-tight">Analyst X Score</h1>
            </div>
            <p className="text-sm text-white/50 max-w-xl">
              Composite accuracy ranking — Z-score normalized across The Huddle Report, FantasyPros, and WalterFootball (2021–2025).
              Higher = more consistently accurate than the field. Min 2 site-years required.
            </p>
          </div>

          {/* Version toggle */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <button
              onClick={() => setVersionB(v => !v)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all",
                versionB
                  ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                  : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/8"
              )}
            >
              {versionB ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
              {versionB ? "V-B: THR 1.5×" : "V-A: Equal Weights"}
            </button>
            <p className="text-[11px] text-white/30 font-mono">
              {versionB ? "THR scores weighted 1.5×" : "All sites weighted equally"}
            </p>
          </div>
        </div>

        {/* Site legend */}
        <div className="flex flex-wrap gap-3 mb-6">
          {Object.entries(SITE_META).map(([key, meta]) => (
            <div key={key} className="flex items-center gap-1.5 bg-white/3 border border-white/8 rounded-lg px-3 py-1.5">
              <span className={cn("text-xs font-mono font-bold", meta.color)}>{meta.label}</span>
              <span className="text-[11px] text-white/40">{meta.note}</span>
            </div>
          ))}
        </div>

        {/* Comparison callout */}
        {vaData && vbData && (
          <div className="mb-6 p-4 bg-white/3 border border-white/8 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-white/40" />
              <span className="text-xs font-mono text-white/50 uppercase tracking-wider">V-A vs V-B — Top 10 Comparison</span>
            </div>
            <div className="grid grid-cols-2 gap-6 text-xs">
              <div>
                <div className="text-white/40 font-mono mb-2">V-A: Equal weights</div>
                {vaData.slice(0, 10).map((a, i) => (
                  <div key={a.id} className="flex justify-between py-0.5">
                    <span className="text-white/60">#{i + 1} {a.name}</span>
                    <span className="font-mono text-white/80">{a.xScore?.toFixed(3)}</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-amber-400/60 font-mono mb-2">V-B: THR 1.5×</div>
                {vbData.slice(0, 10).map((r, i) => {
                  const rankShift = (i + 1) - (vaData.findIndex(a => a.id === r.id) + 1);
                  return (
                    <div key={r.id} className="flex justify-between py-0.5">
                      <span className="text-white/60">
                        #{i + 1} {r.name}
                        {rankShift !== 0 && (
                          <span className={cn("ml-1 text-[10px]", rankShift < 0 ? "text-emerald-400" : "text-red-400")}>
                            ({rankShift > 0 ? "+" : ""}{rankShift})
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-amber-300/80">{r.x_thr15.toFixed(3)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Main table */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-white/30 text-sm">Computing X Scores...</div>
        ) : (
          <div className="bg-card border border-white/8 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8 bg-white/2">
                    <th className="px-4 py-3 text-left text-[11px] font-mono text-white/40 uppercase tracking-wider w-12">#</th>
                    <th className="px-4 py-3 text-left text-[11px] font-mono text-white/40 uppercase tracking-wider">Analyst</th>
                    <th className="px-4 py-3 text-center text-[11px] font-mono text-white/40 uppercase tracking-wider">
                      {versionB ? <span className="text-amber-400">X Score (V-B)</span> : "X Score (V-A)"}
                    </th>
                    <th className="px-4 py-3 text-center text-[11px] font-mono text-white/40 uppercase tracking-wider">Yrs</th>
                    {/* THR year columns */}
                    {YEARS.map(yr => (
                      <th key={`thr-${yr}`} className="px-3 py-3 text-center text-[11px] font-mono text-amber-400/50 uppercase tracking-wider whitespace-nowrap">
                        THR {String(yr).slice(2)}
                      </th>
                    ))}
                    {/* FP year columns */}
                    {YEARS.map(yr => (
                      <th key={`fp-${yr}`} className="px-3 py-3 text-center text-[11px] font-mono text-blue-400/50 uppercase tracking-wider whitespace-nowrap">
                        FP {String(yr).slice(2)}
                      </th>
                    ))}
                    {/* WF year columns */}
                    {YEARS.map(yr => (
                      <th key={`wf-${yr}`} className="px-3 py-3 text-center text-[11px] font-mono text-emerald-400/50 uppercase tracking-wider whitespace-nowrap">
                        WF {String(yr).slice(2)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, i) => {
                    const isExpanded = expanded === row.id;
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
                            {row.rank}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-white">{row.name}</div>
                          <div className="text-xs text-white/40 font-mono">{row.outlet}</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <XBadge score={row.xScore} rank={row.rank} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs font-mono text-white/40">{row.siteYears}</span>
                        </td>
                        {/* THR scores */}
                        {YEARS.map(yr => (
                          <ScoreCell key={`thr-${yr}`} score={va ? getScore(va, 'thr', yr) : undefined} site="thr" />
                        ))}
                        {/* FP scores */}
                        {YEARS.map(yr => (
                          <ScoreCell key={`fp-${yr}`} score={va ? getScore(va, 'fp', yr) : undefined} site="fp" />
                        ))}
                        {/* WF scores */}
                        {YEARS.map(yr => (
                          <ScoreCell key={`wf-${yr}`} score={va ? getScore(va, 'wf', yr) : undefined} site="wf" />
                        ))}
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {rows.length > 30 && (
              <div className="p-4 border-t border-white/5 text-center">
                <button
                  onClick={() => setShowAll(v => !v)}
                  className="flex items-center gap-2 mx-auto text-sm text-white/50 hover:text-white transition-colors"
                >
                  {showAll ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {showAll ? "Show Top 30" : `Show All ${rows.length} Analysts`}
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
          <p>V-A = equal site weights · V-B = THR counts 1.5× (THR is gold standard since 2001, stricter eligibility)</p>
        </div>
      </div>
    </Layout>
  );
}
