// One-time script to fetch and save THR accuracy data from Datawrapper
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const charts = {
  'thr-2025-annual.csv': 'https://datawrapper.dwcdn.net/uGTkG/20/dataset.csv',
  'thr-5year.csv':       'https://datawrapper.dwcdn.net/ZVark/1/dataset.csv',
};

for (const [filename, url] of Object.entries(charts)) {
  const res = await fetch(url);
  if (!res.ok) { console.error(`FAIL ${filename}: ${res.status}`); continue; }
  const text = await res.text();
  fs.writeFileSync(path.join(__dirname, filename), text);
  console.log(`Saved ${filename} — ${text.trim().split('\n').length} rows`);
}
