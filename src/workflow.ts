import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { renderPdfBytes } from "./pdf.ts";
import { latestPdfKey, loadManifest, loadSnapshot, regenPdfKey } from "./storage.ts";
import type { Env, PdfJobParams } from "./types.ts";

/**
 * Durable Cloudflare Workflow for PDF generation on publish (Phase 3):
 *   1. Copy outgoing pdf/latest/{slug}.pdf to pdf/regen/{slug}/v{prev}.pdf
 *   2. Render the print HTML view via Browser Run (tagged: true)
 *   3. Write pdf/latest/{slug}.pdf with version + contentHash customMetadata
 *   4. Purge the slug's PDF cache tag if Workers Caching is enabled
 */
export class PdfRenderWorkflow extends WorkflowEntrypoint<Env, PdfJobParams> {
  async run(event: WorkflowEvent<PdfJobParams>, step: WorkflowStep): Promise<void> {
    const { slug, version, previousVersion, contentHash } = event.payload;

    await step.do("archive-outgoing-latest-pdf", async () => {
      if (!previousVersion || previousVersion >= version) return { archived: false };
      const existing = await this.env.DOCS_BUCKET.get(latestPdfKey(slug));
      if (!existing) return { archived: false };
      const existingVersion = existing.customMetadata?.version ?? String(previousVersion);
      const bytes = await existing.arrayBuffer();
      await this.env.DOCS_BUCKET.put(regenPdfKey(slug, Number(existingVersion)), bytes, {
        httpMetadata: { contentType: "application/pdf" },
        customMetadata: {
          slug,
          version: existingVersion,
          contentHash: existing.customMetadata?.contentHash ?? "",
          archivedAt: new Date().toISOString(),
        },
      });
      return { archived: true, archivedVersion: existingVersion };
    });

    await step.do("render-and-store-latest-pdf", async () => {
      const [snapshot, manifest] = await Promise.all([
        loadSnapshot(this.env.DOCS_BUCKET, slug, version),
        loadManifest(this.env.DOCS_BUCKET),
      ]);
      if (!snapshot) {
        throw new Error(`Snapshot not found for ${slug} v${version}`);
      }
      const entry = manifest.entries[slug];
      const pdfBytes = await renderPdfBytes(snapshot, entry, manifest, this.env);
      await this.env.DOCS_BUCKET.put(latestPdfKey(slug), pdfBytes, {
        httpMetadata: { contentType: "application/pdf" },
        customMetadata: {
          slug,
          version: String(version),
          contentHash,
          renderedAt: new Date().toISOString(),
        },
      });
      return { bytes: pdfBytes.byteLength };
    });
  }
}
