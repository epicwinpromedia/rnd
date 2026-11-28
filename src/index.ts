/**
 * rnd.epicwinpromedia.com — Doc Server v2 (Cloudflare Worker + R2)
 *
 * Ground source of truth for everything EPIC WIN Pro Media publishes as writing.
 * Reads exclusively from its own R2 bucket (`DOCS_BUCKET`).
 *
 * Format resolution priority (Invariant 5):
 *   1. Path extension (.html | .md | .pdf | .jsonld)
 *   2. Format subdomain (html.rnd.* | md.rnd.* | pdf.rnd.* | jsonld.rnd.*)
 *   3. HTTP Accept header (with q-value parsing)
 *   4. Default: html
 */

import { slugifyTaxonomy } from "./canonical.ts";
import { handleIngest } from "./ingest.ts";
import { resolvePdf } from "./pdf.ts";
import {
  renderAuthorHtml,
  renderAuthorJsonLd,
  renderCollectionJsonLd,
  renderCollectionMarkdown,
  renderIndexHtml,
  renderListingHtml,
  renderSitemapXml,
  renderVersionsHtml,
  renderVersionsJsonLd,
  renderWorkHtml,
  renderWorkJsonLd,
  renderWorkMarkdown,
} from "./render.ts";
import { CANONICAL_ORIGIN, PRIMARY_AUTHOR, SCHEMAS_BY_NAME } from "./schemas.ts";
import { getListedEntries, loadManifest, loadSnapshot } from "./storage.ts";
import type {
  DocFormat,
  Env,
  ExecutionContextLike,
  ManifestEntry,
  WorkSnapshot,
} from "./types.ts";

export const CONTENT_TYPES: Record<DocFormat, string> = {
  html: "text/html; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  pdf: "application/pdf",
  jsonld: "application/ld+json; charset=utf-8",
};

const VALID_FORMATS = new Set<DocFormat>(["html", "md", "pdf", "jsonld"]);
const X_ROBOTS_TAG = "noindex, nofollow, noarchive";
const STRICT_HTML_CSP =
  "default-src 'none'; style-src 'unsafe-inline' 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const UNANIMOUS_CACHE_CONTROL = "public, max-age=300, s-maxage=31536000";
const NEGOTIATED_CACHE_CONTROL = "private, max-age=300";

function isFormatSubdomain(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h.startsWith("md.") ||
    h.startsWith("pdf.") ||
    h.startsWith("html.") ||
    h.startsWith("jsonld.")
  );
}

/**
 * Resolve requested output format strictly in priority order:
 *   1. Path extension (.md | .pdf | .html | .jsonld)
 *   2. Format subdomain (md.rnd.* | pdf.rnd.* | html.rnd.* | jsonld.rnd.*)
 *   3. Accept header (text/markdown | application/pdf | application/ld+json | text/html)
 *   4. Default: html
 */
export function resolveFormat(
  pathExt: string | undefined,
  hostname: string,
  acceptHeader: string | null,
): DocFormat {
  // 1. Explicit file extension on path
  if (pathExt && VALID_FORMATS.has(pathExt as DocFormat)) {
    return pathExt as DocFormat;
  }

  // 2. Format subdomain (e.g. md.rnd.epicwinpromedia.com)
  const hostLower = hostname.toLowerCase();
  if (hostLower.startsWith("md.")) return "md";
  if (hostLower.startsWith("pdf.")) return "pdf";
  if (hostLower.startsWith("html.")) return "html";
  if (hostLower.startsWith("jsonld.")) return "jsonld";

  // 3. HTTP Accept header negotiation (respect basic q-values if present)
  if (acceptHeader) {
    const accept = acceptHeader.toLowerCase();
    const candidates: Array<{ fmt: DocFormat; q: number; pos: number }> = [];
    const parts = accept.split(",");
    parts.forEach((part, idx) => {
      const [mediaRaw, ...params] = part.trim().split(";");
      const media = mediaRaw.trim();
      let q = 1.0;
      for (const p of params) {
        const [k, v] = p.trim().split("=");
        if (k === "q" && v !== undefined) {
          const parsed = Number.parseFloat(v);
          if (!Number.isNaN(parsed)) q = parsed;
        }
      }
      if (q <= 0) return;
      if (media === "text/markdown" || media === "text/x-markdown") {
        candidates.push({ fmt: "md", q, pos: idx });
      } else if (media === "application/pdf") {
        candidates.push({ fmt: "pdf", q, pos: idx });
      } else if (media === "application/ld+json") {
        candidates.push({ fmt: "jsonld", q, pos: idx });
      } else if (media === "text/html") {
        candidates.push({ fmt: "html", q, pos: idx });
      }
    });
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.q - a.q || a.pos - b.pos);
      return candidates[0].fmt;
    }
  }

  // 4. Default
  return "html";
}

function applyCommonHeaders(
  headers: Headers,
  options: {
    format: DocFormat;
    negotiated: boolean;
    publicIndexing: boolean;
    cacheTags?: string[];
  },
): void {
  headers.set("Content-Type", CONTENT_TYPES[options.format]);
  if (options.negotiated) {
    headers.set("Vary", "Accept");
    headers.set("Cache-Control", NEGOTIATED_CACHE_CONTROL);
  } else {
    headers.set("Cache-Control", UNANIMOUS_CACHE_CONTROL);
  }
  if (!options.publicIndexing) {
    headers.set("X-Robots-Tag", X_ROBOTS_TAG);
  }
  if (options.format === "html") {
    headers.set("Content-Security-Policy", STRICT_HTML_CSP);
    headers.set("X-Content-Type-Options", "nosniff");
  } else {
    headers.set("X-Content-Type-Options", "nosniff");
  }
  if (options.cacheTags && options.cacheTags.length > 0) {
    headers.set("Cache-Tag", options.cacheTags.join(", "));
  }
}

function buildWorkLinkHeader(
  snapshot: WorkSnapshot,
  entry: ManifestEntry,
  origin: string,
): string {
  const base = `${origin}/${snapshot.type}/${snapshot.slug}`;
  const links: string[] = [
    `<${base}>; rel="canonical"`,
    `<${origin}/schemas/${snapshot.type}.schema.json>; rel="describedby"`,
    `<${snapshot.license}>; rel="license"`,
    `<${base}/v${entry.latestVersion}>; rel="latest-version"`,
    `<${base}/versions>; rel="version-history"`,
  ];

  const versionNums = entry.versions.map((v) => v.version).sort((a, b) => a - b);
  const idx = versionNums.indexOf(snapshot.version);
  if (idx > 0) {
    links.push(`<${base}/v${versionNums[idx - 1]}>; rel="predecessor-version"`);
  }
  if (idx >= 0 && idx < versionNums.length - 1) {
    links.push(`<${base}/v${versionNums[idx + 1]}>; rel="successor-version"`);
  }
  return links.join(", ");
}

function textNotFound(message: string, isHead: boolean, publicIndexing: boolean): Response {
  const headers = new Headers({
    "Content-Type": "text/plain; charset=utf-8",
    Vary: "Accept",
  });
  if (!publicIndexing) headers.set("X-Robots-Tag", X_ROBOTS_TAG);
  return new Response(isHead ? null : message, { status: 404, headers });
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx?: ExecutionContextLike,
  ): Promise<Response> {
    const url = new URL(request.url);
    const hostname = url.hostname.toLowerCase();
    const pathname = url.pathname;
    const origin = env.CANONICAL_ORIGIN ?? CANONICAL_ORIGIN;
    const publicIndexing = env.PUBLIC_INDEXING === "true";

    // 0. Redirect research.epicwinpromedia.com/* -> rnd.epicwinpromedia.com/*
    if (hostname === "research.epicwinpromedia.com") {
      return Response.redirect(`${origin}${pathname}${url.search}`, 301);
    }

    // 1. Signed publish ingest endpoint (POST /_ingest)
    if (pathname === "/_ingest") {
      return handleIngest(request, env, ctx);
    }

    // Public paths allow GET and HEAD only
    const method = request.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      const headers = new Headers({ Allow: "GET, HEAD" });
      if (!publicIndexing) headers.set("X-Robots-Tag", X_ROBOTS_TAG);
      return new Response("Method Not Allowed", { status: 405, headers });
    }

    const isHead = method === "HEAD";
    const acceptHeader = request.headers.get("Accept");
    const hostFixesFormat = isFormatSubdomain(hostname);

    // 2. /robots.txt
    if (pathname === "/robots.txt") {
      const body = publicIndexing
        ? `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`
        : "User-agent: *\nDisallow: /\n";
      const headers = new Headers({
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      });
      if (!publicIndexing) headers.set("X-Robots-Tag", X_ROBOTS_TAG);
      return new Response(isHead ? null : body, { status: 200, headers });
    }

    // 3. /schemas/{work|essay|paper}.schema.json
    const schemaMatch = pathname.match(/^\/schemas\/([a-z0-9-]+)\.schema\.json$/i);
    if (schemaMatch) {
      const schemaName = schemaMatch[1].toLowerCase();
      const schemaObj = SCHEMAS_BY_NAME[schemaName];
      if (!schemaObj) {
        return textNotFound(`Schema not found: ${schemaName}`, isHead, publicIndexing);
      }
      const headers = new Headers({
        "Content-Type": "application/schema+json; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      });
      if (!publicIndexing) headers.set("X-Robots-Tag", X_ROBOTS_TAG);
      return new Response(isHead ? null : JSON.stringify(schemaObj, null, 2), {
        status: 200,
        headers,
      });
    }

    // 4. /assets/{slug}/{file}
    const assetMatch = pathname.match(/^\/assets\/([a-z0-9-]+)\/([a-zA-Z0-9._-]+)$/);
    if (assetMatch) {
      const key = `assets/${assetMatch[1].toLowerCase()}/${assetMatch[2]}`;
      const obj = isHead ? await env.DOCS_BUCKET.head(key) : await env.DOCS_BUCKET.get(key);
      if (!obj) return textNotFound(`Asset not found: ${key}`, isHead, publicIndexing);
      const headers = new Headers({
        "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
        "Cache-Control": UNANIMOUS_CACHE_CONTROL,
        "Cache-Tag": `slug-${assetMatch[1].toLowerCase()}`,
      });
      if (!publicIndexing) headers.set("X-Robots-Tag", X_ROBOTS_TAG);
      if (obj.httpEtag) headers.set("ETag", obj.httpEtag);
      return new Response(isHead ? null : (obj as R2ObjectBody).body, { status: 200, headers });
    }

    // Load manifest for all content/index/taxonomy/sitemap routes
    const manifest = await loadManifest(env.DOCS_BUCKET);

    // 5. /sitemap.xml
    if (pathname === "/sitemap.xml") {
      const xml = renderSitemapXml(manifest, origin);
      const headers = new Headers({
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": UNANIMOUS_CACHE_CONTROL,
        "Cache-Tag": "sitemap",
      });
      if (!publicIndexing) headers.set("X-Robots-Tag", X_ROBOTS_TAG);
      return new Response(isHead ? null : xml, { status: 200, headers });
    }

    // 6. Index portal: /
    if (pathname === "/" || pathname === "") {
      const negotiated = !hostFixesFormat;
      let format = resolveFormat(undefined, hostname, acceptHeader);
      if (format === "pdf") format = "html"; // Index supports html, md, jsonld
      const headers = new Headers({
        Link: `<${origin}/>; rel="canonical", <${origin}/schemas/work.schema.json>; rel="describedby"`,
      });
      applyCommonHeaders(headers, { format, negotiated, publicIndexing, cacheTags: ["index"] });

      const listed = getListedEntries(manifest);
      const body =
        format === "md"
          ? renderCollectionMarkdown(
              "EPIC WIN R&D — Canonical Research & Essay Archive",
              "Ground source of truth for EPIC WIN Pro Media essays and research papers.",
              listed,
              origin,
            )
          : format === "jsonld"
            ? renderCollectionJsonLd(
                "EPIC WIN R&D — Canonical Research & Essay Archive",
                `${origin}/`,
                listed,
                origin,
              )
            : renderIndexHtml(manifest, { origin, publicIndexing });
      return new Response(isHead ? null : body, { status: 200, headers });
    }

    // 7. Type listings: /essay/ or /paper/ (optional .ext)
    const typeListingMatch = pathname.match(/^\/(essay|paper)(?:\.([a-z0-9]+))?\/?$/i);
    if (typeListingMatch) {
      const typeName = typeListingMatch[1].toLowerCase();
      const pathExt = typeListingMatch[2]?.toLowerCase();
      if (pathExt && !VALID_FORMATS.has(pathExt as DocFormat)) {
        return textNotFound(`Unsupported format: .${pathExt}`, isHead, publicIndexing);
      }
      const negotiated = !pathExt && !hostFixesFormat;
      let format = resolveFormat(pathExt, hostname, acceptHeader);
      if (format === "pdf") format = "html";

      const entries = getListedEntries(manifest).filter((e) => e.type === typeName);
      const label = typeName === "paper" ? "Research Papers" : "Essays";
      const canonicalUrl = `${origin}/${typeName}/`;
      const headers = new Headers({
        Link: `<${canonicalUrl}>; rel="canonical", <${origin}/schemas/${typeName}.schema.json>; rel="describedby"`,
      });
      applyCommonHeaders(headers, {
        format,
        negotiated,
        publicIndexing,
        cacheTags: [`type-${typeName}`],
      });

      const body =
        format === "md"
          ? renderCollectionMarkdown(label, `All listed ${label.toLowerCase()} on rnd.epicwinpromedia.com.`, entries, origin)
          : format === "jsonld"
            ? renderCollectionJsonLd(label, canonicalUrl, entries, origin)
            : renderListingHtml(label, canonicalUrl, entries, { origin, publicIndexing });
      return new Response(isHead ? null : body, { status: 200, headers });
    }

    // 8. Taxonomy views: /series/{series}[.{ext}] and /tags/{tag}[.{ext}]
    const taxMatch = pathname.match(/^\/(series|tags)\/([a-z0-9-]+?)(?:\.([a-z0-9]+))?\/?$/i);
    if (taxMatch) {
      const axis = taxMatch[1].toLowerCase();
      const keySlug = slugifyTaxonomy(taxMatch[2]);
      const pathExt = taxMatch[3]?.toLowerCase();
      if (pathExt && !VALID_FORMATS.has(pathExt as DocFormat)) {
        return textNotFound(`Unsupported format: .${pathExt}`, isHead, publicIndexing);
      }
      const negotiated = !pathExt && !hostFixesFormat;
      let format = resolveFormat(pathExt, hostname, acceptHeader);
      if (format === "pdf") format = "html";

      const listed = getListedEntries(manifest);
      const entries =
        axis === "series"
          ? listed.filter((e) => e.seriesSlug === keySlug)
          : listed.filter((e) => e.tagSlugs.includes(keySlug));

      const displayName =
        axis === "series"
          ? entries[0]?.series ?? keySlug
          : entries
              .flatMap((e) => e.tags)
              .find((t) => slugifyTaxonomy(t) === keySlug) ?? keySlug;

      const heading = axis === "series" ? `Series: ${displayName}` : `Tag: ${displayName}`;
      const canonicalUrl = `${origin}/${axis}/${keySlug}`;
      const tagPrefix = axis === "series" ? "series" : "tag";
      const headers = new Headers({
        Link: `<${canonicalUrl}>; rel="canonical", <${origin}/schemas/work.schema.json>; rel="describedby"`,
      });
      applyCommonHeaders(headers, {
        format,
        negotiated,
        publicIndexing,
        cacheTags: [`${tagPrefix}-${keySlug}`],
      });

      const body =
        format === "md"
          ? renderCollectionMarkdown(heading, `Works in ${heading}.`, entries, origin)
          : format === "jsonld"
            ? renderCollectionJsonLd(heading, canonicalUrl, entries, origin)
            : renderListingHtml(heading, canonicalUrl, entries, { origin, publicIndexing });
      return new Response(isHead ? null : body, { status: 200, headers });
    }

    // 9. Author page: /author/{orcid}[.{ext}]
    const authorMatch = pathname.match(
      /^\/author\/([0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X])(?:\.([a-z0-9]+))?\/?$/i,
    );
    if (authorMatch) {
      const orcid = authorMatch[1].toUpperCase();
      const pathExt = authorMatch[2]?.toLowerCase();
      if (pathExt && pathExt !== "html" && pathExt !== "jsonld") {
        return textNotFound(`Unsupported format on /author/: .${pathExt}`, isHead, publicIndexing);
      }
      const entries = getListedEntries(manifest).filter((e) =>
        e.authors.some((a) => a.orcid?.toUpperCase() === orcid),
      );
      if (entries.length === 0 && orcid !== PRIMARY_AUTHOR.orcid) {
        return textNotFound(`Author not found: ${orcid}`, isHead, publicIndexing);
      }
      const negotiated = !pathExt && !hostFixesFormat;
      let format = resolveFormat(pathExt, hostname, acceptHeader);
      if (format !== "jsonld") format = "html";

      const headers = new Headers({
        Link: `<${origin}/author/${orcid}>; rel="canonical", <${origin}/schemas/work.schema.json>; rel="describedby"`,
      });
      applyCommonHeaders(headers, { format, negotiated, publicIndexing, cacheTags: ["author"] });

      const body =
        format === "jsonld"
          ? renderAuthorJsonLd(orcid, entries, origin)
          : renderAuthorHtml(orcid, entries, { origin, publicIndexing });
      return new Response(isHead ? null : body, { status: 200, headers });
    }

    // 10. Version history: /{type}/{slug}/versions[.{ext}]
    const versionsMatch = pathname.match(
      /^\/([a-z0-9-]+)\/([a-z0-9-]+)\/versions(?:\.([a-z0-9]+))?\/?$/i,
    );
    if (versionsMatch) {
      const reqType = versionsMatch[1].toLowerCase();
      const slug = versionsMatch[2].toLowerCase();
      const pathExt = versionsMatch[3]?.toLowerCase();
      if (pathExt && pathExt !== "html" && pathExt !== "jsonld") {
        return textNotFound(`Unsupported format on /versions: .${pathExt}`, isHead, publicIndexing);
      }
      const entry = manifest.entries[slug];
      if (!entry) return textNotFound(`Work not found: ${slug}`, isHead, publicIndexing);
      if (entry.type !== reqType) {
        const suffix = pathExt ? `.${pathExt}` : "";
        return Response.redirect(`${origin}/${entry.type}/${slug}/versions${suffix}`, 301);
      }
      const negotiated = !pathExt && !hostFixesFormat;
      let format = resolveFormat(pathExt, hostname, acceptHeader);
      if (format !== "jsonld") format = "html";

      const headers = new Headers({
        Link: `<${origin}/${entry.type}/${slug}/versions>; rel="canonical", <${origin}/schemas/${entry.type}.schema.json>; rel="describedby"`,
      });
      applyCommonHeaders(headers, {
        format,
        negotiated,
        publicIndexing,
        cacheTags: [`slug-${slug}`],
      });
      const body =
        format === "jsonld"
          ? renderVersionsJsonLd(entry, origin)
          : renderVersionsHtml(entry, { origin, publicIndexing });
      return new Response(isHead ? null : body, { status: 200, headers });
    }

    // 11. Work routes: /{type}/{slug}/v{n}[.{ext}] or /{type}/{slug}[.{ext}]
    const workMatch = pathname.match(
      /^\/([a-z0-9-]+)\/([a-z0-9-]+?)(?:\/v(\d+))?(?:\.([a-z0-9]+))?\/?$/i,
    );
    if (!workMatch) {
      return textNotFound("Not Found", isHead, publicIndexing);
    }

    const reqType = workMatch[1].toLowerCase();
    const slug = workMatch[2].toLowerCase();
    const versionStr = workMatch[3];
    const pathExt = workMatch[4]?.toLowerCase();

    if (pathExt && !VALID_FORMATS.has(pathExt as DocFormat)) {
      return textNotFound(`Unsupported format: .${pathExt}`, isHead, publicIndexing);
    }

    const entry = manifest.entries[slug];
    if (!entry) {
      return textNotFound(`Work not found: ${slug}`, isHead, publicIndexing);
    }

    // Wrong type prefix -> 301 to the right type (unambiguous because slugs are unique across types)
    if (entry.type !== reqType) {
      const versionPart = versionStr ? `/v${versionStr}` : "";
      const extPart = pathExt ? `.${pathExt}` : "";
      return Response.redirect(`${origin}/${entry.type}/${slug}${versionPart}${extPart}`, 301);
    }

    const requestedVersion = versionStr ? Number.parseInt(versionStr, 10) : entry.latestVersion;
    const snapshot = await loadSnapshot(env.DOCS_BUCKET, slug, requestedVersion);
    if (!snapshot) {
      return textNotFound(`Version v${requestedVersion} not found for ${slug}`, isHead, publicIndexing);
    }

    const format = resolveFormat(pathExt, hostname, acceptHeader);
    const negotiated = !pathExt && !hostFixesFormat;
    const etag = `"${snapshot.contentHash}-${format}"`;

    // Conditional ETag check
    const ifNoneMatch = request.headers.get("If-None-Match");
    if (ifNoneMatch && ifNoneMatch.trim() === etag) {
      const notModHeaders = new Headers({
        ETag: etag,
        Link: buildWorkLinkHeader(snapshot, entry, origin),
      });
      applyCommonHeaders(notModHeaders, {
        format,
        negotiated,
        publicIndexing,
        cacheTags: format === "pdf" ? [`slug-${slug}`, `pdf-${slug}`] : [`slug-${slug}`],
      });
      return new Response(null, { status: 304, headers: notModHeaders });
    }

    const headers = new Headers({
      ETag: etag,
      Link: buildWorkLinkHeader(snapshot, entry, origin),
    });
    applyCommonHeaders(headers, {
      format,
      negotiated,
      publicIndexing,
      cacheTags: format === "pdf" ? [`slug-${slug}`, `pdf-${slug}`] : [`slug-${slug}`],
    });

    if (format === "pdf") {
      try {
        const pdfResult = await resolvePdf(snapshot, entry, manifest, env, ctx, isHead);
        if (!pdfResult) {
          return textNotFound(`PDF not yet rendered for ${slug} v${requestedVersion}`, isHead, publicIndexing);
        }
        if (typeof pdfResult.size === "number") {
          headers.set("Content-Length", String(pdfResult.size));
        }
        return new Response(isHead ? null : (pdfResult.body as BodyInit), {
          status: 200,
          headers,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "PDF render failed";
        return new Response(isHead ? null : msg, {
          status: 503,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Retry-After": "10",
            ...(!publicIndexing ? { "X-Robots-Tag": X_ROBOTS_TAG } : {}),
          },
        });
      }
    }

    const body =
      format === "md"
        ? renderWorkMarkdown(snapshot, origin)
        : format === "jsonld"
          ? renderWorkJsonLd(snapshot, manifest, origin)
          : renderWorkHtml(snapshot, entry, manifest, {
              origin,
              publicIndexing,
              isVersionRoute: Boolean(versionStr),
            });

    return new Response(isHead ? null : body, { status: 200, headers });
  },
};
