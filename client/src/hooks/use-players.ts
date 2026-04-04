import { useQuery } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";

// Utility to safely parse JSON that might contain stringified Dates 
// bypassing strict Zod instance checks for simplicity in this context
function safeParse<T>(schema: z.ZodType<any>, data: unknown, fallback: T): T {
  try {
    const result = schema.safeParse(data);
    if (!result.success) {
      console.warn("[Zod Validation Error]:", result.error.format());
      // Return raw data as fallback if custom types (like Dates) cause failure
      return data as T;
    }
    return result.data;
  } catch (e) {
    return data as T;
  }
}

export function usePlayers() {
  return useQuery({
    queryKey: [api.players.list.path],
    queryFn: async () => {
      const res = await fetch(api.players.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch players");
      const data = await res.json();
      return safeParse<z.infer<typeof api.players.list.responses[200]>>(
        api.players.list.responses[200], 
        data, 
        data
      );
    },
  });
}

export function usePlayer(id: number) {
  return useQuery({
    queryKey: [api.players.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.players.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch player");
      const data = await res.json();
      return safeParse<z.infer<typeof api.players.get.responses[200]>>(
        api.players.get.responses[200], 
        data, 
        data
      );
    },
    enabled: !!id,
  });
}

export function usePlayerTrends(id: number) {
  return useQuery({
    queryKey: [api.players.trends.path, id],
    queryFn: async () => {
      const url = buildUrl(api.players.trends.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch player trends");
      const data = await res.json();
      return safeParse<z.infer<typeof api.players.trends.responses[200]>>(
        api.players.trends.responses[200], 
        data, 
        data
      );
    },
    enabled: !!id,
  });
}

export function usePlayerRankings(id: number) {
  return useQuery({
    queryKey: [api.players.rankings.path, id],
    queryFn: async () => {
      const url = buildUrl(api.players.rankings.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch player rankings");
      const data = await res.json();
      return data as Array<{ sourceName: string; sourceKey?: string | null; boardType?: string | null; pickNumber: number; publishedAt?: string | null }>;
    },
    enabled: !!id,
  });
}
