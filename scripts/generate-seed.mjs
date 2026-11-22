#!/usr/bin/env node
/**
 * Generates clean v1 canonical multi-format artifacts (.md, .html, .pdf, .jsonld)
 * for the 4 seed research papers in seed-artifacts/rp/.
 *
 * All PDFs are valid standards-compliant PDF 1.4 documents generated with zero external dependencies.
 * All HTML files enforce zero-<div> TacEm semantic HTML5 + unlisted <meta name="robots">.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = join(process.cwd(), "seed-artifacts", "rp");
mkdirSync(OUT_DIR, { recursive: true });

const PAPERS = [
  {
    slug: "resolution-is-not-leverage",
    title: "Resolution Is Not Leverage",
    subtitle: "Why Raw Model Scale Fails Without Deterministic Architectural Boundaries",
    datePublished: "2026-09-15",
    author: "Bryan Lee Harris",
    organization: "EPIC WIN Pro Media",
    abstract:
      "Enterprise AI programs routinely conflate higher parameter density and longer context windows with operational leverage. Primary-source engineering analysis demonstrates that leverage comes from deterministic routing, capability-scoped interfaces, and strict boundary hygiene—not brute-force inference resolution.",
    keyReceipt:
      "Replacing an unbounded generative loop with a deterministic System 1 router (@cf/cloudflare/clef-flash) cuts tail latency by >85% while eliminating unverified prose.",
    sections: [
      {
        heading: "1. The Resolution Fallacy",
        body: "When an organization struggles to turn AI pilots into production workflows, the default reflex is to buy higher resolution: bigger frontier models, wider context windows, and looser prompts. In video engineering, 8K raw footage with bad lighting and no story structure is still unusable; in AI systems, 1M-token context windows with undefined authority boundaries only scale failure faster.",
      },
      {
        heading: "2. Leverage Lives at the Boundary",
        body: "True leverage is structural. Cloudflare's 2026 Unified Edge Fabric proves this principle in production: Workers isolate execution at the edge, AI Gateway enforces deterministic rate limits and caching, and open-weight System 1 classifiers like @cf/cloudflare/clef-flash resolve intent before expensive reasoning is ever invoked.",
      },
      {
        heading: "3. Implications for Executive Storytelling & Platform Positioning",
        body: "Developers immediately spot hand-waving; CFOs immediately spot unmeasured burn. Technical positioning succeeds when it replaces vague claims of 'AI magic' with verifiable receipts: exact latency budgets, deterministic routing schemas, and reproducible architectures.",
      },
    ],
  },
  {
    slug: "run-time-vs-dev-time",
    title: "Run Time vs. Dev Time",
    subtitle: "Collapsing the Impedance Mismatch Between Authoring Semantics and Global Edge Execution",
    datePublished: "2026-10-02",
    author: "Bryan Lee Harris",
    organization: "EPIC WIN Pro Media",
    abstract:
      "Modern web stacks accumulate layers of build-time abstraction that obscure what actually executes at request time. By pairing semantic HTML5, native CSS state machines (:has()), and edge-native SSR on Cloudflare Workers + EmDash 1.0, teams collapse middleware tax and ship systems whose dev-time mental model matches their run-time reality.",
    keyReceipt:
      "A zero-<div>, zero-Tailwind Astro SSR portal on EmDash 1.0 + D1 + KV + R2 ships <5 KB of vanilla JS while delivering sub-50ms edge personalization.",
    sections: [
      {
        heading: "1. The Middleware Tax",
        body: "Over the past decade, web architecture drifted toward shipping megabytes of client-side hydration machinery just to toggle tabs, open modals, or filter lists. Every abstraction layer widens the gap between what a developer writes and what the browser and network execute.",
      },
      {
        heading: "2. Edge SSR + Native Platform Primitives",
        body: "Cloudflare Workers, D1, R2, and KV move data and compute to the network edge. On the client, Baseline web primitives—:has(), <details name>, <dialog closedby='any'>, @view-transition, and WebMCP—handle interactive state natively without framework sprawl.",
      },
      {
        heading: "3. Co-Equal Citizens: Humans and Agents",
        body: "When the run-time surface is clean semantic HTML paired with content-negotiated Markdown (text/markdown) and structured MCP/WebMCP tools, both human readers and AI agents inspect the exact same source of truth with zero scraping fragility.",
      },
    ],
  },
  {
    slug: "statistical-relevance-fallacy",
    title: "The Statistical Relevance Fallacy",
    subtitle: "Why Probabilistic Confidence Cannot Substitute for Structural Verification",
    datePublished: "2026-10-18",
    author: "Bryan Lee Harris",
    organization: "EPIC WIN Pro Media",
    abstract:
      "Vector similarity and next-token probability measure linguistic proximity, not factual truth or legal compliance. In enterprise customer storytelling and regulated developer platforms, compositive AI pipelines must gate probabilistic outputs behind deterministic thresholds and human-approved source receipts.",
    keyReceipt:
      "Calibrated Companion Noul thresholds (<0.3 out-of-scope, 0.3-0.7 top-2 suggestions, >0.7 verified receipt) enforce zero hallucinated prose in production.",
    sections: [
      {
        heading: "1. Proximity Is Not Proof",
        body: "A retrieval system that returns a 0.89 cosine-similarity chunk can still fabricate a customer metric or misquote a CISO. Statistical relevance tells you two paragraphs share vocabulary; it never guarantees that the resulting claim will survive Legal, Comms, or engineering review.",
      },
      {
        heading: "2. Compositive AI vs. Generative Slop",
        body: "The Comprehensive Brand Profile (CBP) architecture treats approved primary-source interviews as immutable receipts. AI is used to route, structure, and atomize verified facts across channels (keynote, dev blog, CISO brief, social video) under explicit brand guardrails rather than inventing copy from thin air.",
      },
      {
        heading: "3. Auditable Decision Traces",
        body: "Every automated routing decision should expose its confidence score, matched intent, latency, and model identifier. Transparency turns AI from a black-box liability into an inspectable engineering instrument.",
      },
    ],
  },
  {
    slug: "a-taste-of-agi",
    title: "A Taste of AGI!?",
    subtitle: "Primary-Source Forensic Audit of Frontier Agentic Capability vs. Generative Theater",
    datePublished: "2026-11-05",
    author: "Bryan Lee Harris",
    organization: "EPIC WIN Pro Media",
    abstract:
      "Stripping away keynote hype, what actually differentiates a genuinely useful agentic system from an impressive demo? Through primary-source forensics, we show that durable agentic workflows depend on standard tool contracts (MCP + WebMCP), sandboxed execution, and machine-readable web infrastructure.",
    keyReceipt:
      "Combining server-side EmDash MCP, browser-side WebMCP (document.modelContext), and R2 Markdown negotiation turns any publication into a verifiable agentic surface.",
    sections: [
      {
        heading: "1. Beyond the Demo Reel",
        body: "Spectacle demos succeed in controlled videos and fail on real enterprise workflows because they rely on fragile DOM scraping and unguarded permissions. Real capability requires explicit tool schemas, read-only vs. consequential annotations, and clean failure recovery.",
      },
      {
        heading: "2. The Three-Layer Agentic Stack",
        body: "Production agentic readiness spans three interlocking layers: (1) Server MCP for structured backend queries with Zero Trust write protection, (2) Browser WebMCP for in-tab state transitions, and (3) Content-negotiated Markdown for Agents so crawlers and assistants consume clean prose at the edge.",
      },
      {
        heading: "3. Trust as the Ultimate Moat",
        body: "As inference becomes a commodity, trust—cryptographic, architectural, and editorial—becomes the moat. Organizations that pair open standards with verifiable infrastructure win both the developer mindshare and the enterprise boardroom.",
      },
    ],
  },
];

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderMarkdown(paper) {
  const canonical = `https://rnd.epicwinpromedia.com/rp/${paper.slug}`;
  return [
    `---`,
    `title: "${paper.title}"`,
    `subtitle: "${paper.subtitle}"`,
    `author: "${paper.author}"`,
    `organization: "${paper.organization}"`,
    `datePublished: "${paper.datePublished}"`,
    `canonical: "${canonical}"`,
    `schema: "https://rnd.epicwinpromedia.com/schemas/rp.schema.json"`,
    `robots: "noindex, nofollow, noarchive"`,
    `---`,
    ``,
    `# ${paper.title}`,
    ``,
    `> **${paper.subtitle}**  `,
    `> *${paper.author} · ${paper.organization} · ${paper.datePublished}*`,
    ``,
    `## Abstract`,
    ``,
    paper.abstract,
    ``,
    `## Key Receipt`,
    ``,
    `> ${paper.keyReceipt}`,
    ``,
    ...paper.sections.flatMap((s) => [`## ${s.heading}`, ``, s.body, ``]),
    `---`,
    ``,
    `### Canonical Multi-Format Endpoints`,
    `- Canonical (Accept-negotiated): ${canonical}`,
    `- Markdown: https://md.rnd.epicwinpromedia.com/rp/${paper.slug}`,
    `- HTML: https://html.rnd.epicwinpromedia.com/rp/${paper.slug}`,
    `- PDF: https://pdf.rnd.epicwinpromedia.com/rp/${paper.slug}`,
    `- JSON-LD: https://jsonld.rnd.epicwinpromedia.com/rp/${paper.slug}`,
    ``,
  ].join("\n");
}

function renderHtml(paper) {
  const canonical = `https://rnd.epicwinpromedia.com/rp/${paper.slug}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
  <link rel="canonical" href="${canonical}">
  <link rel="alternate" type="text/markdown" href="${canonical}.md">
  <link rel="alternate" type="application/pdf" href="${canonical}.pdf">
  <link rel="alternate" type="application/ld+json" href="${canonical}.jsonld">
  <title>${escapeHtml(paper.title)} — ${escapeHtml(paper.author)}</title>
  <style>
    :root { color-scheme: dark; --bg: #151414; --surface: #1F1F1F; --ink: #F0E3DE; --muted: #9A9390; --accent: #FF5E1F; --teal: #00CCBB; --line: #333130; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Inter', system-ui, sans-serif; background: var(--bg); color: var(--ink); line-height: 1.65; }
    header, main, footer { max-width: 52rem; margin-inline: auto; padding: 2rem 1.5rem; }
    header { border-bottom: 1px solid var(--line); }
    p.eyebrow { font-family: ui-monospace, monospace; font-size: 0.75rem; color: var(--accent); text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 0.75rem; }
    h1 { font-size: clamp(2rem, 4.5vw, 3.25rem); font-weight: 500; letter-spacing: -0.025em; line-height: 1.05; margin: 0 0 0.75rem; }
    p.subtitle { font-size: 1.15rem; color: var(--muted); margin: 0 0 1rem; }
    p.meta { font-family: ui-monospace, monospace; font-size: 0.8rem; color: var(--muted); margin: 0; }
    aside.receipt { background: var(--surface); border: 1px solid var(--line); border-left: 3px solid var(--accent); padding: 1.25rem 1.5rem; margin: 1.5rem 0; }
    aside.receipt p { margin: 0.35rem 0 0; }
    section { margin: 2rem 0; }
    h2 { font-size: 1.5rem; font-weight: 500; letter-spacing: -0.02em; margin: 0 0 0.75rem; }
    nav.formats { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1.25rem; }
    nav.formats a { font-family: ui-monospace, monospace; font-size: 0.8rem; color: var(--ink); text-decoration: none; border: 1px solid var(--line); padding: 0.35rem 0.85rem; border-radius: 9999px; }
    nav.formats a:hover { border-color: var(--accent); color: var(--accent); }
    footer { border-top: 1px solid var(--line); font-family: ui-monospace, monospace; font-size: 0.8rem; color: var(--muted); }
    footer a { color: var(--teal); }
  </style>
</head>
<body>
  <header>
    <p class="eyebrow">EPIC WIN R&amp;D · CANONICAL RESEARCH PAPER · V1</p>
    <h1>${escapeHtml(paper.title)}</h1>
    <p class="subtitle">${escapeHtml(paper.subtitle)}</p>
    <p class="meta">${escapeHtml(paper.author)} · ${escapeHtml(paper.organization)} · ${paper.datePublished}</p>
    <nav class="formats" aria-label="Alternate formats">
      <a href="/rp/${paper.slug}.md">Markdown (.md)</a>
      <a href="/rp/${paper.slug}.pdf">PDF (.pdf)</a>
      <a href="/rp/${paper.slug}.jsonld">JSON-LD (.jsonld)</a>
      <a href="/">All Papers</a>
    </nav>
  </header>
  <main>
    <section aria-labelledby="abstract-heading">
      <h2 id="abstract-heading">Abstract</h2>
      <p>${escapeHtml(paper.abstract)}</p>
    </section>
    <aside class="receipt" aria-label="Key receipt">
      <p class="eyebrow">KEY RECEIPT</p>
      <p>${escapeHtml(paper.keyReceipt)}</p>
    </aside>
    ${paper.sections
      .map(
        (s, idx) => `<section aria-labelledby="sec-${idx + 1}">
      <h2 id="sec-${idx + 1}">${escapeHtml(s.heading)}</h2>
      <p>${escapeHtml(s.body)}</p>
    </section>`,
      )
      .join("\n    ")}
  </main>
  <footer>
    <p>Served directly from Cloudflare R2 (<code>epicwin-rnd-docs</code>) with <code>Vary: Accept</code> · <a href="https://cf.epicwinpromedia.com">Return to Portfolio Portal</a></p>
  </footer>
</body>
</html>`;
}

function renderJsonLd(paper) {
  const canonical = `https://rnd.epicwinpromedia.com/rp/${paper.slug}`;
  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "ScholarlyArticle",
      headline: paper.title,
      alternativeHeadline: paper.subtitle,
      description: paper.abstract,
      author: {
        "@type": "Person",
        name: paper.author,
        affiliation: {
          "@type": "Organization",
          name: paper.organization,
        },
      },
      datePublished: paper.datePublished,
      url: canonical,
      isPartOf: {
        "@type": "WebSite",
        name: "EPIC WIN R&D Canonical Archive",
        url: "https://rnd.epicwinpromedia.com/",
      },
      encoding: [
        { "@type": "MediaObject", encodingFormat: "text/html", contentUrl: `${canonical}.html` },
        { "@type": "MediaObject", encodingFormat: "text/markdown", contentUrl: `${canonical}.md` },
        { "@type": "MediaObject", encodingFormat: "application/pdf", contentUrl: `${canonical}.pdf` },
        { "@type": "MediaObject", encodingFormat: "application/ld+json", contentUrl: `${canonical}.jsonld` },
      ],
    },
    null,
    2,
  );
}

/**
 * Pure-JS PDF 1.4 generator (zero external dependencies) producing valid,
 * readable single-page US Letter PDFs with Helvetica typography.
 */
function pdfEscape(text) {
  return text
    .replace(/[^\x20-\x7E]/g, "-")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function wrapText(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) lines.push(current);
  return lines;
}

function renderPdf(paper) {
  const ops = [];
  let y = 740;
  const left = 54;

  const drawText = (text, font, size, leading) => {
    ops.push(`BT /${font} ${size} Tf ${left} ${y} Td (${pdfEscape(text)}) Tj ET`);
    y -= leading;
  };

  drawText("EPIC WIN R&D // CANONICAL RESEARCH PAPER (V1)", "F2", 9, 18);
  drawText(paper.title, "F2", 20, 24);
  for (const line of wrapText(paper.subtitle, 72)) {
    drawText(line, "F1", 12, 16);
  }
  drawText(`${paper.author} | ${paper.organization} | ${paper.datePublished}`, "F1", 9, 22);

  drawText("ABSTRACT", "F2", 10, 14);
  for (const line of wrapText(paper.abstract, 88)) {
    drawText(line, "F1", 10, 13);
  }
  y -= 8;

  drawText("KEY RECEIPT", "F2", 10, 14);
  for (const line of wrapText(paper.keyReceipt, 88)) {
    drawText(line, "F1", 10, 13);
  }
  y -= 10;

  for (const section of paper.sections) {
    drawText(section.heading, "F2", 11, 15);
    for (const line of wrapText(section.body, 88)) {
      if (y < 70) break;
      drawText(line, "F1", 10, 13);
    }
    y -= 8;
  }

  y = 42;
  drawText(
    `Canonical: https://rnd.epicwinpromedia.com/rp/${paper.slug} | Unlisted (noindex, nofollow, noarchive)`,
    "F1",
    8,
    10,
  );

  const stream = ops.join("\n");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n",
    `4 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    "6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj;
  }
  const xrefPos = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

for (const paper of PAPERS) {
  writeFileSync(join(OUT_DIR, `${paper.slug}.md`), renderMarkdown(paper), "utf8");
  writeFileSync(join(OUT_DIR, `${paper.slug}.html`), renderHtml(paper), "utf8");
  writeFileSync(join(OUT_DIR, `${paper.slug}.jsonld`), renderJsonLd(paper), "utf8");
  writeFileSync(join(OUT_DIR, `${paper.slug}.pdf`), renderPdf(paper));
}

console.log(`Generated ${PAPERS.length * 4} canonical seed artifacts in ${OUT_DIR}`);
