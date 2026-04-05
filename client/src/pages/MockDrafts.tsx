import { useState, useMemo } from "react";
import { Link } from "wouter";
import Layout from "@/components/Layout";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Loader2, TrendingUp, TrendingDown, Minus, ExternalLink,
  ArrowUpDown, BarChart3, Eye, EyeOff, RefreshCw, Activity, Award, Info, X, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ─── Position consolidation ─────────────────────────────────────────────────
const POS_NORMALIZE: Record<string, string> = {
  OT: "OL", OG: "OL", IOL: "OL", G: "OL", C: "OL", "OT/G": "OL",
  EDGE: "DL", DE: "DL", DT: "DL",
};
const POS_PILL_ORDER = ["all", "QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S"];

function normPos(pos: string | null): string {
  return POS_NORMALIZE[pos ?? ""] ?? (pos ?? "");
}

type BoardView = "mock" | "bigboard";

// ─── Types ────────────────────────────────────────────────────────────────────
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

// ─── Cell Color: pick number → color class ────────────────────────────────────
function pickColor(pick: number | undefined): string {
  if (pick === undefined) return "";
  if (pick <= 5)  return "bg-emerald-500/20 text-emerald-300 font-bold";
  if (pick <= 10) return "bg-green-500/15 text-green-400";
  if (pick <= 15) return "bg-lime-500/10 text-lime-400";
  if (pick <= 20) return "bg-yellow-500/10 text-yellow-400";
  if (pick <= 25) return "bg-orange-500/10 text-orange-400";
  return "bg-red-500/10 text-red-400";
}

function pickBorderColor(pick: number | undefined): string {
  if (pick === undefined) return "border-white/4";
  if (pick <= 5)  return "border-emerald-500/30";
  if (pick <= 10) return "border-green-500/20";
  if (pick <= 15) return "border-lime-500/15";
  if (pick <= 20) return "border-yellow-500/15";
  if (pick <= 25) return "border-orange-500/15";
  return "border-red-500/15";
}

// ─── Trend Indicator ─────────────────────────────────────────────────────────
function TrendChip({ change }: { change: number | null }) {
  if (change === null) return null;
  const abs = Math.abs(change);
  if (abs < 0.2) return <span className="text-muted-foreground font-mono text-[10px]">—</span>;
  if (change > 0) {
    return (
      <span className="flex items-center gap-0.5 text-stock-up font-mono text-[10px] font-bold">
        <TrendingUp className="w-2.5 h-2.5" />+{abs.toFixed(1)}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 text-stock-down font-mono text-[10px] font-bold">
      <TrendingDown className="w-2.5 h-2.5" />-{abs.toFixed(1)}
    </span>
  );
}

// ─── Short date from full source name ────────────────────────────────────────
function draftDate(draft: DraftCol): string {
  if (!draft.publishedAt) return "";
  return format(new Date(draft.publishedAt), "M/d");
}

// ─── Color legend ────────────────────────────────────────────────────────────
const LEGEND = [
  { label: "Top 5", color: "bg-emerald-500/20 border border-emerald-500/30 text-emerald-300" },
  { label: "6–10", color: "bg-green-500/15 border border-green-500/20 text-green-400" },
  { label: "11–15", color: "bg-lime-500/10 border border-lime-500/15 text-lime-400" },
  { label: "16–20", color: "bg-yellow-500/10 border border-yellow-500/15 text-yellow-400" },
  { label: "21–25", color: "bg-orange-500/10 border border-orange-500/15 text-orange-400" },
  { label: "26–32", color: "bg-red-500/10 border border-red-500/15 text-red-400" },
  { label: "No pick", color: "bg-card border border-white/5 text-muted-foreground" },
];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MockDrafts() {
  const [boardView, setBoardView] = useState<BoardView>("mock");

  const { data, isLoading, refetch, isFetching } = useQuery<MatrixData>({
    queryKey: ["/api/matrix", boardView],
    queryFn: () => fetch(`/api/matrix?boardType=${boardView}`).then(r => r.json()),
  });

  const [sortBy, setSortBy] = useState<"adp" | "name" | "pos">("adp");
  const [sortDesc, setSortDesc] = useState(false);
  const [filterPos, setFilterPos] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showLegend, setShowLegend] = useState(true);
  const [showKey, setShowKey] = useState(false);

  // Build consolidated position pills in correct order
  const positions = useMemo(() => {
    if (!data?.players) return ["all"];
    const groups = new Set<string>();
    for (const p of data.players) groups.add(normPos(p.position));
    const ordered = POS_PILL_ORDER.filter(p => p === "all" || groups.has(p));
    for (const g of groups) {
      if (!POS_PILL_ORDER.includes(g)) ordered.push(g);
    }
    return ordered;
  }, [data?.players]);

  const sortedPlayers = useMemo(() => {
    if (!data?.players) return [];
    const q = search.toLowerCase();
    let list = [...data.players];
    if (filterPos !== "all") list = list.filter(p => normPos(p.position) === filterPos);
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q) || (p.college ?? "").toLowerCase().includes(q));
    list.sort((a, b) => {
      if (sortBy === "adp") {
        const av = a.currentAdp ?? 99;
        const bv = b.currentAdp ?? 99;
        return sortDesc ? bv - av : av - bv;
      }
      if (sortBy === "name") {
        return sortDesc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name);
      }
      if (sortBy === "pos") {
        const ap = a.position ?? ""; const bp = b.position ?? "";
        return sortDesc ? bp.localeCompare(ap) : ap.localeCompare(bp);
      }
      return 0;
    });
    return list;
  }, [data?.players, sortBy, sortDesc, filterPos]);

  // Sort drafts: most recent first
  const sortedDrafts = useMemo(() => {
    if (!data?.drafts) return [];
    return [...data.drafts].sort((a, b) => {
      return new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime();
    });
  }, [data?.drafts]);

  const toggleSort = (key: typeof sortBy) => {
    if (sortBy === key) setSortDesc(d => !d);
    else { setSortBy(key); setSortDesc(false); }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="h-[60vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  const picks = data?.picks ?? {};
  const totalMocks = sortedDrafts.length;

  return (
    <Layout>
      <div className="space-y-6">

        {/* ── Board Type Toggle ── */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-black/40 border border-white/10 rounded-xl p-1 gap-1">
            <button
              onClick={() => { setBoardView("mock"); setFilterPos("all"); }}
              data-testid="tab-mock-drafts"
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                boardView === "mock"
                  ? "bg-primary text-black shadow-md"
                  : "text-muted-foreground hover:text-white"
              )}
            >
              <Activity className="w-4 h-4" />
              Mock Drafts
            </button>
            <button
              onClick={() => { setBoardView("bigboard"); setFilterPos("all"); }}
              data-testid="tab-big-boards"
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                boardView === "bigboard"
                  ? "bg-violet-600 text-white shadow-md"
                  : "text-muted-foreground hover:text-white"
              )}
            >
              <Award className="w-4 h-4" />
              Big Boards
            </button>
          </div>
          <div className="text-xs font-mono text-muted-foreground">
            {boardView === "mock"
              ? "Team-specific mock drafts — who goes where"
              : "Talent rankings — best players regardless of team fit"}
          </div>
        </div>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">
              {boardView === "mock"
                ? <>Mock Draft <span className="text-primary">Matrix</span></>
                : <>Big Board <span className="text-violet-400">Matrix</span></>}
            </h1>
            <p className="text-muted-foreground text-sm mt-1 font-mono">
              {sortedPlayers.length} prospects · {totalMocks} {boardView === "mock" ? "mock drafts" : "big boards"} · color-coded pick slots
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search prospects…"
                className="pl-8 pr-3 py-1.5 text-xs font-mono rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-primary/50 w-44"
              />
            </div>
            {/* Position filter */}
            <div className="flex gap-1 flex-wrap">
              {positions.map(pos => (
                <button
                  key={pos}
                  onClick={() => setFilterPos(pos)}
                  data-testid={`filter-pos-${pos}`}
                  className={cn(
                    "px-2 py-1 rounded-lg text-xs font-mono font-semibold transition-all border",
                    filterPos === pos
                      ? "bg-primary text-black border-primary"
                      : "bg-white/5 text-muted-foreground border-white/5 hover:border-white/20 hover:text-white"
                  )}
                >
                  {pos.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowLegend(v => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-white transition-colors border border-white/10 rounded-lg px-2 py-1"
            >
              {showLegend ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              Legend
            </button>
            <button
              onClick={() => setShowKey(true)}
              className="flex items-center gap-1.5 text-xs font-mono text-white/40 hover:text-white transition-colors border border-white/10 hover:border-white/20 rounded-lg px-3 py-1.5"
            >
              <Info className="w-3.5 h-3.5" />
              Sources Key
            </button>
            <Button
              size="sm"
              variant="outline"
              className="border-white/10 hover:border-primary hover:text-primary gap-1 text-xs"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn("w-3 h-3", isFetching && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Legend */}
        {showLegend && (
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-muted-foreground font-mono">Pick slot:</span>
            {LEGEND.map(({ label, color }) => (
              <span key={label} className={cn("px-2 py-0.5 rounded text-[10px] font-mono font-semibold", color)}>
                {label}
              </span>
            ))}
          </div>
        )}

        {/* Matrix Table */}
        <div className="overflow-x-auto rounded-xl border border-white/5 bg-black/40">
          <table className="text-xs border-collapse" style={{ minWidth: `${Math.max(900, 280 + sortedDrafts.length * 68)}px` }}>
            {/* Column headers */}
            <thead>
              <tr className="bg-black/60 border-b border-white/10">
                {/* Sticky player column header */}
                <th
                  className="sticky left-0 z-20 bg-black/90 border-r border-white/10 p-0"
                  style={{ minWidth: 200 }}
                >
                  <button
                    className="w-full flex items-center gap-1 px-3 py-3 text-left text-muted-foreground uppercase tracking-widest font-mono hover:text-white transition-colors"
                    onClick={() => toggleSort("name")}
                  >
                    <ArrowUpDown className="w-2.5 h-2.5 shrink-0" />
                    Prospect
                  </button>
                </th>

                {/* ADP + trend */}
                <th className="bg-black/60 border-r border-white/10 px-3 py-3 text-center whitespace-nowrap" style={{ minWidth: 72 }}>
                  <button
                    className="flex flex-col items-center gap-0.5 text-muted-foreground uppercase tracking-widest font-mono hover:text-white transition-colors w-full"
                    onClick={() => toggleSort("adp")}
                  >
                    <BarChart3 className="w-3 h-3" />
                    <span>ADP</span>
                  </button>
                </th>

                {/* One column per mock draft — rotated header for compact layout */}
                {sortedDrafts.map(draft => (
                  <th
                    key={draft.id}
                    className="border-r border-white/5 px-0 text-center"
                    style={{ minWidth: 44, width: 44 }}
                    title={`${draft.sourceName}${draft.publishedAt ? " · " + draftDate(draft) : ""}`}
                  >
                    <div
                      className="flex flex-col items-center justify-end pb-2"
                      style={{ height: 80 }}
                    >
                      <div
                        style={{
                          writingMode: "vertical-lr",
                          transform: "rotate(180deg)",
                          whiteSpace: "nowrap",
                        }}
                        className="font-mono font-bold text-white/80 text-[10px] leading-none tracking-wide"
                      >
                        {draft.shortName}
                        {draft.publishedAt && (
                          <span className="text-white/30 font-normal"> {draftDate(draft)}</span>
                        )}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Rows */}
            <tbody>
              {sortedPlayers.map((player, rowIdx) => {
                const playerPicks = picks[player.id] ?? {};
                const pickValues = sortedDrafts.map(d => playerPicks[d.id]);
                const hasPicks = pickValues.some(v => v !== undefined);

                return (
                  <tr
                    key={player.id}
                    className={cn(
                      "border-b border-white/4 transition-colors group",
                      rowIdx % 2 === 0 ? "bg-white/[0.01]" : "bg-transparent",
                      "hover:bg-primary/5"
                    )}
                    data-testid={`matrix-row-${player.id}`}
                  >
                    {/* Sticky player name cell */}
                    <td
                      className="sticky left-0 z-10 border-r border-white/10 px-3 py-2 bg-[hsl(var(--card)/0.95)] group-hover:bg-primary/10 transition-colors"
                      style={{ minWidth: 200 }}
                    >
                      <Link href={`/players/${player.id}`}>
                        <div className="flex items-center gap-2 cursor-pointer">
                          <div
                            className={cn(
                              "w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold font-mono shrink-0",
                              (player.currentAdp ?? 99) <= 5 ? "bg-emerald-500/20 text-emerald-300"
                              : (player.currentAdp ?? 99) <= 10 ? "bg-green-500/15 text-green-400"
                              : (player.currentAdp ?? 99) <= 15 ? "bg-lime-500/10 text-lime-400"
                              : (player.currentAdp ?? 99) <= 20 ? "bg-yellow-500/10 text-yellow-400"
                              : "bg-orange-500/10 text-orange-400"
                            )}
                          >
                            {Math.round(player.currentAdp ?? 99)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-white text-[12px] leading-tight truncate group-hover:text-primary transition-colors">
                              {player.name}
                            </p>
                            <p className="text-muted-foreground text-[10px] font-mono truncate">
                              {player.position} · {player.college}
                            </p>
                          </div>
                        </div>
                      </Link>
                    </td>

                    {/* ADP cell */}
                    <td className="border-r border-white/10 px-2 py-2 text-center align-middle" style={{ minWidth: 72 }}>
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={cn(
                          "font-mono font-bold text-sm leading-tight",
                          (player.trend === "up") ? "text-stock-up"
                          : (player.trend === "down") ? "text-stock-down"
                          : "text-white"
                        )}>
                          {player.currentAdp != null ? `#${player.currentAdp.toFixed(1)}` : "—"}
                        </span>
                        <TrendChip change={player.adpChange} />
                      </div>
                    </td>

                    {/* Pick cells per draft */}
                    {sortedDrafts.map(draft => {
                      const pick = playerPicks[draft.id];
                      return (
                        <td
                          key={draft.id}
                          className={cn(
                            "border-r border-white/4 px-2 py-2 text-center align-middle transition-colors",
                            pick !== undefined
                              ? cn(pickColor(pick), "border", pickBorderColor(pick))
                              : "text-muted-foreground/30"
                          )}
                          style={{ minWidth: 60 }}
                          data-testid={`matrix-cell-${player.id}-${draft.id}`}
                        >
                          <span className="font-mono font-semibold text-[11px]">
                            {pick !== undefined ? `#${pick}` : "—"}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Source List */}
        <div>
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-mono mb-3">
            {boardView === "mock" ? `Sources (${sortedDrafts.length} mock drafts)` : `Big Boards (${sortedDrafts.length} boards)`}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {sortedDrafts.map(draft => (
              <div
                key={draft.id}
                className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-card/40 border border-white/5 hover:border-white/10 transition-colors"
                data-testid={`draft-item-${draft.id}`}
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-primary text-xs w-16 shrink-0">{draft.shortName}</span>
                  <span className="text-white text-xs truncate">{draft.sourceName}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {draft.publishedAt && (
                    <span className="text-muted-foreground text-[10px] font-mono">
                      {format(new Date(draft.publishedAt), "M/d/yy")}
                    </span>
                  )}
                  {draft.url && (
                    <a href={draft.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sources Key Modal */}
      {showKey && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setShowKey(false)}
        >
          <div
            className="bg-[#0d1117] border border-white/10 rounded-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
                {boardView === "mock" ? "Mock Draft Sources" : "Big Board Sources"}
              </h3>
              <button onClick={() => setShowKey(false)} className="text-white/40 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              {sortedDrafts.length > 0 ? (
                sortedDrafts.map(draft => (
                  <div key={draft.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-white text-xs font-semibold truncate">{draft.sourceName}</span>
                      <span className="text-muted-foreground text-[10px] font-mono">{draft.shortName}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      {draft.publishedAt && (
                        <span className="text-muted-foreground text-[10px] font-mono">
                          {format(new Date(draft.publishedAt), "M/d/yy")}
                        </span>
                      )}
                      {draft.url && (
                        <a
                          href={draft.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary/60 hover:text-primary transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-xs font-mono text-center py-4">No sources loaded.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
