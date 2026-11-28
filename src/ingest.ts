import {
  computeContentHash,
  computeHmacSignature,
  pickAuthoredFields,
  slugifyTaxonomy,
  timingSafeEqualHex,
} from "./canonical.ts";
import {
  CANONICAL_ORIGIN,
  DEFAULT_PUBLISHER,
  TEMPLATE_VERSION,
  validateAuthoredWork,
} from "./schemas.ts";
import {
  loadManifest,
  loadSnapshot,
  saveManifest,
  saveSnapshot,
  upsertManifestEntry,
} from "./storage.ts";
import type {
  Env,
  ExecutionContextLike,
  IngestPayload,
  ManifestEntry,
  WorkSnapshot,
} from "./types.ts";

const MAX_CLOCK_SKEW_SECONDS = 300; // 5 minutes

export function collectPurgeTags(
  slug: string,
  type: string,
  prev?: ManifestEntry,
  next?: ManifestEntry,
): string[] {
  const tags = new Set<string>([
    `slug-${slug}`,
    `pdf-${slug}`,
    `type-${type}`,
    "index",
    "author",
    "sitemap",
  ]);
  for (const entry of [prev, next]) {
    if (!entry) continue;
    if (entry.seriesSlug) tags.add(`series-${entry.seriesSlug}`);
    for (const ts of entry.tagSlugs) tags.add(`tag-${ts}`);
  }
  return Array.from(tags);
}

export async function purgeCacheTagsWithRetry(
  ctx: ExecutionContextLike | undefined,
  tags: string[],
): Promise<{ attempted: boolean; success: boolean; attempts: number }> {
  if (!ctx?.cache || tags.length === 0) {
    return { attempted: false, success: true, attempts: 0 };
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await ctx.cache.purge({ tags });
    if (res.success) {
      return { attempted: true, success: true, attempts: attempt };
    }
  }
  return { attempted: true, success: false, attempts: 3 };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Cache-Control": "no-store",
    },
  });
}

async function writeIngestLog(
  bucket: R2Bucket,
  slug: string,
  version: number | string,
  record: Record<string, unknown>,
): Promise<void> {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const key = `ingest-log/${ts}-${slug}-v${version}.json`;
  await bucket.put(key, JSON.stringify({ timestamp: new Date().toISOString(), ...record }, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

export async function handleIngest(
  request: Request,
  env: Env,
  ctx?: ExecutionContextLike,
): Promise<Response> {
  if (request.method.toUpperCase() !== "POST") {
    return jsonResponse({ error: "Method Not Allowed. Use POST." }, 405);
  }

  if (!env.INGEST_SECRET) {
    return jsonResponse({ error: "INGEST_SECRET is not configured." }, 500);
  }

  const timestampHeader = request.headers.get("X-Ingest-Timestamp");
  const signatureHeader = request.headers.get("X-Ingest-Signature");
  if (!timestampHeader || !signatureHeader) {
    return jsonResponse(
      { error: "Missing X-Ingest-Timestamp or X-Ingest-Signature header." },
      401,
    );
  }

  const tsSec = Number.parseInt(timestampHeader, 10);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(tsSec) || Math.abs(nowSec - tsSec) > MAX_CLOCK_SKEW_SECONDS) {
    return jsonResponse({ error: "Timestamp outside allowed 5-minute window." }, 401);
  }

  const rawBody = await request.text();
  const expectedSig = await computeHmacSignature(env.INGEST_SECRET, timestampHeader, rawBody);
  const providedSig = signatureHeader.replace(/^sha256=/i, "");
  if (!timingSafeEqualHex(expectedSig, providedSig)) {
    return jsonResponse({ error: "Invalid HMAC signature." }, 401);
  }

  let payload: IngestPayload;
  try {
    payload = JSON.parse(rawBody) as IngestPayload;
  } catch {
    return jsonResponse({ error: "Invalid JSON payload." }, 400);
  }

  const manifest = await loadManifest(env.DOCS_BUCKET);
  const origin = env.CANONICAL_ORIGIN ?? CANONICAL_ORIGIN;

  // Handle delist action (D11: URIs keep resolving, removed from index/sitemap/listings)
  if (payload.action === "delist") {
    const slug = payload.slug;
    const existing = manifest.entries[slug];
    if (!existing) {
      return jsonResponse({ error: `Unknown slug: ${slug}` }, 404);
    }
    const prevSnapshot = { ...existing };
    existing.listed = false;
    await saveManifest(env.DOCS_BUCKET, manifest);
    const tags = collectPurgeTags(slug, existing.type, prevSnapshot, existing);
    const purgeResult = await purgeCacheTagsWithRetry(ctx, tags);
    await writeIngestLog(env.DOCS_BUCKET, slug, existing.latestVersion, {
      action: "delist",
      result: "ok",
      purgeResult,
    });
    return jsonResponse({ status: "delisted", slug, listed: false, purgeResult }, 200);
  }

  // Publish action
  const validation = validateAuthoredWork(payload.work, manifest);
  if (!validation.valid) {
    const fallbackSlug =
      typeof (payload.work as { slug?: unknown })?.slug === "string"
        ? (payload.work as { slug: string }).slug
        : "invalid";
    await writeIngestLog(env.DOCS_BUCKET, fallbackSlug, "err", {
      action: "publish",
      result: "validation_failed",
      errors: validation.errors,
    });
    return jsonResponse({ error: "Validation failed", details: validation.errors }, 422);
  }

  const authored = pickAuthoredFields(validation.work);
  const prevEntry = manifest.entries[authored.slug]
    ? { ...manifest.entries[authored.slug] }
    : undefined;

  // Copy referenced media into R2 assets/{slug}/{filename} and rewrite body links (invariant 1)
  if (Array.isArray(payload.assets) && payload.assets.length > 0) {
    let rewrittenBody = authored.body;
    for (const asset of payload.assets) {
      const safeFilename = asset.filename.replace(/[^a-zA-Z0-9._-]/g, "-");
      const assetRes = await fetch(asset.sourceUrl);
      if (!assetRes.ok) {
        return jsonResponse(
          { error: `Failed to fetch asset ${asset.sourceUrl}: ${assetRes.status}` },
          502,
        );
      }
      const assetBytes = await assetRes.arrayBuffer();
      const ct =
        asset.contentType ??
        assetRes.headers.get("Content-Type") ??
        "application/octet-stream";
      await env.DOCS_BUCKET.put(`assets/${authored.slug}/${safeFilename}`, assetBytes, {
        httpMetadata: { contentType: ct },
      });
      rewrittenBody = rewrittenBody.split(asset.sourceUrl).join(`${origin}/assets/${authored.slug}/${safeFilename}`);
    }
    authored.body = rewrittenBody;
  }

  const contentHash = await computeContentHash(authored);
  const existingSnapshot = await loadSnapshot(env.DOCS_BUCKET, authored.slug, authored.version);

  if (existingSnapshot) {
    if (existingSnapshot.contentHash === contentHash) {
      return jsonResponse(
        {
          status: "unchanged",
          slug: authored.slug,
          version: authored.version,
          contentHash,
          url: existingSnapshot.url,
          versionUrl: existingSnapshot.versionUrl,
        },
        200,
      );
    }
    await writeIngestLog(env.DOCS_BUCKET, authored.slug, authored.version, {
      action: "publish",
      result: "conflict",
      existingHash: existingSnapshot.contentHash,
      incomingHash: contentHash,
    });
    return jsonResponse(
      {
        error: `Version v${authored.version} of '${authored.slug}' already exists with a different contentHash. Bump the version number (invariant 2).`,
        existingHash: existingSnapshot.contentHash,
        incomingHash: contentHash,
      },
      409,
    );
  }

  const nowIso = new Date().toISOString();
  const copyrightYear = Number.parseInt(authored.datePublished.slice(0, 4), 10);
  const snapshot: WorkSnapshot = {
    ...authored,
    url: `${origin}/${authored.type}/${authored.slug}`,
    versionUrl: `${origin}/${authored.type}/${authored.slug}/v${authored.version}`,
    dateModified: nowIso,
    copyrightYear,
    contentHash,
    template: TEMPLATE_VERSION,
    publisher: DEFAULT_PUBLISHER,
  };

  await saveSnapshot(env.DOCS_BUCKET, snapshot);
  const updatedEntry = upsertManifestEntry(manifest, snapshot);
  // Ensure re-publishing a previously delisted work relists it
  updatedEntry.listed = true;
  await saveManifest(env.DOCS_BUCKET, manifest);

  const tags = collectPurgeTags(authored.slug, authored.type, prevEntry, updatedEntry);
  const purgeResult = await purgeCacheTagsWithRetry(ctx, tags);

  let pdfJobId: string | undefined;
  if (env.PDF_WORKFLOW) {
    const instance = await env.PDF_WORKFLOW.create({
      id: `pdf-${authored.slug}-v${authored.version}-${contentHash.slice(0, 8)}`,
      params: {
        slug: authored.slug,
        version: authored.version,
        previousVersion: prevEntry?.latestVersion,
        contentHash,
      },
    });
    pdfJobId = instance.id;
  }

  await writeIngestLog(env.DOCS_BUCKET, authored.slug, authored.version, {
    action: "publish",
    result: "accepted",
    contentHash,
    tagsPurged: tags,
    purgeResult,
    pdfJobId,
  });

  return jsonResponse(
    {
      status: "accepted",
      slug: snapshot.slug,
      type: snapshot.type,
      version: snapshot.version,
      contentHash: snapshot.contentHash,
      url: snapshot.url,
      versionUrl: snapshot.versionUrl,
      seriesSlug: snapshot.series ? slugifyTaxonomy(snapshot.series) : undefined,
      purgeResult,
      pdfJobId,
    },
    202,
  );
}
