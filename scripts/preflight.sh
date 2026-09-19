#!/usr/bin/env bash
set -euo pipefail
echo "KK-FRONTEND v0.2 PREFLIGHT"
node --version
pnpm --version
git --version
major="$(node --version | sed 's/^v//' | cut -d. -f1)"
if [ "$major" -lt 22 ]; then echo "STOP: Node 22+ required."; exit 2; fi
if command -v gh >/dev/null 2>&1; then gh --version | head -1; else echo "[WARN] GitHub CLI not found."; fi
echo "[PASS] Preflight complete"
