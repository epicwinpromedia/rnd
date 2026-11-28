import type { Manifest, WorkAuthored } from "./types.ts";

export const CANONICAL_ORIGIN = "https://rnd.epicwinpromedia.com";
export const DEFAULT_LICENSE = "https://creativecommons.org/licenses/by-nc-nd/4.0/";
export const DEFAULT_PUBLISHER = {
  "@type": "Organization" as const,
  name: "EPIC WIN Pro Media",
  url: "https://epicwinpromedia.com/",
};
export const TEMPLATE_VERSION = "v2.0.0";

export const PRIMARY_AUTHOR = {
  name: "Bryan Harris",
  orcid: "0009-0007-9859-2022",
  url: `${CANONICAL_ORIGIN}/author/0009-0007-9859-2022`,
  alternateName: ["B. L. Harris", "B.L. Harris"],
  sameAs: [
    "https://epicwinpromedia.com/",
    "https://medium.com/@epic.win.pro.media",
    "https://substack.com/@epicwinpro",
    "https://linktr.ee/epicwinpromedia",
  ],
};

export const WORK_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: `${CANONICAL_ORIGIN}/schemas/work.schema.json`,
  title: "EPIC WIN R&D Work Snapshot",
  description:
    "Canonical base schema for every published work on rnd.epicwinpromedia.com. Extended by essay.schema.json and paper.schema.json.",
  type: "object",
  required: [
    "slug",
    "type",
    "title",
    "authors",
    "datePublished",
    "version",
    "status",
    "abstract",
    "body",
    "license",
    "copyrightHolder",
    "inLanguage",
  ],
  properties: {
    slug: {
      type: "string",
      pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
      description: "Kebab-case permanent identifier unique across all work types (D14).",
    },
    type: {
      type: "string",
      pattern: "^[a-z][a-z0-9-]*$",
      description: "Open enum work type (built-in: essay, paper).",
    },
    title: { type: "string", minLength: 1 },
    subtitle: { type: "string", minLength: 1 },
    authors: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["name"],
        additionalProperties: false,
        properties: {
          name: { type: "string", minLength: 1 },
          orcid: {
            type: "string",
            pattern: "^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$",
          },
          url: { type: "string", format: "uri" },
          alternateName: {
            type: "array",
            items: { type: "string", minLength: 1 },
          },
          sameAs: {
            type: "array",
            items: { type: "string", format: "uri" },
          },
        },
      },
    },
    datePublished: {
      type: "string",
      format: "date",
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      description: "ISO date of first public release anywhere (D15).",
    },
    version: { type: "integer", minimum: 1 },
    status: {
      type: "string",
      enum: ["preprint", "under-review", "peer-reviewed", "withdrawn"],
      description: "Publication status (D2).",
    },
    venue: {
      type: "string",
      minLength: 1,
      description: "Required when status is peer-reviewed (D2).",
    },
    series: { type: "string", minLength: 1 },
    tags: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    abstract: { type: "string", minLength: 1 },
    body: {
      type: "string",
      minLength: 1,
      description: "Markdown body of the work alone (D17).",
    },
    buildsOn: {
      type: "array",
      items: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
    },
    cites: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    artifacts: {
      type: "array",
      items: {
        type: "object",
        required: ["kind", "url", "description"],
        additionalProperties: false,
        properties: {
          kind: { type: "string", enum: ["dataset", "code", "proof", "materials"] },
          url: { type: "string", format: "uri" },
          description: { type: "string", minLength: 1 },
        },
      },
    },
    openProblems: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    notes: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    mirrors: {
      type: "array",
      items: {
        type: "object",
        required: ["platform", "url"],
        additionalProperties: false,
        properties: {
          platform: { type: "string", minLength: 1 },
          url: { type: "string", format: "uri" },
        },
      },
    },
    license: {
      type: "string",
      format: "uri",
      default: DEFAULT_LICENSE,
    },
    copyrightHolder: {
      type: "object",
      required: ["type", "name"],
      additionalProperties: false,
      properties: {
        type: { type: "string", enum: ["Person", "Organization"] },
        name: { type: "string", minLength: 1 },
        url: { type: "string", format: "uri" },
      },
    },
    identifier: {
      type: "object",
      additionalProperties: false,
      properties: {
        doi: { type: "string", minLength: 1 },
        arxiv: { type: "string", minLength: 1 },
      },
    },
    thumbnail: { type: "string", minLength: 1 },
    inLanguage: {
      type: "string",
      pattern: "^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$",
      default: "en",
    },
    // System fields written at ingest
    url: { type: "string", format: "uri" },
    versionUrl: { type: "string", format: "uri" },
    dateModified: { type: "string", format: "date-time" },
    copyrightYear: { type: "integer", minimum: 1970 },
    contentHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
    template: { type: "string", minLength: 1 },
    publisher: {
      type: "object",
      required: ["@type", "name", "url"],
      properties: {
        "@type": { const: "Organization" },
        name: { type: "string" },
        url: { type: "string", format: "uri" },
      },
    },
  },
  allOf: [
    {
      if: { properties: { status: { const: "peer-reviewed" } }, required: ["status"] },
      then: { required: ["venue"] },
    },
  ],
};

export const ESSAY_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: `${CANONICAL_ORIGIN}/schemas/essay.schema.json`,
  title: "EPIC WIN R&D Essay",
  description:
    "Schema for essays (schema.org Article + genre: essay). Essays must not declare supporting research artifacts (D13).",
  allOf: [{ $ref: `${CANONICAL_ORIGIN}/schemas/work.schema.json` }],
  properties: {
    type: { const: "essay" },
    artifacts: { maxItems: 0 },
  },
  not: {
    required: ["artifacts"],
    properties: {
      artifacts: { minItems: 1 },
    },
  },
};

export const PAPER_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: `${CANONICAL_ORIGIN}/schemas/paper.schema.json`,
  title: "EPIC WIN R&D Research Paper",
  description:
    "Schema for research papers (schema.org ScholarlyArticle). Papers must list at least one supporting artifact (D13).",
  allOf: [{ $ref: `${CANONICAL_ORIGIN}/schemas/work.schema.json` }],
  required: ["artifacts"],
  properties: {
    type: { const: "paper" },
    artifacts: { minItems: 1 },
  },
};

export const SCHEMAS_BY_NAME: Record<string, object> = {
  work: WORK_SCHEMA,
  essay: ESSAY_SCHEMA,
  paper: PAPER_SCHEMA,
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ORCID_RE = /^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$/;
const BCP47_RE = /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/;
const VALID_STATUSES = new Set(["preprint", "under-review", "peer-reviewed", "withdrawn"]);
const VALID_ARTIFACT_KINDS = new Set(["dataset", "code", "proof", "materials"]);

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Validate an authored work payload against both JSON Schema rules and
 * v2 cross-document/manifest invariants.
 */
export function validateAuthoredWork(
  raw: unknown,
  manifest?: Manifest,
): { valid: true; work: WorkAuthored } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { valid: false, errors: ["Payload work must be a JSON object."] };
  }

  const w = raw as Record<string, unknown>;

  // Required string fields
  if (typeof w.slug !== "string" || !SLUG_RE.test(w.slug)) {
    errors.push("slug must be a non-empty kebab-case string matching ^[a-z0-9]+(?:-[a-z0-9]+)*$.");
  }
  if (typeof w.type !== "string" || !/^[a-z][a-z0-9-]*$/.test(w.type)) {
    errors.push("type must be a lowercase identifier (e.g. 'essay' or 'paper').");
  }
  if (typeof w.title !== "string" || w.title.trim().length === 0) {
    errors.push("title must be a non-empty string.");
  }
  if (w.subtitle !== undefined && (typeof w.subtitle !== "string" || w.subtitle.trim().length === 0)) {
    errors.push("subtitle, when present, must be a non-empty string.");
  }
  if (typeof w.abstract !== "string" || w.abstract.trim().length === 0) {
    errors.push("abstract must be a non-empty plain-text string.");
  }
  if (typeof w.body !== "string" || w.body.trim().length === 0) {
    errors.push("body must be a non-empty Markdown string.");
  }
  if (typeof w.datePublished !== "string" || !ISO_DATE_RE.test(w.datePublished)) {
    errors.push("datePublished must be an ISO date (YYYY-MM-DD).");
  } else {
    const parsed = Date.parse(`${w.datePublished}T00:00:00Z`);
    if (Number.isNaN(parsed)) {
      errors.push("datePublished is not a valid calendar date.");
    }
  }
  if (typeof w.version !== "number" || !Number.isInteger(w.version) || w.version < 1) {
    errors.push("version must be an integer >= 1.");
  }
  if (typeof w.status !== "string" || !VALID_STATUSES.has(w.status)) {
    errors.push("status must be one of: preprint, under-review, peer-reviewed, withdrawn.");
  }
  if (w.status === "peer-reviewed" && (typeof w.venue !== "string" || w.venue.trim().length === 0)) {
    errors.push("venue is required when status is 'peer-reviewed' (D2).");
  }
  if (w.venue !== undefined && (typeof w.venue !== "string" || w.venue.trim().length === 0)) {
    errors.push("venue, when present, must be a non-empty string.");
  }

  // Authors
  if (!Array.isArray(w.authors) || w.authors.length === 0) {
    errors.push("authors must be a non-empty array.");
  } else {
    w.authors.forEach((a, idx) => {
      if (!a || typeof a !== "object") {
        errors.push(`authors[${idx}] must be an object.`);
        return;
      }
      const author = a as Record<string, unknown>;
      if (typeof author.name !== "string" || author.name.trim().length === 0) {
        errors.push(`authors[${idx}].name must be a non-empty string.`);
      }
      if (author.orcid !== undefined && (typeof author.orcid !== "string" || !ORCID_RE.test(author.orcid))) {
        errors.push(`authors[${idx}].orcid must match 0000-0000-0000-0000 format.`);
      }
      if (author.url !== undefined && (typeof author.url !== "string" || !isValidHttpUrl(author.url))) {
        errors.push(`authors[${idx}].url must be a valid HTTP(S) URL.`);
      }
      if (author.sameAs !== undefined) {
        if (!Array.isArray(author.sameAs) || !author.sameAs.every((u) => typeof u === "string" && isValidHttpUrl(u))) {
          errors.push(`authors[${idx}].sameAs must be an array of valid HTTP(S) URLs.`);
        }
      }
    });
  }

  // License & copyrightHolder & inLanguage
  if (typeof w.license !== "string" || !isValidHttpUrl(w.license)) {
    errors.push("license must be a valid HTTP(S) URL.");
  }
  if (!w.copyrightHolder || typeof w.copyrightHolder !== "object") {
    errors.push("copyrightHolder must be an object with type ('Person'|'Organization') and name.");
  } else {
    const ch = w.copyrightHolder as Record<string, unknown>;
    if (ch.type !== "Person" && ch.type !== "Organization") {
      errors.push("copyrightHolder.type must be 'Person' or 'Organization'.");
    }
    if (typeof ch.name !== "string" || ch.name.trim().length === 0) {
      errors.push("copyrightHolder.name must be a non-empty string.");
    }
    if (ch.url !== undefined && (typeof ch.url !== "string" || !isValidHttpUrl(ch.url))) {
      errors.push("copyrightHolder.url must be a valid HTTP(S) URL.");
    }
  }
  if (typeof w.inLanguage !== "string" || !BCP47_RE.test(w.inLanguage)) {
    errors.push("inLanguage must be a valid BCP 47 language tag (e.g. 'en').");
  }

  // Artifacts vs type (D13)
  if (w.artifacts !== undefined) {
    if (!Array.isArray(w.artifacts)) {
      errors.push("artifacts must be an array.");
    } else {
      w.artifacts.forEach((art, idx) => {
        if (!art || typeof art !== "object") {
          errors.push(`artifacts[${idx}] must be an object.`);
          return;
        }
        const a = art as Record<string, unknown>;
        if (typeof a.kind !== "string" || !VALID_ARTIFACT_KINDS.has(a.kind)) {
          errors.push(`artifacts[${idx}].kind must be one of: dataset, code, proof, materials.`);
        }
        if (typeof a.url !== "string" || !isValidHttpUrl(a.url)) {
          errors.push(`artifacts[${idx}].url must be a valid HTTP(S) URL.`);
        }
        if (typeof a.description !== "string" || a.description.trim().length === 0) {
          errors.push(`artifacts[${idx}].description must be a non-empty string.`);
        }
      });
    }
  }

  if (w.type === "paper") {
    if (!Array.isArray(w.artifacts) || w.artifacts.length === 0) {
      errors.push("type 'paper' requires at least one supporting artifact in artifacts (D13).");
    }
  } else if (w.type === "essay") {
    if (Array.isArray(w.artifacts) && w.artifacts.length > 0) {
      errors.push("type 'essay' must not include supporting artifacts (D13).");
    }
  }

  // Optional arrays
  for (const field of ["tags", "openProblems", "notes"] as const) {
    if (w[field] !== undefined) {
      if (!Array.isArray(w[field]) || !w[field].every((x) => typeof x === "string" && x.trim().length > 0)) {
        errors.push(`${field} must be an array of non-empty strings.`);
      }
    }
  }

  if (w.mirrors !== undefined) {
    if (!Array.isArray(w.mirrors)) {
      errors.push("mirrors must be an array.");
    } else {
      w.mirrors.forEach((m, idx) => {
        if (!m || typeof m !== "object") {
          errors.push(`mirrors[${idx}] must be an object.`);
          return;
        }
        const mr = m as Record<string, unknown>;
        if (typeof mr.platform !== "string" || mr.platform.trim().length === 0) {
          errors.push(`mirrors[${idx}].platform must be a non-empty string.`);
        }
        if (typeof mr.url !== "string" || !isValidHttpUrl(mr.url)) {
          errors.push(`mirrors[${idx}].url must be a valid HTTP(S) URL.`);
        }
      });
    }
  }

  // buildsOn & cites manifest integrity
  if (w.buildsOn !== undefined) {
    if (!Array.isArray(w.buildsOn) || !w.buildsOn.every((s) => typeof s === "string" && SLUG_RE.test(s))) {
      errors.push("buildsOn must be an array of valid slugs.");
    } else if (manifest) {
      for (const refSlug of w.buildsOn as string[]) {
        if (refSlug === w.slug) {
          errors.push(`buildsOn cannot reference itself ('${refSlug}').`);
        } else if (!manifest.entries[refSlug]) {
          errors.push(`buildsOn references unknown slug '${refSlug}' (must already exist in manifest).`);
        }
      }
    }
  }

  if (w.cites !== undefined) {
    if (!Array.isArray(w.cites) || !w.cites.every((c) => typeof c === "string" && c.trim().length > 0)) {
      errors.push("cites must be an array of non-empty strings (slug, doi:, or URL).");
    } else {
      for (const cite of w.cites as string[]) {
        const isDoi = cite.startsWith("doi:");
        const isUrl = isValidHttpUrl(cite);
        if (!isDoi && !isUrl) {
          if (!SLUG_RE.test(cite)) {
            errors.push(`cites entry '${cite}' must be a valid slug, doi: identifier, or HTTP(S) URL.`);
          } else if (manifest && !manifest.entries[cite]) {
            errors.push(`cites references unknown internal slug '${cite}' (must already exist in manifest).`);
          }
        }
      }
    }
  }

  // Slug uniqueness / immutability of type across versions (D14)
  if (manifest && typeof w.slug === "string" && manifest.entries[w.slug]) {
    const existing = manifest.entries[w.slug];
    if (existing.type !== w.type) {
      errors.push(
        `slug '${w.slug}' is already published as type '${existing.type}' and cannot change to '${w.type}' (D14).`,
      );
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, work: w as unknown as WorkAuthored };
}
