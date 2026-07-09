// Live smoke test — exercises each provider against real mirrors.
// Run: npm run smoke
import { searchBooks, resolveDownloads, libgen, scihub } from "../src/providers/index.js";

function line(s: string) {
  console.log("\n" + "=".repeat(60) + "\n" + s + "\n" + "=".repeat(60));
}

line("search_books: 'dune frank herbert'");
const books = await searchBooks("dune frank herbert", ["annas", "libgen", "zlibrary"], 5);
console.log(`results: ${books.results.length}, errors:`, books.errors);
for (const b of books.results.slice(0, 5))
  console.log(` - [${b.source}] ${b.title.slice(0, 60)} | ${b.format ?? "?"} | ${b.size ?? "?"} | md5=${b.md5 ?? "—"}`);

const withMd5 = books.results.find((b) => b.md5);
if (withMd5?.md5) {
  line(`get_download_links: ${withMd5.md5}`);
  const links = await resolveDownloads(withMd5.md5);
  console.log(`${links.length} links:`);
  for (const l of links.slice(0, 8)) console.log(` - [${l.direct ? "direct" : "page"}] ${l.label}: ${l.url.slice(0, 80)}`);
}

line("search_papers: 'CRISPR gene editing'");
const papers = await libgen.searchPapers("CRISPR gene editing", 5);
console.log(`results: ${papers.length}`);
for (const p of papers.slice(0, 5)) console.log(` - ${p.title.slice(0, 60)} | doi=${p.doi ?? "—"}`);

line("get_paper: '10.1038/nature12373'");
try {
  const paper = await scihub.resolve("10.1038/nature12373");
  console.log(`title: ${paper.title.slice(0, 70)}\npdfUrl: ${paper.pdfUrl ?? "not resolved"}`);
} catch (e) {
  console.log("scihub error:", (e as Error).message);
}

console.log("\n✓ smoke test complete");
