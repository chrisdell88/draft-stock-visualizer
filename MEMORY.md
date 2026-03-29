# MockX Project Memory

## Identity & Branding
- Product name: **MockX** (mockx.co)
- Sibling product to BracketX — same X branding, dark aesthetic, terminal feel
- Different accent color from BracketX (BracketX = cyan #00d4ff; MockX TBD — user to confirm)
- Logo: X favicon (currently using BracketX cyan X — will be differentiated)
- Browser title: "MockX — NFL Draft Consensus Tracker"

## Stack
- Frontend: React 18 + TypeScript, Tailwind CSS, Radix UI (shadcn), Recharts, Framer Motion, Wouter
- Backend: Express 5 + TypeScript, Drizzle ORM, PostgreSQL (Supabase)
- Scraping: Cheerio + Axios (static HTML), Playwright via gstack /browse (JS-rendered sites)
- Build: Vite + esbuild, deployed on Vercel
- GitHub: chrisdell88/draft-stock-visualizer (public repo)
- Live URL: mockx.co / www.mockx.co / mockx-mocha.vercel.app

## Environment Variables
- DATABASE_URL: postgresql://postgres:Draftx2026pass@db.cafhkmvhxnnlvotrlyvj.supabase.co:5432/postgres
- SESSION_SECRET: draftx-admin-secret-2026 (also admin password)
- ODDS_API_KEY: b5e6b3e773229db2fc9cb916f87d3daf (the-odds-api.com, sport: americanfootball_nfl_draft)
- CRON_SECRET: draftx-cron-2026

## Git Identity
- Name: Chris Dell
- Email: chrisdell88@gmail.com
- GitHub: chrisdell88

## Data Architecture
- Players tracked: ~50 seeded, target 200-300 for 2026 draft
- Mock draft depth: 1 round (32 picks), up to 3 rounds (~100-105 with comp picks)
- Compensatory picks start in Round 3
- ADP = average draft position across all tracked mock drafts
- Player name fuzzy matching: matchPlayer() in server/scrapers/index.ts

## Dashboard Design Vision (from user voice note 2026-03-28)
- Main table showing ALL prospects with sortable columns:
  - ADP (default sort)
  - Player name (A-Z)
  - School
  - Height, Weight
  - RAS Score
  - Highest mock position / Lowest mock position
  - Betting odds (over/under draft position props)
- Time filter tabs: All Time (since ~Mar 1) / 30D / 7D / 3D
- Market ticker scrolling at top
- Every column sortable
- Show date of each mock draft
- Player cards: click to expand — shows school, projected ADP, high/low, each analyst's pick
- Methodology page (expand on what's already in Sources & Scrapers)

## Betting Odds Display Strategy
- Pull from: DraftKings, FanDuel, BetMGM, ESPN Bet, Caesars (confirm with user)
- Display: Show the book with biggest ADP discrepancy per player (with tooltip showing all books)

## "Run All Scrapers" Button
- ADMIN ONLY — regular users should never see this

## Accuracy Tracking Sources
### The Huddle Report (thehuddlereport.com) — Gold standard since 2001
- Tracks: 2025, 5-year, all-time for mock drafts AND big boards separately
- Scoring: 1pt = right player Round 1; 2pts = right player + right team
- Data stored in Datawrapper iframe — needs headless browser to scrape
- Top performers: Jason Boris, Josh Norris, Charlie Campbell, Brendan Donahue

### WalterFootball Mock Draft Results (walterfootball.com/mockdraftresults2025.php)
- Plain HTML — easily scrapeable
- 34 analysts tracked, 9-year history
- 2025 top scores: Camenker/McShay (10), Campbell/Cherepinsky/Kelly/Miller/Norris/Prisco (9)
- 9-year leaders: Charlie Campbell (85), Walter Cherepinsky (75), Daniel Jeremiah (69)

### Other Accuracy Trackers
- FantasyPros (JS-rendered, difficult)
- NFL Mock Draft Database (JS-rendered + bot detection, very difficult)
- Grinding the Mocks (Substack — Weighted Spearman Correlation methodology)

## Mock Draft Sources (Scrapability)
### Easy (static HTML)
- NFL.com — Jeremiah, Zierlein, Brooks, Reuter, Edholm
- WalterFootball — Campbell
- CBS Sports — Prisco, Wilson

### Moderate (JS-rendered, needs Playwright)
- The Ringer — Todd McShay
- Tankathon big board
- Pro Football Network
- StickToTheModel

### Hard (paywall or heavy JS)
- The Athletic — Dane Brugler (paywall)
- ESPN — Mel Kiper (ESPN+ paywall)
- PFF Big Board (paywall)
- NFL Mock Draft Database (bot detection)

## Target Analyst Hit List (confirmed accurate performers)
Charlie Campbell, Daniel Jeremiah, Josh Norris, Todd McShay, Mel Kiper Jr., Dane Brugler,
Lance Zierlein, Matt Miller, Pete Prisco, Chad Reuter, Peter Schrager, Bucky Brooks,
Eric Edholm, Rob Rang, Tony Pauline, Jacob Camenker, Walter Cherepinsky, Danny Kelly,
Albert Breer, Trevor Sikemma — plus user's personal vetted insiders (to be provided)

## Player Data Sources
- Headshots: NFL.com / college sites (automated scrape TBD)
- RAS scores: ras.football or manual
- Measurables: NFL.com prospect tracker (static HTML)
- Historical spreadsheets: User providing XLS from previous years

## Automated Scraping Goals
- URL-to-scraper workflow: user pastes URL → system detects analyst → scrapes + adds to DB
- Google/Twitter scan to detect when tracked analysts publish new mocks
- Player name variation matching already in place via matchPlayer()

## gstack Skills Installed (global, all projects)
- /browse — headless Playwright browser (KEY for JS-rendered mock draft sites)
- /office-hours, /plan-eng-review, /review, /qa, /investigate, /retro
- /ship, /land-and-deploy, /cso (security audit)
- Install location: ~/.claude/skills/gstack

## Memory Strategy
- This MEMORY.md updates after every major session
- CLAUDE.md in project root = static project overview
- MEMORY.md here = evolving state, decisions, data
- Update both when: new analysts added, scrapers built, design decisions made

## User Preferences
- Non-technical — Claude handles ALL technical execution
- Apple-like UI/UX aesthetic
- No full rewrites — surgical changes only
- Wants app to run for years with thousands of users
- Draft is ~4 weeks away (as of 2026-03-28) — time is critical
