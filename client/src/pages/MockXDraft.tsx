import { useMemo } from "react";
import { Link } from "wouter";
import Layout from "@/components/Layout";
import { usePlayers } from "@/hooks/use-players";
import { Loader2, TrendingUp, TrendingDown, Minus, ChevronRight, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

// ── Position badge colors ──────────────────────────────────────────────────
const POS_COLOR: Record<string, string> = {
  QB: "#f59e0b", RB: "#34d399", WR: "#60a5fa", TE: "#a78bfa",
  OT: "#fb923c", OG: "#fb923c", IOL: "#fb923c", C: "#fb923c",
  EDGE: "#f472b6", DL: "#f472b6", DT: "#f472b6",
  LB: "#38bdf8", CB: "#4ade80", S: "#4ade80",
};

// Round badge: picks 1-32 = Round 1, 33-64 = Round 2, etc.
function getRound(pick: number): { label: string; color: string } {
  if (pick <= 32)  return { label: "R1", color: "#ffd600" };
  if (pick <= 64)  return { label: "R2", color: "#94a3b8" };
  if (pick <= 96)  return { label: "R3", color: "#fb923c" };
  return             { label: "R4+", color: "#64748b" };
}

// Player initials avatar
function InitialsAvatar({ name, posColor }: { name: string; posColor: string }) {
  const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 border-2"
      style={{
        background: `linear-gradient(135deg, ${posColor}30, ${posColor}10)`,
        borderColor: `${posColor}40`,
        color: posColor,
      }}
    >
      {initials}
    </div>
  );
}

export default function MockXDraft() {
  const { data: players, isLoading } = usePlayers();

  // Sort by ADP ascending, nulls last — then take all (user can view full board)
  const rankedPlayers = useMemo(() => {
    if (!players) return [];
    return [...players]
      .filter(p => p.currentAdp !== null && p.currentAdp !== undefined)
      .sort((a, b) => (a.currentAdp ?? 999) - (b.currentAdp ?? 999));
  }, [players]);

  const round1 = rankedPlayers.slice(0, 32);
  const round2 = rankedPlayers.slice(32, 64);
  const hasRound2 = round2.length > 0;

  const today = format(new Date(), "MMMM d, yyyy");

  return (
    <Layout>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-primary/20 p-2.5 rounded-xl">
            <Trophy className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-white tracking-tight">
              MockX Consensus Mock Draft
            </h1>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              Ranked by consensus ADP · {today} · {rankedPlayers.length} prospects tracked
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-3 max-w-2xl">
          Picks ordered by live consensus Average Draft Position (ADP) — the aggregate of {" "}
          every mock draft and big board in the system, updated daily. ADP shown to tenths
          to surface where analysts cluster vs. diverge.
        </p>
      </div>

      {isLoading ? (
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : rankedPlayers.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center text-muted-foreground font-mono text-sm">
          No ADP data available yet.
        </div>
      ) : (
        <div className="space-y-8">
          {/* Round 1 */}
          <DraftRound
            label="Round 1"
            picks={round1}
            startPick={1}
          />

          {/* Round 2 */}
          {hasRound2 && (
            <DraftRound
              label="Round 2"
              picks={round2}
              startPick={33}
            />
          )}
        </div>
      )}
    </Layout>
  );
}

// ── Draft Round component ──────────────────────────────────────────────────
type Player = {
  id: number;
  name: string;
  position: string | null;
  college: string | null;
  currentAdp: number | null;
  adpChange?: number | null;
  imageUrl?: string | null;
};

function DraftRound({ label, picks, startPick }: { label: string; picks: Player[]; startPick: number }) {
  const round = getRound(startPick);
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      {/* Round header */}
      <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between"
           style={{ background: `${round.color}10` }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded"
                style={{ backgroundColor: `${round.color}20`, color: round.color }}>
            {round.label}
          </span>
          <span className="text-sm font-display font-semibold text-white">{label}</span>
          <span className="text-xs text-muted-foreground font-mono">
            Picks {startPick}–{startPick + picks.length - 1}
          </span>
        </div>
        <span className="text-xs text-muted-foreground font-mono">Consensus ADP</span>
      </div>

      {/* Picks */}
      <div className="divide-y divide-white/5">
        {picks.map((player, i) => {
          const pickNum = startPick + i;
          const posColor = POS_COLOR[player.position ?? ""] ?? "#94a3b8";
          const adp = player.currentAdp;
          const change = player.adpChange ?? null;

          // ADP vs pick number delta — positive = undervalued (picked later than ADP suggests), negative = overvalued
          const adpDelta = adp !== null ? adp - pickNum : null;

          return (
            <Link key={player.id} href={`/players/${player.id}`}>
              <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/3 transition-colors cursor-pointer group">

                {/* Pick number */}
                <div className="w-10 flex-shrink-0 text-center">
                  <span className="font-mono font-bold text-sm text-muted-foreground">
                    #{pickNum}
                  </span>
                </div>

                {/* Avatar */}
                {player.imageUrl ? (
                  <img
                    src={player.imageUrl}
                    alt={player.name}
                    className="w-10 h-10 rounded-full object-cover border-2 flex-shrink-0"
                    style={{ borderColor: `${posColor}40` }}
                  />
                ) : (
                  <InitialsAvatar name={player.name} posColor={posColor} />
                )}

                {/* Name + college */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white text-sm group-hover:text-primary transition-colors truncate">
                      {player.name}
                    </span>
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                          style={{ backgroundColor: `${posColor}20`, color: posColor }}>
                      {player.position ?? "—"}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">{player.college ?? "—"}</span>
                </div>

                {/* ADP + trend */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  {/* ADP delta vs pick slot */}
                  {adpDelta !== null && Math.abs(adpDelta) >= 1.5 && (
                    <span className={cn(
                      "text-[10px] font-mono hidden sm:block",
                      adpDelta > 0 ? "text-emerald-400" : "text-red-400"
                    )}>
                      {adpDelta > 0 ? "▲" : "▼"} {Math.abs(adpDelta).toFixed(1)}
                    </span>
                  )}

                  {/* 7-day change */}
                  {change !== null && Math.abs(change) > 0.2 ? (
                    <span className={cn(
                      "text-[10px] font-mono flex items-center gap-0.5",
                      change > 0 ? "text-emerald-400" : "text-red-400"
                    )}>
                      {change > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {Math.abs(change).toFixed(1)}
                    </span>
                  ) : (
                    <Minus className="w-3 h-3 text-white/20" />
                  )}

                  {/* ADP value (tenths) */}
                  <div className="w-16 text-right">
                    <span className="font-mono font-bold text-white text-sm">
                      #{adp !== null ? adp.toFixed(1) : "—"}
                    </span>
                  </div>

                  <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-primary transition-colors" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
