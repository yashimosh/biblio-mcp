#!/usr/bin/env node
// biblio-mcp — one MCP server for Anna's Archive, Library Genesis, Sci-Hub, and
// Z-Library. Search books and papers, resolve download links, fetch files.
//
// Transport: stdio. Run with `npx biblio-mcp` or `node dist/index.js`.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { writeFile, mkdir } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { getBuffer } from "./http.js";
import {
  searchBooks,
  resolveDownloads,
  BOOK_SOURCES,
  annas,
  libgen,
  scihub,
} from "./providers/index.js";
import type { SourceId } from "./types.js";

const server = new McpServer({ name: "biblio-mcp", version: "1.0.0" });

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

// ---------------------------------------------------------------------------
// search_books — the headline tool
// ---------------------------------------------------------------------------
server.tool(
  "search_books",
  "Search for books/documents across Anna's Archive, Library Genesis, and " +
    "Z-Library at once. Results are merged and de-duplicated by MD5 hash. Each " +
    "result includes an `md5` you can pass to get_download_links or download_book.",
  {
    query: z.string().describe("Title, author, ISBN, or topic to search for."),
    sources: z
      .array(z.enum(["annas", "libgen", "zlibrary"]))
      .optional()
      .describe("Which sources to search. Default: all three."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Max results per source (default 20)."),
  },
  async ({ query, sources, limit }) => {
    const result = await searchBooks(
      query,
      (sources as SourceId[]) ?? BOOK_SOURCES,
      limit ?? 20
    );
    return json({ ...result, total: result.results.length });
  }
);

// ---------------------------------------------------------------------------
// book_details — full metadata + download options for one record
// ---------------------------------------------------------------------------
server.tool(
  "book_details",
  "Get full metadata and download options for a single book by its MD5 hash " +
    "(from a search_books result). Resolves against Anna's Archive.",
  {
    md5: z.string().regex(/^[a-fA-F0-9]{32}$/, "must be a 32-char MD5 hash"),
  },
  async ({ md5 }) => json(await annas.details(md5.toLowerCase()))
);

// ---------------------------------------------------------------------------
// get_download_links — every resolvable download URL for an md5
// ---------------------------------------------------------------------------
server.tool(
  "get_download_links",
  "Resolve every available download link for a book by MD5 — Libgen direct " +
    "(get.php), Anna's Archive partners, and IPFS gateways. Links marked " +
    "`direct: true` point straight at the file.",
  {
    md5: z.string().regex(/^[a-fA-F0-9]{32}$/, "must be a 32-char MD5 hash"),
  },
  async ({ md5 }) => {
    const links = await resolveDownloads(md5.toLowerCase());
    return json({ md5: md5.toLowerCase(), count: links.length, links });
  }
);

// ---------------------------------------------------------------------------
// download_book — fetch the file to disk (Libgen direct path)
// ---------------------------------------------------------------------------
server.tool(
  "download_book",
  "Download a book file to a local directory by MD5. Tries direct links " +
    "(Libgen/IPFS) in order and saves the first that yields a file. Returns the " +
    "saved path, or the full link list if no direct download succeeds.",
  {
    md5: z.string().regex(/^[a-fA-F0-9]{32}$/, "must be a 32-char MD5 hash"),
    output_dir: z
      .string()
      .describe("Absolute path to an existing or creatable directory."),
    filename: z
      .string()
      .optional()
      .describe("Optional filename; defaults to <md5>.<ext>."),
  },
  async ({ md5, output_dir, filename }) => {
    const hash = md5.toLowerCase();
    const links = await resolveDownloads(hash);
    const direct = links.filter((l) => l.direct);
    if (direct.length === 0)
      return json({
        saved: false,
        reason: "No direct download link resolved. Use these links manually.",
        links,
      });

    const dir = isAbsolute(output_dir) ? output_dir : join(process.cwd(), output_dir);
    await mkdir(dir, { recursive: true });

    const errors: string[] = [];
    for (const link of direct) {
      try {
        const { buffer, contentType } = await getBuffer(link.url);
        // Reject obvious HTML error pages masquerading as downloads.
        if (
          (contentType?.includes("text/html") ?? false) &&
          buffer.length < 50_000
        ) {
          errors.push(`${link.label}: got HTML, not a file`);
          continue;
        }
        const ext =
          filename?.split(".").pop() ||
          (contentType?.includes("epub")
            ? "epub"
            : contentType?.includes("pdf")
              ? "pdf"
              : "bin");
        const name = filename ?? `${hash}.${ext}`;
        const path = join(dir, name);
        await writeFile(path, buffer);
        return json({
          saved: true,
          path,
          bytes: buffer.length,
          via: link.label,
        });
      } catch (e) {
        errors.push(`${link.label}: ${(e as Error).message}`);
      }
    }
    return json({ saved: false, errors, links });
  }
);

// ---------------------------------------------------------------------------
// search_papers — academic articles via Library Genesis scimag
// ---------------------------------------------------------------------------
server.tool(
  "search_papers",
  "Search academic papers / journal articles by keyword, author, title, or " +
    "DOI via Library Genesis scimag. Returns DOIs and mirror links. To fetch a " +
    "PDF, pass the DOI to get_paper.",
  {
    query: z.string().describe("Keywords, title, author, or DOI."),
    limit: z.number().int().min(1).max(100).optional(),
  },
  async ({ query, limit }) => {
    const papers = await libgen.searchPapers(query, limit ?? 20);
    return json({ query, total: papers.length, results: papers });
  }
);

// ---------------------------------------------------------------------------
// get_paper — resolve a PDF via Sci-Hub by DOI / URL / title
// ---------------------------------------------------------------------------
server.tool(
  "get_paper",
  "Resolve a paper's PDF via Sci-Hub. Accepts a DOI (best), an article URL, or " +
    "a title. Returns metadata and a direct `pdfUrl` when available.",
  {
    identifier: z
      .string()
      .describe("DOI (e.g. 10.1038/nature12373), article URL, or title."),
  },
  async ({ identifier }) => json(await scihub.resolve(identifier))
);

// ---------------------------------------------------------------------------
const transport = new StdioServerTransport();
await server.connect(transport);
