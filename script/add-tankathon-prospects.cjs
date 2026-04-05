#!/usr/bin/env node
/**
 * Add unmatched Tankathon prospects to the players table.
 * Run: node script/add-tankathon-prospects.cjs
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function decodeHtml(str) {
  return str
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// Players to add — verified 2026 prospects not yet in DB
// Format: [name, position, college]
const PROSPECTS = [
  ["Keionte Scott",         "CB",   "Miami"],
  ["A.J. Haulcy",           "S",    "LSU"],
  ["Treydan Stukes",        "CB",   "Arizona"],
  ["Josiah Trotter",        "LB",   "Missouri"],
  ["Keith Abney II",        "CB",   "Arizona State"],
  ["Joshua Josephs",        "EDGE", "Tennessee"],
  ["Elijah Sarratt",        "WR",   "Indiana"],
  ["Ted Hurst",             "WR",   "Georgia State"],
  ["Davison Igbinosun",     "CB",   "Ohio State"],
  ["Gracen Halton",         "DL",   "Oklahoma"],
  ["Skyler Bell",           "WR",   "UConn"],
  ["Darrell Jackson Jr.",   "DL",   "Florida State"],
  ["Bud Clark",             "S",    "TCU"],
  ["Chandler Rivers",       "CB",   "Duke"],
  ["Zakee Wheatley",        "S",    "Penn State"],
  ["Bryce Lance",           "WR",   "North Dakota State"],
  ["Jonah Coleman",         "RB",   "Washington"],
  ["Jalen Farmer",          "IOL",  "Kentucky"],
  ["Emmett Johnson",        "RB",   "Nebraska"],
  ["Austin Barber",         "OT",   "Florida"],
  ["Justin Joly",           "TE",   "NC State"],
  ["Brenen Thompson",       "WR",   "Mississippi State"],
  ["Michael Trigg",         "TE",   "Baylor"],
  ["De'Zhaun Stribling",    "WR",   "Ole Miss"],
  ["Anthony Lucas",         "EDGE", "USC"],
  ["Billy Schrauth",        "IOL",  "Notre Dame"],
  ["Dametrious Crownover",  "OT",   "Texas A&M"],
  ["Eli Raridon",           "TE",   "Notre Dame"],
  ["Dontay Corleone",       "DL",   "Cincinnati"],
  ["Brian Parker II",       "IOL",  "Duke"],
  ["Rayshaun Benny",        "DL",   "Michigan"],
  ["Parker Brailsford",     "IOL",  "Alabama"],
  ["Taylen Green",          "QB",   "Arkansas"],
  ["Matt Gulbin",           "IOL",  "Michigan State"],
  ["Markel Bell",           "OT",   "Miami"],
  ["Zxavian Harris",        "DL",   "Ole Miss"],
  ["Tyreak Sapp",           "EDGE", "Florida"],
  ["Dallen Bentley",        "TE",   "Utah"],
  ["Seth McGowan",          "RB",   "Kentucky"],
  ["Kaytron Allen",         "RB",   "Penn State"],
  ["CJ Daniels",            "WR",   "Miami"],
  ["Fa'alili Fa'amoe",      "OT",   "Wake Forest"],
  ["Kendrick Law",          "WR",   "Kentucky"],
  ["Cole Payton",           "QB",   "North Dakota State"],
  ["Bryce Boettcher",       "LB",   "Oregon"],
  ["Trey Zuhn III",         "OT",   "Texas A&M"],
  ["Kevin Coleman Jr.",     "WR",   "Missouri"],
  ["Jack Endries",          "TE",   "Texas"],
  ["Nadame Tucker",         "EDGE", "Western Michigan"],
  ["Kaelon Black",          "RB",   "Indiana"],
  ["Jaydn Ott",             "RB",   "Oklahoma"],
  ["John Michael Gyllenborg","TE",  "Wyoming"],
  ["Charles Demmings",      "CB",   "Stephen F. Austin"],
  ["Reggie Virgil",         "WR",   "Texas Tech"],
  ["J.C. Davis",            "OT",   "Illinois"],
  ["Cade Klubnik",          "QB",   "Clemson"],
  ["Jager Burton",          "IOL",  "Kentucky"],
  ["Taurean York",          "LB",   "Texas A&M"],
  ["Nate Boerkircher",      "TE",   "Texas A&M"],
  ["Max Llewellyn",         "EDGE", "Iowa"],
  ["Landon Robinson",       "DL",   "Navy"],
  ["Tim Keenan III",        "DL",   "Alabama"],
  ["Hezekiah Masses",       "CB",   "California"],
  ["Ethan Burke",           "EDGE", "Texas"],
  ["Michael Taaffe",        "S",    "Texas"],
  ["Devon Marshall",        "CB",   "NC State"],
  ["VJ Payne",              "S",    "Kansas State"],
  ["Kaleb Elarms-Orr",      "LB",   "TCU"],
  ["Eric Rivers",           "WR",   "Georgia Tech"],
  ["Ephesians Prysock",     "CB",   "Washington"],
  ["Louis Moore",           "S",    "Indiana"],
  ["DJ Campbell",           "IOL",  "Texas"],
  ["Skyler Gill-Howard",    "DL",   "Texas Tech"],
  ["Aiden Fisher",          "LB",   "Indiana"],
  ["Beau Stephens",         "IOL",  "Iowa"],
  ["Jeremiah Wright",       "IOL",  "Auburn"],
  ["Josh Cameron",          "WR",   "Baylor"],
  ["Marlin Klein",          "TE",   "Michigan"],
  ["Vincent Anthony Jr.",   "EDGE", "Duke"],
  // These match existing players by nickname — update name only
  // Vega Ioane = Olaivavega Ioane (already in DB)
  // Mike Washington Jr = Mike Washington (already in DB — Jr suffix)
  // D'Angelo Ponds — new
  ["D'Angelo Ponds",        "CB",   "Indiana"],
  // Harold Perkins Jr. = Harold Perkins (already in DB)
];

async function main() {
  // Check which names already exist
  const { rows: existing } = await pool.query('SELECT name FROM players');
  const existingNames = new Set(existing.map(r => r.name.toLowerCase().trim()));

  const toInsert = PROSPECTS.filter(([name]) => !existingNames.has(name.toLowerCase().trim()));
  console.log(`${toInsert.length} new prospects to insert (${PROSPECTS.length - toInsert.length} already in DB)`);

  if (toInsert.length === 0) {
    console.log('Nothing to do.');
    await pool.end();
    return;
  }

  for (const [name, position, college] of toInsert) {
    await pool.query(
      'INSERT INTO players (name, position, college) VALUES ($1, $2, $3)',
      [name, position, college]
    );
    console.log(`  + ${name} (${position}, ${college})`);
  }

  const { rows: countRow } = await pool.query('SELECT COUNT(*) FROM players');
  console.log(`\nDone. Total players in DB: ${countRow[0].count}`);
  await pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
