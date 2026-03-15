# DraftX Terminal — 2026 NFL Draft Stock Tracker

## Overview
Full-stack financial-market-style app that automatically scrapes 30+ analyst mock drafts daily, tracks ADP (Average Draft Position) changes over time, and visualizes player stock movement with a stock market UI.

## Architecture
- **Frontend**: React + Vite, Wouter routing, TanStack Query, Recharts, Framer Motion, Shadcn/UI
- **Backend**: Express + TypeScript, Drizzle ORM, PostgreSQL
- **Scrapers**: Cheerio + Axios for HTML scraping; node-cron for daily automation (6am ET)

## Database Schema (`shared/schema.ts`)
- `players` — 50 tracked prospects with combine data + `imageUrl` for headshots
- `analysts` — 43 sources with accuracy weights and `sourceKey` identifiers
- `mockDrafts` — 15 mock drafts including 6 new scrapers (Sharp, NFL.com, MockDraftNFL)
- `mockDraftPicks` — individual player picks per mock (picks 1-100 covering rounds 1-3)
- `adpHistory` — 4 ADP snapshots (Jan 29, Feb 20, Mar 8, Mar 15) for each player
- `odds` — sportsbook odds history (DraftKings, FanDuel, BetMGM, Caesars)
- `scrapeJobs` — tracks auto-scraper status per source (13 active scrapers)

## Key Routes
- `GET /api/players` — players with currentAdp + trend (up/down/flat) + adpChange + imageUrl
- `GET /api/players/:id/trends` — ADP history + odds history for a player
- `GET /api/players/:id/rankings` — all analyst rankings for a player
- `GET /api/analysts` — all 43 analysts sorted by accuracy weight
- `GET /api/mock-drafts` — all mock drafts
- `GET /api/scrape/status` — scrape job status + scraper registry
- `POST /api/scrape` — run all auto-scrapers now
- `POST /api/scrape/:sourceKey` — run specific scraper
- `GET /api/discrepancy` — ADP vs sportsbook odds betting signals
- `GET /api/activity` — recent mock draft activity feed

## Auto-Scrapers (server/scrapers/)
13 scrapers running daily at 6am ET:
1. **walterfootball_walt** — WalterFootball Walt's mock (data-number selector, R1-R3)
2. **walterfootball_charlie** — Charlie Campbell's mock (same site, R1-R3)
3. **tankathon** — Tankathon Big Board (puppeteer/cheerio)
4. **mddb_consensus** — NFLMDB consensus (HTML entity decode + JSON parse)
5. **mddb_bigboard** — NFLMDB Big Board consensus
6. **mcshay_report** — Todd McShay via NFLMDB (paywalled — may fail)
7. **fantasypros_freedman** — Matthew Freedman via NFLMDB (may be rate-limited)
8. **sharp_mccrystal** — Ryan McCrystal (SharpFootball h3 regex, 19 picks)
9. **sharp_donahue** — Brendan Donahue (SharpFootball h3 regex, 19 picks)
10. **nfl_zierlein** — Lance Zierlein NFL.com article (sequential headshots, 14 picks)
11. **nfl_brooks** — Bucky Brooks NFL.com article (4 picks + headshots)
12. **nfl_davis** — Charles Davis NFL.com article (15 picks + headshots)
13. **mockdraftnfl** — MockDraftNFL consensus (h2 team+player structure, 19 picks)

## Headshots
NFL.com article scrapers auto-populate `players.imageUrl` with official headshot URLs:
`https://static.www.nfl.com/image/private/t_official/f_auto/league/god-prospect-headshots/{year}/{uuid}`
Currently 17 players have headshots. PlayerCard and PlayerDetail show circular headshots with initials fallback.

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

## Key Frontend Components
- `PlayerCard.tsx` — player card with circular headshot + ADP trend
- `Layout.tsx` — app shell with sidebar nav + scrolling ticker
- `Sidebar.tsx` — navigation sidebar
- Activity feed drawer — floating drawer showing recent scrape activity
