/**
 * Service B: rnd.epicwinpromedia.com — Canonical Multi-Format Research Paper & Essay Server
 *
 * Implements "Markdown for Agents" proof with zero sub-request hops (reads directly from R2).
 * Format resolution priority:
 *   1. Explicit file extension on path (/rp/{slug}.md, .pdf, .html, .jsonld)
 *   2. Format subdomain (md.rnd.*, pdf.rnd.*, html.rnd.*, jsonld.rnd.*)
 *   3. HTTP Accept header (text/markdown, application/pdf, application/ld+json, default html)
 *
 * Enforces unlisted hygiene:
 *   - GET /robots.txt -> Disallow: /
 *   - X-Robots-Tag: noindex, nofollow, noarchive on EVERY response
 *   - Vary: Accept on EVERY negotiated response (prevents edge cache poisoning)
 */

export interface Env {
  DOCS_BUCKET: R2Bucket;
}

export type DocFormat = "html" | "md" | "pdf" | "jsonld";

export const CONTENT_TYPES: Record<DocFormat, string> = {
  html: "text/html; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  pdf: "application/pdf",
  jsonld: "application/ld+json; charset=utf-8",
};

const VALID_FORMATS = new Set<DocFormat>(["html", "md", "pdf", "jsonld"]);

const ROBOTS_TXT = "User-agent: *\nDisallow: /\n";
const X_ROBOTS_TAG = "noindex, nofollow, noarchive";

const RP_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://rnd.epicwinpromedia.com/schemas/rp.schema.json",
  title: "EPIC WIN R&D Research Paper",
  description:
    "Canonical multi-format scholarly monograph schema served via Cloudflare Workers + R2 content negotiation.",
  type: "object",
  required: ["@context", "@type", "headline", "author", "url", "datePublished", "encoding"],
  properties: {
    "@context": { const: "https://schema.org" },
    "@type": { const: "ScholarlyArticle" },
    headline: { type: "string" },
    description: { type: "string" },
    author: {
      type: "object",
      required: ["@type", "name"],
      properties: {
        "@type": { const: "Person" },
        name: { type: "string" },
      },
    },
    datePublished: { type: "string", format: "date" },
    url: { type: "string", format: "uri" },
    encoding: {
      type: "array",
      items: {
        type: "object",
        required: ["@type", "encodingFormat", "contentUrl"],
        properties: {
          "@type": { const: "MediaObject" },
          encodingFormat: { type: "string" },
          contentUrl: { type: "string", format: "uri" },
        },
      },
    },
  },
};

const CATALOG = [
  {
    slug: "resolution-is-not-leverage",
    title: "Resolution Is Not Leverage",
    thesis:
      "Why higher parameter counts and raw pixel/token density fail to produce operational leverage without deterministic architectural boundaries.",
  },
  {
    slug: "run-time-vs-dev-time",
    title: "Run Time vs. Dev Time",
    thesis:
      "Collapsing the impedance mismatch between local authoring semantics and globally distributed edge execution on Cloudflare Workers.",
  },
  {
    slug: "statistical-relevance-fallacy",
    title: "The Statistical Relevance Fallacy",
    thesis:
      "Why probabilistic confidence scores cannot substitute for structural verification in enterprise storytelling and AI control planes.",
  },
  {
    slug: "a-taste-of-agi",
    title: "A Taste of AGI!?",
    thesis:
      "Primary-source forensic audit separating genuine agentic capability from generative theater across modern frontier systems.",
  },
];

/**
 * Resolve requested output format strictly in priority order:
 *   1. Path extension (.md | .pdf | .html | .jsonld)
 *   2. Format subdomain (md.rnd.* | pdf.rnd.* | html.rnd.* | jsonld.rnd.*)
 *   3. Accept header (text/markdown | application/pdf | application/ld+json)
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

function buildCatalogResponse(format: DocFormat, isHead: boolean): Response {
  const headers = new Headers({
    "Content-Type": CONTENT_TYPES[format === "pdf" ? "html" : format],
    Vary: "Accept",
    Link: '<https://rnd.epicwinpromedia.com/schemas/rp.schema.json>; rel="describedby"',
    "X-Robots-Tag": X_ROBOTS_TAG,
    "Cache-Control": "public, max-age=300, s-maxage=3600",
  });

  if (format === "md") {
    const body = [
      "# EPIC WIN R&D — Canonical Research Index",
      "",
      "Multi-format content-negotiated archive served from Cloudflare R2 (`epicwin-rnd-docs`).",
      "Request any paper with `.md`, `.html`, `.pdf`, `.jsonld`, via format subdomain (`md.rnd.*`), or via `Accept` header.",
      "",
      ...CATALOG.map(
        (p) =>
          `- **${p.title}** — ${p.thesis}\n  - Canonical: https://rnd.epicwinpromedia.com/rp/${p.slug}\n  - Markdown: https://md.rnd.epicwinpromedia.com/rp/${p.slug}\n  - PDF: https://pdf.rnd.epicwinpromedia.com/rp/${p.slug}\n  - JSON-LD: https://jsonld.rnd.epicwinpromedia.com/rp/${p.slug}`,
      ),
      "",
    ].join("\n");
    return new Response(isHead ? null : body, { status: 200, headers });
  }

  if (format === "jsonld") {
    const body = JSON.stringify(
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "EPIC WIN R&D — Canonical Research Index",
        url: "https://rnd.epicwinpromedia.com/",
        hasPart: CATALOG.map((p) => ({
          "@type": "ScholarlyArticle",
          headline: p.title,
          description: p.thesis,
          url: `https://rnd.epicwinpromedia.com/rp/${p.slug}`,
        })),
      },
      null,
      2,
    );
    return new Response(isHead ? null : body, { status: 200, headers });
  }

  // Zero-<div> TacEm HTML index
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
  <title>EPIC WIN R&amp;D — Canonical Multi-Format Research Server</title>
  <style>
    :root { color-scheme: dark; --bg: #151414; --surface: #1F1F1F; --ink: #F0E3DE; --muted: #9A9390; --accent: #FF5E1F; --teal: #00CCBB; --line: #333130; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Inter', system-ui, sans-serif; background: var(--bg); color: var(--ink); line-height: 1.55; }
    header, main, footer { max-width: 64rem; margin-inline: auto; padding: 2rem 1.5rem; }
    header { border-bottom: 1px solid var(--line); }
    h1 { font-size: clamp(2rem, 4vw, 3rem); font-weight: 500; letter-spacing: -0.025em; margin: 0.5rem 0; }
    p.eyebrow { font-family: ui-monospace, monospace; font-size: 0.75rem; color: var(--accent); letter-spacing: 0.08em; text-transform: uppercase; margin: 0; }
    p.dek { color: var(--muted); max-width: 65ch; }
    ul.papers { list-style: none; padding: 0; margin: 0; display: grid; gap: 1.5rem; }
    article { background: var(--surface); border: 1px solid var(--line); padding: 1.5rem; }
    article h2 { margin: 0 0 0.5rem; font-size: 1.35rem; font-weight: 500; }
    article p { margin: 0 0 1rem; color: var(--muted); }
    nav.formats { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    nav.formats a { font-family: ui-monospace, monospace; font-size: 0.8rem; color: var(--ink); text-decoration: none; border: 1px solid var(--line); padding: 0.35rem 0.85rem; border-radius: 9999px; }
    nav.formats a:hover, nav.formats a:focus-visible { border-color: var(--accent); color: var(--accent); }
    footer { border-top: 1px solid var(--line); font-family: ui-monospace, monospace; font-size: 0.8rem; color: var(--muted); }
    footer a { color: var(--teal); }
  </style>
</head>
<body>
  <header>
    <p class="eyebrow">SERVICE B · CLOUDFLARE WORKERS + R2 · MARKDOWN FOR AGENTS</p>
    <h1>EPIC WIN R&amp;D — Canonical Research Archive</h1>
    <p class="dek">Zero sub-request hop content negotiation. Every paper resolves directly from R2 by explicit extension, format subdomain (<code>md.rnd.*</code>, <code>pdf.rnd.*</code>, <code>jsonld.rnd.*</code>), or HTTP <code>Accept</code> header with <code>Vary: Accept</code>.</p>
  </header>
  <main>
    <ul class="papers">
      ${CATALOG.map(
        (p) => `<li>
        <article>
          <h2><a href="/rp/${p.slug}" style="color:inherit;text-decoration:none;">${p.title}</a></h2>
          <p>${p.thesis}</p>
          <nav class="formats" aria-label="Formats for ${p.title}">
            <a href="/rp/${p.slug}.html">HTML</a>
            <a href="/rp/${p.slug}.md">Markdown (.md)</a>
            <a href="/rp/${p.slug}.pdf">PDF</a>
            <a href="/rp/${p.slug}.jsonld">JSON-LD</a>
          </nav>
        </article>
      </li>`,
      ).join("\n")}
    </ul>
  </main>
  <footer>
    <p>Canonical portal: <a href="https://cf.epicwinpromedia.com">cf.epicwinpromedia.com</a> · Schema: <a href="/schemas/rp.schema.json">/schemas/rp.schema.json</a> · Unlisted (<code>noindex, nofollow, noarchive</code>)</p>
  </footer>
</body>
</html>`;
  return new Response(isHead ? null : html, { status: 200, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const method = request.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: {
          Allow: "GET, HEAD",
          "X-Robots-Tag": X_ROBOTS_TAG,
        },
      });
    }

    const isHead = method === "HEAD";
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 1. Strict unlisted robots.txt
    if (pathname === "/robots.txt") {
      return new Response(isHead ? null : ROBOTS_TXT, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Robots-Tag": X_ROBOTS_TAG,
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // 2. JSON Schema endpoint referenced by Link rel="describedby"
    if (pathname === "/schemas/rp.schema.json") {
      return new Response(isHead ? null : JSON.stringify(RP_SCHEMA, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/schema+json; charset=utf-8",
          "X-Robots-Tag": X_ROBOTS_TAG,
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // 3. Root catalog index
    if (pathname === "/" || pathname === "") {
      const format = resolveFormat(undefined, url.hostname, request.headers.get("Accept"));
      return buildCatalogResponse(format, isHead);
    }

    // 4. Document route: /{schema_type}/{slug}[.{ext}]
    const match = pathname.match(/^\/([a-z0-9-]+)\/([a-z0-9-]+?)(?:\.([a-z0-9]+))?\/?$/i);
    if (!match) {
      return new Response(isHead ? null : "Not Found", {
        status: 404,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          Vary: "Accept",
          "X-Robots-Tag": X_ROBOTS_TAG,
        },
      });
    }

    const [, schemaTypeRaw, slugRaw, pathExtRaw] = match;
    const schemaType = schemaTypeRaw.toLowerCase();
    const slug = slugRaw.toLowerCase();
    const pathExt = pathExtRaw?.toLowerCase();

    // If an explicit extension was supplied but isn't a supported format, return 404
    if (pathExt && !VALID_FORMATS.has(pathExt as DocFormat)) {
      return new Response(isHead ? null : `Unsupported format: .${pathExt}`, {
        status: 404,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          Vary: "Accept",
          "X-Robots-Tag": X_ROBOTS_TAG,
        },
      });
    }

    const format = resolveFormat(pathExt, url.hostname, request.headers.get("Accept"));
    const objectKey = `${schemaType}/${slug}.${format}`;

    // Zero sub-request hops: direct R2 lookup
    const r2Object = isHead
      ? await env.DOCS_BUCKET.head(objectKey)
      : await env.DOCS_BUCKET.get(objectKey);

    if (!r2Object) {
      return new Response(isHead ? null : `Document not found: ${objectKey}`, {
        status: 404,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          Vary: "Accept",
          Link: `<https://rnd.epicwinpromedia.com/schemas/${schemaType}.schema.json>; rel="describedby"`,
          "X-Robots-Tag": X_ROBOTS_TAG,
        },
      });
    }

    const headers = new Headers();
    headers.set("Content-Type", CONTENT_TYPES[format]);
    headers.set("Vary", "Accept");
    headers.set(
      "Link",
      `<https://rnd.epicwinpromedia.com/schemas/${schemaType}.schema.json>; rel="describedby"`,
    );
    headers.set("X-Robots-Tag", X_ROBOTS_TAG);
    headers.set("Cache-Control", "public, max-age=300, s-maxage=3600");
    if (r2Object.httpEtag) {
      headers.set("ETag", r2Object.httpEtag);
    }
    if (typeof r2Object.size === "number") {
      headers.set("Content-Length", String(r2Object.size));
    }

    if (isHead) {
      return new Response(null, { status: 200, headers });
    }

    return new Response((r2Object as R2ObjectBody).body, {
      status: 200,
      headers,
    });
  },
};
