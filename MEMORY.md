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

## Current state (2026-04-19, 4 days pre-draft)

### In progress
- **MDDB accuracy-data coverage audit.** User confirmed MDDB source totals per year: 2021=1,312 / 2022=1,379 / 2023=1,529 / 2024=1,514 / 2025=1,530 submissions. We only have top ~100–240 submissions ingested per year (unique analysts after dedup: 178 / 88 / 105 / 111 / 82). The note inside `nflmdd-historical.json` claiming "full data 2021–2024" does not match reality — we likely have pages 1–4 only, losing 200–600 unique analysts per year.
- Goal: re-scrape all pages × 5 years, dedupe by analyst name, keep best score per analyst per year, reseed `analyst_accuracy_scores` for `site='nflmdd'`, then `recompute-xscores.mjs`.
- MDDB has bot protection — plain curl gets redirected to `/restricted`. Our existing scraper uses `fetchHtml` which has headers; needs to be tested against `/mock-drafts/YEAR/final-scores?page=N`.

### Known good (do NOT re-scrape)
- WalterFootball 2021–2025 — complete (WF only has ~30/year, take-everyone site): `seed-wf-historical.mjs` + `seed-accuracy.mjs` lines 216–251
- FantasyPros 2021–2025 — user confirmed counts are correct as-is (`fp-{year}.tsv` files)
- THR 2021–2025 — user confirmed correct (`thr-5year.csv`, 174 analysts × 5 years, source: thehuddlereport.com/mock-5-year)

### Next session (after device setup is done)
1. Test `fetchHtml` against one MDDB final-scores page to confirm scraping is viable
2. If viable: write one-off paginated scraper for all 5 years
3. Dedupe, reseed, recompute x-scores
4. Verify counts on live Supabase match what's on mockx.co

### Not started
- Verifying live mockx.co data matches `server/data/accuracy/*` source files end-to-end
- Draft-day plan / post-draft accuracy grading workflow for 2026
