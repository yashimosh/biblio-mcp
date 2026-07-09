// Anna's Archive provider.
//
// Anna's Archive is the broadest aggregator — it indexes Libgen, Z-Library,
// Sci-Hub/scimag, IPFS, and more. We use it as the primary book source and as
// the detail/metadata resolver for any md5.

import * as cheerio from "cheerio";
import { fetchFromMirrors } from "../http.js";
import { ANNAS_MIRRORS } from "../mirrors.js";
import type { Book, DownloadLink } from "../types.js";

const GROUP = "annas";

/** Pull the first metadata line out of a result block and parse loosely. */
function parseMeta(metaText: string): Partial<Book> {
  const out: Partial<Book> = {};
  const year = metaText.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
  if (year) out.year = year[1];
  const fmt = metaText.match(/\b(pdf|epub|mobi|djvu|azw3|cbr|cbz|fb2)\b/i);
  if (fmt) out.format = fmt[1].toUpperCase();
  const size = metaText.match(/(\d+(?:\.\d+)?\s?(?:KB|MB|GB))/i);
  if (size) out.size = size[1].replace(/\s+/, " ");
  const lang = metaText.match(
    /\b(English|Spanish|French|German|Russian|Chinese|Arabic|Portuguese|Italian|Dutch|Japanese|Korean|Turkish|Persian|Hindi|Polish|Ukrainian)\b/i
  );
  if (lang) out.language = lang[1];
  return out;
}

export async function search(query: string, limit: number): Promise<Book[]> {
  const { html, base } = await fetchFromMirrors(GROUP, ANNAS_MIRRORS, (b) =>
    `${b}/search?q=${encodeURIComponent(query)}`
  );
  const $ = cheerio.load(html);
  const books: Book[] = [];
  const seen = new Set<string>();

  // Each record is an <a href="/md5/HASH"> block. Anna's ships some results
  // inside HTML comments (lazy-render); strip comment markers first so the
  // parser sees them too.
  const normalized = html.replace(/<!--/g, "").replace(/-->/g, "");
  const $$ = cheerio.load(normalized);

  $$('a[href^="/md5/"]').each((_i, el) => {
    if (books.length >= limit) return false;
    const href = $$(el).attr("href") || "";
    const md5 = href.match(/\/md5\/([a-f0-9]{32})/)?.[1];
    if (!md5 || seen.has(md5)) return;

    const block = $$(el);
    const text = block.text().replace(/\s+/g, " ").trim();
    // Title is the most prominent text node; fall back to the block text.
    const title =
      block.find("h3").first().text().trim() ||
      block.find(".text-xl, .font-bold, .text-lg").first().text().trim() ||
      text.slice(0, 120);
    if (!title) return;

    const coverUrl = block.find("img").first().attr("src") || undefined;
    // Metadata typically lives in sibling divs after the cover anchor.
    const metaText = block.parent().text().replace(/\s+/g, " ").trim();

    seen.add(md5);
    books.push({
      source: "annas",
      md5,
      title,
      url: `${base}/md5/${md5}`,
      coverUrl,
      ...parseMeta(metaText),
    });
  });

  return books;
}

/** Fetch the md5 detail page and extract structured metadata + links. */
export async function details(
  md5: string
): Promise<Book & { downloadLinks: DownloadLink[] }> {
  const { html, base } = await fetchFromMirrors(GROUP, ANNAS_MIRRORS, (b) =>
    `${b}/md5/${md5}`
  );
  const $ = cheerio.load(html);

  const title = $("h1").first().text().trim() || $("title").text().trim();
  const metaText = $("main, body").text().replace(/\s+/g, " ").trim();

  const downloadLinks = extractDownloadLinks($, base);

  return {
    source: "annas",
    md5,
    title,
    url: `${base}/md5/${md5}`,
    ...parseMeta(metaText),
    downloadLinks,
  };
}

function extractDownloadLinks(
  $: cheerio.CheerioAPI,
  base: string
): DownloadLink[] {
  const links: DownloadLink[] = [];
  $("a").each((_i, el) => {
    const href = $(el).attr("href") || "";
    const text = $(el).text().replace(/\s+/g, " ").trim();
    const isDownload =
      /\/(slow_download|fast_download|download)\//.test(href) ||
      /ipfs/i.test(href) ||
      /^download/i.test(text) ||
      /download now|option #/i.test(text.toLowerCase());
    if (!isDownload) return;
    const url = href.startsWith("http") ? href : `${base}${href}`;
    links.push({
      source: "annas",
      label: text.slice(0, 80) || "download",
      url,
      direct: /ipfs|\.(pdf|epub|mobi|djvu)(\?|$)/i.test(url),
    });
  });
  return links;
}
