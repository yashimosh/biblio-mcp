# biblio-mcp

[![CI](https://github.com/yashimosh/biblio-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/yashimosh/biblio-mcp/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/biblio-mcp.svg)](https://www.npmjs.com/package/biblio-mcp)
[![license](https://img.shields.io/npm/l/biblio-mcp.svg)](LICENSE)

**One [MCP](https://modelcontextprotocol.io) server for Anna's Archive, Library Genesis, Sci-Hub, and Z-Library.**

Search books and papers across every major shadow library through a single
unified interface, resolve download links, and fetch files — all from your MCP
client (Claude Code, Claude Desktop, Cline, etc.).

No API keys. No login. No per-source servers to juggle. One server, six tools.

---

## Why

Each shadow library has its own scrapers and quirks, and the community MCP
servers for them are separate projects with separate configs — one for Anna's
Archive, one for Libgen, one for Sci-Hub, one for Z-Library. `biblio-mcp` merges
them into a single server with a shared data model:

- **One search** fans out to Anna's Archive, Libgen, and Z-Library concurrently
  and **de-duplicates results by MD5 hash** (the universal key these libraries
  share), keeping the richest metadata for each unique book.
- **Mirror rotation is built in.** Every source declares a list of mirror
  domains; a dead or blocked host automatically falls through to the next, and
  the working one is remembered. When domains change, you edit
  [`src/mirrors.ts`](src/mirrors.ts) — one file — and everything picks it up.
- **Per-source failures never blank the search.** If Z-Library is down, you
  still get Anna's + Libgen results, with the failure reported separately.

## Install

Requires **Node.js ≥ 18**.

```bash
# Run directly (no install)
npx biblio-mcp

# Or clone and build
git clone https://github.com/yashimosh/biblio-mcp.git
cd biblio-mcp
npm install
npm run build
```

### Add to Claude Code

```bash
claude mcp add -s user biblio -- npx biblio-mcp
# or, from a local build:
claude mcp add -s user biblio -- node /absolute/path/to/biblio-mcp/dist/index.js
```

### Add to Claude Desktop / Cline

```jsonc
{
  "mcpServers": {
    "biblio": {
      "command": "npx",
      "args": ["biblio-mcp"]
    }
  }
}
```

## Tools

| Tool | What it does |
|---|---|
| `search_books` | Search Anna's Archive + Libgen + Z-Library at once; merged & deduped by MD5. |
| `book_details` | Full metadata + download options for one book by MD5. |
| `get_download_links` | Every resolvable download URL for an MD5 — Libgen `get.php`, Anna's partner servers, IPFS gateways. `direct: true` links point straight at the file. |
| `download_book` | Fetch the file to a local directory by MD5 (tries direct links in order). |
| `search_papers` | Academic paper / article search via Library Genesis scimag; returns DOIs. |
| `get_paper` | Resolve a paper's PDF via Sci-Hub by DOI, URL, or title. |

### Typical flow

1. `search_books({ query: "dune frank herbert" })` → results, each with an `md5`.
2. `get_download_links({ md5: "..." })` → pick a `direct: true` link, **or**
3. `download_book({ md5: "...", output_dir: "~/Downloads/books" })` → saved file.

For papers: `search_papers({ query: "CRISPR gene editing" })` → grab a `doi` →
`get_paper({ identifier: "10.1089/crispr.2019.0064" })`.

## Configuration

All optional — sensible defaults ship built-in. Override via environment variables:

| Variable | Purpose | Default |
|---|---|---|
| `BIBLIO_ANNAS_MIRRORS` | Comma-separated Anna's Archive base URLs | `.org, .se, .li, .gl` |
| `BIBLIO_LIBGEN_MIRRORS` | Comma-separated Libgen base URLs | `.li, .is, .rs, .st, .gs, .vg` |
| `BIBLIO_SCIHUB_MIRRORS` | Comma-separated Sci-Hub base URLs | `.se, .st, .ru` |
| `BIBLIO_ZLIB_MIRRORS` | Comma-separated Z-Library domains | `z-lib.io, z-library.sk, …` |
| `BIBLIO_IPFS_GATEWAYS` | IPFS gateway bases for CID fallback | `ipfs.io, cloudflare-ipfs, pinata` |
| `BIBLIO_TIMEOUT_MS` | Per-request timeout | `20000` |

## Known limitations

- **Sci-Hub** increasingly gates mirrors behind Cloudflare/captcha. `get_paper`
  extracts the PDF when the mirror serves a real page and otherwise returns the
  mirror URLs so you can open the article in a browser. This is inherent to
  Sci-Hub, not a bug in this server.
- **Z-Library** rotates domains and gates most of its catalog behind login. The
  built-in public search is best-effort; when it's blocked, Anna's Archive
  (which indexes the Z-Library collection) covers the same books. Point
  `BIBLIO_ZLIB_MIRRORS` at your working personal domain for better results.
- These sites change their HTML often. Parsers live in
  [`src/providers/`](src/providers/) and mirrors in
  [`src/mirrors.ts`](src/mirrors.ts) — both are small and easy to patch.

## Development

```bash
npm run dev     # run from source via tsx
npm run build   # compile to dist/
npm run smoke   # live end-to-end test against real mirrors
```

Architecture:

```
src/
  index.ts          MCP server + tool definitions
  http.ts           mirror-rotating fetch (retry, timeout, stickiness)
  mirrors.ts        all mirror domains — the one file to edit when hosts change
  types.ts          shared Book / Paper / DownloadLink model
  providers/
    annas.ts        Anna's Archive (primary book source + md5 resolver)
    libgen.ts       Library Genesis (books + scimag papers + direct downloads)
    scihub.ts       Sci-Hub (paper PDF resolution by DOI)
    zlibrary.ts     Z-Library (best-effort public search)
    index.ts        aggregation: fan-out, merge, dedup-by-md5
```

## Legal

This tool is a client that queries publicly reachable third-party websites; it
hosts no content itself. Copyright law varies by country. You are responsible
for ensuring your use complies with the laws of your jurisdiction and with the
rights of copyright holders. Provided for research, archival, and accessibility
purposes. The authors do not endorse copyright infringement.

## License

[MIT](LICENSE)
