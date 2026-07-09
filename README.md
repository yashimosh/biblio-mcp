# biblio-mcp

[![CI](https://github.com/yashimosh/biblio-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/yashimosh/biblio-mcp/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/biblio-mcp.svg)](https://www.npmjs.com/package/biblio-mcp)
[![license](https://img.shields.io/npm/l/biblio-mcp.svg)](LICENSE)

**One [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that searches Anna's Archive, Library Genesis (Libgen), Sci-Hub, and Z-Library — all at once.**

Search millions of books, academic papers, and research articles across every major shadow library through a single unified interface. Resolve download links and fetch files directly from your AI assistant — Claude Code, Claude Desktop, Cline, Cursor, or any MCP-compatible client.

No API keys. No login. No per-source servers to juggle. One server, six tools, four sources.

---

## What is biblio-mcp?

biblio-mcp is an open-source MCP server that acts as a unified search layer across the four largest shadow libraries on the internet. Instead of installing and configuring separate MCP servers for each source, biblio-mcp combines them into a single server with a shared data model and automatic deduplication.

It connects to any MCP client (Claude, Cline, Cursor, Windsurf, or custom agents) and gives your AI assistant the ability to search for books, find academic papers by DOI, resolve download links, and download files — all through natural language.

### How it works

1. **Fan-out search** — a single query hits Anna's Archive, Library Genesis, and Z-Library concurrently.
2. **MD5-based deduplication** — results from different sources for the same book are merged by MD5 hash (the universal identifier these libraries share), keeping the richest metadata from each.
3. **Mirror rotation** — every source declares a list of mirror domains. A dead or blocked host automatically falls through to the next working one, which is remembered for future requests.
4. **Fault isolation** — if one source is down, the others still return results. Failures are reported separately, never silently swallowed.

### Sources covered

| Source | What it provides | Coverage |
|---|---|---|
| **Anna's Archive** | Book search, metadata, download links (partner servers, IPFS) | 36M+ books and papers |
| **Library Genesis (Libgen)** | Book search, academic paper search (scimag), direct `get.php` downloads | 15M+ books, 100M+ papers |
| **Sci-Hub** | Paper PDF resolution by DOI, URL, or title | 85M+ research articles |
| **Z-Library** | Best-effort public book search (no login required) | 14M+ books |

## Install

Requires **Node.js ≥ 18**.

```bash
# Run directly (no install needed)
npx biblio-mcp

# Or clone and build locally
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

### Add to Claude Desktop / Cline / Cursor

Add to your MCP configuration file (`claude_desktop_config.json`, `cline_mcp_settings.json`, etc.):

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

### Add to any MCP client

biblio-mcp uses **stdio transport** — any MCP client that can launch a subprocess works. Point it at `npx biblio-mcp` (or `node dist/index.js` for a local build).

## Tools

| Tool | What it does |
|---|---|
| `search_books` | Search Anna's Archive + Libgen + Z-Library at once; merged & deduped by MD5. Returns title, author, year, format, size, and md5 for each result. |
| `book_details` | Full metadata + download options for one book by MD5 hash. |
| `get_download_links` | Every resolvable download URL for an MD5 — Libgen `get.php`, Anna's partner servers, IPFS gateways. Links marked `direct: true` point straight at the file. |
| `download_book` | Fetch the actual file to a local directory by MD5 (tries every direct link in order until one succeeds). |
| `search_papers` | Academic paper / article search via Library Genesis scimag; returns DOIs and metadata. |
| `get_paper` | Resolve a paper's PDF via Sci-Hub by DOI, URL, or title. Returns the direct PDF URL when available. |

### Typical flow

**Books:**

1. `search_books({ query: "dune frank herbert" })` → results, each with an `md5`
2. `get_download_links({ md5: "..." })` → pick a `direct: true` link, **or**
3. `download_book({ md5: "...", output_dir: "~/Downloads/books" })` → saved file

**Papers:**

1. `search_papers({ query: "CRISPR gene editing" })` → results with DOIs
2. `get_paper({ identifier: "10.1089/crispr.2019.0064" })` → direct PDF URL

## Configuration

All optional — sensible defaults ship built-in. Override via environment variables:

| Variable | Purpose | Default |
|---|---|---|
| `BIBLIO_ANNAS_MIRRORS` | Comma-separated Anna's Archive base URLs | `.org, .se, .li, .gl` |
| `BIBLIO_LIBGEN_MIRRORS` | Comma-separated Libgen base URLs | `.li, .is, .rs, .st, .gs, .vg` |
| `BIBLIO_SCIHUB_MIRRORS` | Comma-separated Sci-Hub base URLs | `.ren, .mksa.top, .hkvisa.net, .se, .st, .ru` |
| `BIBLIO_ZLIB_MIRRORS` | Comma-separated Z-Library domains | `z-lib.io, z-library.sk, …` |
| `BIBLIO_IPFS_GATEWAYS` | IPFS gateway bases for CID fallback | `ipfs.io, cloudflare-ipfs, pinata` |
| `BIBLIO_TIMEOUT_MS` | Per-request timeout | `20000` |

## Why biblio-mcp instead of separate servers?

| | biblio-mcp | Separate MCP servers |
|---|---|---|
| **Setup** | One `npx` command | Install 4 servers in 3 languages (Go, Python, Node) |
| **Config** | One entry in MCP settings | Four entries, four sets of env vars |
| **Dedup** | Automatic — same book from 3 sources = 1 result | Manual — you see duplicates |
| **Mirrors** | Built-in rotation, one file to update | Each server manages its own |
| **Fault tolerance** | Source down? Others still work | Server down? That source is gone |
| **Papers + Books** | Both in one server | Need separate servers for Sci-Hub vs Libgen |

## Known limitations

- **Sci-Hub** mirrors sometimes gate behind captcha, but the PDF embed URL is
  still present in the HTML for most mirrors. `get_paper` extracts it
  successfully in the vast majority of cases. If all mirrors fail, it returns
  fallback URLs so you can open the article in a browser.
- **Z-Library** rotates domains and gates most of its catalog behind login. The
  built-in public search is best-effort; when it's blocked, Anna's Archive
  (which indexes the Z-Library collection) covers the same books. Point
  `BIBLIO_ZLIB_MIRRORS` at your working personal domain for better results.
- These sites change their HTML often. Parsers live in
  [`src/providers/`](src/providers/) and mirrors in
  [`src/mirrors.ts`](src/mirrors.ts) — both are small and easy to patch.

## FAQ

### How do I search for books with Claude?

Install biblio-mcp (`claude mcp add -s user biblio -- npx biblio-mcp`), then ask Claude naturally: "Find me Dune by Frank Herbert as an EPUB." Claude calls `search_books` and `get_download_links` automatically.

### Does this work with ChatGPT or other AI assistants?

biblio-mcp uses the Model Context Protocol (MCP) standard. It works with any MCP-compatible client: Claude Code, Claude Desktop, Cline, Cursor, Windsurf, and custom agents built with the MCP SDK. ChatGPT does not currently support MCP.

### Do I need an account on any of these sites?

No. biblio-mcp queries publicly accessible pages only. No API keys, no login, no cookies. For Z-Library, an account gives access to more results — set `BIBLIO_ZLIB_MIRRORS` to your personal domain if you have one.

### What happens when a mirror goes down?

The server tries the next mirror in the list automatically. The first working mirror is remembered so subsequent requests are fast. If all mirrors for a source fail, that source returns an error but the other sources still return results.

### Can I add my own mirrors?

Yes. Set the corresponding environment variable (e.g. `BIBLIO_LIBGEN_MIRRORS="https://my-mirror.com,https://libgen.li"`) and your mirrors will be tried first.

### How is this different from the Anna's Archive MCP / Libgen MCP / Sci-Hub MCP?

Those are single-source servers. biblio-mcp combines all four into one server with cross-source deduplication, shared mirror rotation, and fault isolation. One install replaces four.

### Does biblio-mcp host or store any content?

No. It is a client that queries publicly reachable third-party websites and returns metadata and URLs. It hosts no files, stores no content, and maintains no index.

## Development

```bash
npm run dev     # run from source via tsx
npm run build   # compile to dist/
npm run smoke   # live end-to-end test against real mirrors
```

### Architecture

```
src/
  index.ts          MCP server + tool definitions (stdio transport)
  http.ts           mirror-rotating fetch (retry, timeout, per-host stickiness)
  mirrors.ts        all mirror domains — the one file to edit when hosts change
  types.ts          shared Book / Paper / DownloadLink data model
  providers/
    annas.ts        Anna's Archive (primary book source + md5 resolver)
    libgen.ts       Library Genesis (books + scimag papers + direct downloads)
    scihub.ts       Sci-Hub (paper PDF resolution by DOI)
    zlibrary.ts     Z-Library (best-effort public search)
    index.ts        aggregation: fan-out, merge, dedup-by-md5
```

### Contributing

PRs welcome — especially for parser fixes when sites change their HTML. The most common maintenance task is updating [`src/mirrors.ts`](src/mirrors.ts) when domains rotate.

## Legal

This tool is a client that queries publicly reachable third-party websites; it
hosts no content itself. Copyright law varies by country. You are responsible
for ensuring your use complies with the laws of your jurisdiction and with the
rights of copyright holders. Provided for research, archival, and accessibility
purposes. The authors do not endorse copyright infringement.

## License

[MIT](LICENSE)
