// Library Genesis provider.
//
// Libgen is the fastest path to a *directly downloadable* file: its md5 records
// resolve to a real get.php link with no waitlist or captcha. We scrape the
// search table (structure differs slightly across the .li vs .is mirror
// families, so the parser is defensive) and resolve downloads via the md5.

import * as cheerio from "cheerio";
import { fetchFromMirrors } from "../http.js";
import { LIBGEN_MIRRORS } from "../mirrors.js";
import type { Book, DownloadLink, Paper } from "../types.js";

const GROUP = "libgen";

/** Search Library Genesis scimag (academic articles) by keyword or DOI. */
export async function searchPapers(
  query: string,
  limit: number
): Promise<Paper[]> {
  // topics[]=a scopes the search to scimag (articles). Confirmed against the
  // .li family; the .is family exposes the same collection at /scimag/.
  const { html, base } = await fetchFromMirrors(GROUP, LIBGEN_MIRRORS, (b) =>
    `${b}/index.php?req=${encodeURIComponent(query)}&topics%5B%5D=a&res=100`
  ).catch(() =>
    fetchFromMirrors(GROUP, LIBGEN_MIRRORS, (b) =>
      `${b}/scimag/?q=${encodeURIComponent(query)}`
    )
  );

  const $ = cheerio.load(html);
  const papers: Paper[] = [];
  const seen = new Set<string>();

  $("table tr").each((_i, row) => {
    if (papers.length >= limit) return false;
    const $row = $(row);
    const rowHtml = $row.html() || "";
    const doi = rowHtml.match(/10\.\d{4,9}\/[^\s"'<>]+/)?.[0];
    const md5 = rowHtml.match(/md5=([a-f0-9]{32})/i)?.[1]?.toLowerCase();
    const key = doi || md5;
    if (!key || seen.has(key)) return;

    let title = "";
    $row.find("a").each((_j, a) => {
      const t = $(a).text().replace(/\s+/g, " ").trim();
      if (t.length > title.length && !/^\d+$/.test(t)) title = t;
    });
    if (!title || title.length < 4) return;

    seen.add(key);
    papers.push({
      source: "libgen",
      title,
      doi,
      url: md5 ? `${base}/ads.php?md5=${md5}` : undefined,
      mirrors: md5 ? [`${base}/ads.php?md5=${md5}`] : undefined,
    });
  });

  return papers;
}

export async function search(query: string, limit: number): Promise<Book[]> {
  // The .li family uses index.php; the .is/.rs family uses search.php. Try a
  // path that both understand, then fall back.
  const { html, base } = await fetchFromMirrors(GROUP, LIBGEN_MIRRORS, (b) =>
    `${b}/index.php?req=${encodeURIComponent(query)}&res=100`
  ).catch(() =>
    fetchFromMirrors(GROUP, LIBGEN_MIRRORS, (b) =>
      `${b}/search.php?req=${encodeURIComponent(query)}&res=100&column=def`
    )
  );

  const $ = cheerio.load(html);
  const books: Book[] = [];
  const seen = new Set<string>();

  // Collect md5s from any ads.php / md5 links present in each row, and read the
  // row's cell text for metadata.
  $("table tr").each((_i, row) => {
    if (books.length >= limit) return false;
    const $row = $(row);
    const rowHtml = $row.html() || "";
    const md5 =
      rowHtml.match(/md5=([a-f0-9]{32})/i)?.[1]?.toLowerCase() ||
      rowHtml.match(/\/md5\/([a-f0-9]{32})/i)?.[1]?.toLowerCase();
    if (!md5 || seen.has(md5)) return;

    const cells = $row.find("td");
    if (cells.length < 3) return;

    // Title = the longest anchor text in the row (works for both layouts).
    let title = "";
    $row.find("a").each((_j, a) => {
      const t = $(a).text().replace(/\s+/g, " ").trim();
      if (t.length > title.length && !/^\d+$/.test(t) && !/^(libgen|mirror|\[)/i.test(t))
        title = t;
    });
    if (!title) return;

    const cellText = cells.map((_j, c) => $(c).text().trim()).get();
    const joined = cellText.join(" | ");

    const year = joined.match(/\b(1[5-9]\d{2}|20\d{2})\b/)?.[1];
    const fmt = joined.match(/\b(pdf|epub|mobi|djvu|azw3|fb2)\b/i)?.[1];
    const size = joined.match(/(\d+(?:\.\d+)?\s?(?:KB|MB|GB))/i)?.[1];
    const lang = joined.match(
      /\b(English|Spanish|French|German|Russian|Chinese|Arabic|Portuguese|Italian|Dutch|Japanese|Korean|Turkish|Persian)\b/i
    )?.[1];
    // Author is usually the first cell for .is layout; best-effort.
    const author = cellText[0] && cellText[0].length < 120 ? cellText[0] : undefined;

    seen.add(md5);
    books.push({
      source: "libgen",
      md5,
      title,
      author,
      year,
      language: lang,
      format: fmt?.toUpperCase(),
      size: size?.replace(/\s+/, " "),
      url: `${base}/ads.php?md5=${md5}`,
    });
  });

  return books;
}

/**
 * Resolve a directly-downloadable URL for an md5 via the Libgen "ads"/download
 * page. Returns every candidate found (get.php, cdn, mirror partners).
 */
export async function downloadLinks(md5: string): Promise<DownloadLink[]> {
  const { html, base } = await fetchFromMirrors(GROUP, LIBGEN_MIRRORS, (b) =>
    `${b}/ads.php?md5=${md5}`
  );
  const $ = cheerio.load(html);
  const links: DownloadLink[] = [];
  const push = (url: string, label: string, direct: boolean) => {
    const full = url.startsWith("http") ? url : `${base}/${url.replace(/^\//, "")}`;
    if (!links.some((l) => l.url === full)) links.push({ source: "libgen", label, url: full, direct });
  };

  $("a").each((_i, el) => {
    const href = $(el).attr("href") || "";
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (/get\.php\?/i.test(href)) push(href, "Libgen direct (get.php)", true);
    else if (/\/get\b|cdn|download/i.test(href) && /^(get|download|libgen)/i.test(text))
      push(href, text || "download", true);
    else if (/(annas-archive|libgen\.pw|randombook)/i.test(href))
      push(href, `mirror: ${text || href}`, false);
  });

  return links;
}
