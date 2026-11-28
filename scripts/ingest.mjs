#!/usr/bin/env node
/**
 * scripts/ingest.mjs — Signed CLI ingest tool (Second Door) for rnd.epicwinpromedia.com
 *
 * Usage:
 *   node scripts/ingest.mjs --validate-only [file1.json ...]
 *   INGEST_SECRET=... RND_INGEST_URL=https://rnd.epicwinpromedia.com/_ingest node scripts/ingest.mjs [file1.json ...]
 *
 * If no file arguments are passed, ingests all *.json files in content/works/
 * in topological order (respecting buildsOn dependencies).
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { computeContentHash, computeHmacSignature } from "../src/canonical.ts";
import { validateAuthoredWork } from "../src/schemas.ts";
import { emptyManifest, upsertManifestEntry } from "../src/storage.ts";
import { CANONICAL_ORIGIN, DEFAULT_PUBLISHER, TEMPLATE_VERSION } from "../src/schemas.ts";

const args = process.argv.slice(2);
const validateOnly = args.includes("--validate-only");
const fileArgs = args.filter((a) => !a.startsWith("--"));

const defaultDir = resolve(process.cwd(), "content/works");
const files =
  fileArgs.length > 0
    ? fileArgs.map((f) => resolve(process.cwd(), f))
    : readdirSync(defaultDir)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => join(defaultDir, f));

if (files.length === 0) {
  console.error("No work JSON files found to ingest.");
  process.exit(1);
}

// Load and topologically sort by buildsOn so referenced slugs are ingested first
const items = files.map((filePath) => ({
  filePath,
  work: JSON.parse(readFileSync(filePath, "utf8")),
}));

const bySlug = new Map(items.map((item) => [item.work.slug, item]));
const visited = new Set();
const sorted = [];

function visit(item) {
  if (visited.has(item.work.slug)) return;
  visited.add(item.work.slug);
  for (const dep of item.work.buildsOn ?? []) {
    if (bySlug.has(dep)) visit(bySlug.get(dep));
  }
  sorted.push(item);
}
for (const item of items) visit(item);

// Validate locally first against an evolving manifest
const manifest = emptyManifest();
for (const { filePath, work } of sorted) {
  const res = validateAuthoredWork(work, manifest);
  if (!res.valid) {
    console.error(`Validation FAILED for ${filePath}:`);
    for (const err of res.errors) console.error(`  - ${err}`);
    process.exit(1);
  }
  const hash = await computeContentHash(res.work);
  const snapshot = {
    ...res.work,
    url: `${CANONICAL_ORIGIN}/${res.work.type}/${res.work.slug}`,
    versionUrl: `${CANONICAL_ORIGIN}/${res.work.type}/${res.work.slug}/v${res.work.version}`,
    dateModified: new Date().toISOString(),
    copyrightYear: Number.parseInt(res.work.datePublished.slice(0, 4), 10),
    contentHash: hash,
    template: TEMPLATE_VERSION,
    publisher: DEFAULT_PUBLISHER,
  };
  upsertManifestEntry(manifest, snapshot);
  console.log(`✓ Valid: ${res.work.type}/${res.work.slug} v${res.work.version} (sha256:${hash.slice(0, 12)})`);
}

if (validateOnly) {
  console.log(`All ${sorted.length} work(s) validated cleanly.`);
  process.exit(0);
}

const secret = process.env.INGEST_SECRET;
const endpoint = process.env.RND_INGEST_URL ?? `${CANONICAL_ORIGIN}/_ingest`;
if (!secret) {
  console.error("INGEST_SECRET environment variable is required to push to /_ingest.");
  process.exit(1);
}

for (const { work } of sorted) {
  const body = JSON.stringify({ action: "publish", work });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await computeHmacSignature(secret, timestamp, body);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Ingest-Timestamp": timestamp,
      "X-Ingest-Signature": `sha256=${signature}`,
    },
    body,
  });

  const text = await response.text();
  if (!response.ok) {
    console.error(`Ingest FAILED for ${work.slug} (${response.status}): ${text}`);
    process.exit(1);
  }
  console.log(`→ Ingested ${work.type}/${work.slug} v${work.version} (${response.status}): ${text}`);
}
