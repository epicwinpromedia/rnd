#!/usr/bin/env bash
set -euo pipefail

# rnd.epicwinpromedia.com — Doc Server v2 deployment script (uses Cloudflare cf CLI)
# Run from an authenticated session (`cf auth login` or `CLOUDFLARE_API_TOKEN`).
# Set INGEST_SECRET in your environment to seed content/works/*.json after deploy.

BUCKET="epicwin-rnd-docs"

echo "1/5 Validating canonical works locally..."
pnpm run validate:works

echo "2/5 Ensuring R2 bucket '${BUCKET}' exists..."
cf r2 buckets create --name "${BUCKET}" 2>/dev/null || echo "Bucket '${BUCKET}' already exists."

echo "3/5 Removing legacy rp/* placeholder objects from R2 (Phase 0 hygiene)..."
for slug in resolution-is-not-leverage run-time-vs-dev-time statistical-relevance-fallacy a-taste-of-agi; do
  for ext in html md pdf jsonld; do
    cf r2 objects delete "rp/${slug}.${ext}" --bucket-name "${BUCKET}" 2>/dev/null || true
  done
done

echo "4/5 Deploying rnd-doc-server v2 Worker, Workflows, Browser Run, and Custom Domains..."
cf deploy

if [[ -n "${INGEST_SECRET:-}" ]]; then
  echo "5/5 Seeding canonical works via signed POST /_ingest..."
  pnpm run ingest
else
  echo "5/5 Skipping live seed (set INGEST_SECRET to push content/works/*.json to /_ingest)."
fi

echo ""
echo "=== Live Verification ==="
curl -sI https://rnd.epicwinpromedia.com/robots.txt | grep -iE "HTTP/|x-robots-tag"
curl -sI https://rnd.epicwinpromedia.com/schemas/essay.schema.json | grep -iE "HTTP/|content-type"
curl -sI -H "Accept: text/markdown" https://rnd.epicwinpromedia.com/essay/resolution-is-not-leverage | grep -iE "HTTP/|content-type|vary|link|x-robots-tag"
curl -sI https://md.rnd.epicwinpromedia.com/essay/resolution-is-not-leverage | grep -iE "HTTP/|content-type|cache-control"
