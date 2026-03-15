import { useState, useMemo } from "react";
import { Link } from "wouter";
import Layout from "@/components/Layout";
import { useQuery } from "@tanstack/react-query";
import { Loader2, TrendingUp, TrendingDown, ExternalLink, Award, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// ─── Types ─────────────────────────────────────────────────────────────────
type PlayerRow = {
  id: number;
  name: string;
  position: string | null;
  college: string | null;
  currentAdp: number | null;
  adpChange: number | null;
  trend: string | null;
};

type DraftCol = {
  id: number;
  sourceName: string;
  shortName: string;
  sourceKey: string | null;
  url: string | null;
  publishedAt: string | null;
};

type MatrixData = {
  players: PlayerRow[];
  drafts: DraftCol[];
  picks: Record<number, Record<number, number>>;
};

function rankColor(rank: number | undefined): string {
  if (rank === undefined) return "";
  if (rank <= 5)  return "bg-emerald-500/20 text-emerald-300 font-bold";
  if (rank <= 10) return "bg-green-500/15 text-green-400";
  if (rank <= 15) return "bg-lime-500/10 text-lime-400";
  if (rank <= 20) return "bg-yellow-500/10 text-yellow-400";
  if (rank <= 32) return "bg-orange-500/10 text-orange-400";
  return "bg-red-500/10 text-red-400";
}

const POS_COLOR: Record<string, string> = {
  QB: "text-amber-400 bg-amber-500/10",
  RB: "text-emerald-400 bg-emerald-500/10",
  WR: "text-blue-400 bg-blue-500/10",
  TE: "text-violet-400 bg-violet-500/10",
  OT: "text-orange-400 bg-orange-500/10",
  OG: "text-orange-400 bg-orange-500/10",
  IOL: "text-orange-400 bg-orange-500/10",
  EDGE: "text-pink-400 bg-pink-500/10",
  DL: "text-pink-400 bg-pink-500/10",
  DT: "text-pink-400 bg-pink-500/10",
  LB: "text-sky-400 bg-sky-500/10",
  CB: "text-green-400 bg-green-500/10",
  S: "text-green-400 bg-green-500/10",
};

export default function BigBoards() {
  const { data, isLoading } = useQuery<MatrixData>({
    queryKey: ["/api/matrix?boardType=bigboard"],
    queryFn: () => fetch("/api/matrix?boardType=bigboard").then(r => r.json()),
  });

  const [posFilter, setPosFilter] = useState<string>("ALL");

  const positions = useMemo(() => {
    if (!data?.players) return ["ALL"];
    const pos = Array.from(new Set(data.players.map(p => p.position).filter(Boolean) as string[])).sort();
    return ["ALL", ...pos];
  }, [data]);

  const filteredRows = useMemo(() => {
    if (!data?.players) return [];
    const rows = data.players
      .filter(p => posFilter === "ALL" || p.position === posFilter)
      .filter(p => {
        // Only show players that have at least one pick in the big board drafts
        return data.drafts.some(d => data.picks[p.id]?.[d.id] !== undefined);
      })
      .map(p => ({
        ...p,
        picks: data.drafts.map(d => data.picks[p.id]?.[d.id]),
        avgRank: (() => {
          const vals = data.drafts.map(d => data.picks[p.id]?.[d.id]).filter(Boolean) as number[];
          return vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : Infinity;
        })(),
      }));
    return rows.sort((a, b) => a.avgRank - b.avgRank);
  }, [data, posFilter]);

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
            <Award className="w-7 h-7 text-violet-400" />
            Big Boards
          </h1>
          <p className="text-sm text-muted-foreground mt-1 font-mono">
            Talent rankings — individual analyst evaluations, not team-specific mock drafts
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground font-mono">
            {data?.drafts.length ?? 0} board{data?.drafts.length !== 1 ? "s" : ""} · {filteredRows.length} prospects
          </p>
        </div>
      </div>

      {/* Position filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        {positions.map(pos => (
          <button
            key={pos}
            onClick={() => setPosFilter(pos)}
            data-testid={`filter-pos-${pos.toLowerCase()}`}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-mono border transition-all",
              posFilter === pos
                ? "bg-violet-500/20 text-violet-300 border-violet-500/40"
                : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10"
            )}
          >
            {pos}
          </button>
        ))}
      </div>

      {/* Source legend */}
      {data && data.drafts.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4">
          {data.drafts.map(d => (
            <div key={d.id} className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-violet-400" />
              <span>{d.shortName}</span>
              {d.url && (
                <a href={d.url} target="_blank" rel="noopener noreferrer"
                   className="text-violet-400 hover:text-violet-300" data-testid={`link-source-${d.sourceKey}`}>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Matrix */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !data || data.drafts.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <Award className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
          <p className="text-muted-foreground font-mono text-sm">No big board data available yet.</p>
          <p className="text-muted-foreground font-mono text-xs mt-1">
            Big boards include DJ's top-50 rankings and Tankathon's talent board.
          </p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="bigboards-matrix">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="sticky left-0 z-10 bg-card/90 backdrop-blur-md px-4 py-3 text-left font-mono text-xs text-muted-foreground uppercase tracking-widest w-48">
                    Prospect
                  </th>
                  <th className="px-3 py-3 text-center font-mono text-xs text-muted-foreground uppercase w-16">ADP</th>
                  {data.drafts.map(d => (
                    <th key={d.id} className="px-3 py-3 text-center font-mono text-xs text-violet-400 uppercase whitespace-nowrap">
                      {d.shortName}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center font-mono text-xs text-muted-foreground uppercase w-16">Avg</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, rowIdx) => (
                  <tr key={row.id}
                      className={cn("border-b border-white/5 hover:bg-white/5 transition-colors", rowIdx % 2 === 0 ? "" : "bg-white/[0.02]")}
                      data-testid={`row-player-${row.id}`}>
                    {/* Player name */}
                    <td className="sticky left-0 z-10 bg-card/90 backdrop-blur-md px-4 py-2.5">
                      <Link href={`/players/${row.id}`}
                            className="flex items-center gap-2 group" data-testid={`link-player-${row.id}`}>
                        <div>
                          <p className="font-medium text-white text-xs group-hover:text-violet-300 transition-colors whitespace-nowrap leading-tight">
                            {row.name}
                          </p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className={cn("text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase", POS_COLOR[row.position ?? ""] ?? "text-muted-foreground bg-white/5")}>
                              {row.position}
                            </span>
                            <span className="text-[9px] text-muted-foreground font-mono">{row.college}</span>
                          </div>
                        </div>
                      </Link>
                    </td>

                    {/* ADP */}
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex flex-col items-center">
                        <span className="font-mono text-xs text-white font-semibold">
                          {row.currentAdp?.toFixed(1) ?? "–"}
                        </span>
                        {row.adpChange != null && Math.abs(row.adpChange) > 0.2 && (
                          <span className={cn("text-[9px] font-mono flex items-center gap-0.5", row.adpChange > 0 ? "text-emerald-400" : "text-red-400")}>
                            {row.adpChange > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                            {Math.abs(row.adpChange).toFixed(1)}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Pick cells per source */}
                    {data.drafts.map(d => {
                      const pick = data.picks[row.id]?.[d.id];
                      return (
                        <td key={d.id} className="px-2 py-2.5 text-center"
                            data-testid={`cell-${row.id}-${d.id}`}>
                          {pick !== undefined ? (
                            <span className={cn("inline-block min-w-[32px] text-center text-xs font-mono px-1.5 py-0.5 rounded", rankColor(pick))}>
                              #{pick}
                            </span>
                          ) : (
                            <span className="text-white/10 text-xs font-mono">—</span>
                          )}
                        </td>
                      );
                    })}

                    {/* Avg rank */}
                    <td className="px-3 py-2.5 text-center">
                      {row.avgRank !== Infinity ? (
                        <span className={cn("inline-block min-w-[36px] text-center text-xs font-mono px-1.5 py-0.5 rounded border border-white/10", rankColor(Math.round(row.avgRank)))}>
                          #{row.avgRank.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-white/10 text-xs font-mono">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer note */}
      <div className="mt-4 text-xs text-muted-foreground font-mono flex items-center gap-2">
        <BarChart3 className="w-3 h-3" />
        Big boards reflect talent rankings — players shown in ascending rank order. Color: green = top talent, orange/red = later board placement.
      </div>
    </Layout>
  );
}
