// Z-Library provider — best-effort, no-auth public search.
//
// Z-Library is the flakiest source to automate: it rotates "personal" domains,
// gates much of its catalog behind login, and sometimes serves a captcha. This
// provider makes a best-effort public-search attempt across known domains and
// returns whatever it can parse. It NEVER hard-fails the aggregate search — an
// empty result is an acceptable outcome here, since Anna's Archive already
// indexes the Z-Library collection as a reliable fallback.
//
// For authenticated, complete Z-Library access, set BIBLIO_ZLIB_MIRRORS to your
// working personal domain; richer login-based access is intentionally out of
// scope to keep the server credential-free by default.

import * as cheerio from "cheerio";
import { fetchFromMirrors } from "../http.js";
import type { Book } from "../types.js";

const GROUP = "zlibrary";

const ZLIB_MIRRORS = (process.env.BIBLIO_ZLIB_MIRRORS ??
  "https://z-lib.io,https://z-library.sk,https://1lib.sk,https://zlibrary-global.se")
  .split(",")
  .map((s) => s.trim().replace(/\/+$/, ""))
  .filter(Boolean);

export async function search(query: string, limit: number): Promise<Book[]> {
  const { html, base } = await fetchFromMirrors(GROUP, ZLIB_MIRRORS, (b) =>
    `${b}/s/${encodeURIComponent(query)}`
  );
  const $ = cheerio.load(html);
  const books: Book[] = [];

  // Z-Library result cards vary by theme; try the common selectors.
  const cards = $(
    "z-bookcard, .book-item, .resItemBox, [class*='bookRow'], .book-card"
  );

  cards.each((_i, el) => {
    if (books.length >= limit) return false;
    const $el = $(el);

    const title =
      $el.attr("title") ||
      $el.find("h3 a, .title a, [slot='title'], .bookTitle").first().text().trim() ||
      $el.find("a[href*='/book/']").first().text().trim();
    if (!title) return;

    const href =
      $el.attr("href") ||
      $el.find("a[href*='/book/']").first().attr("href") ||
      "";
    const author =
      $el.attr("author") ||
      $el.find(".author, [slot='author'], [class*='author']").first().text().trim() ||
      undefined;
    const blob = $el.text().replace(/\s+/g, " ");
    const year = $el.attr("year") || blob.match(/\b(1[5-9]\d{2}|20\d{2})\b/)?.[1];
    const format =
      ($el.attr("extension") || blob.match(/\b(pdf|epub|mobi|djvu|azw3)\b/i)?.[1])?.toUpperCase();
    const size = $el.attr("filesize") || blob.match(/(\d+(?:\.\d+)?\s?(?:KB|MB|GB))/i)?.[1];

    books.push({
      source: "zlibrary",
      title,
      author,
      year,
      format,
      size: size?.replace(/\s+/, " "),
      url: href ? (href.startsWith("http") ? href : `${base}${href}`) : undefined,
    });
  });

  return books;
}
