import { bindings, defineConfig, exports } from "cf/config";
import * as entrypoint from "./src/worker.ts" with { type: "cf-worker" };

export default defineConfig({
  worker: {
    name: "rnd-doc-server",
    entrypoint,
    compatibilityDate: "2026-11-01",
    domains: [
      "rnd.epicwinpromedia.com",
      "md.rnd.epicwinpromedia.com",
      "pdf.rnd.epicwinpromedia.com",
      "html.rnd.epicwinpromedia.com",
      "jsonld.rnd.epicwinpromedia.com",
      "research.epicwinpromedia.com",
    ],
    cache: {
      enabled: true,
      crossVersionCache: false,
    },
    exports: {
      PdfRenderWorkflow: exports.workflow({
        name: "rnd-pdf-render",
      }),
    },
    env: {
      DOCS_BUCKET: bindings.r2({ name: "epicwin-rnd-docs" }),
      BROWSER: bindings.browser(),
      PDF_WORKFLOW: bindings.workflow({
        name: "rnd-pdf-render",
        worker: "rnd-doc-server",
        exportName: "PdfRenderWorkflow",
      }),
      INGEST_SECRET: bindings.secret(),
    },
  },
});
