/**
 * seed-odds.mjs
 * Fetches current NFL Draft prop odds from the-odds-api.com and inserts into DB.
 * Run: node -r dotenv/config server/data/seed-odds.mjs
 */
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const API_KEY = 'b5e6b3e773229db2fc9cb916f87d3daf';
const SPORT = 'americanfootball_nfl_draft';
const BASE = 'https://api.the-odds-api.com/v4';

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url} — ${await res.text()}`);
  return res.json();
}

// Map player name from odds API to DB player name
function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z ]/g, '').trim();
}

async function main() {
  // 1. Get all events for NFL Draft
  let events;
  try {
    events = await fetchJson(`${BASE}/sports/${SPORT}/events?apiKey=${API_KEY}`);
    console.log(`Events: ${events.length}`);
  } catch (err) {
    // Try the standard NFL futures market instead
    console.log('NFL Draft sport not found, trying nfl futures...');
    try {
      events = await fetchJson(`${BASE}/sports/americanfootball_nfl/events?apiKey=${API_KEY}`);
      // Filter for draft-related events
      events = events.filter(e => /draft|pick/i.test(e.sport_title || e.description || ''));
      console.log(`Filtered draft events: ${events.length}`);
    } catch (err2) {
      console.log('Falling back to player_props markets...');
      events = [];
    }
  }

  // 2. If no events, try player futures directly
  if (events.length === 0) {
    console.log('Checking available sports...');
    const sports = await fetchJson(`${BASE}/sports?apiKey=${API_KEY}`);
    const draftSports = sports.filter(s => /draft|nfl/i.test(s.key));
    console.log('NFL/Draft sports available:', draftSports.map(s => s.key));

    // Try nfl_draft or similar
    const draftSport = draftSports.find(s => s.key.includes('draft'));
    if (draftSport) {
      try {
        events = await fetchJson(`${BASE}/sports/${draftSport.key}/events?apiKey=${API_KEY}`);
        console.log(`Events for ${draftSport.key}: ${events.length}`);
      } catch (err) {
        console.log('No events found');
      }
    }
  }

  if (events.length === 0) {
    console.log('No NFL Draft odds events found. The 2026 draft markets may not be open yet.');
    console.log('Checking remaining API quota...');
    // Make a cheap call to check quota
    const sports = await fetchJson(`${BASE}/sports?apiKey=${API_KEY}`);
    console.log(`Available sports count: ${sports.length}`);
    await pool.end();
    return;
  }

  // 3. Get players from DB for matching
  const { rows: dbPlayers } = await pool.query('SELECT id, name FROM players');
  const playerMap = new Map(dbPlayers.map(p => [normalizeName(p.name), p.id]));

  let inserted = 0;
  const today = new Date().toISOString().split('T')[0];

  for (const event of events.slice(0, 5)) {
    try {
      const odds = await fetchJson(
        `${BASE}/events/${event.id}/odds?apiKey=${API_KEY}&regions=us&markets=h2h,totals&oddsFormat=american`
      );

      for (const bookmaker of (odds.bookmakers || [])) {
        for (const market of (bookmaker.markets || [])) {
          for (const outcome of (market.outcomes || [])) {
            // Try to match player name
            const normalized = normalizeName(outcome.name);
            const playerId = playerMap.get(normalized);
            if (!playerId) continue;

            await pool.query(`
              INSERT INTO odds (player_id, bookmaker, market_type, odds, date)
              VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT DO NOTHING
            `, [playerId, bookmaker.title, market.key, outcome.price.toString(), today]);
            inserted++;
          }
        }
      }
    } catch (err) {
      console.warn(`Event ${event.id} failed:`, err.message);
    }
  }

  console.log(`Inserted ${inserted} odds rows`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
