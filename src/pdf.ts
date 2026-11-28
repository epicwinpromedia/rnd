import { escapeHtml } from "./markdown.ts";
import { renderWorkHtml } from "./render.ts";
import { CANONICAL_ORIGIN } from "./schemas.ts";
import { latestPdfKey, regenPdfKey } from "./storage.ts";
import type {
  Env,
  ExecutionContextLike,
  Manifest,
  ManifestEntry,
  WorkSnapshot,
} from "./types.ts";

export interface PdfLookupResult {
  body: ReadableStream | ArrayBuffer | Uint8Array | null;
  size?: number;
  etag?: string;
  source: "latest" | "regen" | "rendered";
}

function buildPdfFooterTemplate(snapshot: WorkSnapshot, renderedAt: string): string {
  const shortHash = snapshot.contentHash.slice(0, 12);
  const dateOnly = renderedAt.slice(0, 10);
  const notice = `${snapshot.slug} · v${snapshot.version} · sha256:${shortHash} · rendered ${dateOnly} · © ${snapshot.copyrightYear} ${snapshot.copyrightHolder.name} (CC BY-NC-ND 4.0)`;
  return `<div style="width:100%;font-size:7pt;font-family:sans-serif;color:#555;padding:0 0.6in;display:flex;justify-content:space-between;"><span>${escapeHtml(notice)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
}

/**
 * Render a tagged, accessible PDF from a WorkSnapshot using Cloudflare Browser Run.
 */
export async function renderPdfBytes(
  snapshot: WorkSnapshot,
  entry: ManifestEntry | undefined,
  manifest: Manifest | undefined,
  env: Env,
): Promise<Uint8Array> {
  if (!env.BROWSER) {
    throw new Error("BROWSER binding is not configured for PDF rendering.");
  }

  const origin = env.CANONICAL_ORIGIN ?? CANONICAL_ORIGIN;
  const html = renderWorkHtml(snapshot, entry, manifest, {
    origin,
    publicIndexing: env.PUBLIC_INDEXING === "true",
    isVersionRoute: true,
  });

  const renderedAt = new Date().toISOString();
  const res = await env.BROWSER.fetch("https://browser/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      html,
      pdfOptions: {
        format: "letter",
        printBackground: true,
        tagged: true,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: buildPdfFooterTemplate(snapshot, renderedAt),
        margin: {
          top: "0.85in",
          bottom: "0.95in",
          left: "0.8in",
          right: "0.8in",
        },
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Browser Run PDF render failed (${res.status}): ${detail}`);
  }

  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Resolve a PDF request according to the v2 Versioning & PDF strategy:
 *   1. (Edge cache handled by Workers Caching before this runs)
 *   2. If version is latest and pdf/latest/{slug}.pdf matches version metadata -> serve
 *   3. If pdf/regen/{slug}/v{n}.pdf exists -> serve
 *   4. Otherwise (GET only): render via Browser Run, store in pdf/regen/ in background, serve.
 *      HEAD requests stop at step 3 and NEVER trigger a render.
 */
export async function resolvePdf(
  snapshot: WorkSnapshot,
  entry: ManifestEntry,
  manifest: Manifest,
  env: Env,
  ctx: ExecutionContextLike | undefined,
  isHead: boolean,
): Promise<PdfLookupResult | null> {
  const isLatest = snapshot.version === entry.latestVersion;

  // Step 2: latest PDF in R2
  if (isLatest) {
    const key = latestPdfKey(snapshot.slug);
    const obj = isHead ? await env.DOCS_BUCKET.head(key) : await env.DOCS_BUCKET.get(key);
    if (obj && obj.customMetadata?.version === String(snapshot.version)) {
      return {
        body: isHead ? null : (obj as R2ObjectBody).body,
        size: obj.size,
        etag: obj.httpEtag,
        source: "latest",
      };
    }
  }

  // Step 3: regen PDF in R2
  const regenKey = regenPdfKey(snapshot.slug, snapshot.version);
  const regenObj = isHead
    ? await env.DOCS_BUCKET.head(regenKey)
    : await env.DOCS_BUCKET.get(regenKey);
  if (regenObj) {
    return {
      body: isHead ? null : (regenObj as R2ObjectBody).body,
      size: regenObj.size,
      etag: regenObj.httpEtag,
      source: "regen",
    };
  }

  // HEAD never starts a render
  if (isHead) {
    return null;
  }

  // Step 4: On-demand render via Browser Run
  const bytes = await renderPdfBytes(snapshot, entry, manifest, env);
  const putPromise = env.DOCS_BUCKET.put(regenKey, bytes, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: {
      slug: snapshot.slug,
      version: String(snapshot.version),
      contentHash: snapshot.contentHash,
      renderedAt: new Date().toISOString(),
    },
  });

  if (ctx?.waitUntil) {
    ctx.waitUntil(putPromise);
  } else {
    await putPromise;
  }

  return {
    body: bytes,
    size: bytes.byteLength,
    source: "rendered",
  };
}
