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
      const result = await pool.query(`
        SELECT p.*,
          (SELECT ah.adp_value FROM adp_history ah WHERE ah.player_id = p.id ORDER BY ah.date DESC LIMIT 1) as current_adp
        FROM players p
        ORDER BY (SELECT ah.adp_value FROM adp_history ah WHERE ah.player_id = p.id ORDER BY ah.date DESC LIMIT 1)::numeric ASC NULLS LAST
      `);
      return res.json(result.rows);
    }

    if (path === "/analysts" || path === "/analysts/") {
      const result = await pool.query("SELECT * FROM analysts ORDER BY accuracy_weight DESC NULLS LAST");
      return res.json(result.rows);
    }

    if (path === "/mock-drafts" || path === "/mock-drafts/") {
      const result = await pool.query("SELECT * FROM mock_drafts ORDER BY id DESC");
      return res.json(result.rows);
    }

    if (path.startsWith("/players/") && path.split("/").length === 3) {
      const id = parseInt(path.split("/")[2]);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid player ID" });
      const player = await pool.query("SELECT * FROM players WHERE id = $1", [id]);
      if (player.rows.length === 0) return res.status(404).json({ message: "Player not found" });
      return res.json(player.rows[0]);
    }

    if (path.startsWith("/players/") && path.endsWith("/adp")) {
      const id = parseInt(path.split("/")[2]);
      const result = await pool.query("SELECT * FROM adp_history WHERE player_id = $1 ORDER BY date ASC", [id]);
      return res.json(result.rows);
    }

    if (path.startsWith("/players/") && path.endsWith("/odds")) {
      const id = parseInt(path.split("/")[2]);
      const result = await pool.query("SELECT * FROM odds WHERE player_id = $1 ORDER BY fetched_at DESC", [id]);
      return res.json(result.rows);
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
      return res.json(result.rows);
    }

    if (path === "/accuracy/leaderboard" || path === "/accuracy/leaderboard/") {
      const result = await pool.query("SELECT * FROM analyst_accuracy_scores ORDER BY score DESC NULLS LAST");
      return res.json(result.rows);
    }

    if (path === "/adp-windows" || path === "/adp-windows/") {
      const result = await pool.query(`
        SELECT p.id, p.name, p.position,
          (SELECT ah.adp_value FROM adp_history ah WHERE ah.player_id = p.id ORDER BY ah.date DESC LIMIT 1) as current_adp,
          (SELECT ah.adp_value FROM adp_history ah WHERE ah.player_id = p.id ORDER BY ah.date ASC LIMIT 1) as earliest_adp
        FROM players p
        ORDER BY (SELECT ah.adp_value FROM adp_history ah WHERE ah.player_id = p.id ORDER BY ah.date DESC LIMIT 1)::numeric ASC NULLS LAST
      `);
      return res.json(result.rows);
    }

    if (path === "/odds/movers" || path === "/odds/movers/") {
      const result = await pool.query("SELECT * FROM odds ORDER BY fetched_at DESC LIMIT 50");
      return res.json(result.rows);
    }

    if (path === "/discrepancy" || path === "/discrepancy/") {
      return res.json([]);
    }

    if (path === "/matrix" || path === "/matrix/") {
      const result = await pool.query(`
        SELECT mdp.player_id, p.name as player_name, md.source_name, md.source_key, mdp.pick_number
        FROM mock_draft_picks mdp
        JOIN players p ON p.id = mdp.player_id
        JOIN mock_drafts md ON md.id = mdp.mock_draft_id
        ORDER BY mdp.pick_number ASC
      `);
      return res.json(result.rows);
    }

    if (path === "/activity" || path === "/activity/") {
      const result = await pool.query("SELECT * FROM mock_drafts ORDER BY id DESC LIMIT 30");
      return res.json(result.rows);
    }

    if (path === "/scrape/status" || path === "/scrape/status/") {
      return res.json({ scrapers: [], lastRun: null });
    }

    // Health check
    if (path === "/health" || path === "/" || path === "") {
      return res.json({ status: "ok", timestamp: new Date().toISOString() });
    }

    return res.status(404).json({ message: "Not found" });
  } catch (err: any) {
    console.error("API Error:", err);
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
}
