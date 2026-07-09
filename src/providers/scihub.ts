// Sci-Hub provider — academic papers by DOI / title / URL.
//
// Sci-Hub takes a DOI (or an article URL/title) and returns a page embedding
// the PDF. We POST the identifier and extract the PDF src from the response.

import * as cheerio from "cheerio";
import { fetchFromMirrors } from "../http.js";
import { SCIHUB_MIRRORS } from "../mirrors.js";
import type { Paper } from "../types.js";

const GROUP = "scihub";

/** Normalize an embedded PDF src into an absolute URL. */
function absolutize(src: string, base: string): string {
  if (src.startsWith("//")) return `https:${src}`;
  if (src.startsWith("http")) return src;
  if (src.startsWith("/")) return `${base}${src}`;
  return `${base}/${src}`;
}

/**
 * Resolve a paper via Sci-Hub. `identifier` may be a DOI, an article URL, or a
 * title. Returns the paper with a `pdfUrl` when one is found.
 */
export async function resolve(identifier: string): Promise<Paper> {
  const id = identifier.trim();
  const { html, base, finalUrl } = await fetchFromMirrors(
    GROUP,
    SCIHUB_MIRRORS,
    (b) => `${b}/${encodeURIComponent(id)}`
  );

  const $ = cheerio.load(html);

  // The PDF lives in an <embed>/<iframe id="pdf"> or a "save" button onclick.
  let pdfSrc =
    $("embed#pdf").attr("src") ||
    $("iframe#pdf").attr("src") ||
    $("embed[type='application/pdf']").attr("src") ||
    $("#article embed").attr("src") ||
    $("#article iframe").attr("src") ||
    $("embed[src]").first().attr("src") ||
    "";

  if (!pdfSrc) {
    const onclick = $("a:contains('save'), button:contains('save')").attr("onclick") || "";
    const m = onclick.match(/location\.href=['"]([^'"]+)['"]/);
    if (m) pdfSrc = m[1];
  }
  if (!pdfSrc) {
    const m = html.match(/(?:src|href)=["']([^"']+\.pdf[^"']*)["']/i);
    if (m) pdfSrc = m[1];
  }

  // Strip viewer fragment (e.g. #view=FitH) from PDF URL.
  if (pdfSrc) pdfSrc = pdfSrc.replace(/#.*$/, "");

  const title =
    $("#citation i").first().text().trim() ||
    $("title").text().trim() ||
    id;

  const doi = id.match(/10\.\d{4,9}\/\S+/)?.[0];

  return {
    source: "scihub",
    title,
    doi,
    url: finalUrl,
    pdfUrl: pdfSrc ? absolutize(pdfSrc, base) : undefined,
    mirrors: SCIHUB_MIRRORS.map((m) => `${m}/${encodeURIComponent(id)}`),
  };
}
