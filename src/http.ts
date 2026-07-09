// Resilient HTTP layer with mirror rotation.
//
// Shadow libraries move between domains constantly and any given mirror may be
// blocked from a given network. Every provider therefore declares a LIST of
// candidate mirrors; we try them in order, remember the one that worked, and
// prefer it next time. A request only "fails" when every mirror is exhausted.

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent": USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

export const TIMEOUT_MS = Number(process.env.BIBLIO_TIMEOUT_MS ?? 20000);

/** Remembers, per mirror-group, which host last succeeded. */
const preferredMirror = new Map<string, string>();

function orderMirrors(groupKey: string, mirrors: string[]): string[] {
  const preferred = preferredMirror.get(groupKey);
  if (!preferred || !mirrors.includes(preferred)) return mirrors;
  return [preferred, ...mirrors.filter((m) => m !== preferred)];
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      redirect: "follow",
      signal: controller.signal,
      headers: { ...DEFAULT_HEADERS, ...(init.headers as object) },
    });
  } finally {
    clearTimeout(timer);
  }
}

export interface MirrorFetchResult {
  html: string;
  /** The base mirror that served the request (e.g. "https://libgen.li"). */
  base: string;
  finalUrl: string;
}

/**
 * Try each mirror until one returns a 2xx response.
 * @param groupKey  Stable key naming the mirror set (used for stickiness).
 * @param mirrors   Ordered list of base URLs (no trailing slash).
 * @param buildPath Given a base, return the full URL to fetch.
 */
export async function fetchFromMirrors(
  groupKey: string,
  mirrors: string[],
  buildPath: (base: string) => string,
  init?: RequestInit
): Promise<MirrorFetchResult> {
  const ordered = orderMirrors(groupKey, mirrors);
  const failures: string[] = [];

  for (const base of ordered) {
    const url = buildPath(base);
    try {
      const res = await fetchWithTimeout(url, init);
      if (!res.ok) {
        failures.push(`${base} -> HTTP ${res.status}`);
        continue;
      }
      const html = await res.text();
      preferredMirror.set(groupKey, base);
      return { html, base, finalUrl: res.url || url };
    } catch (err) {
      failures.push(`${base} -> ${(err as Error).message}`);
    }
  }
  throw new Error(
    `All ${mirrors.length} ${groupKey} mirror(s) failed: ${failures.join("; ")}`
  );
}

/** Single-URL GET returning text, with timeout. Throws on non-2xx. */
export async function getText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetchWithTimeout(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/** Fetch binary content as a Buffer (for downloads). Throws on non-2xx. */
export async function getBuffer(
  url: string,
  init?: RequestInit
): Promise<{ buffer: Buffer; contentType: string | null }> {
  const res = await fetchWithTimeout(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const arrayBuf = await res.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuf),
    contentType: res.headers.get("content-type"),
  };
}
