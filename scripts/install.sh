#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
bash scripts/preflight.sh
pnpm install
pnpm exec playwright install chromium
node tests/selftest.mjs
echo "[PASS] KK-FRONTEND installed."
