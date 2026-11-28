import { slugifyTaxonomy } from "./canonical.ts";
import type { Manifest, ManifestEntry, WorkSnapshot } from "./types.ts";

export const MANIFEST_KEY = "manifest.json";

export function snapshotKey(slug: string, version: number): string {
  return `snapshots/${slug}/v${version}.json`;
}

export function latestPdfKey(slug: string): string {
  return `pdf/latest/${slug}.pdf`;
}

export function regenPdfKey(slug: string, version: number): string {
  return `pdf/regen/${slug}/v${version}.pdf`;
}

export function emptyManifest(): Manifest {
  return {
    schemaVersion: 2,
    updatedAt: new Date(0).toISOString(),
    entries: {},
  };
}

export async function loadManifest(bucket: R2Bucket): Promise<Manifest> {
  const obj = await bucket.get(MANIFEST_KEY);
  if (!obj) return emptyManifest();
  const parsed = (await obj.json()) as Manifest;
  if (!parsed || typeof parsed !== "object" || !parsed.entries) {
    return emptyManifest();
  }
  return parsed;
}

export async function saveManifest(bucket: R2Bucket, manifest: Manifest): Promise<void> {
  manifest.updatedAt = new Date().toISOString();
  rebuildReverseEdges(manifest);
  await bucket.put(MANIFEST_KEY, JSON.stringify(manifest, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

export async function loadSnapshot(
  bucket: R2Bucket,
  slug: string,
  version: number,
): Promise<WorkSnapshot | null> {
  const obj = await bucket.get(snapshotKey(slug, version));
  if (!obj) return null;
  return (await obj.json()) as WorkSnapshot;
}

export async function saveSnapshot(bucket: R2Bucket, snapshot: WorkSnapshot): Promise<void> {
  await bucket.put(snapshotKey(snapshot.slug, snapshot.version), JSON.stringify(snapshot, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: {
      slug: snapshot.slug,
      type: snapshot.type,
      version: String(snapshot.version),
      contentHash: snapshot.contentHash,
    },
  });
}

/**
 * Recompute reverse `buildsOn` -> `builtOnBy` edges across the entire manifest.
 */
export function rebuildReverseEdges(manifest: Manifest): void {
  const reverse = new Map<string, Set<string>>();
  for (const slug of Object.keys(manifest.entries)) {
    reverse.set(slug, new Set());
  }
  for (const entry of Object.values(manifest.entries)) {
    for (const parentSlug of entry.buildsOn ?? []) {
      if (reverse.has(parentSlug)) {
        reverse.get(parentSlug)!.add(entry.slug);
      }
    }
  }
  for (const [slug, entry] of Object.entries(manifest.entries)) {
    entry.builtOnBy = Array.from(reverse.get(slug) ?? []).sort();
  }
}

/**
 * Update (or create) a ManifestEntry from a newly ingested WorkSnapshot.
 */
export function upsertManifestEntry(
  manifest: Manifest,
  snapshot: WorkSnapshot,
): ManifestEntry {
  const existing = manifest.entries[snapshot.slug];
  const versionsMap = new Map<number, { version: number; status: WorkSnapshot["status"]; dateModified: string; contentHash: string }>();
  if (existing) {
    for (const v of existing.versions) {
      versionsMap.set(v.version, v);
    }
  }
  versionsMap.set(snapshot.version, {
    version: snapshot.version,
    status: snapshot.status,
    dateModified: snapshot.dateModified,
    contentHash: snapshot.contentHash,
  });

  const sortedVersions = Array.from(versionsMap.values()).sort((a, b) => a.version - b.version);
  const latestVersion = sortedVersions[sortedVersions.length - 1].version;

  // If ingesting an older version back-fill, keep latest fields unless this IS the latest version
  const isLatest = snapshot.version >= latestVersion;
  const tags = snapshot.tags ?? [];

  const next: ManifestEntry =
    existing && !isLatest
      ? {
          ...existing,
          versions: sortedVersions,
          latestVersion,
        }
      : {
          slug: snapshot.slug,
          type: snapshot.type,
          title: snapshot.title,
          subtitle: snapshot.subtitle,
          authors: snapshot.authors,
          datePublished: snapshot.datePublished,
          dateModified: snapshot.dateModified,
          latestVersion,
          versions: sortedVersions,
          status: snapshot.status,
          venue: snapshot.venue,
          listed: existing ? existing.listed : true,
          series: snapshot.series,
          seriesSlug: snapshot.series ? slugifyTaxonomy(snapshot.series) : undefined,
          tags,
          tagSlugs: tags.map(slugifyTaxonomy).filter(Boolean),
          abstract: snapshot.abstract,
          buildsOn: snapshot.buildsOn ?? [],
          builtOnBy: existing?.builtOnBy ?? [],
          openProblems: snapshot.openProblems ?? [],
          contentHash: snapshot.contentHash,
          license: snapshot.license,
          copyrightHolder: snapshot.copyrightHolder,
          copyrightYear: snapshot.copyrightYear,
          inLanguage: snapshot.inLanguage,
        };

  manifest.entries[snapshot.slug] = next;
  rebuildReverseEdges(manifest);
  return manifest.entries[snapshot.slug];
}

export function getListedEntries(manifest: Manifest): ManifestEntry[] {
  return Object.values(manifest.entries)
    .filter((e) => e.listed)
    .sort((a, b) => b.datePublished.localeCompare(a.datePublished) || a.slug.localeCompare(b.slug));
}
