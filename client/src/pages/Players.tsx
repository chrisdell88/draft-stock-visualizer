import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import Layout from "@/components/Layout";
import { usePlayers } from "@/hooks/use-players";
import { Search, TrendingUp, TrendingDown, Minus, ArrowUpDown, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { WindowToggle } from "@/components/WindowToggle";

// ─── Position config ───────────────────────────────────────────────────────
const POS_ORDER = ["QB", "RB", "WR", "TE", "OT", "OG", "IOL", "C", "EDGE", "DL", "DT", "LB", "CB", "S"];
const POS_COLOR: Record<string, string> = {
  QB: "text-amber-400 bg-amber-500/15 border-amber-500/30",
  RB: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30",
  WR: "text-blue-400 bg-blue-500/15 border-blue-500/30",
  TE: "text-violet-400 bg-violet-500/15 border-violet-500/30",
  OT: "text-orange-400 bg-orange-500/15 border-orange-500/30",
  OG: "text-orange-400 bg-orange-500/15 border-orange-500/30",
  IOL: "text-orange-400 bg-orange-500/15 border-orange-500/30",
  C: "text-orange-400 bg-orange-500/15 border-orange-500/30",
  EDGE: "text-pink-400 bg-pink-500/15 border-pink-500/30",
  DL: "text-pink-400 bg-pink-500/15 border-pink-500/30",
  DT: "text-pink-400 bg-pink-500/15 border-pink-500/30",
  LB: "text-sky-400 bg-sky-500/15 border-sky-500/30",
  CB: "text-green-400 bg-green-500/15 border-green-500/30",
  S:  "text-green-400 bg-green-500/15 border-green-500/30",
};
function posColorClass(pos: string | null): string {
  return POS_COLOR[pos ?? ""] ?? "text-muted-foreground bg-white/5 border-white/10";
}

type SortKey = "adp" | "name" | "ras" | "change";
type SortDir = "asc" | "desc";

export default function Players() {
  const { data: players, isLoading } = usePlayers();
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("adp");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // ── Position pills with heat data ─────────────────────────────────────────
  const posPills = useMemo(() => {
    if (!players) return [];
    const counts: Record<string, { count: number; rising: number; falling: number }> = {};
    for (const p of players) {
      const pos = p.position ?? "UNK";
      if (!counts[pos]) counts[pos] = { count: 0, rising: 0, falling: 0 };
      counts[pos].count++;
      if ((p.adpChange ?? 0) > 0.2) counts[pos].rising++;
      if ((p.adpChange ?? 0) < -0.2) counts[pos].falling++;
    }
    return POS_ORDER.filter(pos => counts[pos])
      .map(pos => ({ pos, ...counts[pos] }));
  }, [players]);

  // ── Sorting helper ─────────────────────────────────────────────────────────
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : key === "adp" ? "asc" : "desc"); }
  };
  const SortIcon = ({ k }: { k: SortKey }) => (
    <ArrowUpDown className={cn("w-3 h-3 inline ml-0.5 opacity-40", sortKey === k && "opacity-100 text-primary")} />
  );

  // ── Filtered + sorted list ─────────────────────────────────────────────────
  const filteredPlayers = useMemo(() => {
    let list = (players ?? []).filter(p => {
      const q = search.toLowerCase();
      const matchSearch = !q || p.name.toLowerCase().includes(q) || (p.college ?? "").toLowerCase().includes(q) || (p.position ?? "").toLowerCase().includes(q);
      const matchPos = posFilter === "ALL" || p.position === posFilter;
      return matchSearch && matchPos;
    });

    list = [...list].sort((a, b) => {
      let diff = 0;
      if (sortKey === "adp")    diff = (a.currentAdp ?? 999) - (b.currentAdp ?? 999);
      if (sortKey === "name")   diff = a.name.localeCompare(b.name);
      if (sortKey === "ras")    diff = (Number(b.rasScore ?? 0)) - (Number(a.rasScore ?? 0));
      if (sortKey === "change") diff = (b.adpChange ?? 0) - (a.adpChange ?? 0);
      return sortDir === "desc" ? -diff : diff;
    });

    return list;
  }, [players, search, posFilter, sortKey, sortDir]);

  const totalRising  = filteredPlayers.filter(p => (p.adpChange ?? 0) > 0.2).length;
  const totalFalling = filteredPlayers.filter(p => (p.adpChange ?? 0) < -0.2).length;

  return (
    <Layout>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white mb-1">2026 Draft Board</h1>
            <p className="text-muted-foreground text-sm">
              {filteredPlayers.length} prospects · <span className="text-emerald-400">{totalRising} rising</span> · <span className="text-red-400">{totalFalling} falling</span>
            </p>
          </div>
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <WindowToggle />
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search prospects..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                data-testid="input-search-players"
                className="bg-card/50 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all w-full md:w-64"
              />
            </div>
          </div>
        </div>

        {/* Position heat pills */}
        {!isLoading && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setPosFilter("ALL")}
              data-testid="filter-pos-all"
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-mono border transition-all",
                posFilter === "ALL"
                  ? "bg-primary/20 text-primary border-primary/40"
                  : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10"
              )}
            >
              ALL ({players?.length ?? 0})
            </button>
            {posPills.map(({ pos, count, rising, falling }) => {
              const isActive = posFilter === pos;
              const heat = rising > falling ? "rising" : falling > rising ? "falling" : "neutral";
              return (
                <button
                  key={pos}
                  onClick={() => setPosFilter(pos)}
                  data-testid={`filter-pos-${pos.toLowerCase()}`}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono border transition-all",
                    isActive
                      ? cn(posColorClass(pos), "opacity-100")
                      : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10"
                  )}
                >
                  <span>{pos}</span>
                  <span className={cn("font-bold", isActive ? "" : "text-muted-foreground/60")}>{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Table */}
        <div className="glass-card rounded-xl overflow-hidden border border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-white/5 border-b border-white/10 font-mono tracking-wider">
                <tr>
                  <th className="px-4 py-3 w-8 text-center">#</th>
                  <th className="px-4 py-3">
                    <button onClick={() => toggleSort("name")} className="hover:text-white flex items-center gap-1" data-testid="sort-by-name">
                      Prospect <SortIcon k="name" />
                    </button>
                  </th>
                  <th className="px-4 py-3 hidden sm:table-cell">Size</th>
                  <th className="px-4 py-3">
                    <button onClick={() => toggleSort("ras")} className="hover:text-white flex items-center gap-1" data-testid="sort-by-ras">
                      RAS <SortIcon k="ras" />
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button onClick={() => toggleSort("adp")} className="hover:text-white flex items-center gap-1" data-testid="sort-by-adp">
                      ADP <SortIcon k="adp" />
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button onClick={() => toggleSort("change")} className="hover:text-white flex items-center gap-1" data-testid="sort-by-change">
                      Movement <SortIcon k="change" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Signal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
                    </td>
                  </tr>
                ) : filteredPlayers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground font-mono text-sm">
                      No prospects match your filters.
                    </td>
                  </tr>
                ) : (
                  filteredPlayers.map((player, idx) => {
                    const change = player.adpChange ?? 0;
                    const isUp = change > 0.2;
                    const isDown = change < -0.2;
                    const changeAbs = Math.abs(change);
                    const barPct = Math.min(changeAbs / 5 * 100, 100);

                    return (
                      <motion.tr
                        key={player.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(idx * 0.01, 0.3) }}
                        className="hover:bg-white/5 transition-colors group"
                        data-testid={`row-player-${player.id}`}
                      >
                        {/* Rank */}
                        <td className="px-4 py-3 text-center">
                          <span className="text-muted-foreground font-mono text-xs">{idx + 1}</span>
                        </td>

                        {/* Player identity */}
                        <td className="px-4 py-3">
                          <Link href={`/players/${player.id}`} className="flex items-center gap-3" data-testid={`link-player-${player.id}`}>
                            {player.imageUrl ? (
                              <img src={player.imageUrl} alt={player.name}
                                   className="w-9 h-9 rounded-full object-cover border border-white/10 flex-shrink-0" />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center font-bold text-muted-foreground flex-shrink-0 text-xs">
                                {player.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                              </div>
                            )}
                            <div>
                              <p className="font-semibold text-white group-hover:text-primary transition-colors text-sm leading-tight" data-testid={`text-player-name-${player.id}`}>
                                {player.name}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className={cn("text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border", posColorClass(player.position))}>
                                  {player.position}
                                </span>
                                <span className="text-[10px] text-muted-foreground">{player.college}</span>
                              </div>
                            </div>
                          </Link>
                        </td>

                        {/* Measurables */}
                        <td className="px-4 py-3 hidden sm:table-cell font-mono text-xs text-muted-foreground">
                          <div>{player.height ?? "–"}</div>
                          <div>{player.weight ? `${player.weight} lbs` : "–"}</div>
                        </td>

                        {/* RAS */}
                        <td className="px-4 py-3" data-testid={`cell-ras-${player.id}`}>
                          <span className={cn(
                            "px-2 py-0.5 rounded font-mono text-xs border",
                            player.rasScore && Number(player.rasScore) >= 9 ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
                            player.rasScore && Number(player.rasScore) >= 7 ? "bg-primary/15 text-primary border-primary/30" :
                            player.rasScore && Number(player.rasScore) >= 5 ? "bg-white/8 text-white border-white/10" :
                            player.rasScore ? "bg-red-500/10 text-red-400 border-red-500/20" :
                            "text-muted-foreground border-transparent"
                          )}>
                            {player.rasScore ? Number(player.rasScore).toFixed(2) : "–"}
                          </span>
                        </td>

                        {/* ADP */}
                        <td className="px-4 py-3" data-testid={`cell-adp-${player.id}`}>
                          <span className="font-mono font-bold text-white text-base">
                            #{player.currentAdp?.toFixed(1) ?? "–"}
                          </span>
                        </td>

                        {/* Movement bar */}
                        <td className="px-4 py-3" data-testid={`cell-change-${player.id}`}>
                          {isUp || isDown ? (
                            <div>
                              <div className="flex items-center gap-1.5 mb-1">
                                {isUp
                                  ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                  : <TrendingDown className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                                <span className={cn("font-mono text-xs font-bold", isUp ? "text-emerald-400" : "text-red-400")}>
                                  {isUp ? "+" : "-"}{changeAbs.toFixed(1)}
                                </span>
                              </div>
                              <div className="w-20 h-1 bg-white/8 rounded-full overflow-hidden">
                                <div
                                  className={cn("h-full rounded-full", isUp ? "bg-emerald-400" : "bg-red-400")}
                                  style={{ width: `${barPct}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Minus className="w-3 h-3" />
                              <span className="font-mono text-xs">flat</span>
                            </div>
                          )}
                        </td>

                        {/* Signal */}
                        <td className="px-4 py-3 text-right hidden md:table-cell">
                          <span className={cn(
                            "inline-flex px-2 py-0.5 rounded text-[10px] font-mono font-bold border",
                            isUp   ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" :
                            isDown ? "text-red-400 bg-red-500/10 border-red-500/20" :
                                     "text-muted-foreground bg-white/5 border-transparent"
                          )} data-testid={`signal-${player.id}`}>
                            {isUp ? "BUY" : isDown ? "SELL" : "HOLD"}
                          </span>
                        </td>
                      </motion.tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-muted-foreground font-mono text-center">
          ADP = Average Draft Position across all mock drafts · Movement based on last 7 days · Signal is informational only
        </p>
      </motion.div>
    </Layout>
  );
}
