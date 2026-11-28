/**
 * Zero-<div> semantic HTML5 Markdown renderer.
 * Supports headings, paragraphs, blockquotes, ordered/unordered lists,
 * fenced code blocks, horizontal rules, inline emphasis/code/links, and
 * Markdown footnotes ([^id] + [^id]: definition).
 */

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeHref(url: string): string {
  const trimmed = url.trim();
  if (
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("mailto:")
  ) {
    return escapeHtml(trimmed);
  }
  return "#";
}

function renderInline(raw: string): string {
  // 1. Protect inline code spans
  const codeTokens: string[] = [];
  let text = raw.replace(/`([^`]+)`/g, (_m, code: string) => {
    const idx = codeTokens.length;
    codeTokens.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000CODE${idx}\u0000`;
  });

  // 2. Escape remaining HTML
  text = escapeHtml(text);

  // 3. Markdown links [label](url)
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    const decodedUrl = url.replace(/&amp;/g, "&");
    return `<a href="${sanitizeHref(decodedUrl)}">${label}</a>`;
  });

  // 4. Footnote references [^1]
  text = text.replace(/\[\^([a-zA-Z0-9_-]+)\]/g, (_m, id: string) => {
    const safeId = escapeHtml(id);
    return `<sup id="fnref-${safeId}"><a href="#fn-${safeId}" role="doc-noteref">${safeId}</a></sup>`;
  });

  // 5. Bare URLs (not already inside an href attribute)
  text = text.replace(/(^|[\s(])(https?:\/\/[^\s)<>"']+)/g, (_m, prefix: string, url: string) => {
    let clean = url;
    let trailing = "";
    while (/[.,;:!?]$/.test(clean)) {
      trailing = clean.slice(-1) + trailing;
      clean = clean.slice(0, -1);
    }
    const decodedUrl = clean.replace(/&amp;/g, "&");
    return `${prefix}<a href="${sanitizeHref(decodedUrl)}">${clean}</a>${trailing}`;
  });

  // 6. Bold + italic, bold, italic
  text = text.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");

  // 7. Restore code spans
  text = text.replace(/\u0000CODE(\d+)\u0000/g, (_m, idx: string) => codeTokens[Number(idx)] ?? "");

  return text;
}

export function renderMarkdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const footnotes = new Map<string, string>();
  const bodyLines: string[] = [];

  // Extract footnote definitions ([^id]: text)
  let currentFnId: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fnMatch = line.match(/^\[\^([a-zA-Z0-9_-]+)\]:\s*(.*)$/);
    if (fnMatch) {
      currentFnId = fnMatch[1];
      footnotes.set(currentFnId, fnMatch[2]);
      continue;
    }
    if (currentFnId !== null) {
      if (line.trim() === "") {
        currentFnId = null;
      } else if (/^\s{2,}/.test(line) || /^and https?:\/\//.test(line.trim())) {
        footnotes.set(currentFnId, `${footnotes.get(currentFnId)} ${line.trim()}`);
        continue;
      } else {
        currentFnId = null;
      }
    }
    bodyLines.push(line);
  }

  const out: string[] = [];
  let i = 0;

  while (i < bodyLines.length) {
    const line = bodyLines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      i++;
      continue;
    }

    // Fenced code block
    const fenceMatch = trimmed.match(/^```([a-zA-Z0-9_-]*)$/);
    if (fenceMatch) {
      const lang = fenceMatch[1];
      const codeLines: string[] = [];
      i++;
      while (i < bodyLines.length && !bodyLines[i].trim().startsWith("```")) {
        codeLines.push(bodyLines[i]);
        i++;
      }
      i++; // skip closing fence
      const classAttr = lang ? ` class="language-${escapeHtml(lang)}"` : "";
      out.push(`<pre><code${classAttr}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    // Horizontal rule
    if (/^(?:---+|\*\*\*+|___+)$/.test(trimmed)) {
      out.push("<hr>");
      i++;
      continue;
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = Math.min(6, Math.max(2, headingMatch[1].length));
      const text = headingMatch[2].trim();
      const id = text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      out.push(`<h${level} id="${escapeHtml(id)}">${renderInline(text)}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < bodyLines.length && bodyLines[i].trim().startsWith(">")) {
        quoteLines.push(bodyLines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      const inner = quoteLines.map((q) => renderInline(q)).join("<br>");
      out.push(`<blockquote><p>${inner}</p></blockquote>`);
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < bodyLines.length && /^[-*+]\s+/.test(bodyLines[i].trim())) {
        items.push(`<li>${renderInline(bodyLines[i].trim().replace(/^[-*+]\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ul>\n${items.join("\n")}\n</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < bodyLines.length && /^\d+\.\s+/.test(bodyLines[i].trim())) {
        items.push(`<li>${renderInline(bodyLines[i].trim().replace(/^\d+\.\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ol>\n${items.join("\n")}\n</ol>`);
      continue;
    }

    // Paragraph
    const paraLines: string[] = [];
    while (
      i < bodyLines.length &&
      bodyLines[i].trim() !== "" &&
      !/^(#{1,6}\s|```|---+$|\*\*\*+$|___+$|>|[-*+]\s|\d+\.\s)/.test(bodyLines[i].trim())
    ) {
      paraLines.push(bodyLines[i].trim());
      i++;
    }
    out.push(`<p>${paraLines.map((p) => renderInline(p)).join("<br>")}</p>`);
  }

  // Append footnotes section if any definitions were extracted
  if (footnotes.size > 0) {
    const fnItems: string[] = [];
    for (const [id, content] of footnotes.entries()) {
      const safeId = escapeHtml(id);
      fnItems.push(
        `<li id="fn-${safeId}">${renderInline(content)} <a href="#fnref-${safeId}" aria-label="Back to reference ${safeId}">↩</a></li>`,
      );
    }
    out.push(
      `<section class="footnotes" role="doc-endnotes" aria-label="Footnotes">\n<ol>\n${fnItems.join("\n")}\n</ol>\n</section>`,
    );
  }

  return out.join("\n");
}
