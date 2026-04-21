# mockx — Project Memory

**Last updated:** 2026-04-19
**Repo:** https://github.com/chrisdell88/mockx
**Production:** mockx.co (Vercel auto-deploys from `main`)
**Database:** Supabase (aws-1-us-east-2 pooler) — see `.env.example`

## Session start protocol
1. `cd ~/Projects/mockx`
2. `git pull`
3. Read this file top to bottom
4. `git log --oneline -10` for recent commits

## Session end protocol (REQUIRED — workflow rule #2)
1. Commit all changes
2. Push to `main`
3. Update the "Current state" section below with what changed / what's next
4. Commit + push MEMORY.md

Nothing stays uncommitted on a single device. If you see uncommitted local changes at session start, ask before touching them.

## Key dates
- **2026 NFL Draft: Thursday, April 23, 2026** — site is built around this
- Site has been live publicly well before April 2026 (launch target `2026-04-03` in CLAUDE.md is historical, not draft date)

## Accuracy-data year model (CRITICAL — don't confuse)
- "Year N" in `server/data/accuracy/*` = post-draft results from the **April-of-year-N** NFL Draft
- Accuracy data only exists for *completed* drafts
- As of 2026-04-19, latest completed = **2025 NFL Draft** (April 2025) → "2025" data is final, not in-progress
- 2026 accuracy will not exist until after 2026-04-23
- Target historical coverage: 5 completed draft years = **2021, 2022, 2023, 2024, 2025**

## Per-device setup (one-time, required for running code locally)
GitHub syncs code/docs. These do NOT sync via GitHub (by design — secrets stay local):
1. Install **Node.js LTS** (nodejs.org → LTS `.pkg`)
2. `cd ~/Projects/mockx && npm install`
3. Create `.env` in repo root with 4 vars — pull from Vercel dashboard or 1Password:
   - `DATABASE_URL` (Supabase pooler URL)
   - `SESSION_SECRET`
   - `ODDS_API_KEY` (the-odds-api.com, account-level key)
   - `CRON_SECRET`
4. Verify: `npm run dev` boots server on :5000

Until the 4 steps above are done on a given device, you can only do **code edits + git push** from it — *not* running seeds or querying Supabase.

## Memory location policy
- **Durable, cross-device facts** → this file (`MEMORY.md`), committed to GitHub
- **Device-local scratch** → `~/.claude/projects/.../memory/` (ephemeral, per-device, don't rely on it across devices)

## Current state (2026-04-20, 3 days pre-draft)

### Just shipped (2026-04-20)
- **MDDB full 5-year scrape:** `scrape-nflmdd-all.mjs` pulls all pages via Googlebot UA (bypasses bot detection; robots.txt allows it). Output: `nflmdd-full.json` (7MB, ~2,144 unique analyst-years across 2021–2025). Detailed counts: 444/417/435/436/411.
- **Live DB reseeded:** `seed-nflmdd-full.mjs` replaced 354 old nflmdd rows with 2,143 new rows; auto-created 845 new analyst records.
- **X-score 3-year rule:** `recompute-xscores.mjs` now requires ≥3 DISTINCT draft years (not site-years) + 2025 data. Before: 584 ranked (164 were one-hit wonders at top). After: 344 ranked, all with sustained multi-year presence. Analysts with <3 distinct years keep raw per-year scores but `x_score`/`x_score_rank` = NULL.
- **Live ADP refresh:** `scripts/run-scrapers-now.ts` runs all 13 scrapers + `synthesizeAdpFromPicks()` against live Supabase. 56 sec end-to-end. Use this as a manual trigger — see KNOWN ISSUE below.

### KNOWN ISSUE — prod cron was broken (FIXED 2026-04-20 late)
- `POST /api/internal/cron` was returning 500: `Cannot find module '/var/task/server/scrapers/index'`.
- Root cause: the handler used `await import("../server/scrapers/index")` (dynamic imports). Vercel's bundler doesn't follow dynamic imports reliably, so the files weren't packaged into the serverless function.
- Fix: hoisted to static imports at the top of `api/index.ts`. Vercel now bundles server/scrapers/ and server/storage into the function.
- Cron is wired via `vercel.json` at `0 11 * * *` UTC (7am ET DST) hitting `/api/internal/cron`.
- Manual on-demand trigger still works: `npx tsx scripts/run-scrapers-now.ts`.

### KNOWN FOOTGUN — parallel X-score implementations
- Production uses `api/index.ts` (Vercel serverless function). Local dev uses `server/storage.ts`. Both have their own `/accuracy/leaderboard` logic with duplicate site/year weights and qualification rules.
- When the 3-year rule was added to `recompute-xscores.mjs` + `server/storage.ts`, the live site still showed Freddy Branson #1 for hours because `api/index.ts` was missed. Headers on both files warn future-us.
- Post-draft TODO: extract to `shared/xscore.ts` and import from both. Risky to do now (3 days pre-draft) — leave it.

### Known good (do NOT re-scrape)
- WalterFootball 2021–2025 — complete (WF only has ~30/year, take-everyone site): `seed-wf-historical.mjs` + `seed-accuracy.mjs` lines 216–251
- FantasyPros 2021–2025 — user confirmed counts are correct as-is (`fp-{year}.tsv` files)
- THR 2021–2025 — user confirmed correct (`thr-5year.csv`, 174 analysts × 5 years, source: thehuddlereport.com/mock-5-year)
- MDDB 2021–2025 — FULL DATA now in `nflmdd-full.json` + live DB (2026-04-20 scrape)

### Not started
- Verifying live mockx.co data matches `server/data/accuracy/*` source files end-to-end
- Draft-day plan / post-draft accuracy grading workflow for 2026

### Pending user discussion (after MDDB work lands)
- **X-score formula changes** — user wants to revisit the weighting in `recompute-xscores.mjs` (current: site weights `thr:1, fp:1, wf:0.5, nflmdd:1, thr_bigboard:1`; year weights `2025:3.25, 2024:2, 2023:1.5, 2022:1, 2021:0.75`; 2025 data required to qualify)
- **ADP source selection** — decide which mock-draft sources feed the live consensus ADP shown on mockx.co. Currently wired scrapers (`server/scrapers/index.ts` SCRAPERS array) include walterfootball_walt/charlie, mddb_consensus, mddb_bigboard, mcshay_report, fantasypros_freedman, etc. Review for quality/weighting.
