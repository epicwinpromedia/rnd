import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { computeHmacSignature } from "../src/canonical.ts";
import worker, { resolveFormat } from "../src/index.ts";

const INGEST_SECRET = "test-ingest-secret-v2";

function createInMemoryR2() {
  const store = new Map();
  return {
    store,
    async get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      const buf = Buffer.from(entry.bytes);
      return {
        key,
        size: buf.byteLength,
        httpEtag: `"etag-${key}"`,
        httpMetadata: entry.httpMetadata ?? {},
        customMetadata: entry.customMetadata ?? {},
        body: buf,
        async text() {
          return buf.toString("utf8");
        },
        async json() {
          return JSON.parse(buf.toString("utf8"));
        },
        async arrayBuffer() {
          return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        },
      };
    },
    async head(key) {
      const entry = store.get(key);
      if (!entry) return null;
      return {
        key,
        size: entry.bytes.byteLength,
        httpEtag: `"etag-${key}"`,
        httpMetadata: entry.httpMetadata ?? {},
        customMetadata: entry.customMetadata ?? {},
      };
    },
    async put(key, value, options = {}) {
      const bytes =
        typeof value === "string"
          ? Buffer.from(value, "utf8")
          : value instanceof Uint8Array
            ? Buffer.from(value)
            : Buffer.from(new Uint8Array(value));
      store.set(key, {
        bytes,
        httpMetadata: options.httpMetadata ?? {},
        customMetadata: options.customMetadata ?? {},
      });
    },
  };
}

function createTestHarness() {
  const bucket = createInMemoryR2();
  const purgedBatches = [];
  const workflowJobs = [];
  let browserRenderCount = 0;

  const env = {
    DOCS_BUCKET: bucket,
    INGEST_SECRET,
    BROWSER: {
      async fetch() {
        browserRenderCount++;
        const fakePdf = Buffer.from("%PDF-1.4\n% mocked tagged PDF\n%%EOF\n", "utf8");
        return new Response(fakePdf, {
          status: 200,
          headers: { "Content-Type": "application/pdf" },
        });
      },
    },
    PDF_WORKFLOW: {
      async create(opts) {
        workflowJobs.push(opts);
        return { id: opts?.id ?? "wf-1" };
      },
    },
  };

  const pendingWaitUntils = [];
  const ctx = {
    waitUntil(promise) {
      pendingWaitUntils.push(promise);
    },
    cache: {
      async purge(opts) {
        purgedBatches.push(opts);
        return { success: true };
      },
    },
  };

  async function signedIngest(payload, overrides = {}) {
    const rawBody = JSON.stringify(payload);
    const ts = overrides.timestamp ?? String(Math.floor(Date.now() / 1000));
    const sig =
      overrides.signature ?? `sha256=${await computeHmacSignature(INGEST_SECRET, ts, rawBody)}`;
    const req = new Request("https://rnd.epicwinpromedia.com/_ingest", {
      method: overrides.method ?? "POST",
      headers: {
        "Content-Type": "application/json",
        ...(overrides.omitHeaders
          ? {}
          : { "X-Ingest-Timestamp": ts, "X-Ingest-Signature": sig }),
      },
      body: rawBody,
    });
    return worker.fetch(req, env, ctx);
  }

  async function seedCanonicalWorks() {
    const dir = join(process.cwd(), "content/works");
    const order = [
      "resolution-is-not-leverage.json",
      "ai-as-the-shadow-self.json",
      "a-taste-of-agi.json",
      "benching-the-ego.json",
    ];
    for (const file of order) {
      const work = JSON.parse(readFileSync(join(dir, file), "utf8"));
      const res = await signedIngest({ action: "publish", work });
      assert.equal(res.status, 202, `Expected 202 seeding ${file}, got ${res.status}`);
    }
  }

  return {
    bucket,
    env,
    ctx,
    purgedBatches,
    workflowJobs,
    pendingWaitUntils,
    getBrowserRenderCount: () => browserRenderCount,
    signedIngest,
    seedCanonicalWorks,
  };
}

test("Phase 0 & Gate 1: Empty archive 404s old /rp/ paths and enforces unlisted robots.txt", async () => {
  const { env } = createTestHarness();

  const robots = await worker.fetch(new Request("https://rnd.epicwinpromedia.com/robots.txt"), env);
  assert.equal(robots.status, 200);
  assert.equal(robots.headers.get("X-Robots-Tag"), "noindex, nofollow, noarchive");
  assert.match(await robots.text(), /Disallow:\s*\//);

  const oldRp = await worker.fetch(
    new Request("https://rnd.epicwinpromedia.com/rp/resolution-is-not-leverage"),
    env,
  );
  assert.equal(oldRp.status, 404);

  const launchRobots = await worker.fetch(
    new Request("https://rnd.epicwinpromedia.com/robots.txt"),
    { ...env, PUBLIC_INDEXING: "true" },
  );
  assert.equal(launchRobots.status, 200);
  assert.equal(launchRobots.headers.get("X-Robots-Tag"), null);
  const launchBody = await launchRobots.text();
  assert.match(launchBody, /Allow:\s*\//);
  assert.match(launchBody, /Sitemap:\s*https:\/\/rnd\.epicwinpromedia\.com\/sitemap\.xml/);
});

test("Phase 1: Schema endpoints serve work, essay, and paper 2020-12 JSON Schemas", async () => {
  const { env } = createTestHarness();
  for (const name of ["work", "essay", "paper"]) {
    const res = await worker.fetch(
      new Request(`https://rnd.epicwinpromedia.com/schemas/${name}.schema.json`),
      env,
    );
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Content-Type"), "application/schema+json; charset=utf-8");
    const schema = JSON.parse(await res.text());
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.$id, `https://rnd.epicwinpromedia.com/schemas/${name}.schema.json`);
  }
});

test("Phase 1 & 2: /_ingest enforces HMAC auth, schema rules (D2, D13), immutability (409), and idempotency (200)", async () => {
  const { env, signedIngest, seedCanonicalWorks, purgedBatches, workflowJobs } =
    createTestHarness();

  // Missing signature -> 401
  const noSig = await signedIngest({ action: "publish", work: {} }, { omitHeaders: true });
  assert.equal(noSig.status, 401);

  // Stale timestamp -> 401
  const stale = await signedIngest(
    { action: "publish", work: {} },
    { timestamp: String(Math.floor(Date.now() / 1000) - 600) },
  );
  assert.equal(stale.status, 401);

  // Paper without artifacts -> 422 (D13)
  const sampleEssay = JSON.parse(
    readFileSync(join(process.cwd(), "content/works/resolution-is-not-leverage.json"), "utf8"),
  );
  const badPaper = await signedIngest({
    action: "publish",
    work: { ...sampleEssay, slug: "missing-artifacts-paper", type: "paper" },
  });
  assert.equal(badPaper.status, 422);

  // peer-reviewed without venue -> 422 (D2)
  const badPeerReviewed = await signedIngest({
    action: "publish",
    work: { ...sampleEssay, slug: "no-venue-essay", status: "peer-reviewed" },
  });
  assert.equal(badPeerReviewed.status, 422);

  // Seed all 4 canonical works cleanly
  await seedCanonicalWorks();
  assert.equal(workflowJobs.length, 4);
  assert.ok(purgedBatches.length >= 4);

  // Re-ingest identical v1 -> 200 idempotent
  const idem = await signedIngest({ action: "publish", work: sampleEssay });
  assert.equal(idem.status, 200);

  // Re-ingest modified v1 without bumping version -> 409 conflict (Invariant 2)
  const conflict = await signedIngest({
    action: "publish",
    work: { ...sampleEssay, abstract: "Modified abstract without version bump." },
  });
  assert.equal(conflict.status, 409);

  // Publish v2 cleanly -> 202
  const v2 = await signedIngest({
    action: "publish",
    work: { ...sampleEssay, version: 2, abstract: "Updated v2 abstract." },
  });
  assert.equal(v2.status, 202);

  // Check v1 is immutable and carries RFC 5829 successor/latest-version links
  const v1Res = await worker.fetch(
    new Request("https://rnd.epicwinpromedia.com/essay/resolution-is-not-leverage/v1.html"),
    env,
  );
  assert.equal(v1Res.status, 200);
  const linkHeader = v1Res.headers.get("Link") ?? "";
  assert.match(linkHeader, /rel="canonical"/);
  assert.match(linkHeader, /rel="describedby"/);
  assert.match(linkHeader, /rel="license"/);
  assert.match(linkHeader, /v2>; rel="latest-version"/);
  assert.match(linkHeader, /v2>; rel="successor-version"/);
  assert.match(linkHeader, /versions>; rel="version-history"/);
  const v1Html = await v1Res.text();
  assert.match(v1Html, /A newer version/);
  assert.equal(/<div[\s>]/i.test(v1Html), false, "HTML must have zero <div> elements");
});

test("Gate 2 & URI Contract: Content negotiation, format subdomains, wrong-type 301, research 301, works graph, taxonomy, author, sitemap", async () => {
  const { env, seedCanonicalWorks } = createTestHarness();
  await seedCanonicalWorks();

  // Format precedence check
  assert.equal(resolveFormat("jsonld", "md.rnd.epicwinpromedia.com", "application/pdf"), "jsonld");
  assert.equal(resolveFormat(undefined, "md.rnd.epicwinpromedia.com", "text/html"), "md");
  assert.equal(
    resolveFormat(undefined, "rnd.epicwinpromedia.com", "text/html;q=0.5, text/markdown;q=0.9"),
    "md",
  );

  // Header-negotiated Markdown matches md.rnd subdomain and sends Vary: Accept + private Cache-Control
  const mdAccept = await worker.fetch(
    new Request("https://rnd.epicwinpromedia.com/essay/a-taste-of-agi", {
      headers: { Accept: "text/markdown" },
    }),
    env,
  );
  assert.equal(mdAccept.status, 200);
  assert.equal(mdAccept.headers.get("Content-Type"), "text/markdown; charset=utf-8");
  assert.equal(mdAccept.headers.get("Vary"), "Accept");
  assert.equal(mdAccept.headers.get("Cache-Control"), "private, max-age=300");

  const mdSub = await worker.fetch(
    new Request("https://md.rnd.epicwinpromedia.com/essay/a-taste-of-agi"),
    env,
  );
  assert.equal(mdSub.status, 200);
  assert.equal(mdSub.headers.get("Cache-Control"), "public, max-age=300, s-maxage=31536000");
  assert.equal(await mdAccept.text(), await mdSub.text());

  // HTML check: <te-ref>, zero <div>, strict CSP, citation tags, works graph reverse edge
  const shadowHtmlRes = await worker.fetch(
    new Request("https://rnd.epicwinpromedia.com/essay/ai-as-the-shadow-self.html"),
    env,
  );
  assert.equal(shadowHtmlRes.status, 200);
  assert.match(shadowHtmlRes.headers.get("Content-Security-Policy") ?? "", /default-src 'none'/);
  const shadowHtml = await shadowHtmlRes.text();
  assert.equal(/<div[\s>]/i.test(shadowHtml), false);
  assert.match(shadowHtml, /<te-ref[\s>]/);
  assert.match(shadowHtml, /citation_title/);
  assert.match(shadowHtml, /Built on by/);
  assert.match(shadowHtml, /A Taste of AGI!\?/);
  // Voice consistency fixed, zero content dropped
  assert.match(shadowHtml, /what we&#39;re pointing at:/);
  assert.match(shadowHtml, /Down with Trust!!!/);

  // JSON-LD check: Article + genre: essay + ORCID @id + mirrors sameAs
  const jsonldRes = await worker.fetch(
    new Request("https://rnd.epicwinpromedia.com/essay/benching-the-ego.jsonld"),
    env,
  );
  assert.equal(jsonldRes.status, 200);
  const jsonld = JSON.parse(await jsonldRes.text());
  assert.equal(jsonld["@type"], "Article");
  assert.equal(jsonld.genre, "essay");
  assert.equal(jsonld.author[0]["@id"], "https://orcid.org/0009-0007-9859-2022");
  assert.equal(jsonld.author[0].name, "Bryan Harris");
  assert.ok(Array.isArray(jsonld.sameAs) && jsonld.sameAs.length === 1);

  // ETag -> 304 Not Modified
  const etag = jsonldRes.headers.get("ETag");
  assert.ok(etag);
  const notMod = await worker.fetch(
    new Request("https://rnd.epicwinpromedia.com/essay/benching-the-ego.jsonld", {
      headers: { "If-None-Match": etag },
    }),
    env,
  );
  assert.equal(notMod.status, 304);

  // Wrong-type prefix -> 301
  const wrongType = await worker.fetch(
    new Request("https://rnd.epicwinpromedia.com/paper/a-taste-of-agi"),
    env,
  );
  assert.equal(wrongType.status, 301);
  assert.equal(
    wrongType.headers.get("Location"),
    "https://rnd.epicwinpromedia.com/essay/a-taste-of-agi",
  );

  // research.epicwinpromedia.com/* -> 301
  const researchRedirect = await worker.fetch(
    new Request("https://research.epicwinpromedia.com/essay/a-taste-of-agi"),
    env,
  );
  assert.equal(researchRedirect.status, 301);
  assert.equal(
    researchRedirect.headers.get("Location"),
    "https://rnd.epicwinpromedia.com/essay/a-taste-of-agi",
  );

  // Index, type listing, tag, author, sitemap
  for (const path of [
    "/",
    "/essay/",
    "/paper/",
    "/tags/agi",
    "/author/0009-0007-9859-2022",
    "/essay/a-taste-of-agi/versions",
    "/sitemap.xml",
  ]) {
    const res = await worker.fetch(new Request(`https://rnd.epicwinpromedia.com${path}`), env);
    assert.equal(res.status, 200, `Expected 200 for ${path}`);
  }
});

test("Phase 3 & D11: HEAD never triggers PDF render; GET renders on demand and caches in pdf/regen/; delist preserves URI", async () => {
  const { env, ctx, bucket, pendingWaitUntils, getBrowserRenderCount, signedIngest, seedCanonicalWorks } =
    createTestHarness();
  await seedCanonicalWorks();

  // HEAD before PDF exists -> 404 and 0 browser renders
  const headPdf = await worker.fetch(
    new Request("https://rnd.epicwinpromedia.com/essay/benching-the-ego/v1.pdf", {
      method: "HEAD",
    }),
    env,
    ctx,
  );
  assert.equal(headPdf.status, 404);
  assert.equal(getBrowserRenderCount(), 0);

  // GET triggers on-demand render and stores in pdf/regen/
  const getPdf1 = await worker.fetch(
    new Request("https://rnd.epicwinpromedia.com/essay/benching-the-ego/v1.pdf"),
    env,
    ctx,
  );
  assert.equal(getPdf1.status, 200);
  assert.equal(getPdf1.headers.get("Content-Type"), "application/pdf");
  assert.match(await getPdf1.text(), /^%PDF-1\.4/);
  assert.equal(getBrowserRenderCount(), 1);
  await Promise.all(pendingWaitUntils);
  assert.ok(bucket.store.has("pdf/regen/benching-the-ego/v1.pdf"));

  // Second GET hits pdf/regen/ without invoking Browser Run again
  const getPdf2 = await worker.fetch(
    new Request("https://rnd.epicwinpromedia.com/essay/benching-the-ego/v1.pdf"),
    env,
    ctx,
  );
  assert.equal(getPdf2.status, 200);
  assert.equal(getBrowserRenderCount(), 1);

  // Delist removes from index/sitemap, but URI still returns 200 (Invariant 3 / D11)
  const delistRes = await signedIngest({ action: "delist", slug: "benching-the-ego" });
  assert.equal(delistRes.status, 200);
  const sitemapXml = await (
    await worker.fetch(new Request("https://rnd.epicwinpromedia.com/sitemap.xml"), env)
  ).text();
  assert.equal(sitemapXml.includes("benching-the-ego"), false);

  const stillAlive = await worker.fetch(
    new Request("https://rnd.epicwinpromedia.com/essay/benching-the-ego"),
    env,
  );
  assert.equal(stillAlive.status, 200);
  assert.match(await stillAlive.text(), /Delisted:/);
});

test("Content hygiene: content/works contains only the 4 real works (no placeholders)", () => {
  const files = readdirSync(join(process.cwd(), "content/works")).sort();
  assert.deepEqual(files, [
    "a-taste-of-agi.json",
    "ai-as-the-shadow-self.json",
    "benching-the-ego.json",
    "resolution-is-not-leverage.json",
  ]);
});
