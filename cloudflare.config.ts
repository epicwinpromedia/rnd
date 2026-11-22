import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

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
    ],
    env: {
      DOCS_BUCKET: bindings.r2({ name: "epicwin-rnd-docs" }),
    },
  },
});
