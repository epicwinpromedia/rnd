import type { WorkAuthored } from "./types.ts";

/**
 * Authored field keys in the canonical entry model.
 * System fields are excluded so contentHash strictly anchors authored content.
 */
export const AUTHORED_KEYS: ReadonlyArray<keyof WorkAuthored> = [
  "slug",
  "type",
  "title",
  "subtitle",
  "authors",
  "datePublished",
  "version",
  "status",
  "venue",
  "series",
  "tags",
  "abstract",
  "body",
  "buildsOn",
  "cites",
  "artifacts",
  "openProblems",
  "notes",
  "mirrors",
  "license",
  "copyrightHolder",
  "identifier",
  "thumbnail",
  "inLanguage",
];

/**
 * Extract only defined authored fields so extra/system fields never alter contentHash.
 */
export function pickAuthoredFields(input: WorkAuthored): WorkAuthored {
  const out: Record<string, unknown> = {};
  for (const key of AUTHORED_KEYS) {
    const val = input[key];
    if (val !== undefined) {
      out[key] = val;
    }
  }
  return out as unknown as WorkAuthored;
}

/**
 * Canonical JSON serialization with recursively sorted object keys and no extra whitespace.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Compute SHA-256 hex digest of the canonical JSON of authored fields.
 */
export async function computeContentHash(work: WorkAuthored): Promise<string> {
  const canonical = canonicalJson(pickAuthoredFields(work));
  const data = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

/**
 * Compute HMAC-SHA256 hex signature over `${timestamp}.${rawBody}`.
 */
export async function computeHmacSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${rawBody}`));
  return bytesToHex(new Uint8Array(sig));
}

/**
 * Constant-time string comparison for hex signatures.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const normA = a.trim().toLowerCase();
  const normB = b.trim().toLowerCase();
  if (normA.length !== normB.length) return false;
  let diff = 0;
  for (let i = 0; i < normA.length; i++) {
    diff |= normA.charCodeAt(i) ^ normB.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Normalize free-text taxonomy values (series, tags) to URL-safe kebab-case.
 */
export function slugifyTaxonomy(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['’"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
