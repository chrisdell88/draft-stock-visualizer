# DraftX Terminal — 2026 NFL Draft Stock Tracker

## Overview
Full-stack financial-market-style app that automatically scrapes 30+ analyst mock drafts daily, tracks ADP (Average Draft Position) changes over time, and visualizes player stock movement with a stock market UI.

## Architecture
- **Frontend**: React + Vite, Wouter routing, TanStack Query, Recharts, Framer Motion, Shadcn/UI
- **Backend**: Express + TypeScript, Drizzle ORM, PostgreSQL
- **Scrapers**: Cheerio + Axios for HTML scraping; node-cron for daily automation (6am ET)

## Database Schema (`shared/schema.ts`)
- `players` — 140 tracked prospects (auto-grows as scrapers find new players) with combine data + `imageUrl` for headshots
- `analysts` — 43 sources with accuracy weights and `sourceKey` identifiers
- `mockDrafts` — 15+ mock drafts (mocks + big boards)
- `mockDraftPicks` — 523+ individual player picks per mock (rounds 1-3 coverage)
- `adpHistory` — 4 ADP snapshots (Jan 29, Feb 20, Mar 8, Mar 15) for each player
- `odds` — sportsbook odds history (DraftKings, FanDuel, BetMGM, Caesars)
- `scrapeJobs` — tracks auto-scraper status per source (14 active scrapers)

## Key Routes
- `GET /api/players` — players with currentAdp + trend (up/down/flat) + adpChange + imageUrl
- `GET /api/players/:id/trends` — ADP history + odds history for a player
- `GET /api/players/:id/rankings` — all analyst rankings for a player
- `GET /api/analysts` — all 43 analysts sorted by accuracy weight
- `GET /api/mock-drafts` — all mock drafts
- `GET /api/scrape/status` — scrape job status + scraper registry (14 scrapers)
- `POST /api/scrape` — run all auto-scrapers now
- `POST /api/scrape/headshots` — scrape NFL.com articles for headshots only
- `POST /api/scrape/:sourceKey` — run specific scraper

## Auto-Scrapers (server/scrapers/)
14 scrapers running daily at 6am ET. All scrapers use `ensurePlayer()` for auto-player creation:
1. **walterfootball_walt** — WalterFootball Walt's mock (R1-R3, 96 picks)
2. **walterfootball_charlie** — Charlie Campbell's mock (R1-R3, 96 picks)
3. **tankathon** — Tankathon Big Board (42 picks)
4. **mddb_consensus** — NFLMDB consensus (currently blocked by site)
5. **mddb_bigboard** — NFLMDB Big Board (currently blocked by site)
6. **mcshay_report** — Todd McShay via NFLMDB (paywalled — fails)
7. **fantasypros_freedman** — Matthew Freedman via NFLMDB (currently blocked)
8. **sharp_mccrystal** — Ryan McCrystal (SharpFootball, 32 picks, full R1)
9. **sharp_donahue** — Brendan Donahue (SharpFootball, 32 picks, full R1)
10. **nfl_zierlein** — Lance Zierlein NFL.com article (25 picks)
11. **nfl_brooks** — Bucky Brooks NFL.com article (4 picks)
12. **nfl_davis** — Charles Davis NFL.com article (26 picks)
13. **nfl_jeremiah_bigboard** — Daniel Jeremiah Top-50 Big Board (NFL.com, 38 picks, boardType=bigboard)
14. **mockdraftnfl** — MockDraftNFL consensus (32 picks, full R1)

## Auto-Player Creation
All scrapers use `ensurePlayer(name, players, position, college)` from `server/scrapers/index.ts`.
When a scraper finds a player not in the DB, it auto-creates them with name + position + college.
This grew the player DB from 50 → 140 players in a single scrape session.

## Headshots
Headshot scraper (`server/scrapers/headshots.ts`) scrapes multiple NFL.com articles:
- Daniel Jeremiah Top-50 (42 unique prospects)
- Zierlein, Brooks, Davis mock draft articles
Extracts `alt="PlayerName"` + `god-prospect-headshots/{year}/{uuid}` pairs.
Currently 42/140 players have headshots. Headshots auto-update whenever NFL.com article scrapers run.
NFL.com headshot URL format: `https://static.www.nfl.com/image/private/t_official/f_auto/league/god-prospect-headshots/{year}/{uuid}`

## Big Boards
boardType field on mock_drafts: "mock" | "bigboard"
Current big boards: Tankathon (42 picks), Jeremiah Top-50 (38 picks, nfl.com)
Awaiting links for: Brugler, Kiper, McShay, and other analysts

## Startup Behavior
On server start, `ensureSourceKeysFix()` in routes.ts:
1. Patches all 43 analysts to have sourceKeys (was null for early-seeded analysts)
2. Initializes scrape_jobs for all 14 scrapers (only creates, doesn't overwrite existing success status)

## Pages
- `/` — Dashboard (ADP movers, odds signals, activity feed, ticker)
- `/players` — Players list with search, filter by position, ADP sorting
- `/players/:id` — Player detail (ADP chart, odds, combine stats, analyst rankings)
- `/mock-drafts` — Mock draft matrix (Mock/BigBoard tab toggle)
- `/big-boards` — Analyst big board rankings
- `/sources` — Sources leaderboard with scrape status for all 43 analysts

## ADP Snapshot Dates
Jan 29, Feb 20, Mar 8, Mar 12, Mar 15 (current)
`adpChange` = prevAdp - currentAdp (positive = rising stock)

## Scrapers Waiting for Links
When user provides non-paywalled URLs:
- Todd McShay (ESPN/The McShay Report)
- Mel Kiper Jr. (ESPN)
- Dane Brugler (The Athletic)
- Matthew Freedman (direct article URL, not via NFLMDB)
- Any additional mock draft or big board sources
