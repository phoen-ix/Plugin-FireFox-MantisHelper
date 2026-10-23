#!/usr/bin/env bash
# Regenerate the docs screenshots: run the docs tour (e2e/docs/) in headless
# Firefox against the extension's pages in data/.
#
#   scripts/docs-screenshots.sh [outdir]      # default: docs/screenshots
#
# No server, no Docker: the pages are opened as files, so nothing binds a port
# and there is no compose project. ARTIFACTS: where Playwright's test results
# go (default: a temp dir). Node + `npm ci` and `npx playwright install
# firefox` in e2e/ are the caller's.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/docs/screenshots}"
OUT="$(mkdir -p "$OUT" && cd "$OUT" && pwd)"
ARTIFACTS="${ARTIFACTS:-$(mktemp -d)}"

cd "$ROOT/e2e"
DOCS_SCREENSHOT_DIR="$OUT" npx playwright test -c playwright.docs.config.ts --output "$ARTIFACTS/test-results"
echo "docs-screenshots: $(find "$OUT" -name '*.png' | wc -l) PNGs in $OUT"
