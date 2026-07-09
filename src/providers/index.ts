// Aggregation layer.
//
// Fans a query out to every book provider concurrently, merges the results, and
// dedups by md5 (the universal key) while keeping the richest record. Per-source
// failures are collected, not thrown, so one dead mirror never blanks the search.

import * as annas from "./annas.js";
import * as libgen from "./libgen.js";
import * as scihub from "./scihub.js";
import * as zlibrary from "./zlibrary.js";
import { IPFS_GATEWAYS } from "../mirrors.js";
import type {
  Book,
  DownloadLink,
  Paper,
  SearchResult,
  SourceId,
  SourceError,
} from "../types.js";

export const BOOK_SOURCES: SourceId[] = ["annas", "libgen", "zlibrary"];

const bookSearchers: Record<
  string,
  (q: string, limit: number) => Promise<Book[]>
> = {
  annas: annas.search,
  libgen: libgen.search,
  zlibrary: zlibrary.search,
};

/** Merge two records for the same md5, preferring non-empty fields. */
function mergeBook(a: Book, b: Book): Book {
  const pick = <K extends keyof Book>(k: K) => a[k] || b[k];
  return {
    ...a,
    title: a.title.length >= b.title.length ? a.title : b.title,
    author: pick("author"),
    publisher: pick("publisher"),
    year: pick("year"),
    language: pick("language"),
    format: pick("format"),
    size: pick("size"),
    pages: pick("pages"),
    isbn: pick("isbn"),
    coverUrl: pick("coverUrl"),
    url: pick("url"),
    mirrors: [...(a.mirrors ?? []), ...(b.mirrors ?? [])],
  };
}

export async function searchBooks(
  query: string,
  sources: SourceId[],
  limit: number
): Promise<SearchResult<Book>> {
  const active = sources.filter((s) => s in bookSearchers);
  const settled = await Promise.allSettled(
    active.map((s) => bookSearchers[s](query, limit))
  );

  const errors: SourceError[] = [];
  const byMd5 = new Map<string, Book>();
  const noMd5: Book[] = [];

  settled.forEach((r, i) => {
    const source = active[i];
    if (r.status === "rejected") {
      errors.push({ source, error: String(r.reason?.message ?? r.reason) });
      return;
    }
    for (const book of r.value) {
      if (book.md5) {
        const existing = byMd5.get(book.md5);
        byMd5.set(book.md5, existing ? mergeBook(existing, book) : book);
      } else {
        noMd5.push(book);
      }
    }
  });

  return {
    query,
    results: [...byMd5.values(), ...noMd5],
    errors,
  };
}

/** Resolve every download candidate we can find for an md5. */
export async function resolveDownloads(md5: string): Promise<DownloadLink[]> {
  const links: DownloadLink[] = [];

  const [libgenRes, annasRes] = await Promise.allSettled([
    libgen.downloadLinks(md5),
    annas.details(md5),
  ]);

  if (libgenRes.status === "fulfilled") links.push(...libgenRes.value);
  if (annasRes.status === "fulfilled") links.push(...annasRes.value.downloadLinks);

  // Surface an IPFS CID as gateway links if one appears among Anna's links.
  const cid = links
    .map((l) => l.url.match(/\/ipfs\/([A-Za-z0-9]+)/)?.[1])
    .find(Boolean);
  if (cid) {
    for (const gw of IPFS_GATEWAYS) {
      const url = `${gw}/${cid}`;
      if (!links.some((l) => l.url === url))
        links.push({ source: "ipfs", label: "IPFS gateway", url, direct: true });
    }
  }

  return links;
}

export { annas, libgen, scihub, zlibrary };
export type { Book, Paper, DownloadLink, SearchResult, SourceId };
