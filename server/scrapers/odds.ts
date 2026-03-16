import axios from "axios";
import { storage } from "../storage";
import type { Player } from "@shared/schema";
import { matchPlayer } from "./index";

const API_BASE = "https://api.the-odds-api.com/v4";

interface OddsApiOutcome {
  name: string;
  price: number;
}

interface OddsApiBookmaker {
  key: string;
  title: string;
  markets: Array<{
    key: string;
    outcomes: OddsApiOutcome[];
  }>;
}

interface OddsApiEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string | null;
  away_team: string | null;
  bookmakers: OddsApiBookmaker[];
}

interface OddsApiSport {
  key: string;
  group: string;
  title: string;
  description: string;
  active: boolean;
  has_outrights: boolean;
}

const BOOKMAKER_DISPLAY: Record<string, string> = {
  draftkings: "DraftKings",
  fanduel: "FanDuel",
  betmgm: "BetMGM",
  williamhill_us: "Caesars",
  caesars: "Caesars",
  espnbet: "ESPN Bet",
  bet365: "Bet365",
  pointsbetus: "PointsBet",
  betonlineag: "BetOnline",
  bovada: "Bovada",
  mybookieag: "MyBookie",
  betus: "BetUS",
  betrivers: "BetRivers",
  unibet_us: "Unibet",
  superbook: "SuperBook",
  wynnbet: "WynnBET",
  hardrockbet: "Hard Rock",
  fliff: "Fliff",
  betparx: "BetParx",
};

function formatBookmaker(key: string): string {
  return BOOKMAKER_DISPLAY[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function priceToAmerican(price: number): string {
  if (price >= 2.0) {
    return `+${Math.round((price - 1) * 100)}`;
  } else {
    return `${Math.round(-100 / (price - 1))}`;
  }
}

function inferMarketType(sportKey: string, marketKey: string, eventTitle: string): string {
  const lower = (sportKey + " " + marketKey + " " + eventTitle).toLowerCase();
  if (lower.includes("winner") || lower.includes("first_overall") || lower.includes("#1") || lower.includes("number_1") || lower.includes("no. 1") || lower.includes("1st overall")) return "first_overall";
  if (lower.includes("top_3") || lower.includes("top 3") || lower.includes("top three")) return "top_3_pick";
  if (lower.includes("top_5") || lower.includes("top 5") || lower.includes("top five")) return "top_5_pick";
  if (lower.includes("top_10") || lower.includes("top 10") || lower.includes("top ten")) return "top_10_pick";
  if (lower.includes("first_round") || lower.includes("first round") || lower.includes("1st round")) return "first_round";
  if (lower.includes("outright") || lower.includes("winner")) return "first_overall";
  return marketKey;
}

export async function scrapeOdds(): Promise<{
  picksFound: number;
  sportsFound: string[];
  error?: string;
}> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    console.log("[ODDS] No ODDS_API_KEY set — skipping odds fetch.");
    return { picksFound: 0, sportsFound: [], error: "No ODDS_API_KEY configured" };
  }

  try {
    const sportsRes = await axios.get<OddsApiSport[]>(`${API_BASE}/sports`, {
      params: { apiKey },
      timeout: 15000,
    });
    const draftSports = sportsRes.data.filter(s =>
      s.active && (
        s.key.includes("nfl_draft") ||
        s.key.includes("nfl_number") ||
        (s.group.toLowerCase().includes("american football") && s.title.toLowerCase().includes("draft"))
      )
    );

    if (draftSports.length === 0) {
      const possibleKeys = [
        "americanfootball_nfl_draft_winner",
        "americanfootball_nfl_draft",
        "americanfootball_nfl_draft_number1",
      ];
      for (const key of possibleKeys) {
        draftSports.push({
          key,
          group: "American Football",
          title: `NFL Draft (${key})`,
          description: "",
          active: true,
          has_outrights: true,
        });
      }
    }

    const allPlayers = await storage.getPlayers();
    let totalInserted = 0;
    const sportsUsed: string[] = [];
    const today = new Date();

    for (const sport of draftSports) {
      try {
        const oddsRes = await axios.get<OddsApiEvent[]>(`${API_BASE}/sports/${sport.key}/odds`, {
          params: {
            apiKey,
            regions: "us,us2",
            markets: "h2h,outrights",
            oddsFormat: "decimal",
          },
          timeout: 15000,
        });

        if (!oddsRes.data || oddsRes.data.length === 0) continue;
        sportsUsed.push(sport.key);

        for (const event of oddsRes.data) {
          const eventTitle = event.home_team || event.sport_title || "";

          for (const bm of event.bookmakers) {
            const bookName = formatBookmaker(bm.key);

            for (const market of bm.markets) {
              const marketType = inferMarketType(sport.key, market.key, eventTitle);

              for (const outcome of market.outcomes) {
                const player = matchPlayer(outcome.name, allPlayers);
                if (!player) continue;

                const americanOdds = priceToAmerican(outcome.price);

                await storage.addOddsHistory({
                  playerId: player.id,
                  bookmaker: bookName,
                  marketType,
                  odds: americanOdds,
                  date: today,
                });
                totalInserted++;
              }
            }
          }
        }
      } catch (err: any) {
        if (err?.response?.status === 404) {
          continue;
        }
        console.warn(`[ODDS] Error fetching ${sport.key}:`, err?.message);
      }
    }

    console.log(`[ODDS] Inserted ${totalInserted} odds rows from ${sportsUsed.length} sport(s): ${sportsUsed.join(", ")}`);
    return { picksFound: totalInserted, sportsFound: sportsUsed };
  } catch (err: any) {
    console.error("[ODDS] Fatal error:", err?.message);
    return { picksFound: 0, sportsFound: [], error: err?.message ?? String(err) };
  }
}
