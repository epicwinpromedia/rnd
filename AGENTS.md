# AGENTS.md — Service B (`rnd-doc-server`)

When interacting with Cloudflare, use the `cf` CLI (`cloudflare.config.ts`). Do not add Wrangler configuration files.

## Architecture
- **Hostname**: `rnd.epicwinpromedia.com` (+ `md.rnd.*`, `pdf.rnd.*`, `html.rnd.*`, `jsonld.rnd.*`)
- **R2 Bucket**: `epicwin-rnd-docs` bound as `DOCS_BUCKET`
- **Format Resolution**: Path extension -> Format subdomain -> `Accept` header -> `html` default
- **Mandatory Headers**: `Content-Type`, `Vary: Accept`, `Link: <https://rnd.epicwinpromedia.com/schemas/{schema_type}.schema.json>; rel="describedby"`, `X-Robots-Tag: noindex, nofollow, noarchive`
- **Unlisted Hygiene**: `GET /robots.txt` returns `User-agent: *\nDisallow: /`; all HTML includes `<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">`.
- **Zero-`<div>` Markup**: All generated HTML uses semantic HTML5 only.

## Commands
- `pnpm run generate:seed` — Regenerate all 16 multi-format seed artifacts in `seed-artifacts/rp/`
- `pnpm test` — Run Gate 1 & Gate 2 content-negotiation verification suite
- `pnpm run build` — Build Worker via `cf build`
- `./scripts/deploy.sh` — Create R2 bucket, upload artifacts, deploy via `cf deploy`, and verify live endpoints
