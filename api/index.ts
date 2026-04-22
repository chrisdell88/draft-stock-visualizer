import type { VercelRequest, VercelResponse } from "@vercel/node";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const path = url.pathname.replace(/^\/api/, "");

  try {
    if (path === "/players" || path === "/players/") {
      // Windowed ADP: compute per-player ADP across 5 time windows (L24/L3/L7/L30/All)
      // filtered to only picks from qualifying analysts:
      //   - x_score_rank ≤ 150 (auto, top individual accuracy performers), OR
      //   - manually_included_in_adp = true (user-whitelisted individuals + aggregates)
      // currentAdp preserved for backward compat: falls back L24 → L3 → L7 → L30 → All.
      // adpChange is L24 vs. L7 (today's consensus vs. last-week consensus).
      const result = await pool.query(`
        WITH qualifying_picks AS (
          SELECT mdp.player_id, mdp.pick_number, md.published_at
          FROM mock_draft_picks mdp
          JOIN mock_drafts md ON md.id = mdp.mock_draft_id
          JOIN analysts a ON a.id = md.analyst_id
          WHERE a.x_score_rank <= 150 OR a.manually_included_in_adp = true
        ),
        player_adps AS (
          SELECT player_id,
            AVG(pick_number) FILTER (WHERE published_at >= NOW() - INTERVAL '24 hours')::numeric AS adp_l24,
            COUNT(*) FILTER (WHERE published_at >= NOW() - INTERVAL '24 hours')::int AS n_l24,
            AVG(pick_number) FILTER (WHERE published_at >= NOW() - INTERVAL '3 days')::numeric AS adp_l3,
            COUNT(*) FILTER (WHERE published_at >= NOW() - INTERVAL '3 days')::int AS n_l3,
            AVG(pick_number) FILTER (WHERE published_at >= NOW() - INTERVAL '7 days')::numeric AS adp_l7,
            COUNT(*) FILTER (WHERE published_at >= NOW() - INTERVAL '7 days')::int AS n_l7,
            AVG(pick_number) FILTER (WHERE published_at >= NOW() - INTERVAL '30 days')::numeric AS adp_l30,
            COUNT(*) FILTER (WHERE published_at >= NOW() - INTERVAL '30 days')::int AS n_l30,
            AVG(pick_number)::numeric AS adp_all,
            COUNT(*)::int AS n_all
          FROM qualifying_picks
          GROUP BY player_id
        )
        SELECT p.*,
          adps.adp_l24, adps.n_l24,
          adps.adp_l3, adps.n_l3,
          adps.adp_l7, adps.n_l7,
          adps.adp_l30, adps.n_l30,
          adps.adp_all, adps.n_all,
          COALESCE(adps.adp_l24, adps.adp_l3, adps.adp_l7, adps.adp_l30, adps.adp_all) AS current_adp,
          CASE
            WHEN adps.adp_l24 IS NOT NULL AND adps.adp_l7 IS NOT NULL
            THEN (adps.adp_l7 - adps.adp_l24)
            ELSE NULL
          END AS adp_change,
          CASE
            WHEN adps.adp_l24 IS NOT NULL AND adps.adp_l7 IS NOT NULL AND (adps.adp_l7 - adps.adp_l24) > 0.2 THEN 'up'
            WHEN adps.adp_l24 IS NOT NULL AND adps.adp_l7 IS NOT NULL AND (adps.adp_l7 - adps.adp_l24) < -0.2 THEN 'down'
            ELSE 'flat'
          END AS trend
        FROM players p
        LEFT JOIN player_adps adps ON adps.player_id = p.id
        ORDER BY COALESCE(adps.adp_l24, adps.adp_l3, adps.adp_l7, adps.adp_l30, adps.adp_all) ASC NULLS LAST
      `);
      const toNum = (v: any) => v !== null && v !== undefined ? Number(v) : null;
      const players = result.rows.map((r: any) => ({
        ...r,
        currentAdp: toNum(r.current_adp),
        adpChange: toNum(r.adp_change),
        adpL24: toNum(r.adp_l24), nL24: r.n_l24 ?? 0,
        adpL3: toNum(r.adp_l3), nL3: r.n_l3 ?? 0,
        adpL7: toNum(r.adp_l7), nL7: r.n_l7 ?? 0,
        adpL30: toNum(r.adp_l30), nL30: r.n_l30 ?? 0,
        adpAll: toNum(r.adp_all), nAll: r.n_all ?? 0,
        imageUrl: r.image_url ?? null,
        rasScore: toNum(r.ras_score),
        fortyYard: toNum(r.forty_yard),
        benchPress: r.bench_press ?? null,
        verticalJump: toNum(r.vertical_jump),
        broadJump: r.broad_jump ?? null,
        coneDrill: toNum(r.cone_drill),
        shuttleRun: toNum(r.shuttle_run),
        comparablePlayer: r.comparable_player ?? null,
        dominatorRating: toNum(r.dominator_rating),
        breakoutAge: toNum(r.breakout_age),
        playerProfilerUrl: r.player_profiler_url ?? null,
      }));
      return res.json(players);
    }

    if (path === "/analysts" || path === "/analysts/") {
      const result = await pool.query("SELECT * FROM analysts ORDER BY accuracy_weight DESC NULLS LAST");
      return res.json(result.rows.map((r: any) => ({
        ...r,
        accuracyWeight: r.accuracy_weight,
        isConsensus: r.is_consensus,
        sourceKey: r.source_key,
        scrapeUrl: r.scrape_url,
        huddleScore2025: r.huddle_score_2025,
        huddleScore5Year: r.huddle_score_5_year,
        scraperType: r.scraper_type,
        boardType: r.board_type,
        xScore: r.x_score !== null ? Number(r.x_score) : null,
        xScoreRank: r.x_score_rank,
        xScoreSitesCount: r.x_score_sites_count,
        xScoreLastUpdated: r.x_score_last_updated,
      })));
    }

    if (path === "/mock-drafts" || path === "/mock-drafts/") {
      const result = await pool.query("SELECT * FROM mock_drafts ORDER BY id DESC");
      return res.json(result.rows);
    }

    if (path.startsWith("/players/") && path.split("/").length === 3) {
      const id = parseInt(path.split("/")[2]);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid player ID" });
      // Include windowed ADPs (same filter + formula as /players list) so the
      // detail page respects the active window toggle too.
      const result = await pool.query(`
        WITH qualifying_picks AS (
          SELECT mdp.player_id, mdp.pick_number, md.published_at
          FROM mock_draft_picks mdp
          JOIN mock_drafts md ON md.id = mdp.mock_draft_id
          JOIN analysts a ON a.id = md.analyst_id
          WHERE (a.x_score_rank <= 150 OR a.manually_included_in_adp = true)
            AND mdp.player_id = $1
        ),
        adps AS (
          SELECT
            AVG(pick_number) FILTER (WHERE published_at >= NOW() - INTERVAL '24 hours')::numeric AS adp_l24,
            COUNT(*) FILTER (WHERE published_at >= NOW() - INTERVAL '24 hours')::int AS n_l24,
            AVG(pick_number) FILTER (WHERE published_at >= NOW() - INTERVAL '3 days')::numeric AS adp_l3,
            COUNT(*) FILTER (WHERE published_at >= NOW() - INTERVAL '3 days')::int AS n_l3,
            AVG(pick_number) FILTER (WHERE published_at >= NOW() - INTERVAL '7 days')::numeric AS adp_l7,
            COUNT(*) FILTER (WHERE published_at >= NOW() - INTERVAL '7 days')::int AS n_l7,
            AVG(pick_number) FILTER (WHERE published_at >= NOW() - INTERVAL '30 days')::numeric AS adp_l30,
            COUNT(*) FILTER (WHERE published_at >= NOW() - INTERVAL '30 days')::int AS n_l30,
            AVG(pick_number)::numeric AS adp_all,
            COUNT(*)::int AS n_all
          FROM qualifying_picks
        )
        SELECT p.*,
          adps.adp_l24, adps.n_l24, adps.adp_l3, adps.n_l3,
          adps.adp_l7, adps.n_l7, adps.adp_l30, adps.n_l30,
          adps.adp_all, adps.n_all,
          COALESCE(adps.adp_l24, adps.adp_l3, adps.adp_l7, adps.adp_l30, adps.adp_all) AS current_adp
        FROM players p
        LEFT JOIN adps ON true
        WHERE p.id = $1
      `, [id]);
      if (result.rows.length === 0) return res.status(404).json({ message: "Player not found" });
      const r = result.rows[0];
      const toNum = (v: any) => v !== null && v !== undefined ? Number(v) : null;
      return res.json({
        ...r,
        currentAdp: toNum(r.current_adp),
        adpL24: toNum(r.adp_l24), nL24: r.n_l24 ?? 0,
        adpL3: toNum(r.adp_l3), nL3: r.n_l3 ?? 0,
        adpL7: toNum(r.adp_l7), nL7: r.n_l7 ?? 0,
        adpL30: toNum(r.adp_l30), nL30: r.n_l30 ?? 0,
        adpAll: toNum(r.adp_all), nAll: r.n_all ?? 0,
        imageUrl: r.image_url ?? null,
        rasScore: toNum(r.ras_score),
        fortyYard: toNum(r.forty_yard),
        benchPress: r.bench_press ?? null,
        verticalJump: toNum(r.vertical_jump),
        broadJump: r.broad_jump ?? null,
        coneDrill: toNum(r.cone_drill),
        shuttleRun: toNum(r.shuttle_run),
        comparablePlayer: r.comparable_player ?? null,
        dominatorRating: toNum(r.dominator_rating),
        breakoutAge: toNum(r.breakout_age),
        playerProfilerUrl: r.player_profiler_url ?? null,
        age: toNum(r.age),
        handSize: r.hand_size ?? null,
        collegeQbrPct: r.college_qbr_pct ?? null,
        collegeYpaPct: r.college_ypa_pct ?? null,
        breakoutAgePct: r.breakout_age_pct ?? null,
      });
    }

    if (path.startsWith("/players/") && path.endsWith("/trends")) {
      const id = parseInt(path.split("/")[2]);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid player ID" });
      const adpResult = await pool.query("SELECT * FROM adp_history WHERE player_id = $1 ORDER BY date ASC", [id]);
      const oddsResult = await pool.query("SELECT * FROM odds WHERE player_id = $1 ORDER BY date DESC", [id]);
      const adp = adpResult.rows.map((r: any) => ({
        ...r,
        playerId: r.player_id,
        adpValue: r.adp_value !== null ? Number(r.adp_value) : null,
      }));
      const odds_out = oddsResult.rows.map((r: any) => ({
        ...r,
        playerId: r.player_id,
        marketType: r.market_type,
        fetchedAt: r.fetched_at,
      }));
      return res.json({ adp, odds: odds_out });
    }

    if (path.startsWith("/players/") && path.endsWith("/adp")) {
      const id = parseInt(path.split("/")[2]);
      const result = await pool.query("SELECT * FROM adp_history WHERE player_id = $1 ORDER BY date ASC", [id]);
      return res.json(result.rows);
    }

    if (path.startsWith("/players/") && path.endsWith("/odds")) {
      const id = parseInt(path.split("/")[2]);
      const result = await pool.query("SELECT * FROM odds WHERE player_id = $1 ORDER BY date DESC", [id]);
      return res.json(result.rows);
    }

    if (path.startsWith("/players/") && path.endsWith("/positionrank")) {
      const id = parseInt(path.split("/")[2]);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid player ID" });
      const result = await pool.query(`
        WITH target AS (
          SELECT p.id, p.position,
            (SELECT adp_value FROM adp_history WHERE player_id = p.id ORDER BY date DESC LIMIT 1) AS adp
          FROM players p WHERE p.id = $1
        ),
        ranked AS (
          SELECT p.id, p.position,
            (SELECT adp_value FROM adp_history WHERE player_id = p.id ORDER BY date DESC LIMIT 1) AS adp
          FROM players p
          WHERE p.position = (SELECT position FROM target)
        ),
        with_rank AS (
          SELECT id, position, adp,
            RANK() OVER (ORDER BY adp ASC NULLS LAST) AS pos_rank,
            COUNT(*) OVER () AS pos_total
          FROM ranked
          WHERE adp IS NOT NULL
        )
        SELECT pos_rank AS rank, pos_total AS total, position
        FROM with_rank WHERE id = $1
      `, [id]);
      if (result.rows.length === 0) return res.json({ rank: null, total: null, position: null });
      const r = result.rows[0];
      return res.json({ rank: Number(r.rank), total: Number(r.total), position: r.position });
    }

    if (path.startsWith("/players/") && path.endsWith("/rankings")) {
      const id = parseInt(path.split("/")[2]);
      const result = await pool.query(`
        SELECT md.source_name, md.source_key, md.board_type, md.analyst_id, mdp.pick_number, md.published_at
        FROM mock_draft_picks mdp
        JOIN mock_drafts md ON md.id = mdp.mock_draft_id
        WHERE mdp.player_id = $1
        ORDER BY mdp.pick_number ASC
      `, [id]);
      return res.json(result.rows.map((r: any) => ({
        ...r,
        sourceName: r.source_name,
        sourceKey: r.source_key,
        boardType: r.board_type,
        analystId: r.analyst_id,
        pickNumber: r.pick_number,
        publishedAt: r.published_at,
      })));
    }

    if (path === "/accuracy/leaderboard/xb" || path === "/accuracy/leaderboard/xb/") {
      // Version B: THR weighted 1.5x
      const analysts_result = await pool.query(`
        SELECT a.id, a.name, a.outlet,
          a.x_score, a.x_score_rank, a.x_score_sites_count
        FROM analysts a
        WHERE a.x_score IS NOT NULL
        ORDER BY a.x_score DESC NULLS LAST
      `);
      // Recompute with THR 1.5x weight using raw scores
      const scoresResult = await pool.query(`
        SELECT analyst_id, site, year, z_score
        FROM analyst_accuracy_scores
        WHERE z_score IS NOT NULL
      `);
      const scoresByAnalyst: Record<number, Array<{ site: string; year: number; z_score: number }>> = {};
      for (const row of scoresResult.rows) {
        if (!scoresByAnalyst[row.analyst_id]) scoresByAnalyst[row.analyst_id] = [];
        scoresByAnalyst[row.analyst_id].push({ site: row.site, year: row.year, z_score: Number(row.z_score) });
      }
      const xbRows = analysts_result.rows.map((a: any) => {
        const scores = scoresByAnalyst[a.id] ?? [];
        if (scores.length < 2) return null;
        let total = 0, count = 0;
        for (const s of scores) {
          const w = s.site === 'thr' ? 1.5 : 1.0;
          total += s.z_score * w;
          count += w;
        }
        const x_thr15 = count > 0 ? total / count : 0;
        return { id: a.id, name: a.name, outlet: a.outlet, n: scores.length, x_thr15, rank_b: 0 };
      }).filter(Boolean).sort((a: any, b: any) => b.x_thr15 - a.x_thr15).map((r: any, i: number) => ({ ...r, rank_b: i + 1 }));
      return res.json(xbRows);
    }

    if (path === "/accuracy/leaderboard" || path === "/accuracy/leaderboard/") {
      // ═══════════════════════════════════════════════════════════════════════
      // ⚠️  DUPLICATED LOGIC — KEEP IN SYNC with:
      //     - server/storage.ts `getAccuracyLeaderboard` (local dev path)
      //     - server/data/accuracy/recompute-xscores.mjs (writes to analysts table)
      // If you change site weights, year weights, or qualification rules, update
      // all three or behavior diverges between local dev, prod API, and the
      // stored a.x_score column. Production (THIS file) is what mockx.co runs.
      // TODO post-draft: extract to shared/xscore.ts.
      // ═══════════════════════════════════════════════════════════════════════
      const _minYears = parseInt(url.searchParams.get("minYears") || "1"); // kept for backward compat; qualification enforced below
      const analysts_result = await pool.query(`
        SELECT a.id, a.name, a.outlet,
          a.x_score, a.x_score_rank, a.x_score_sites_count,
          a.huddle_score_5_year
        FROM analysts a
        ORDER BY a.x_score DESC NULLS LAST
      `);
      const scoresResult = await pool.query(`
        SELECT analyst_id, site, year, raw_score, site_rank, z_score
        FROM analyst_accuracy_scores
        ORDER BY analyst_id, site, year
      `);
      const scoresByAnalyst: Record<number, any[]> = {};
      for (const row of scoresResult.rows) {
        if (!scoresByAnalyst[row.analyst_id]) scoresByAnalyst[row.analyst_id] = [];
        scoresByAnalyst[row.analyst_id].push({
          site: row.site,
          year: Number(row.year),
          rawScore: row.raw_score !== null ? Number(row.raw_score) : null,
          siteRank: row.site_rank,
          zScore: row.z_score !== null ? Number(row.z_score) : null,
        });
      }
      // Weighted formula: all sites equal (1x), WF=0.5x · 2025=3.25x, 2024=2x, 2023=1.5x, 2022=1x, 2021=0.75x
      // Qualification rules:
      //   1. Must have at least 1 score entry from 2025
      //   2. Must have scores across ≥3 DISTINCT draft years (not site-years) — prevents
      //      one-lucky-submission analysts from ranking above sustained performers
      // Analysts who don't qualify keep their raw per-year scores (returned via /analysts
      // endpoints for profile pages) but are excluded from the ranked leaderboard.
      const SITE_W: Record<string, number> = { thr: 1, fp: 1, wf: 0.5, nflmdd: 1, thr_bigboard: 1 };
      const YEAR_W: Record<number, number> = { 2025: 3.25, 2024: 2, 2023: 1.5, 2022: 1, 2021: 0.75 };
      const withWeighted = analysts_result.rows.map((a: any) => {
        const scores = scoresByAnalyst[a.id] ?? [];
        const zEntries = scores.filter((s: any) => s.zScore !== null);
        const has2025 = zEntries.some((s: any) => s.year === 2025);
        const distinctYears = new Set(zEntries.map((s: any) => s.year)).size;
        let wSum = 0, wTotal = 0;
        for (const s of zEntries) {
          const w = (SITE_W[s.site] ?? 1) * (YEAR_W[s.year] ?? 1);
          wSum += s.zScore * w;
          wTotal += w;
        }
        const qualifies = has2025 && distinctYears >= 3 && wTotal > 0;
        const xScoreWeighted = qualifies ? wSum / wTotal : null;
        return {
          id: a.id, name: a.name, outlet: a.outlet,
          xScore: xScoreWeighted,
          xScoreRank: null,         // computed below after sort
          xScoreSitesCount: zEntries.length,
          xScoreDistinctYears: distinctYears,
          has2025,
          huddleScore5Year: a.huddle_score_5_year,
          scores,
        };
      })
      .filter((a: any) => a.xScore !== null)
      .sort((a: any, b: any) => (b.xScore ?? -99) - (a.xScore ?? -99))
      .map((a: any, i: number) => ({ ...a, xScoreRank: i + 1 }));
      return res.json(withWeighted);
    }

    if (path === "/adp-windows" || path === "/adp-windows/") {
      const result = await pool.query(`
        SELECT p.id, p.name, p.position, p.college, p.image_url,
          latest.adp_value::numeric as current_adp,
          snap_info.snap_count,
          snap_info.days_tracked,
          CASE
            WHEN latest.adp_value IS NOT NULL AND ago3d.adp_value IS NOT NULL AND snap_info.days_tracked >= 2
            THEN (ago3d.adp_value::numeric - latest.adp_value::numeric)
            ELSE NULL
          END as change3d,
          CASE
            WHEN latest.adp_value IS NOT NULL AND ago7d.adp_value IS NOT NULL AND snap_info.days_tracked >= 2
            THEN (ago7d.adp_value::numeric - latest.adp_value::numeric)
            ELSE NULL
          END as change7d,
          CASE
            WHEN latest.adp_value IS NOT NULL AND ago30d.adp_value IS NOT NULL AND snap_info.days_tracked >= 2
            THEN (ago30d.adp_value::numeric - latest.adp_value::numeric)
            ELSE NULL
          END as change30d,
          CASE
            WHEN latest.adp_value IS NOT NULL AND first_snap.adp_value IS NOT NULL AND snap_info.days_tracked >= 2
            THEN (first_snap.adp_value::numeric - latest.adp_value::numeric)
            ELSE NULL
          END as change_all
        FROM players p
        LEFT JOIN LATERAL (
          SELECT adp_value FROM adp_history WHERE player_id = p.id ORDER BY date DESC LIMIT 1
        ) latest ON true
        LEFT JOIN LATERAL (
          SELECT adp_value FROM adp_history WHERE player_id = p.id AND date <= NOW() - INTERVAL '3 days' ORDER BY date DESC LIMIT 1
        ) ago3d ON true
        LEFT JOIN LATERAL (
          SELECT adp_value FROM adp_history WHERE player_id = p.id AND date <= NOW() - INTERVAL '7 days' ORDER BY date DESC LIMIT 1
        ) ago7d ON true
        LEFT JOIN LATERAL (
          SELECT adp_value FROM adp_history WHERE player_id = p.id AND date <= NOW() - INTERVAL '30 days' ORDER BY date DESC LIMIT 1
        ) ago30d ON true
        LEFT JOIN LATERAL (
          SELECT adp_value FROM adp_history WHERE player_id = p.id ORDER BY date ASC LIMIT 1
        ) first_snap ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*) as snap_count,
            EXTRACT(EPOCH FROM (MAX(date) - MIN(date))) / 86400 as days_tracked
          FROM adp_history WHERE player_id = p.id
        ) snap_info ON true
        ORDER BY latest.adp_value::numeric ASC NULLS LAST
      `);
      const windowPlayers = result.rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        position: r.position,
        college: r.college,
        imageUrl: r.image_url ?? null,
        currentAdp: r.current_adp !== null ? Number(r.current_adp) : null,
        isNew: Number(r.days_tracked ?? 0) < 2,
        change3d: r.change3d !== null ? Number(r.change3d) : null,
        change7d: r.change7d !== null ? Number(r.change7d) : null,
        change30d: r.change30d !== null ? Number(r.change30d) : null,
        changeAll: r.change_all !== null ? Number(r.change_all) : null,
      }));
      return res.json(windowPlayers);
    }

    if (path === "/odds/movers" || path === "/odds/movers/") {
      const result = await pool.query("SELECT * FROM odds ORDER BY fetched_at DESC LIMIT 50");
      return res.json(result.rows);
    }

    if (path === "/discrepancy" || path === "/discrepancy/") {
      return res.json([]);
    }

    if (path === "/matrix" || path === "/matrix/") {
      const boardType = url.searchParams.get("boardType") ?? null;
      const boardFilter = boardType ? "AND md.board_type = $1" : "";
      const queryArgs = boardType ? [boardType] : [];

      const picksResult = await pool.query(`
        SELECT mdp.player_id, mdp.pick_number, mdp.mock_draft_id,
          md.id as draft_id, md.source_name, md.source_key, md.url, md.published_at, md.board_type
        FROM mock_draft_picks mdp
        JOIN mock_drafts md ON md.id = mdp.mock_draft_id
        WHERE 1=1 ${boardFilter}
        ORDER BY mdp.pick_number ASC
      `, queryArgs);

      const playersResult = await pool.query(`
        SELECT p.id, p.name, p.position, p.college, p.image_url,
          latest.adp_value::numeric as current_adp,
          CASE
            WHEN latest.adp_value IS NOT NULL AND prev7.adp_value IS NOT NULL
            THEN (prev7.adp_value::numeric - latest.adp_value::numeric)
            ELSE NULL
          END as adp_change,
          CASE
            WHEN latest.adp_value IS NOT NULL AND prev7.adp_value IS NOT NULL AND (prev7.adp_value::numeric - latest.adp_value::numeric) > 0.2 THEN 'up'
            WHEN latest.adp_value IS NOT NULL AND prev7.adp_value IS NOT NULL AND (prev7.adp_value::numeric - latest.adp_value::numeric) < -0.2 THEN 'down'
            ELSE 'flat'
          END as trend
        FROM players p
        LEFT JOIN LATERAL (
          SELECT adp_value FROM adp_history WHERE player_id = p.id ORDER BY date DESC LIMIT 1
        ) latest ON true
        LEFT JOIN LATERAL (
          SELECT adp_value FROM adp_history WHERE player_id = p.id AND date <= NOW() - INTERVAL '7 days' ORDER BY date DESC LIMIT 1
        ) prev7 ON true
      `);

      // Build unique drafts (columns)
      const draftMap = new Map<number, any>();
      for (const row of picksResult.rows) {
        if (!draftMap.has(row.draft_id)) {
          draftMap.set(row.draft_id, {
            id: row.draft_id,
            sourceName: row.source_name,
            shortName: row.source_key ?? row.source_name,
            sourceKey: row.source_key,
            url: row.url,
            publishedAt: row.published_at,
          });
        }
      }
      const drafts = Array.from(draftMap.values());

      // Build picks lookup: picks[playerId][draftId] = pickNumber
      const picks: Record<number, Record<number, number>> = {};
      for (const row of picksResult.rows) {
        if (!picks[row.player_id]) picks[row.player_id] = {};
        picks[row.player_id][row.draft_id] = row.pick_number;
      }

      // Only include players that have at least one pick in these drafts
      const playerIdsWithPicks = new Set(picksResult.rows.map((r: any) => r.player_id));
      const players_out = playersResult.rows
        .filter((p: any) => playerIdsWithPicks.has(p.id))
        .map((p: any) => ({
          id: p.id,
          name: p.name,
          position: p.position,
          college: p.college,
          imageUrl: p.image_url ?? null,
          currentAdp: p.current_adp !== null ? Number(p.current_adp) : null,
          adpChange: p.adp_change !== null ? Number(p.adp_change) : null,
          trend: p.trend,
        }));

      return res.json({ players: players_out, drafts, picks });
    }

    if (path === "/activity" || path === "/activity/") {
      const limitParam = url.searchParams.get("limit");
      const limit = limitParam ? Math.min(parseInt(limitParam) || 30, 200) : 30;
      const boardTypeParam = url.searchParams.get("boardType");
      let q = "SELECT id, source_name, source_key, board_type, published_at, url FROM mock_drafts";
      const qParams: any[] = [];
      if (boardTypeParam) { q += " WHERE board_type = $1"; qParams.push(boardTypeParam); }
      q += ` ORDER BY published_at DESC NULLS LAST LIMIT ${limit}`;
      const result = await pool.query(q, qParams);
      return res.json(result.rows.map((r: any) => ({
        id: r.id,
        sourceName: r.source_name,
        shortName: r.source_key,
        boardType: r.board_type,
        publishedAt: r.published_at,
        url: r.url,
      })));
    }

    if (path === "/scrape/status" || path === "/scrape/status/") {
      const jobsResult = await pool.query("SELECT * FROM scrape_jobs ORDER BY source_key ASC");
      const analystsResult = await pool.query("SELECT id, name, source_key FROM analysts WHERE source_key IS NOT NULL ORDER BY name ASC");
      const jobs = jobsResult.rows;
      const scrapable = analystsResult.rows;
      const scrapers = scrapable.map((a: any) => ({
        sourceKey: a.source_key,
        displayName: a.name,
        job: jobs.find((j: any) => j.source_key === a.source_key) ?? null,
      }));
      return res.json({
        jobs,
        scrapers,
        totalSources: scrapable.length,
        scrapableSources: scrapers.length,
      });
    }

    if (path === "/internal/cron" || path === "/internal/cron/") {
      const secret = process.env.CRON_SECRET;
      const authHeader = req.headers["authorization"];
      if (secret && authHeader !== `Bearer ${secret}`) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { runAllScrapers } = await import("../server/scrapers/index");
      const { storage } = await import("../server/storage");
      const { scrapeOdds } = await import("../server/scrapers/odds");
      const results = await runAllScrapers();
      await storage.synthesizeAdpFromPicks();
      await scrapeOdds();
      return res.json({ ok: true, results });
    }

    // Health check
    if (path === "/health" || path === "/" || path === "") {
      const dbUrl = process.env.DATABASE_URL || "NOT SET";
      const masked = dbUrl.substring(0, 30) + "..." + dbUrl.substring(dbUrl.length - 15);
      return res.json({ status: "ok", timestamp: new Date().toISOString(), db_hint: masked, db_length: dbUrl.length });
    }

    return res.status(404).json({ message: "Not found" });
  } catch (err: any) {
    console.error("API Error:", err);
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
}
