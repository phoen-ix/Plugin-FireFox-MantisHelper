#!/usr/bin/env bash
# Run the e2e suite (e2e/tests/, inventory in e2e/COVERAGE.md) in headless
# Firefox: the add-on installed as a temporary add-on over Firefox's remote
# debugging protocol (on a Unix socket), and its pages opened as files.
#
#   scripts/e2e.sh [playwright args]      # e.g. tests/menu.spec.ts, --repeat-each=3
#
# No server, no Docker: nothing binds a port and there is no compose project.
# ARTIFACTS: where Playwright's results and traces go (default: a temp dir).
# Node + `npm ci` and `npx playwright install firefox` in e2e/ are the caller's.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACTS="${ARTIFACTS:-$(mktemp -d)}"

cd "$ROOT/e2e"
npx playwright test --output "$ARTIFACTS/test-results" "$@"
