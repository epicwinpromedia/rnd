# AGENTS.md — Doc Server v2 (`rnd-doc-server`)

When interacting with Cloudflare, use the `cf` CLI (`cloudflare.config.ts`). Do not add Wrangler configuration files.

## Architecture (Master Plan v2)
- **Hostname**: `rnd.epicwinpromedia.com` (+ `md.rnd.*`, `pdf.rnd.*`, `html.rnd.*`, `jsonld.rnd.*`, `research.epicwinpromedia.com` 301 redirect)
- **R2 Bucket**: `epicwin-rnd-docs` bound as `DOCS_BUCKET`
  - `snapshots/{slug}/v{n}.json` — Immutable version snapshots
  - `manifest.json` — Derived index & reverse `buildsOn` graph
  - `assets/{slug}/{file}` — Self-contained media copies
  - `pdf/latest/{slug}.pdf` & `pdf/regen/{slug}/v{n}.pdf` — Browser Run PDFs (30-day lifecycle on `pdf/regen/`)
  - `ingest-log/{timestamp}-{slug}-v{n}.json` — Audit log (365-day lifecycle)
- **Work Types**: `essay` (`Article` + `genre: essay`, no `artifacts`) and `paper` (`ScholarlyArticle`, >= 1 `artifacts`)
- **Format Resolution**: Path extension -> Format subdomain -> `Accept` header -> `html` default
- **Mandatory Headers**: `Content-Type`, `Vary: Accept` (on header-negotiated URLs), `Link` (`canonical`, `describedby`, `license`, RFC 5829 version links), `ETag`, `Cache-Tag`, strict zero-JS `Content-Security-Policy` on HTML, `X-Robots-Tag: noindex, nofollow, noarchive` (until `PUBLIC_INDEXING=true` launch flip)
- **Zero-`<div>` Markup**: All generated HTML uses semantic HTML5 and `<te-ref>` elements only, with zero public JavaScript.

## Commands
- `pnpm run validate:works` — Validate all works in `content/works/` against v2 schemas and manifest rules
- `pnpm test` — Run full v2 conformance test suite
- `pnpm run typecheck` — Run `tsc --noEmit`
- `pnpm run build` — Build Worker via `cf build`
- `INGEST_SECRET=... pnpm run ingest` — Sign and push `content/works/*.json` to `POST /_ingest`
- `./scripts/deploy.sh` — Clean legacy `rp/*` keys, deploy via `cf deploy`, seed via `/_ingest`, and verify live endpoints
