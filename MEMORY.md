# MockX Project Memory

## Identity & Branding
- Product name: **MockX** (mockx.co)
- Sibling product to BracketX — same X branding, dark aesthetic, terminal feel
- GitHub: chrisdell88/draft-stock-visualizer (public)
- Live URL: mockx.co / www.mockx.co / mockx-mocha.vercel.app

## Stack
- Frontend: React 18 + TypeScript, Tailwind CSS, Radix UI (shadcn), Recharts, Framer Motion, Wouter v3
- Backend: Vercel serverless (`api/index.ts`) using raw `pg.Pool` — NOT Express/Drizzle
- Database: Supabase PostgreSQL (us-east-2), pooler URL required (Vercel can't resolve direct hostname)
- Build: Vite + esbuild, deployed on Vercel via git push
- Scraping: Cheerio + Axios (static HTML), Playwright via gstack /browse (JS-rendered)

## CRITICAL: Database Connection
- Must use TRANSACTION POOLER URL (not direct `db.<ref>.supabase.co`)
- DATABASE_URL: stored in Vercel env vars + local .env only — NOT in code
- Supabase project ref: `cafhkmvhxnnlvotrlyvj` (us-east-2 region)
- Format: `postgresql://postgres.cafhkmvhxnnlvotrlyvj:[PASSWORD]@aws-1-us-east-2.pooler.supabase.com:6543/postgres`

## Environment Variables
- DATABASE_URL: in Vercel env + local .env (never hardcode in scripts)
- SESSION_SECRET / admin password: in Vercel env
- ODDS_API_KEY: b5e6b3e773229db2fc9cb916f87d3daf (the-odds-api.com, sport key: `americanfootball_nfl_draft`)
- CRON_SECRET: in Vercel env

## Git Identity
- Name: Chris Dell / Email: chrisdell88@gmail.com

## API Architecture (`api/index.ts`)
- Single Vercel serverless function handles ALL routes
- Uses raw `pg.Pool` (not Drizzle ORM) → returns snake_case from DB → must manually camelCase in responses
- Key routes: /players, /players/:id, /players/:id/trends, /players/:id/rankings, /players/:id/positionrank
- /adp-windows (change3d, change7d, change30d, changeAll), /accuracy/leaderboard, /activity, /mock-drafts
- /api/odds/status checks The Odds API for americanfootball_nfl_draft
- /activity supports ?limit=N and ?boardType=mock|bigboard params

## X Score Formula (CURRENT — weighted, computed on-the-fly in API)
- Site weights: THR = 3×, FP = 2×, WF = 1×
- Year weights: 2025 = 3×, 2024 = 2×, 2023 = 1.5×, 2022 = 1×, 2021 = 0.75×
- Combined entry weight = site_weight × year_weight
- xScore = sum(z_score × combined_weight) / sum(combined_weight)
- Min 2 site-years to qualify (pending user confirmation if we want to lower to 1)
- Computed fresh per API request in /accuracy/leaderboard (no stored score used)

## Database Tables
- `players` — 143 players, has image_url, ras_score, combine stats
- `mock_drafts` — source metadata (source_name, source_key, board_type, published_at, url)
- `mock_draft_picks` — player_id, mock_draft_id, pick_number
- `analysts` — id, name, outlet, source_key, accuracy_weight, x_score, x_score_rank
- `adp_history` — player_id, adp_value, date (snapshots since Feb 1, 2026)
- `analyst_accuracy_scores` — analyst_id, site (thr/fp/wf), year, raw_score, site_rank, z_score
- `odds` — player_id, date, bookmaker, market_type, odds (American)
- `scrape_jobs` — source_key, status, last_run, error

## Data State (as of 2026-04-05)
- 137 players tracked (removed 3 confirmed 2025 draftees + 3 duplicate entries)
- 70 mock drafts (added WalterFootball bigboard + Tankathon bigboard)
- 43 players have headshots; 94 still missing
- 37 players have RAS scores (2026 class not yet on ras.football — re-run when available)
- 2025 NFLMDD accuracy data seeded (107 entries, pages 1-4)
- Weighting formula: THR 3×/FP 2×/WF 1× with year multipliers; must have 2025 entry to qualify

## Mock Draft Sources Currently Tracked (scraped)
- NFL.com: Jeremiah, Zierlein, Brooks, Reuter, Edholm
- WalterFootball: Campbell
- CBS Sports: Prisco, Wilson
- Sharp Football, MockDraftNFL, Tankathon, MDDB consensus+McShay
- 48 total mock drafts in DB as of 2026-04-04

## Pending: 12 Mock Draft URLs from Chris (awaiting)
Still waiting on: Mel Kiper Jr., Jordan Reid, Field Yates, Peter Schrager, Dane Brugler,
Hayden Winks, Josh Norris, John Daigle, Cory Rindone, Jason Boris, Todd McShay alt, Matthew Freedman alt

## Key Fixes Completed (session 2026-04-04)
- Ticker: rAF pixel-based loop (was broken CSS translateX% — percentage is relative to offsetWidth, not scrollWidth); drag-to-scroll added
- Player detail blank page: fixed by switching useRoute → useParams (wouter v3 API)
- Dashboard: ● System Online + last-updated timestamps in header AND footer
- Window selector: 3D/7D/30D/ALL tabs (ALL falls back to 30D data)
- Position breakdown: clean QB·6 boxes, no arrows, click → /players?position=QB
- ADP description: now shows mockDraftCount + accuracy-weighted attribution
- Activity API: now respects ?limit= and ?boardType= params
- positionrank endpoint added (/api/players/:id/positionrank)
- changeAll added to /api/adp-windows (full-period ADP change)
- Accuracy page: V-A/V-B removed, sortable columns, search bar, analyst pop-up card, site counts
- BigBoards/MockDrafts: Sources Key modal, sortable columns

## Key Fixes Completed (session 2026-04-05)
- X Score qualification: now requires at least 1 entry from 2025 (was min 2 site-years)
- DB cleanup: removed 2025 draftees TreVeyon Henderson, Jack Bech, Jarquez Hunter
- DB cleanup: merged duplicate player entries (Max Iheanachor ×3→1, KC Concepcion ×2→1)
- BigBoards: prospect search bar; OL umbrella (OT/OG/IOL/G/C), DL umbrella (EDGE/DE/DT); correct position order QB/RB/WR/TE/OL/DL/LB/CB/S
- MockDrafts: prospect search bar; same OL/DL consolidation; column headers rotated 90° (no more overlap)
- Ticker: "7D" label added at left edge
- scrape-headshots.mjs: expanded to 24 NFL.com source URLs (43/137 players now have photos)
- scrape-walterfootball-bigboard.cjs: WalterFootball big board scraper (26 picks, full coverage)
- scrape-tankathon-bigboard.cjs: Tankathon big board scraper as board_type=bigboard (109 picks)
- scrape-cbs-mockdraft.cjs: CBS Sports scraper stub (blocked by WAF, needs puppeteer or direct URLs)

## Pending Tasks
- Daily scheduled scraping cron (not yet set up)
- Mock draft URLs from Chris (12 analysts): Jason Boris, Chris Dell, Albert Breer, Field Yates, Jordan Reid, Peter Schrager, Josh Norris, Hayden Winks, John Daigle, Mel Kiper, Dane Brugler, Cory Rindone
- Big board URLs from Chris (10 boards): Hasan/Wide Left, Thor/FantasyLife, Winks/ETR, Athletic Staff, Brugler T100, R. Esch/THR, Xavier/FF Metrics, Carter/Post-Gazette, Kiper/ESPN+, Feldman Freaks
- CBS Sports Prisco + Wilson: needs puppeteer OR direct article URLs from Chris (WAF blocks server-side)
- Player photos: 94/137 still missing — scrape-headshots.mjs already at max NFL.com coverage; need other sources
- RAS scores: re-run when ras.football/2026-nfl-draft-class/ exists
- Sportsbook placeholder auto-activates when Odds API adds americanfootball_nfl_draft (~Apr 10)
- Player Profiler data: college dominator, breakout age, comparable player
- Analyst page: hyperlinks from player cards to analyst mock draft URLs
- Activity feed feature: add "feature updates" type for announcements

## User Preferences
- Non-technical — Claude handles ALL technical execution
- Apple-like UI/UX aesthetic
- No full rewrites — surgical changes only
- Wants app to run for years with thousands of users
- NFL Draft: April 24, 2026

## Accuracy Tracking Sources
### The Huddle Report (THR) — Gold standard since 2001
- 1pt = right player Round 1; 2pts = right player + right team (max 96)
- Jason Boris historically #1, strong recent years

### FantasyPros (FP) — 4 categories × 32 picks = 320 max

### WalterFootball (WF) — correct player+team matches (max 32)
- Smaller pool than THR/FP; ~30-40 analysts tracked
- Charlie Campbell consistently #1 here

### NFLMDD — seeded 2021-2025 (107 entries for 2025)

## Scraper Notes
- NFLMDB: Googlebot UA bypasses bot detection; data-react-props contains full SSR JSON
- NFLMDD 2025: seeded from nflmdd-historical.json (107 entries)
- scrape-headshots.mjs: uses NFL.com article pages (needs more HEADSHOT_SOURCES added)
- scrape-ras.mjs: uses ras.football Ninja Tables AJAX endpoint (2025 class for now)
