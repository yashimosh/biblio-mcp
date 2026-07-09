# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/).

## [1.0.0] - 2026-07-08

Initial release.

### Added
- `search_books` — fan-out search across Anna's Archive, Libgen, and Z-Library, deduped by MD5
- `book_details` — full metadata for a book by MD5
- `get_download_links` — resolvable download URLs for an MD5 (Libgen direct, Anna's partner servers, IPFS gateways)
- `download_book` — fetch a file to a local directory by MD5
- `search_papers` — academic paper search via Library Genesis scimag
- `get_paper` — resolve a paper's PDF via Sci-Hub by DOI, URL, or title
- Mirror rotation with per-host stickiness and env var overrides for every source
- Per-source fault isolation via `Promise.allSettled`

[1.0.0]: https://github.com/yashimosh/biblio-mcp/releases/tag/v1.0.0
