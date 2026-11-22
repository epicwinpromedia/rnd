import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import worker, { resolveFormat } from "../src/index.ts";

const SEED_ROOT = join(process.cwd(), "seed-artifacts");

function createMockR2() {
  return {
    async get(key) {
      const fullPath = join(SEED_ROOT, key);
      if (!existsSync(fullPath)) return null;
      const buf = readFileSync(fullPath);
      return {
        key,
        size: buf.byteLength,
        httpEtag: `"mock-${key}"`,
        body: buf,
      };
    },
    async head(key) {
      const fullPath = join(SEED_ROOT, key);
      if (!existsSync(fullPath)) return null;
      const buf = readFileSync(fullPath);
      return {
        key,
        size: buf.byteLength,
        httpEtag: `"mock-${key}"`,
      };
    },
  };
}

const env = { DOCS_BUCKET: createMockR2() };

test("Gate 1: /robots.txt returns Disallow: / and X-Robots-Tag", async () => {
  const res = await worker.fetch(new Request("https://rnd.epicwinpromedia.com/robots.txt"), env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("X-Robots-Tag"), "noindex, nofollow, noarchive");
  const text = await res.text();
  assert.match(text, /User-agent:\s*\*/);
  assert.match(text, /Disallow:\s*\//);
});

test("Gate 2: Accept: text/markdown returns Markdown with Vary: Accept and Link describedby", async () => {
  const res = await worker.fetch(
    new Request("https://rnd.epicwinpromedia.com/rp/resolution-is-not-leverage", {
      headers: { Accept: "text/markdown" },
    }),
    env,
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "text/markdown; charset=utf-8");
  assert.equal(res.headers.get("Vary"), "Accept");
  assert.equal(
    res.headers.get("Link"),
    '<https://rnd.epicwinpromedia.com/schemas/rp.schema.json>; rel="describedby"',
  );
  assert.equal(res.headers.get("X-Robots-Tag"), "noindex, nofollow, noarchive");
  const md = await res.text();
  assert.match(md, /^---[\s\S]+# Resolution Is Not Leverage/m);
});

test("Gate 2: Subdomain md.rnd.epicwinpromedia.com matches Accept: text/markdown", async () => {
  const resAccept = await worker.fetch(
    new Request("https://rnd.epicwinpromedia.com/rp/resolution-is-not-leverage", {
      headers: { Accept: "text/markdown" },
    }),
    env,
  );
  const resSub = await worker.fetch(
    new Request("https://md.rnd.epicwinpromedia.com/rp/resolution-is-not-leverage"),
    env,
  );
  assert.equal(resSub.status, 200);
  assert.equal(resSub.headers.get("Content-Type"), "text/markdown; charset=utf-8");
  assert.equal(await resAccept.text(), await resSub.text());
});

test("Gate 2: Explicit extension overrides subdomain and Accept header", async () => {
  assert.equal(resolveFormat("jsonld", "md.rnd.epicwinpromedia.com", "application/pdf"), "jsonld");
  const res = await worker.fetch(
    new Request("https://md.rnd.epicwinpromedia.com/rp/a-taste-of-agi.jsonld", {
      headers: { Accept: "application/pdf" },
    }),
    env,
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "application/ld+json; charset=utf-8");
  const parsed = JSON.parse(await res.text());
  assert.equal(parsed["@type"], "ScholarlyArticle");
  assert.equal(parsed.headline, "A Taste of AGI!?");
});

test("Gate 2: PDF returns valid %PDF-1.4 header and HTML has zero <div> elements", async () => {
  const pdfRes = await worker.fetch(
    new Request("https://pdf.rnd.epicwinpromedia.com/rp/run-time-vs-dev-time"),
    env,
  );
  assert.equal(pdfRes.status, 200);
  assert.equal(pdfRes.headers.get("Content-Type"), "application/pdf");
  const pdfText = await pdfRes.text();
  assert.ok(pdfText.startsWith("%PDF-1.4"));

  const htmlRes = await worker.fetch(
    new Request("https://rnd.epicwinpromedia.com/rp/statistical-relevance-fallacy"),
    env,
  );
  assert.equal(htmlRes.status, 200);
  assert.equal(htmlRes.headers.get("Content-Type"), "text/html; charset=utf-8");
  const html = await htmlRes.text();
  assert.equal(/<div[\s>]/i.test(html), false, "HTML must contain zero <div> elements");
  assert.match(html, /noindex, nofollow, noarchive, nosnippet/);
});

test("HEAD requests succeed for all 4 seed papers across all 4 formats", async () => {
  const slugs = [
    "resolution-is-not-leverage",
    "run-time-vs-dev-time",
    "statistical-relevance-fallacy",
    "a-taste-of-agi",
  ];
  const exts = ["html", "md", "pdf", "jsonld"];
  for (const slug of slugs) {
    for (const ext of exts) {
      const res = await worker.fetch(
        new Request(`https://rnd.epicwinpromedia.com/rp/${slug}.${ext}`, { method: "HEAD" }),
        env,
      );
      assert.equal(res.status, 200, `HEAD failed for ${slug}.${ext}`);
      assert.equal(res.headers.get("Vary"), "Accept");
      assert.equal(res.headers.get("X-Robots-Tag"), "noindex, nofollow, noarchive");
    }
  }
});
