// Shared data model. Every provider normalizes into these shapes so the
// aggregation layer and MCP tools never care which source a result came from.

export type SourceId = "annas" | "libgen" | "scihub" | "zlibrary";

/** A book / document result. `md5` is the universal join key across sources. */
export interface Book {
  source: SourceId;
  /** MD5 hash of the file. Shared identifier between Anna's Archive and Libgen. */
  md5?: string;
  title: string;
  author?: string;
  publisher?: string;
  year?: string;
  language?: string;
  /** File extension, upper-cased, e.g. "PDF", "EPUB". */
  format?: string;
  /** Human-readable size, e.g. "4.2 MB". */
  size?: string;
  pages?: string;
  isbn?: string;
  /** Canonical detail-page URL for this record. */
  url?: string;
  coverUrl?: string;
  /** Raw download / mirror URLs discovered at search time (may need resolving). */
  mirrors?: string[];
}

/** An academic paper result. */
export interface Paper {
  source: SourceId;
  title: string;
  author?: string;
  doi?: string;
  year?: string;
  journal?: string;
  url?: string;
  /** Direct PDF URL when resolvable (Sci-Hub). */
  pdfUrl?: string;
  mirrors?: string[];
}

/** A resolved, ready-to-fetch download candidate for a given md5. */
export interface DownloadLink {
  source: SourceId | "ipfs";
  label: string;
  url: string;
  /** True when the URL points straight at the file (not an intermediate page). */
  direct: boolean;
}

/** Per-source error surfaced without failing the whole aggregate search. */
export interface SourceError {
  source: SourceId;
  error: string;
}

export interface SearchResult<T> {
  query: string;
  results: T[];
  errors: SourceError[];
}
