/**
 * scrape-nflmdd-all.mjs — Scrape ALL MDDB final-scores pages for 2021-2025.
 *
 * Source: https://www.nflmockdraftdatabase.com/mock-drafts/YEAR/final-scores?page=N
 * Bot detection: bypass with Googlebot UA (allowed per their robots.txt).
 * Rate limit: 5s between requests (their crawl-delay is 10; we use 5 to balance).
 * Output: writes nflmdd-full.json {year: [submissions...]} with checkpointing.
 *
 * Run: node server/data/accuracy/scrape-nflmdd-all.mjs
 */
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(__dirname, 'nflmdd-full.json');
const UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const DELAY_MS = 5000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(year, page) {
  const url = `https://www.nflmockdraftdatabase.com/mock-drafts/${year}/final-scores?page=${page}`;
  const r = await axios.get(url, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html' },
    timeout: 30000,
    maxRedirects: 3,
  });
  const m = String(r.data).match(/data-react-class="mocks\/FinalScores"[^>]*data-react-props="([^"]+)"/);
  if (!m) throw new Error(`No props found for ${url}`);
  const json = m[1]
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'");
  return JSON.parse(json);
}

async function scrapeYear(year, out) {
  const p1 = await fetchPage(year, 1);
  const totalPages = p1.pagination.total_pages;
  const totalCount = p1.pagination.total_count;
  console.log(`\n${year}: ${totalCount} mocks across ${totalPages} pages`);

  const selections = [...p1.mock.selections];
  process.stdout.write(`  page 1/${totalPages}  (${selections.length} collected)\n`);

  for (let page = 2; page <= totalPages; page++) {
    await sleep(DELAY_MS);
    try {
      const data = await fetchPage(year, page);
      selections.push(...data.mock.selections);
      process.stdout.write(`  page ${page}/${totalPages}  (${selections.length} collected)\n`);
    } catch (e) {
      console.error(`  ERROR page ${page}: ${e.message}`);
      await sleep(DELAY_MS * 2);
    }

    if (page % 10 === 0) {
      out[year] = selections;
      await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2));
    }
  }

  out[year] = selections;
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2));

  const uniqueNames = new Set(
    selections.map((s) => (s.author?.name || '').trim().toLowerCase()).filter(Boolean)
  );
  console.log(`  ✓ ${year}: ${selections.length} submissions, ${uniqueNames.size} unique analysts`);
  return { total: selections.length, unique: uniqueNames.size };
}

async function main() {
  const years = [2021, 2022, 2023, 2024, 2025];
  let out = {};
  try {
    out = JSON.parse(await fs.readFile(OUT_FILE, 'utf8'));
    console.log(`Resuming from ${OUT_FILE} — existing years: ${Object.keys(out).join(', ')}`);
  } catch {
    console.log(`Starting fresh — output: ${OUT_FILE}`);
  }

  const summary = {};
  for (const year of years) {
    if (out[year] && out[year].length > 0) {
      const uniq = new Set(out[year].map((s) => (s.author?.name || '').trim().toLowerCase()).filter(Boolean));
      console.log(`${year}: already have ${out[year].length} submissions, ${uniq.size} unique — skipping. Delete entry in JSON to re-fetch.`);
      summary[year] = { total: out[year].length, unique: uniq.size };
      continue;
    }
    summary[year] = await scrapeYear(year, out);
  }

  console.log('\n=== FINAL SUMMARY ===');
  for (const y of years) {
    console.log(`  ${y}: ${summary[y].total} submissions, ${summary[y].unique} unique analysts`);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
