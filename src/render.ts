import { slugifyTaxonomy } from "./canonical.ts";
import { escapeHtml, renderMarkdownToHtml } from "./markdown.ts";
import { CANONICAL_ORIGIN, DEFAULT_PUBLISHER, PRIMARY_AUTHOR } from "./schemas.ts";
import { getListedEntries } from "./storage.ts";
import type { AuthorRecord, Manifest, ManifestEntry, WorkSnapshot } from "./types.ts";

export interface RenderOptions {
  origin?: string;
  publicIndexing?: boolean;
  isVersionRoute?: boolean;
}

const SHARED_CSS = `
:root {
  color-scheme: dark light;
  --bg: #151414;
  --surface: #1f1f1f;
  --surface-alt: #262524;
  --ink: #f0e3de;
  --muted: #a39b97;
  --accent: #ff5e1f;
  --teal: #00ccbb;
  --line: #333130;
  --warn-bg: #2f2217;
  --warn-border: #d97706;
}
@media (prefers-color-scheme: light) {
  :root {
    --bg: #faf8f6;
    --surface: #ffffff;
    --surface-alt: #f3efec;
    --ink: #1b1918;
    --muted: #5c5552;
    --accent: #c8400c;
    --teal: #007a70;
    --line: #ddd6d1;
    --warn-bg: #fff7ed;
    --warn-border: #c2410c;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--ink);
  line-height: 1.65;
  text-rendering: optimizeLegibility;
}
header.site-header, main, footer.site-footer {
  max-width: 58rem;
  margin-inline: auto;
  padding: 1.75rem 1.5rem;
}
header.site-header { border-bottom: 1px solid var(--line); }
footer.site-footer {
  border-top: 1px solid var(--line);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8rem;
  color: var(--muted);
}
a { color: var(--teal); text-underline-offset: 0.18em; }
a:hover, a:focus-visible { color: var(--accent); }
.eyebrow {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
  margin: 0 0 0.4rem;
}
h1 { font-size: clamp(1.85rem, 3.8vw, 2.75rem); line-height: 1.15; letter-spacing: -0.025em; margin: 0.25rem 0 0.6rem; font-weight: 600; }
h2 { font-size: 1.45rem; line-height: 1.25; margin: 2rem 0 0.75rem; font-weight: 600; }
h3 { font-size: 1.15rem; margin: 1.5rem 0 0.5rem; font-weight: 600; }
p.subtitle, p.dek { color: var(--muted); font-size: 1.08rem; max-width: 68ch; margin: 0.25rem 0 0.9rem; }
nav.breadcrumb, nav.formats, nav.top-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin: 0.75rem 0;
}
nav.formats a, a.pill, span.pill {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.78rem;
  color: var(--ink);
  text-decoration: none;
  border: 1px solid var(--line);
  padding: 0.28rem 0.7rem;
  border-radius: 9999px;
  display: inline-block;
}
nav.formats a:hover, a.pill:hover { border-color: var(--accent); color: var(--accent); }
te-ref { display: block; }
te-ref.card {
  background: var(--surface);
  border: 1px solid var(--line);
  padding: 1.35rem 1.5rem;
  margin-bottom: 1rem;
}
te-ref.card h3 { margin: 0 0 0.35rem; font-size: 1.25rem; }
te-ref.card h3 a { color: var(--ink); text-decoration: none; }
te-ref.card h3 a:hover { color: var(--accent); }
dl.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.25rem;
  margin: 0.6rem 0 0.9rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8rem;
  color: var(--muted);
}
dl.meta dt { font-weight: 600; display: inline; }
dl.meta dd { display: inline; margin: 0 0 0 0.3rem; }
aside.notice {
  background: var(--warn-bg);
  border-left: 3px solid var(--warn-border);
  padding: 0.85rem 1.1rem;
  margin: 1rem 0 1.5rem;
}
section.abstract, section.cite-box, section.license-box, section.graph-box, section.notes-box, section.artifacts-box, section.open-problems-box {
  background: var(--surface);
  border: 1px solid var(--line);
  padding: 1.15rem 1.35rem;
  margin: 1.25rem 0;
}
section.body { max-width: 68ch; font-size: 1.03rem; }
section.body blockquote {
  border-left: 3px solid var(--accent);
  margin: 1.25rem 0;
  padding: 0.25rem 0 0.25rem 1.1rem;
  color: var(--muted);
}
section.body hr { border: 0; border-top: 1px solid var(--line); margin: 2rem 0; }
section.body pre {
  background: var(--surface-alt);
  border: 1px solid var(--line);
  padding: 1rem;
  overflow-x: auto;
  font-size: 0.88rem;
}
section.body code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9em;
}
section.footnotes {
  margin-top: 2.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--line);
  font-size: 0.9rem;
  color: var(--muted);
}
details { margin-top: 0.6rem; }
details summary {
  cursor: pointer;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.82rem;
  color: var(--teal);
}
fieldset.filter-bar {
  border: 1px solid var(--line);
  background: var(--surface);
  padding: 0.75rem 1rem;
  margin: 1rem 0 1.5rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.1rem;
  align-items: center;
}
fieldset.filter-bar legend {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem;
  color: var(--muted);
  padding: 0 0.4rem;
}
fieldset.filter-bar label {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.82rem;
  cursor: pointer;
}
/* Zero-JS CSS :has() filtering on the index portal */
main:has(input[name="type-filter"][value="paper"]:checked) te-ref.card:not([type="paper"]) { display: none; }
main:has(input[name="type-filter"][value="essay"]:checked) te-ref.card:not([type="essay"]) { display: none; }
main:has(input[name="status-filter"][value="preprint"]:checked) te-ref.card:not([status="preprint"]) { display: none; }
main:has(input[name="status-filter"][value="under-review"]:checked) te-ref.card:not([status="under-review"]) { display: none; }
main:has(input[name="status-filter"][value="peer-reviewed"]:checked) te-ref.card:not([status="peer-reviewed"]) { display: none; }
main:has(input[name="status-filter"][value="withdrawn"]:checked) te-ref.card:not([status="withdrawn"]) { display: none; }
@media print {
  @page { margin: 1in 0.85in 1in 0.85in; }
  :root {
    --bg: #ffffff;
    --surface: #ffffff;
    --surface-alt: #f5f5f5;
    --ink: #111111;
    --muted: #444444;
    --accent: #111111;
    --teal: #111111;
    --line: #cccccc;
  }
  body { background: #ffffff; color: #111111; font-size: 11pt; line-height: 1.5; }
  nav.top-nav, nav.formats, nav.breadcrumb, fieldset.filter-bar { display: none !important; }
  header.site-header, main, footer.site-footer { max-width: none; padding: 0; }
  section.body { max-width: none; }
  a { color: #111111; text-decoration: underline; }
  section.abstract, section.cite-box, section.license-box { break-inside: avoid; }
}
`.trim();

function robotsMeta(publicIndexing?: boolean): string {
  return publicIndexing
    ? ""
    : `\n  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet">`;
}

function formatAuthorJsonLd(author: AuthorRecord, origin: string): Record<string, unknown> {
  const id = author.orcid
    ? `https://orcid.org/${author.orcid}`
    : author.url ?? `${origin}/.well-known/genid/${slugifyTaxonomy(author.name) || "author"}`;
  const obj: Record<string, unknown> = {
    "@type": "Person",
    "@id": id,
    name: author.name,
  };
  if (author.url) obj.url = author.url;
  if (author.alternateName && author.alternateName.length > 0) obj.alternateName = author.alternateName;
  if (author.sameAs && author.sameAs.length > 0) obj.sameAs = author.sameAs;
  if (author.orcid === PRIMARY_AUTHOR.orcid) {
    obj.affiliation = { "@type": "Organization", name: DEFAULT_PUBLISHER.name, url: DEFAULT_PUBLISHER.url };
  }
  return obj;
}

function formatCopyrightHolderJsonLd(snapshot: WorkSnapshot): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    "@type": snapshot.copyrightHolder.type,
    name: snapshot.copyrightHolder.name,
  };
  if (snapshot.copyrightHolder.url) {
    obj["@id"] = snapshot.copyrightHolder.url;
    obj.url = snapshot.copyrightHolder.url;
  }
  return obj;
}

function citeToUrlOrText(cite: string, manifest: Manifest | undefined, origin: string): string {
  if (cite.startsWith("http://") || cite.startsWith("https://")) return cite;
  if (cite.startsWith("doi:")) return `https://doi.org/${cite.slice(4)}`;
  const target = manifest?.entries[cite];
  if (target) return `${origin}/${target.type}/${target.slug}`;
  return cite;
}

export function buildWorkJsonLdObject(
  snapshot: WorkSnapshot,
  manifest?: Manifest,
  origin = CANONICAL_ORIGIN,
): Record<string, unknown> {
  const isEssay = snapshot.type === "essay";
  const basePath = `/${snapshot.type}/${snapshot.slug}`;
  const versionPath = `${basePath}/v${snapshot.version}`;

  const doc: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": isEssay ? "Article" : "ScholarlyArticle",
    "@id": `${origin}${versionPath}`,
    url: `${origin}${basePath}`,
    mainEntityOfPage: `${origin}${basePath}`,
    headline: snapshot.title,
    name: snapshot.title,
    ...(isEssay ? { genre: "essay" } : {}),
    ...(snapshot.subtitle ? { alternativeHeadline: snapshot.subtitle } : {}),
    author: snapshot.authors.map((a) => formatAuthorJsonLd(a, origin)),
    publisher: snapshot.publisher,
    datePublished: snapshot.datePublished,
    dateModified: snapshot.dateModified,
    version: snapshot.version,
    creativeWorkStatus: snapshot.status,
    inLanguage: snapshot.inLanguage,
    abstract: snapshot.abstract,
    license: snapshot.license,
    copyrightYear: snapshot.copyrightYear,
    copyrightHolder: formatCopyrightHolderJsonLd(snapshot),
    encoding: [
      { "@type": "MediaObject", encodingFormat: "text/html", contentUrl: `${origin}${versionPath}.html` },
      { "@type": "MediaObject", encodingFormat: "text/markdown", contentUrl: `${origin}${versionPath}.md` },
      { "@type": "MediaObject", encodingFormat: "application/pdf", contentUrl: `${origin}${versionPath}.pdf` },
      { "@type": "MediaObject", encodingFormat: "application/ld+json", contentUrl: `${origin}${versionPath}.jsonld` },
    ],
  };

  const isPartOf: Array<Record<string, unknown>> = [];
  if (snapshot.venue) {
    isPartOf.push({ "@type": "Periodical", name: snapshot.venue });
  }
  if (snapshot.series) {
    isPartOf.push({
      "@type": "CreativeWorkSeries",
      name: snapshot.series,
      url: `${origin}/series/${slugifyTaxonomy(snapshot.series)}`,
    });
  }
  if (isPartOf.length === 1) doc.isPartOf = isPartOf[0];
  else if (isPartOf.length > 1) doc.isPartOf = isPartOf;

  if (snapshot.tags && snapshot.tags.length > 0) doc.keywords = snapshot.tags;

  if (snapshot.buildsOn && snapshot.buildsOn.length > 0) {
    doc.isBasedOn = snapshot.buildsOn.map((slug) => {
      const target = manifest?.entries[slug];
      return target ? `${origin}/${target.type}/${target.slug}` : slug;
    });
  }

  if (snapshot.cites && snapshot.cites.length > 0) {
    doc.citation = snapshot.cites.map((c) => citeToUrlOrText(c, manifest, origin));
  }

  if (snapshot.artifacts && snapshot.artifacts.length > 0) {
    doc.hasPart = snapshot.artifacts.map((art) => ({
      "@type":
        art.kind === "dataset"
          ? "Dataset"
          : art.kind === "code"
            ? "SoftwareSourceCode"
            : "CreativeWork",
      additionalType: art.kind,
      url: art.url,
      description: art.description,
    }));
  }

  if (snapshot.mirrors && snapshot.mirrors.length > 0) {
    doc.sameAs = snapshot.mirrors.map((m) => m.url);
  }

  if (snapshot.identifier && (snapshot.identifier.doi || snapshot.identifier.arxiv)) {
    const ids: Array<Record<string, unknown>> = [];
    if (snapshot.identifier.doi) {
      ids.push({ "@type": "PropertyValue", propertyID: "DOI", value: snapshot.identifier.doi });
    }
    if (snapshot.identifier.arxiv) {
      ids.push({ "@type": "PropertyValue", propertyID: "arXiv", value: snapshot.identifier.arxiv });
    }
    doc.identifier = ids;
  }

  if (snapshot.thumbnail) {
    doc.image = snapshot.thumbnail;
    doc.thumbnailUrl = snapshot.thumbnail;
  }

  if (snapshot.openProblems && snapshot.openProblems.length > 0) {
    doc[`${origin}/vocab/core#openProblem`] = snapshot.openProblems;
  }

  return doc;
}

export function renderWorkJsonLd(
  snapshot: WorkSnapshot,
  manifest?: Manifest,
  origin = CANONICAL_ORIGIN,
): string {
  return JSON.stringify(buildWorkJsonLdObject(snapshot, manifest, origin), null, 2);
}

function yamlScalar(val: string | number | boolean): string {
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  return JSON.stringify(val);
}

export function renderWorkMarkdown(snapshot: WorkSnapshot, origin = CANONICAL_ORIGIN): string {
  const fm: string[] = [
    "---",
    `slug: ${yamlScalar(snapshot.slug)}`,
    `type: ${yamlScalar(snapshot.type)}`,
    `title: ${yamlScalar(snapshot.title)}`,
  ];
  if (snapshot.subtitle) fm.push(`subtitle: ${yamlScalar(snapshot.subtitle)}`);
  fm.push("authors:");
  for (const a of snapshot.authors) {
    fm.push(`  - name: ${yamlScalar(a.name)}`);
    if (a.orcid) fm.push(`    orcid: ${yamlScalar(a.orcid)}`);
    if (a.url) fm.push(`    url: ${yamlScalar(a.url)}`);
  }
  fm.push(`datePublished: ${yamlScalar(snapshot.datePublished)}`);
  fm.push(`dateModified: ${yamlScalar(snapshot.dateModified)}`);
  fm.push(`version: ${snapshot.version}`);
  fm.push(`status: ${yamlScalar(snapshot.status)}`);
  if (snapshot.venue) fm.push(`venue: ${yamlScalar(snapshot.venue)}`);
  if (snapshot.series) fm.push(`series: ${yamlScalar(snapshot.series)}`);
  if (snapshot.tags && snapshot.tags.length > 0) {
    fm.push(`tags: [${snapshot.tags.map(yamlScalar).join(", ")}]`);
  }
  fm.push(`url: ${yamlScalar(`${origin}/${snapshot.type}/${snapshot.slug}`)}`);
  fm.push(`versionUrl: ${yamlScalar(`${origin}/${snapshot.type}/${snapshot.slug}/v${snapshot.version}`)}`);
  fm.push(`contentHash: ${yamlScalar(snapshot.contentHash)}`);
  fm.push(`license: ${yamlScalar(snapshot.license)}`);
  fm.push(`copyright: ${yamlScalar(`© ${snapshot.copyrightYear} ${snapshot.copyrightHolder.name}`)}`);
  fm.push(`inLanguage: ${yamlScalar(snapshot.inLanguage)}`);
  if (snapshot.buildsOn && snapshot.buildsOn.length > 0) {
    fm.push(`buildsOn: [${snapshot.buildsOn.map(yamlScalar).join(", ")}]`);
  }
  if (snapshot.mirrors && snapshot.mirrors.length > 0) {
    fm.push("mirrors:");
    for (const m of snapshot.mirrors) {
      fm.push(`  - platform: ${yamlScalar(m.platform)}`);
      fm.push(`    url: ${yamlScalar(m.url)}`);
    }
  }
  fm.push(`abstract: ${yamlScalar(snapshot.abstract)}`);
  fm.push("---");
  fm.push("");
  fm.push(`# ${snapshot.title}`);
  if (snapshot.subtitle) {
    fm.push("");
    fm.push(`*${snapshot.subtitle}*`);
  }
  fm.push("");
  fm.push(snapshot.body.trim());
  fm.push("");
  return fm.join("\n");
}

export function renderWorkHtml(
  snapshot: WorkSnapshot,
  entry: ManifestEntry | undefined,
  manifest: Manifest | undefined,
  options: RenderOptions = {},
): string {
  const origin = options.origin ?? CANONICAL_ORIGIN;
  const canonicalUrl = `${origin}/${snapshot.type}/${snapshot.slug}`;
  const versionUrl = `${canonicalUrl}/v${snapshot.version}`;
  const pdfUrl = `${versionUrl}.pdf`;
  const jsonLd = renderWorkJsonLd(snapshot, manifest, origin);
  const bodyHtml = renderMarkdownToHtml(snapshot.body);
  const shortHash = snapshot.contentHash.slice(0, 12);

  const isOlderVersion = Boolean(entry && snapshot.version < entry.latestVersion);
  const isWithdrawn = snapshot.status === "withdrawn";
  const isDelisted = Boolean(entry && !entry.listed);

  const authorLinks = snapshot.authors
    .map((a) => {
      const href = a.orcid ? `/author/${escapeHtml(a.orcid)}` : a.url ? escapeHtml(a.url) : null;
      return href ? `<a href="${href}">${escapeHtml(a.name)}</a>` : escapeHtml(a.name);
    })
    .join(", ");

  const citationAuthorTags = snapshot.authors
    .map((a) => `  <meta name="citation_author" content="${escapeHtml(a.name)}">`)
    .join("\n");

  const buildsOnItems = (snapshot.buildsOn ?? []).map((slug) => {
    const target = manifest?.entries[slug];
    return target
      ? `<li><a href="/${escapeHtml(target.type)}/${escapeHtml(target.slug)}">${escapeHtml(target.title)}</a></li>`
      : `<li>${escapeHtml(slug)}</li>`;
  });

  const builtOnByItems = (entry?.builtOnBy ?? []).map((slug) => {
    const target = manifest?.entries[slug];
    return target
      ? `<li><a href="/${escapeHtml(target.type)}/${escapeHtml(target.slug)}">${escapeHtml(target.title)}</a></li>`
      : `<li>${escapeHtml(slug)}</li>`;
  });

  const notices: string[] = [];
  if (isWithdrawn) {
    notices.push(
      `<aside class="notice" role="note"><strong>Withdrawn:</strong> This version has been marked withdrawn. Its permanent URI remains resolvable for citation integrity.</aside>`,
    );
  }
  if (isDelisted) {
    notices.push(
      `<aside class="notice" role="note"><strong>Delisted:</strong> This work is unlisted from the public index, but its permanent URI remains resolvable.</aside>`,
    );
  }
  if (isOlderVersion && entry) {
    notices.push(
      `<aside class="notice" role="note">You are viewing <strong>version ${snapshot.version}</strong>. A newer version (<a href="/${escapeHtml(snapshot.type)}/${escapeHtml(snapshot.slug)}">v${entry.latestVersion}</a>) is available. <a href="/${escapeHtml(snapshot.type)}/${escapeHtml(snapshot.slug)}/versions">All versions</a>.</aside>`,
    );
  }

  const tagsHtml =
    snapshot.tags && snapshot.tags.length > 0
      ? snapshot.tags
          .map(
            (t) =>
              `<a class="pill" href="/tags/${escapeHtml(slugifyTaxonomy(t))}">${escapeHtml(t)}</a>`,
          )
          .join(" ")
      : "";

  const citeDate = snapshot.datePublished;
  const authorPlain = snapshot.authors.map((a) => a.name).join(", ");
  const howToCite = `${authorPlain} (${snapshot.copyrightYear}). "${snapshot.title}." Version ${snapshot.version}. ${snapshot.publisher.name}. Published ${citeDate}. ${versionUrl} (SHA-256: ${shortHash}).`;

  return `<!doctype html>
<html lang="${escapeHtml(snapshot.inLanguage)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">${robotsMeta(options.publicIndexing)}
  <title>${escapeHtml(snapshot.title)} — EPIC WIN R&amp;D</title>
  <meta name="description" content="${escapeHtml(snapshot.abstract)}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <link rel="license" href="${escapeHtml(snapshot.license)}">
  <link rel="describedby" href="${escapeHtml(`${origin}/schemas/${snapshot.type}.schema.json`)}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(snapshot.title)}">
  <meta property="og:description" content="${escapeHtml(snapshot.abstract)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">${snapshot.thumbnail ? `\n  <meta property="og:image" content="${escapeHtml(snapshot.thumbnail)}">` : ""}
  <meta name="citation_title" content="${escapeHtml(snapshot.title)}">
${citationAuthorTags}
  <meta name="citation_publication_date" content="${escapeHtml(snapshot.datePublished)}">
  <meta name="citation_pdf_url" content="${escapeHtml(pdfUrl)}">
  <script type="application/ld+json">
${jsonLd.replace(/<\/script/gi, "<\\/script")}
  </script>
  <style>${SHARED_CSS}</style>
</head>
<body>
  <header class="site-header">
    <nav class="top-nav" aria-label="Archive navigation">
      <a href="/">EPIC WIN R&amp;D</a>
      <span aria-hidden="true">/</span>
      <a href="/${escapeHtml(snapshot.type)}/">${escapeHtml(snapshot.type)}</a>
      <span aria-hidden="true">/</span>
      <span>${escapeHtml(snapshot.slug)}</span>
    </nav>
  </header>
  <main>
    <te-ref
      slug="${escapeHtml(snapshot.slug)}"
      type="${escapeHtml(snapshot.type)}"
      status="${escapeHtml(snapshot.status)}"
      version="${snapshot.version}"
      date="${escapeHtml(snapshot.datePublished)}"${snapshot.series ? `\n      series="${escapeHtml(slugifyTaxonomy(snapshot.series))}"` : ""}${snapshot.tags && snapshot.tags.length > 0 ? `\n      tags="${escapeHtml(snapshot.tags.map(slugifyTaxonomy).join(" "))}"` : ""}
      content-hash="${escapeHtml(snapshot.contentHash)}">
      <article>
        <header>
          <p class="eyebrow">${escapeHtml(snapshot.type)} · ${escapeHtml(snapshot.status)} · v${snapshot.version}</p>
          <h1>${escapeHtml(snapshot.title)}</h1>
          ${snapshot.subtitle ? `<p class="subtitle">${escapeHtml(snapshot.subtitle)}</p>` : ""}
          <dl class="meta">
            <dt>Author</dt><dd>${authorLinks}</dd>
            <dt>Published</dt><dd><time datetime="${escapeHtml(snapshot.datePublished)}">${escapeHtml(snapshot.datePublished)}</time></dd>
            <dt>Version</dt><dd><a href="/${escapeHtml(snapshot.type)}/${escapeHtml(snapshot.slug)}/versions">v${snapshot.version}</a></dd>
            ${snapshot.venue ? `<dt>Venue</dt><dd>${escapeHtml(snapshot.venue)}</dd>` : ""}
            ${snapshot.series ? `<dt>Series</dt><dd><a href="/series/${escapeHtml(slugifyTaxonomy(snapshot.series))}">${escapeHtml(snapshot.series)}</a></dd>` : ""}
            <dt>Hash</dt><dd><code>${escapeHtml(shortHash)}</code></dd>
          </dl>
          ${tagsHtml ? `<p>${tagsHtml}</p>` : ""}
          <nav class="formats" aria-label="Alternate formats">
            <a href="/${escapeHtml(snapshot.type)}/${escapeHtml(snapshot.slug)}/v${snapshot.version}.html">HTML</a>
            <a href="/${escapeHtml(snapshot.type)}/${escapeHtml(snapshot.slug)}/v${snapshot.version}.md">Markdown</a>
            <a href="/${escapeHtml(snapshot.type)}/${escapeHtml(snapshot.slug)}/v${snapshot.version}.pdf">PDF</a>
            <a href="/${escapeHtml(snapshot.type)}/${escapeHtml(snapshot.slug)}/v${snapshot.version}.jsonld">JSON-LD</a>
            <a href="/${escapeHtml(snapshot.type)}/${escapeHtml(snapshot.slug)}/versions">Version history</a>
          </nav>
        </header>

        ${notices.join("\n")}

        <section class="abstract" aria-label="Abstract">
          <h2>Abstract</h2>
          <p>${escapeHtml(snapshot.abstract)}</p>
        </section>

        <section class="body" aria-label="Work body">
          ${bodyHtml}
        </section>

        ${
          snapshot.artifacts && snapshot.artifacts.length > 0
            ? `<section class="artifacts-box" aria-label="Supporting artifacts">
          <h2>Supporting Artifacts</h2>
          <ul>
            ${snapshot.artifacts
              .map(
                (a) =>
                  `<li><strong>${escapeHtml(a.kind)}:</strong> <a href="${escapeHtml(a.url)}">${escapeHtml(a.description)}</a></li>`,
              )
              .join("\n")}
          </ul>
        </section>`
            : ""
        }

        ${
          buildsOnItems.length > 0 || builtOnByItems.length > 0
            ? `<section class="graph-box" aria-label="Works graph">
          <h2>Works Graph</h2>
          ${buildsOnItems.length > 0 ? `<h3>Builds on</h3><ul>${buildsOnItems.join("")}</ul>` : ""}
          ${builtOnByItems.length > 0 ? `<h3>Built on by</h3><ul>${builtOnByItems.join("")}</ul>` : ""}
        </section>`
            : ""
        }

        ${
          snapshot.openProblems && snapshot.openProblems.length > 0
            ? `<section class="open-problems-box" aria-label="Open problems">
          <h2>Open Problems</h2>
          <ul>${snapshot.openProblems.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>
        </section>`
            : ""
        }

        ${
          snapshot.notes && snapshot.notes.length > 0
            ? `<section class="notes-box" aria-label="Notes">
          <h2>Notes</h2>
          <ul>${snapshot.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>
        </section>`
            : ""
        }

        ${
          snapshot.mirrors && snapshot.mirrors.length > 0
            ? `<section class="notes-box" aria-label="Mirrors">
          <h2>Mirrors</h2>
          <ul>${snapshot.mirrors.map((m) => `<li>${escapeHtml(m.platform)}: <a href="${escapeHtml(m.url)}">${escapeHtml(m.url)}</a></li>`).join("")}</ul>
        </section>`
            : ""
        }

        <section class="cite-box" aria-label="How to cite">
          <h2>How to cite</h2>
          <p>${escapeHtml(howToCite)}</p>
        </section>

        <section class="license-box" aria-label="Licence and copyright">
          <p>© ${snapshot.copyrightYear} ${escapeHtml(snapshot.copyrightHolder.name)}. Licensed under <a rel="license" href="${escapeHtml(snapshot.license)}">CC BY-NC-ND 4.0</a>: free to read, share and cite with attribution; no commercial use; no derivatives.</p>
        </section>
      </article>
    </te-ref>
  </main>
  <footer class="site-footer">
    <p>${escapeHtml(snapshot.slug)} · v${snapshot.version} · sha256:${escapeHtml(shortHash)} · <a href="/schemas/${escapeHtml(snapshot.type)}.schema.json">schema</a> · <a href="/">rnd.epicwinpromedia.com</a></p>
  </footer>
</body>
</html>`;
}

function renderCardHtml(entry: ManifestEntry): string {
  const tagsHtml = entry.tags
    .map((t) => `<a class="pill" href="/tags/${escapeHtml(slugifyTaxonomy(t))}">${escapeHtml(t)}</a>`)
    .join(" ");
  return `<te-ref
  class="card"
  slug="${escapeHtml(entry.slug)}"
  type="${escapeHtml(entry.type)}"
  status="${escapeHtml(entry.status)}"
  version="${entry.latestVersion}"
  date="${escapeHtml(entry.datePublished)}"${entry.seriesSlug ? `\n  series="${escapeHtml(entry.seriesSlug)}"` : ""}${entry.tagSlugs.length > 0 ? `\n  tags="${escapeHtml(entry.tagSlugs.join(" "))}"` : ""}>
  <article>
    <p class="eyebrow">${escapeHtml(entry.type)} · ${escapeHtml(entry.status)} · v${entry.latestVersion} · <time datetime="${escapeHtml(entry.datePublished)}">${escapeHtml(entry.datePublished)}</time></p>
    <h3><a href="/${escapeHtml(entry.type)}/${escapeHtml(entry.slug)}">${escapeHtml(entry.title)}</a></h3>
    ${entry.subtitle ? `<p class="subtitle">${escapeHtml(entry.subtitle)}</p>` : ""}
    ${entry.series ? `<p>Series: <a href="/series/${escapeHtml(entry.seriesSlug ?? slugifyTaxonomy(entry.series))}">${escapeHtml(entry.series)}</a></p>` : ""}
    ${tagsHtml ? `<p>${tagsHtml}</p>` : ""}
    <details>
      <summary>Abstract &amp; formats</summary>
      <p>${escapeHtml(entry.abstract)}</p>
      <nav class="formats" aria-label="Formats for ${escapeHtml(entry.title)}">
        <a href="/${escapeHtml(entry.type)}/${escapeHtml(entry.slug)}.html">HTML</a>
        <a href="/${escapeHtml(entry.type)}/${escapeHtml(entry.slug)}.md">Markdown</a>
        <a href="/${escapeHtml(entry.type)}/${escapeHtml(entry.slug)}.pdf">PDF</a>
        <a href="/${escapeHtml(entry.type)}/${escapeHtml(entry.slug)}.jsonld">JSON-LD</a>
      </nav>
    </details>
  </article>
</te-ref>`;
}

function renderGroupedCards(entries: ManifestEntry[]): string {
  const bySeries = new Map<string, ManifestEntry[]>();
  for (const e of entries) {
    const key = e.series ?? "";
    if (!bySeries.has(key)) bySeries.set(key, []);
    bySeries.get(key)!.push(e);
  }
  const sections: string[] = [];
  // Named series first, then standalone works
  const keys = Array.from(bySeries.keys()).sort((a, b) => {
    if (a === "" && b !== "") return 1;
    if (b === "" && a !== "") return -1;
    return a.localeCompare(b);
  });
  for (const seriesName of keys) {
    const group = bySeries.get(seriesName)!;
    if (seriesName) {
      sections.push(
        `<section aria-label="Series ${escapeHtml(seriesName)}"><h3><a href="/series/${escapeHtml(slugifyTaxonomy(seriesName))}">${escapeHtml(seriesName)}</a></h3>${group.map(renderCardHtml).join("\n")}</section>`,
      );
    } else {
      sections.push(group.map(renderCardHtml).join("\n"));
    }
  }
  return sections.join("\n");
}

export function renderIndexHtml(manifest: Manifest, options: RenderOptions = {}): string {
  const origin = options.origin ?? CANONICAL_ORIGIN;
  const listed = getListedEntries(manifest);
  const papers = listed.filter((e) => e.type === "paper");
  const essays = listed.filter((e) => e.type === "essay");
  const openProblems = listed.flatMap((e) =>
    e.openProblems.map((p) => ({ problem: p, entry: e })),
  );
  const jsonLd = renderCollectionJsonLd(
    "EPIC WIN R&D — Canonical Research & Essay Archive",
    `${origin}/`,
    listed,
    origin,
  );

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">${robotsMeta(options.publicIndexing)}
  <title>EPIC WIN R&amp;D — Canonical Research &amp; Essay Archive</title>
  <link rel="canonical" href="${escapeHtml(`${origin}/`)}">
  <script type="application/ld+json">
${jsonLd.replace(/<\/script/gi, "<\\/script")}
  </script>
  <style>${SHARED_CSS}</style>
</head>
<body>
  <header class="site-header">
    <p class="eyebrow">EPIC WIN PRO MEDIA · CANONICAL PUBLISHING ARCHIVE</p>
    <h1>EPIC WIN R&amp;D</h1>
    <p class="dek">Ground source of truth for EPIC WIN Pro Media essays and research papers. Every work resolves as HTML, Markdown, PDF, or JSON-LD from immutable version snapshots.</p>
    <nav class="top-nav" aria-label="Archive sections">
      <a class="pill" href="/essay/">Essays (${essays.length})</a>
      ${papers.length > 0 ? `<a class="pill" href="/paper/">Papers (${papers.length})</a>` : ""}
      <a class="pill" href="/author/${escapeHtml(PRIMARY_AUTHOR.orcid)}">Author</a>
      <a class="pill" href="/schemas/work.schema.json">Schemas</a>
    </nav>
  </header>
  <main>
    <section aria-label="Works">
      <fieldset class="filter-bar">
        <legend>Filter works (CSS only)</legend>
        <label><input type="radio" name="type-filter" value="all" checked> All types</label>
        ${papers.length > 0 ? `<label><input type="radio" name="type-filter" value="paper"> Papers</label>` : ""}
        <label><input type="radio" name="type-filter" value="essay"> Essays</label>
        <span aria-hidden="true">·</span>
        <label><input type="radio" name="status-filter" value="all" checked> Any status</label>
        <label><input type="radio" name="status-filter" value="preprint"> Preprint</label>
        <label><input type="radio" name="status-filter" value="under-review"> Under review</label>
        <label><input type="radio" name="status-filter" value="peer-reviewed"> Peer-reviewed</label>
      </fieldset>

      ${
        listed.length === 0
          ? `<p class="dek">No works published yet.</p>`
          : `${
              papers.length > 0
                ? `<section aria-label="Papers"><h2>Papers</h2>${renderGroupedCards(papers)}</section>`
                : ""
            }
      ${
        essays.length > 0
          ? `<section aria-label="Essays"><h2>Essays</h2>${renderGroupedCards(essays)}</section>`
          : ""
      }`
      }
    </section>

    ${
      openProblems.length > 0
        ? `<section class="open-problems-box" aria-label="Research agenda">
      <h2>Research Agenda — Open Problems</h2>
      <ul>
        ${openProblems
          .map(
            (item) =>
              `<li>${escapeHtml(item.problem)} — <a href="/${escapeHtml(item.entry.type)}/${escapeHtml(item.entry.slug)}">${escapeHtml(item.entry.title)}</a></li>`,
          )
          .join("\n")}
      </ul>
    </section>`
        : ""
    }

    <section class="notes-box" aria-label="Correspondence">
      <h2>Correspondence</h2>
      <p>Published by <a href="/author/${escapeHtml(PRIMARY_AUTHOR.orcid)}">${escapeHtml(PRIMARY_AUTHOR.name)}</a> at <a href="${escapeHtml(DEFAULT_PUBLISHER.url)}">${escapeHtml(DEFAULT_PUBLISHER.name)}</a>.</p>
    </section>
  </main>
  <footer class="site-footer">
    <p>Formats: <code>.html</code> · <code>.md</code> · <code>.pdf</code> · <code>.jsonld</code> · <a href="/sitemap.xml">sitemap.xml</a> · <a href="/schemas/work.schema.json">work.schema.json</a></p>
  </footer>
</body>
</html>`;
}

export function renderCollectionMarkdown(
  heading: string,
  description: string,
  entries: ManifestEntry[],
  origin = CANONICAL_ORIGIN,
): string {
  const lines = [`# ${heading}`, "", description, ""];
  if (entries.length === 0) {
    lines.push("_No works listed._", "");
    return lines.join("\n");
  }
  for (const e of entries) {
    lines.push(`- **${e.title}** (${e.type}, ${e.status}, v${e.latestVersion}, ${e.datePublished})`);
    lines.push(`  - Abstract: ${e.abstract}`);
    lines.push(`  - Canonical: ${origin}/${e.type}/${e.slug}`);
    lines.push(`  - Markdown: ${origin}/${e.type}/${e.slug}.md`);
    lines.push(`  - PDF: ${origin}/${e.type}/${e.slug}.pdf`);
    lines.push(`  - JSON-LD: ${origin}/${e.type}/${e.slug}.jsonld`);
  }
  lines.push("");
  return lines.join("\n");
}

export function renderCollectionJsonLd(
  name: string,
  url: string,
  entries: ManifestEntry[],
  origin = CANONICAL_ORIGIN,
): string {
  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name,
      url,
      hasPart: entries.map((e) => ({
        "@type": e.type === "essay" ? "Article" : "ScholarlyArticle",
        ...(e.type === "essay" ? { genre: "essay" } : {}),
        headline: e.title,
        abstract: e.abstract,
        datePublished: e.datePublished,
        version: e.latestVersion,
        creativeWorkStatus: e.status,
        url: `${origin}/${e.type}/${e.slug}`,
      })),
    },
    null,
    2,
  );
}

export function renderListingHtml(
  heading: string,
  canonicalUrl: string,
  entries: ManifestEntry[],
  options: RenderOptions = {},
): string {
  const origin = options.origin ?? CANONICAL_ORIGIN;
  const jsonLd = renderCollectionJsonLd(heading, canonicalUrl, entries, origin);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">${robotsMeta(options.publicIndexing)}
  <title>${escapeHtml(heading)} — EPIC WIN R&amp;D</title>
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <script type="application/ld+json">
${jsonLd.replace(/<\/script/gi, "<\\/script")}
  </script>
  <style>${SHARED_CSS}</style>
</head>
<body>
  <header class="site-header">
    <nav class="top-nav"><a href="/">EPIC WIN R&amp;D</a></nav>
    <h1>${escapeHtml(heading)}</h1>
  </header>
  <main>
    ${entries.length === 0 ? `<p class="dek">No works listed.</p>` : renderGroupedCards(entries)}
  </main>
  <footer class="site-footer">
    <p><a href="/">rnd.epicwinpromedia.com</a></p>
  </footer>
</body>
</html>`;
}

export function renderVersionsHtml(entry: ManifestEntry, options: RenderOptions = {}): string {
  const origin = options.origin ?? CANONICAL_ORIGIN;
  const canonicalUrl = `${origin}/${entry.type}/${entry.slug}/versions`;
  const jsonLd = renderVersionsJsonLd(entry, origin);
  return `<!doctype html>
<html lang="${escapeHtml(entry.inLanguage)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">${robotsMeta(options.publicIndexing)}
  <title>Versions of ${escapeHtml(entry.title)} — EPIC WIN R&amp;D</title>
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <script type="application/ld+json">
${jsonLd.replace(/<\/script/gi, "<\\/script")}
  </script>
  <style>${SHARED_CSS}</style>
</head>
<body>
  <header class="site-header">
    <nav class="top-nav">
      <a href="/">EPIC WIN R&amp;D</a> /
      <a href="/${escapeHtml(entry.type)}/${escapeHtml(entry.slug)}">${escapeHtml(entry.title)}</a>
    </nav>
    <h1>Version history: ${escapeHtml(entry.title)}</h1>
  </header>
  <main>
    <ol>
      ${[...entry.versions]
        .reverse()
        .map(
          (v) => `<li>
        <strong><a href="/${escapeHtml(entry.type)}/${escapeHtml(entry.slug)}/v${v.version}">v${v.version}</a></strong>
        — ${escapeHtml(v.status)} · ingested ${escapeHtml(v.dateModified)} · <code>${escapeHtml(v.contentHash.slice(0, 12))}</code>
        (<a href="/${escapeHtml(entry.type)}/${escapeHtml(entry.slug)}/v${v.version}.md">md</a> ·
        <a href="/${escapeHtml(entry.type)}/${escapeHtml(entry.slug)}/v${v.version}.pdf">pdf</a> ·
        <a href="/${escapeHtml(entry.type)}/${escapeHtml(entry.slug)}/v${v.version}.jsonld">jsonld</a>)
      </li>`,
        )
        .join("\n")}
    </ol>
  </main>
  <footer class="site-footer">
    <p><a href="/${escapeHtml(entry.type)}/${escapeHtml(entry.slug)}">Latest version (v${entry.latestVersion})</a></p>
  </footer>
</body>
</html>`;
}

export function renderVersionsJsonLd(entry: ManifestEntry, origin = CANONICAL_ORIGIN): string {
  const base = `${origin}/${entry.type}/${entry.slug}`;
  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `Version history of ${entry.title}`,
      url: `${base}/versions`,
      itemListElement: entry.versions.map((v, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        url: `${base}/v${v.version}`,
        name: `${entry.title} (v${v.version})`,
      })),
    },
    null,
    2,
  );
}

export function renderAuthorJsonLd(
  orcid: string,
  entries: ManifestEntry[],
  origin = CANONICAL_ORIGIN,
): string {
  const author =
    entries.flatMap((e) => e.authors).find((a) => a.orcid === orcid) ??
    (orcid === PRIMARY_AUTHOR.orcid ? PRIMARY_AUTHOR : null);

  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      url: `${origin}/author/${orcid}`,
      mainEntity: author
        ? formatAuthorJsonLd(author, origin)
        : { "@type": "Person", "@id": `https://orcid.org/${orcid}` },
      hasPart: entries.map((e) => ({
        "@type": e.type === "essay" ? "Article" : "ScholarlyArticle",
        headline: e.title,
        datePublished: e.datePublished,
        url: `${origin}/${e.type}/${e.slug}`,
      })),
    },
    null,
    2,
  );
}

export function renderAuthorHtml(
  orcid: string,
  entries: ManifestEntry[],
  options: RenderOptions = {},
): string {
  const origin = options.origin ?? CANONICAL_ORIGIN;
  const author =
    entries.flatMap((e) => e.authors).find((a) => a.orcid === orcid) ??
    (orcid === PRIMARY_AUTHOR.orcid ? PRIMARY_AUTHOR : { name: orcid, orcid });
  const jsonLd = renderAuthorJsonLd(orcid, entries, origin);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">${robotsMeta(options.publicIndexing)}
  <title>${escapeHtml(author.name)} — Author — EPIC WIN R&amp;D</title>
  <link rel="canonical" href="${escapeHtml(`${origin}/author/${orcid}`)}">
  <script type="application/ld+json">
${jsonLd.replace(/<\/script/gi, "<\\/script")}
  </script>
  <style>${SHARED_CSS}</style>
</head>
<body>
  <header class="site-header">
    <nav class="top-nav"><a href="/">EPIC WIN R&amp;D</a> / Author</nav>
    <h1>${escapeHtml(author.name)}</h1>
    <p class="dek">ORCID: <a href="https://orcid.org/${escapeHtml(orcid)}">https://orcid.org/${escapeHtml(orcid)}</a></p>
    ${
      author.sameAs && author.sameAs.length > 0
        ? `<nav class="formats" aria-label="Public profiles">${author.sameAs
            .map((u) => `<a href="${escapeHtml(u)}">${escapeHtml(new URL(u).hostname)}</a>`)
            .join("")}</nav>`
        : ""
    }
  </header>
  <main>
    <h2>Published Works (${entries.length})</h2>
    ${entries.length === 0 ? `<p class="dek">No listed works yet.</p>` : entries.map(renderCardHtml).join("\n")}
  </main>
  <footer class="site-footer">
    <p><a href="/">rnd.epicwinpromedia.com</a></p>
  </footer>
</body>
</html>`;
}

export function renderSitemapXml(manifest: Manifest, origin = CANONICAL_ORIGIN): string {
  const listed = getListedEntries(manifest);
  const urls: Array<{ loc: string; lastmod: string }> = [
    { loc: `${origin}/`, lastmod: manifest.updatedAt },
    { loc: `${origin}/essay/`, lastmod: manifest.updatedAt },
    { loc: `${origin}/paper/`, lastmod: manifest.updatedAt },
    { loc: `${origin}/author/${PRIMARY_AUTHOR.orcid}`, lastmod: manifest.updatedAt },
  ];

  const seriesSet = new Set<string>();
  const tagSet = new Set<string>();

  for (const e of listed) {
    urls.push({ loc: `${origin}/${e.type}/${e.slug}`, lastmod: e.dateModified });
    if (e.seriesSlug) seriesSet.add(e.seriesSlug);
    for (const ts of e.tagSlugs) tagSet.add(ts);
  }
  for (const s of Array.from(seriesSet).sort()) {
    urls.push({ loc: `${origin}/series/${s}`, lastmod: manifest.updatedAt });
  }
  for (const t of Array.from(tagSet).sort()) {
    urls.push({ loc: `${origin}/tags/${t}`, lastmod: manifest.updatedAt });
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url>\n    <loc>${escapeHtml(u.loc)}</loc>\n    <lastmod>${escapeHtml(u.lastmod)}</lastmod>\n  </url>`,
  )
  .join("\n")}
</urlset>
`;
}
