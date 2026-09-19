#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
[ -d node_modules ] || { echo "STOP: node_modules missing. Run scripts/install.sh first."; exit 2; }
node src/server.mjs
