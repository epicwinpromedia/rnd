export type DocFormat = "html" | "md" | "pdf" | "jsonld";

export type WorkStatus = "preprint" | "under-review" | "peer-reviewed" | "withdrawn";

export type ArtifactKind = "dataset" | "code" | "proof" | "materials";

export interface AuthorRecord {
  name: string;
  orcid?: string;
  url?: string;
  alternateName?: string[];
  sameAs?: string[];
}

export interface SupportingArtifact {
  kind: ArtifactKind;
  url: string;
  description: string;
}

export interface MirrorRecord {
  platform: string;
  url: string;
}

export interface CopyrightHolder {
  type: "Person" | "Organization";
  name: string;
  url?: string;
}

export interface WorkIdentifier {
  doi?: string;
  arxiv?: string;
}

export interface PublisherRecord {
  "@type": "Organization";
  name: string;
  url: string;
}

/**
 * Authored fields entered in EmDash or content/works/*.json.
 * contentHash is computed over the canonical JSON serialization of these fields.
 */
export interface WorkAuthored {
  slug: string;
  type: string; // open enum; built-in: "essay" | "paper"
  title: string;
  subtitle?: string;
  authors: AuthorRecord[];
  datePublished: string; // ISO YYYY-MM-DD
  version: number; // integer >= 1
  status: WorkStatus;
  venue?: string;
  series?: string;
  tags?: string[];
  abstract: string;
  body: string; // Markdown, the work alone (D17)
  buildsOn?: string[];
  cites?: string[];
  artifacts?: SupportingArtifact[];
  openProblems?: string[];
  notes?: string[];
  mirrors?: MirrorRecord[];
  license: string;
  copyrightHolder: CopyrightHolder;
  identifier?: WorkIdentifier;
  thumbnail?: string;
  inLanguage: string;
}

/**
 * Immutable version snapshot stored at snapshots/{slug}/v{n}.json.
 */
export interface WorkSnapshot extends WorkAuthored {
  url: string;
  versionUrl: string;
  dateModified: string;
  copyrightYear: number;
  contentHash: string;
  template: string;
  publisher: PublisherRecord;
}

export interface ManifestVersionSummary {
  version: number;
  status: WorkStatus;
  dateModified: string;
  contentHash: string;
}

export interface ManifestEntry {
  slug: string;
  type: string;
  title: string;
  subtitle?: string;
  authors: AuthorRecord[];
  datePublished: string;
  dateModified: string;
  latestVersion: number;
  versions: ManifestVersionSummary[];
  status: WorkStatus;
  venue?: string;
  listed: boolean;
  series?: string;
  seriesSlug?: string;
  tags: string[];
  tagSlugs: string[];
  abstract: string;
  buildsOn: string[];
  builtOnBy: string[];
  openProblems: string[];
  contentHash: string;
  license: string;
  copyrightHolder: CopyrightHolder;
  copyrightYear: number;
  inLanguage: string;
}

export interface Manifest {
  schemaVersion: 2;
  updatedAt: string;
  entries: Record<string, ManifestEntry>;
}

export interface IngestPublishPayload {
  action?: "publish";
  work: WorkAuthored;
  assets?: Array<{
    filename: string;
    sourceUrl: string;
    contentType?: string;
  }>;
}

export interface IngestDelistPayload {
  action: "delist";
  slug: string;
}

export type IngestPayload = IngestPublishPayload | IngestDelistPayload;

export interface PdfJobParams {
  slug: string;
  version: number;
  previousVersion?: number;
  contentHash: string;
}

export interface WorkersCacheHandle {
  purge(options: { tags?: string[]; pathPrefixes?: string[] }): Promise<{ success: boolean }>;
}

export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
  cache?: WorkersCacheHandle;
}

export interface BrowserBindingLike {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface WorkflowBindingLike<TParams = unknown> {
  create(options?: { id?: string; params?: TParams }): Promise<{ id: string }>;
}

export interface Env {
  DOCS_BUCKET: R2Bucket;
  INGEST_SECRET?: string;
  BROWSER?: BrowserBindingLike;
  PDF_WORKFLOW?: WorkflowBindingLike<PdfJobParams>;
  PUBLIC_INDEXING?: string;
  CANONICAL_ORIGIN?: string;
}
