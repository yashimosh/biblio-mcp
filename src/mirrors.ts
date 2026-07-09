// Centralized mirror registry.
//
// These domains rotate over time. When a source stops working, this is the ONE
// file to update — add/reorder hosts here and every provider picks it up. Order
// = preference; the HTTP layer will fall through to later entries automatically.
//
// Overridable at runtime via comma-separated env vars, e.g.:
//   BIBLIO_ANNAS_MIRRORS="https://annas-archive.org,https://annas-archive.se"

function fromEnv(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

export const ANNAS_MIRRORS = fromEnv("BIBLIO_ANNAS_MIRRORS", [
  "https://annas-archive.org",
  "https://annas-archive.se",
  "https://annas-archive.li",
  "https://annas-archive.gl",
]);

export const LIBGEN_MIRRORS = fromEnv("BIBLIO_LIBGEN_MIRRORS", [
  "https://libgen.li",
  "https://libgen.is",
  "https://libgen.rs",
  "https://libgen.st",
  "https://libgen.gs",
  "https://libgen.vg",
]);

export const SCIHUB_MIRRORS = fromEnv("BIBLIO_SCIHUB_MIRRORS", [
  "https://sci-hub.ren",
  "https://sci-hub.mksa.top",
  "https://sci-hub.hkvisa.net",
  "https://sci-hub.se",
  "https://sci-hub.st",
  "https://sci-hub.ru",
]);

// Public IPFS gateways used as a last-resort download path for records that
// expose an IPFS CID (common on Anna's Archive).
export const IPFS_GATEWAYS = fromEnv("BIBLIO_IPFS_GATEWAYS", [
  "https://ipfs.io/ipfs",
  "https://cloudflare-ipfs.com/ipfs",
  "https://gateway.pinata.cloud/ipfs",
]);
