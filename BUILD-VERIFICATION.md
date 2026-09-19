# KK-FRONTEND v0.2.2 Build Verification

## Verified in this build environment

- All `.js` / `.mjs` files passed `node --check`.
- `tests/selftest.mjs` passed.
- `tests/optimization.test.mjs` passed: 4/4.
- Locale canonicalization verified (`/ja`, `/ko`, `/pt-pt` collapse when locale deep-scan is off).
- Route include/exclude regex behavior verified.
- Cooperative safe-stop checkpoint behavior verified (`KK_STOP`).
- JSON files parse successfully.
- WebApp JavaScript element-ID references all resolve to existing HTML IDs.
- Cross-platform path handling uses `fileURLToPath(import.meta.url)`.
- Windows launcher now uses `pnpm.cmd` + `node.exe` directly; it does not depend on the user's broken npm installation.
- macOS launcher uses `pnpm` + `node` directly.
- Execution still requires explicit approval, a clean Git tree and an isolated Git worktree.

## Scanner architecture verified by source/static tests

- `Fast Deep`, `Standard`, and `Extreme` modes are present.
- Locale route de-duplication and canonical route families are present.
- Every canonical route receives desktop/mobile fingerprint evidence.
- Layout clustering is present.
- Shared CSS evidence and route-specific CSS evidence are present.
- CSS breakpoints are probed at `-1 / exact / +1` via compact responsive-boundary evidence.
- Meaningful breakpoints are promoted to full snapshots.
- Fingerprint screenshots and deep full-page screenshots are written separately.
- Asset manifest is globally de-duplicated and incrementally reused.
- Pause / Resume / Stop APIs and UI controls are present.
- Partial audit and same-session resume paths are present.
- ETA/work-unit fields and duplicate-progress suppression are present.

## Not runtime-proven in this sandbox

The sandbox does not currently have the project's Playwright/Express npm packages installed, so a full live browser scan was not executed here.

On the user's Windows PC, the launcher performs:

1. Node/Git/pnpm preflight.
2. `pnpm install` only when `node_modules` is absent.
3. `pnpm exec playwright install chromium` only on first install.
4. internal selftest.
5. local WebApp start at `http://127.0.0.1:4317`.

The first real Suno run on the user's PC is the runtime proof for the new Fast Deep algorithm.

## v0.2.2 current package verification

- node --check PASS (17 files)
- optimization tests PASS (11 tests)
- selftest PASS
- ZIP integrity verified after creation.

## v0.2.2 Blueprint Fast verification

- node --check PASS (20 JS/MJS files)
- optimization.test.mjs PASS
- blueprint-fast.test.mjs PASS
- selftest PASS
- semantic build assertions PASS
- Full external website Playwright runtime scan is not claimed from this build environment; the user's PC is the runtime proof.

## v0.2.3 DESIGN-PACK verification

- node --check PASS (22 JS/MJS files)
- optimization.test.mjs PASS
- blueprint-fast.test.mjs PASS
- design-pack.test.mjs PASS
- selftest PASS
- semantic assertions PASS
- External authenticated runtime scan is not claimed from this build environment; user's PC remains the runtime proof.

## v0.2.4 GROUP-SELECTION verification

- node --check PASS (23 files)
- optimization.test.mjs PASS
- blueprint-fast.test.mjs PASS
- design-pack.test.mjs PASS
- group-selection.test.mjs PASS
- selftest PASS
- semantic assertions PASS

## v0.2.5 FLEX-EXECUTION verification

- node --check PASS (25 files)
- optimization.test.mjs PASS
- blueprint-fast.test.mjs PASS
- design-pack.test.mjs PASS
- group-selection.test.mjs PASS
- flex-execution.test.mjs PASS
- selftest PASS
- semantic assertions PASS
- External target-project execution was not performed in the build sandbox; local/Git runtime proof occurs on the user machine.
