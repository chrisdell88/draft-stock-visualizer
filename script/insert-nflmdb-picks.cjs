/**
 * insert-nflmdb-picks.cjs
 * Reads pre-scraped picks from /tmp/nflmdb_all_picks.json and inserts into DB.
 * Usage: node script/insert-nflmdb-picks.cjs
 */

const { Pool } = require('pg');
const fs = require('fs');

const DB_URL = 'process.env.DATABASE_URL';

function normalizeName(name) {
  return name.toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^a-z' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchPlayer(name, players) {
  const norm = normalizeName(name);
  let match = players.find(p => normalizeName(p.name) === norm);
  if (match) return match;
  const words = norm.split(' ').filter(Boolean);
  if (words.length >= 2) {
    const lastName = words[words.length - 1];
    const firstName = words[0];
    match = players.find(p => {
      const pWords = normalizeName(p.name).split(' ');
      return pWords[pWords.length - 1] === lastName && pWords[0].startsWith(firstName[0]);
    });
    if (match) return match;
  }
  match = players.find(p => normalizeName(p.name).includes(norm) || norm.includes(normalizeName(p.name)));
  return match;
}

async function main() {
  const pool = new Pool({ connectionString: DB_URL });

  // Load all players from DB
  const { rows: players } = await pool.query('SELECT id, name, position, college FROM players ORDER BY id');
  console.log(`Loaded ${players.length} players from DB`);

  // Load pre-scraped picks
  const allData = JSON.parse(fs.readFileSync('/tmp/nflmdb_all_picks.json', 'utf8'));

  const today = new Date().toISOString().slice(0, 10);

  const results = [];

  for (const source of allData) {
    console.log(`\n=== ${source.sourceKey} (${source.picks.length} picks) ===`);

    if (source.picks.length === 0) {
      console.log(`  No picks found, skipping`);
      results.push({ sourceKey: source.sourceKey, status: 'no_picks' });
      continue;
    }

    // Check if already scraped today with sufficient picks
    const minPicks = source.boardType === 'bigboard' ? 50 : 30;
    const existing = await pool.query(
      `SELECT md.id, count(mdp.id) AS pick_count
       FROM mock_drafts md
       LEFT JOIN mock_draft_picks mdp ON mdp.mock_draft_id = md.id
       WHERE md.source_key = $1 AND DATE(md.published_at) = $2
       GROUP BY md.id
       LIMIT 1`,
      [source.sourceKey, today]
    );
    if (existing.rows.length > 0 && parseInt(existing.rows[0].pick_count) >= minPicks) {
      console.log(`  Already scraped today with ${existing.rows[0].pick_count} picks (id=${existing.rows[0].id}), skipping`);
      results.push({ sourceKey: source.sourceKey, status: 'already_exists', mockDraftId: existing.rows[0].id });
      continue;
    }
    // Delete any incomplete prior record from today
    if (existing.rows.length > 0) {
      const oldId = existing.rows[0].id;
      console.log(`  Deleting incomplete prior record id=${oldId} (only ${existing.rows[0].pick_count} picks)`);
      await pool.query('DELETE FROM mock_draft_picks WHERE mock_draft_id = $1', [oldId]);
      await pool.query('DELETE FROM mock_drafts WHERE id = $1', [oldId]);
    }

    // Get analyst id
    const analystRow = await pool.query(
      `SELECT id FROM analysts WHERE source_key = $1 LIMIT 1`,
      [source.sourceKey]
    );
    const analystId = analystRow.rows[0]?.id || null;

    // Insert mock_draft record
    const sourceName = `${source.displayName} — ${new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })}`;
    const mdResult = await pool.query(
      `INSERT INTO mock_drafts (source_name, source_key, analyst_id, url, board_type, published_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id`,
      [sourceName, source.sourceKey, analystId, source.url, source.boardType]
    );
    const mockDraftId = mdResult.rows[0].id;
    console.log(`  Created mock_draft id=${mockDraftId}`);

    // Match players and build insert list
    const dbPicks = [];
    const unmatched = [];
    for (const { pickNumber, playerName } of source.picks) {
      const matched = matchPlayer(playerName, players);
      if (matched) {
        dbPicks.push({ mockDraftId, playerId: matched.id, pickNumber });
      } else {
        unmatched.push({ pickNumber, playerName });
      }
    }

    if (dbPicks.length > 0) {
      // Bulk insert picks in batches of 100
      const batchSize = 100;
      for (let i = 0; i < dbPicks.length; i += batchSize) {
        const batch = dbPicks.slice(i, i + batchSize);
        const values = batch.map((p, j) => `($${j * 3 + 1}, $${j * 3 + 2}, $${j * 3 + 3})`).join(', ');
        const params = batch.flatMap(p => [p.mockDraftId, p.playerId, p.pickNumber]);
        await pool.query(
          `INSERT INTO mock_draft_picks (mock_draft_id, player_id, pick_number) VALUES ${values}`,
          params
        );
      }
      console.log(`  Inserted ${dbPicks.length} picks`);
    }

    if (unmatched.length > 0) {
      console.log(`  Unmatched (${unmatched.length}): ${unmatched.slice(0, 10).map(u => `#${u.pickNumber} ${u.playerName}`).join(', ')}`);
    }

    results.push({ sourceKey: source.sourceKey, status: 'ok', mockDraftId, picksInserted: dbPicks.length, unmatched: unmatched.length });
  }

  await pool.end();

  console.log('\n=== SUMMARY ===');
  for (const r of results) {
    console.log(JSON.stringify(r));
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
