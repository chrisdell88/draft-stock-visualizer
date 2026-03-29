// One-time script: fetch FantasyPros mock draft accuracy for 2021-2025
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'https://www.fantasypros.com/nfl/accuracy/mock-drafts.php';
const HEADER = 'Rank\tAnalyst\tDraftSlots\tPlayerRanks\tPositions\tTeams\tTotal';

function extractRows(html) {
  // Parse table rows from HTML (Node.js — no DOMParser)
  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return [];
  const rowMatches = tableMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  const rows = [];
  for (const row of rowMatches) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map(m => m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&#\d+;/g,'').replace(/\s+/g,' ').trim());
    if (cells.length >= 7) rows.push(cells);
  }
  return rows;
}

function dedupe(cells) {
  // FantasyPros comparison view doubles each value: [rank, analyst, s, s, pr, pr, pos, pos, t, t, total, total]
  if (cells.length > 7) return [cells[0], cells[1], cells[2], cells[4], cells[6], cells[8], cells[10]];
  return cells;
}

for (const year of [2021, 2022, 2023, 2024, 2025]) {
  const url = `${BASE}?start_year=${year}&end_year=${year}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) { console.error(`FAIL ${year}: ${res.status}`); continue; }
  const html = await res.text();
  const rows = extractRows(html).map(dedupe);
  const csv = [HEADER, ...rows.map(r => r.join('\t'))].join('\n');
  const outPath = path.join(__dirname, `fp-${year}.tsv`);
  fs.writeFileSync(outPath, csv);
  console.log(`Saved fp-${year}.tsv — ${rows.length} rows | #1: ${rows[0]?.[1]} (${rows[0]?.[6]} pts)`);
}
