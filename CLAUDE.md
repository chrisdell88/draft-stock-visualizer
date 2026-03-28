# Draft X — NFL Mock Draft Consensus Tracker

## PROJECT OVERVIEW
Interactive NFL Draft analytics dashboard that aggregates mock drafts, big boards, and sportsbook odds from 40+ professional sources. Calculates consensus ADP (Average Draft Position), analyst accuracy ratings, and betting signal analysis.

## CRITICAL RULES
- This is a SEPARATE project from BracketX. Do NOT reference or modify BracketX files.
- Project folder: /Users/chrisdell/Downloads/draftx-project/
- GitHub repo: chrisdell88/draft-stock-visualizer

## TECH STACK
- Frontend: React 18 + TypeScript, Tailwind CSS, Radix UI (shadcn/ui), Recharts, Framer Motion, Wouter
- Backend: Express 5 + TypeScript, Drizzle ORM, PostgreSQL
- Scraping: Cheerio + Axios, node-cron for scheduling
- Build: Vite, tsx for dev server

## KEY ARCHITECTURE
- `shared/schema.ts` — Drizzle DB schema (players, analysts, mockDrafts, mockDraftPicks, adpHistory, odds, scrapeJobs)
- `server/scrapers/index.ts` — Scraper registry (SCRAPERS array)
- `server/storage.ts` — DatabaseStorage class with all DB operations
- `server/routes.ts` — Express API routes + seed data + cron job
- `client/src/pages/` — Dashboard, Players, PlayerDetail, Sources, MockDrafts, BigBoards, Admin

## DATA FLOW
1. Scrapers fetch HTML from source URLs
2. `matchPlayer()` fuzzy-matches scraped names to DB players
3. `ensurePlayer()` auto-creates new players if not found
4. Mock draft + picks stored in DB
5. `synthesizeAdpFromPicks()` calculates consensus ADP daily
6. Frontend fetches via REST API

## ENVIRONMENT VARIABLES NEEDED
- DATABASE_URL — PostgreSQL connection string
- SESSION_SECRET — Admin password + session secret
- ODDS_API_KEY — the-odds-api.com key (b5e6b3e773229db2fc9cb916f87d3daf)

## DEPLOYMENT
- Local dev: `npm run dev` (port 5000)
- Build: `npm run build` → `npm start`
- Target: GitHub Pages or similar static host + separate API server
- Goal: Public launch by April 3, 2026

## ODDS API
- Provider: the-odds-api.com
- Key: b5e6b3e773229db2fc9cb916f87d3daf
- Sport key: basketball_ncaab (for BracketX) / americanfootball_nfl_draft (for Draft X)
- Same API key works across projects — it's account-level, not project-level

## USER PREFERENCES
- Non-technical user, learning Claude Code
- Prefers clean, working code over quick hacks
- Goal: launch publicly by Thursday April 3, 2026
- Apple-like UI/UX aesthetic
- Wants thorough analysis and questions, not assumptions
