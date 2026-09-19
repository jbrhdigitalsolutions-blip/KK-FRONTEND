#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
bash scripts/preflight.sh
if [ ! -d node_modules ]; then
  pnpm install
  pnpm exec playwright install chromium
fi
node tests/selftest.mjs
node src/server.mjs
