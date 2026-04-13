import { scrapeAllHeadshots } from "../server/scrapers/headshots.js";
const result = await scrapeAllHeadshots();
console.log(JSON.stringify(result, null, 2));
process.exit(0);
