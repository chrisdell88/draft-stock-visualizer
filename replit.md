# DraftX Terminal — 2026 NFL Draft Stock Tracker

## Overview
Full-stack financial-market-style app that automatically scrapes 30+ analyst mock drafts daily, tracks ADP (Average Draft Position) changes over time, and visualizes player stock movement with a stock market UI.

## Architecture
- **Frontend**: React + Vite, Wouter routing, TanStack Query, Recharts, Framer Motion, Shadcn/UI
- **Backend**: Express + TypeScript, Drizzle ORM, PostgreSQL
- **Scrapers**: Cheerio + Axios for HTML scraping; node-cron for daily automation

## Database Schema (`shared/schema.ts`)
- `players` — 50 tracked prospects with combine data
- `analysts` — 41 sources with accuracy weights (Huddle Report data)
- `mockDrafts` — 8 mock drafts (DJ v1/v2/v3, GTM, MDDB, Walt 3/7, Charlie 3/9, Tankathon 3/14)
- `mockDraftPicks` — individual player picks per mock
- `adpHistory` — 4 ADP snapshots (Jan 29, Feb 20, Mar 8, Mar 15) for each player
- `odds` — sportsbook odds history (DraftKings, FanDuel, BetMGM, Caesars)
- `scrapeJobs` — tracks auto-scraper status per source

## Key Routes
- `GET /api/players` — players with currentAdp + trend (up/down/flat) + adpChange
- `GET /api/players/:id/trends` — ADP history + odds history for a player
- `GET /api/players/:id/rankings` — all analyst rankings for a player
- `GET /api/analysts` — all 41 analysts sorted by accuracy weight
- `GET /api/mock-drafts` — all mock drafts
- `GET /api/scrape/status` — scrape job status + scraper registry
- `POST /api/scrape` — run all auto-scrapers now
- `POST /api/scrape/:sourceKey` — run specific scraper

## Auto-Scrapers (server/scrapers/)
- **walterfootball_walt**: Scrapes Walt's mock (draft2026.php + draft2026_1.php)
- **walterfootball_charlie**: Scrapes Charlie's mock (draft2026charlie.php + draft2026charlie_1.php)
- **tankathon**: Scrapes Tankathon Big Board
- **mddb_consensus**: Scrapes NFL Mock Draft Database consensus
- All scrapers run daily at 6:00 AM ET via node-cron
- Idempotent: checks for existing mock draft on same day (sourceKey + date) before creating new

## Pages
- `/` — Dashboard: scrolling market ticker, biggest movers (risers/fallers with ADP Δ), position breakdown, source coverage
- `/players` — Full prospect leaderboard with position filter pills (showing count + heat), sortable by ADP/RAS/Name/Movement, stock-market signal column (BUY/SELL/HOLD), ADP movement bars
- `/big-boards` — Big boards matrix (analyst talent rankings, not team mocks)
- `/sources` — Analyst accuracy leaderboard (41 sources), scrape status cards, manual trigger buttons
- `/players/:id` — Player detail: gradient AreaChart ADP trend, split mock/big-board rankings panels, analyst divergence bars, combine stats, position rank
- `/mock-drafts` — Mock draft matrix: all sources as columns, players as rows, color-coded pick cells

## Analyst Sources (41 total)
Includes: Jason Boris (best 5-yr), Charlie Campbell (#1 in 2024), GTM Consensus, MDDB Consensus, PFF Sikkema, Sharp Donahue, ETR Daigle, ITA Amico, ESPN Kiper/Miller/Reid/Yates, NFL Jeremiah/Zierlein/Brooks/Davis/Band, SI Breer, Athletic Brugler/Standig/Feldman, UD Norris/Winks, Tankathon, and more.

## Data Model Notes
- ADP history d1=Jan 29, d2=Feb 20, d3=Mar 8, d4=Mar 15 — uses 6 sources
- Key d4 movers: Fano +4.0 (BIG RISE), Tyson +4.1, Downs +1.3, Sadiq -3.8 (FALL), Freeling -3.8
- All dates 2026+, no data before Jan 1 2026

## Dependencies
- `cheerio` — HTML parsing for scrapers
- `node-cron` — daily scrape scheduling
- `axios` — HTTP requests in scrapers
- `recharts` — ADP charts
- `framer-motion` — animations
- `drizzle-orm` + `drizzle-zod` — ORM + validation
