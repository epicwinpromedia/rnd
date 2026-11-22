#!/usr/bin/env bash
set -euo pipefail

# Service B: rnd.epicwinpromedia.com deployment script (uses Cloudflare cf CLI)
# Run from an authenticated session (`cf auth login` or `CLOUDFLARE_API_TOKEN`).

BUCKET="epicwin-rnd-docs"

echo "1/4 Generating canonical seed artifacts..."
pnpm run generate:seed

echo "2/4 Ensuring R2 bucket '${BUCKET}' exists..."
cf r2 buckets create --name "${BUCKET}" 2>/dev/null || echo "Bucket '${BUCKET}' already exists."

echo "3/4 Uploading all 16 multi-format artifacts to R2 (${BUCKET})..."
for file in seed-artifacts/rp/*; do
  key="rp/$(basename "$file")"
  case "$file" in
    *.html)   ct="text/html; charset=utf-8" ;;
    *.md)     ct="text/markdown; charset=utf-8" ;;
    *.pdf)    ct="application/pdf" ;;
    *.jsonld) ct="application/ld+json; charset=utf-8" ;;
    *)        ct="application/octet-stream" ;;
  esac
  echo "  -> Uploading ${key} (${ct})"
  cf r2 objects put "${BUCKET}/${key}" --file "${file}" --content-type "${ct}"
done

echo "4/4 Deploying rnd-doc-server Worker + Custom Domains..."
cf deploy

echo ""
echo "=== Live Verification (Gate 1 & Gate 2) ==="
curl -sI https://rnd.epicwinpromedia.com/robots.txt | grep -iE "HTTP/|x-robots-tag"
curl -sI -H "Accept: text/markdown" https://rnd.epicwinpromedia.com/rp/resolution-is-not-leverage | grep -iE "HTTP/|content-type|vary|link|x-robots-tag"
curl -sI https://md.rnd.epicwinpromedia.com/rp/resolution-is-not-leverage | grep -iE "HTTP/|content-type|vary|x-robots-tag"
