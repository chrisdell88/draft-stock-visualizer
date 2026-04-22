import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Global ADP window selector. User picks one of 5 time windows and every
 * ADP value rendered across the app reflects that window. Default L24.
 *
 * Windows map to API response fields on /api/players:
 *   "24h" → adpL24 / nL24
 *   "3d"  → adpL3 / nL3
 *   "7d"  → adpL7 / nL7
 *   "30d" → adpL30 / nL30
 *   "all" → adpAll / nAll
 *
 * Selection persists in localStorage so user doesn't have to re-pick on nav.
 */

export type AdpWindow = "24h" | "3d" | "7d" | "30d" | "all";

export const ADP_WINDOWS: { value: AdpWindow; label: string; full: string }[] = [
  { value: "24h", label: "L24", full: "Last 24 Hours" },
  { value: "3d", label: "L3", full: "Last 3 Days" },
  { value: "7d", label: "L7", full: "Last 7 Days" },
  { value: "30d", label: "L30", full: "Last 30 Days" },
  { value: "all", label: "All", full: "All Mocks" },
];

const STORAGE_KEY = "mockx-adp-window";
const DEFAULT_WINDOW: AdpWindow = "24h";

interface AdpWindowContextValue {
  window: AdpWindow;
  setWindow: (w: AdpWindow) => void;
}

const AdpWindowContext = createContext<AdpWindowContextValue | null>(null);

function readStoredWindow(): AdpWindow {
  if (typeof window === "undefined") return DEFAULT_WINDOW;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v && ["24h", "3d", "7d", "30d", "all"].includes(v)) return v as AdpWindow;
  } catch {}
  return DEFAULT_WINDOW;
}

export function AdpWindowProvider({ children }: { children: ReactNode }) {
  const [w, setW] = useState<AdpWindow>(readStoredWindow);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, w);
    } catch {}
  }, [w]);

  const value = useMemo(() => ({ window: w, setWindow: setW }), [w]);

  return <AdpWindowContext.Provider value={value}>{children}</AdpWindowContext.Provider>;
}

export function useAdpWindow(): AdpWindowContextValue {
  const ctx = useContext(AdpWindowContext);
  if (!ctx) throw new Error("useAdpWindow must be used inside <AdpWindowProvider>");
  return ctx;
}

// Map a player object from /api/players to the ADP value for the active window.
// Returns null if that window has no data for the player.
export function getAdpForWindow(player: any, w: AdpWindow): number | null {
  if (!player) return null;
  const key =
    w === "24h" ? "adpL24" :
    w === "3d"  ? "adpL3"  :
    w === "7d"  ? "adpL7"  :
    w === "30d" ? "adpL30" :
                  "adpAll";
  const v = player[key];
  return typeof v === "number" ? v : null;
}

export function getSampleCountForWindow(player: any, w: AdpWindow): number {
  if (!player) return 0;
  const key =
    w === "24h" ? "nL24" :
    w === "3d"  ? "nL3"  :
    w === "7d"  ? "nL7"  :
    w === "30d" ? "nL30" :
                  "nAll";
  const v = player[key];
  return typeof v === "number" ? v : 0;
}

// Transform an array of players so `currentAdp` reflects the active window.
// Existing components reading `currentAdp` then automatically respect the
// window without needing changes.
export function applyWindowToPlayers<T extends Record<string, any>>(
  players: T[] | undefined | null,
  w: AdpWindow,
): T[] {
  if (!Array.isArray(players)) return [];
  return players.map((p) => ({
    ...p,
    currentAdp: getAdpForWindow(p, w),
    activeAdpSampleCount: getSampleCountForWindow(p, w),
  })).sort((a, b) => {
    const av = (a as any).currentAdp;
    const bv = (b as any).currentAdp;
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return av - bv;
  });
}
