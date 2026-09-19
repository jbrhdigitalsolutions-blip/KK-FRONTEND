## v0.2.3 DESIGN-PACK

After a successful Reference Scan, hand `data/runs/<session-id>/DESIGN-PACK/` to the coding agent.

Start with:
1. `DESIGN.md`
2. `CODING-AGENT-PROMPT.md`
3. `PACK-MANIFEST.json`

The pack also contains exact route/profile JSON, CSS evidence, screenshots and the asset inventory.

## Blueprint Fast — recommended when the goal is design transfer

`Blueprint Fast` is the fastest reference mode. It creates one `DESIGN.md` intended to be handed directly to a coding agent.

It avoids the expensive part of the deeper scanner:
- no full render at every CSS breakpoint;
- no repeated song/album/profile instances;
- no bulk asset-byte downloads;
- only three exact deep anchor viewports per unique visual layout: `390×844`, `820×1180`, `1440×900`.

It still records CSS breakpoint declarations, design tokens, fonts, state rules, animations, route templates, key visible element geometry, interactions, scrolling behavior, technology signals and design-asset URLs.

For final pixel certification after implementation, use a deeper scan mode on the specific routes/viewports that still differ.


# KK-FRONTEND v0.2.3 DESIGN-PACK — FAST-DEEP

Frontend Reference Intelligence & Upgrade Studio.

This release replaces the slow `every route × every full profile` strategy with a two-pass evidence architecture designed for large production SPAs such as Suno.

## v0.2 scan architecture

1. Discover routes from the seed page, navigation, sitemaps/robots and frontend bundle hints.
2. Normalize/collapse locale aliases by default (`/ja`, `/ko`, `/pt-pt`, etc.) into one canonical route family.
3. Fingerprint **every canonical route** at desktop + mobile and store screenshots + exact compact layout evidence.
4. Cluster structurally equivalent routes.
5. Deep-scan only one representative per unique visual-layout cluster in `Fast Deep` / `Standard` mode.
6. Read CSS breakpoints and probe every available breakpoint at `-1 / exact / +1` with compact geometry evidence.
7. Promote meaningful breakpoint changes to full DOM/computed-style snapshots.
8. Deduplicate assets globally by URL/content hash and write them incrementally.
9. Persist partial artifacts so a stopped scan can resume in the same session.

This keeps route evidence complete while avoiding thousands of redundant locale/profile renders.

## Scan modes

### Fast Deep — recommended

- Every canonical route gets desktop + mobile fingerprint evidence.
- Locale aliases are collapsed unless explicitly enabled.
- Structurally equivalent routes share one deep representative.
- 7 representative deep viewports.
- Every CSS breakpoint still gets exact `-1/exact/+1` compact probes.
- Only meaningful breakpoints are promoted to full snapshots.

### Standard

Same two-pass architecture with a larger representative viewport matrix.

### Extreme

Uses the large viewport matrix and deep-scans every canonical route. This is intentionally slower.

## New v0.2 controls

- Fast Deep / Standard / Extreme mode.
- Locale-variant toggle.
- Route include regex.
- Route exclude regex.
- Pause scan.
- Resume scan.
- Safe stop with partial artifacts retained.
- Session persistence / Resume Latest Session.
- ETA and work-unit telemetry.
- Duplicate progress-line suppression.

## Runtime evidence produced

Reference/runtime scans create files such as:

```text
reference/
├─ audit.json
├─ audit.partial.json              # only while partial/stopped
├─ shared-css.json
├─ technology.json
├─ route-inventory.json
├─ route-coverage.json
├─ layout-clusters.json
├─ runtime-errors.json
├─ assets/
│  └─ manifest.json
└─ routes/
   └─ <route>/
      ├─ fingerprint.json
      ├─ fingerprints/
      │  ├─ 1440x900.png
      │  └─ 390x844.png
      ├─ route-css.json
      ├─ responsive-boundaries.json
      ├─ route.json
      ├─ profiles/*.json
      └─ screenshots/*.png
```

`route-coverage.json` explicitly maps every canonical route to its visual cluster and deep-scan representative. A skipped duplicate is never silently presented as independently deep-scanned.

## Safety

The scanner does not click destructive controls or submit forms. Hover/focus inspection remains non-destructive. Inaccessible evidence stays marked `UNAVAILABLE`/`RESTRICTED` rather than being invented.

Target implementation still requires explicit user approval and a clean Git tree, then runs inside an isolated worktree. The original project remains unchanged until the user deliberately chooses what to integrate.

## Windows 11 start

v0.2 uses **pnpm directly** and does not depend on the user's broken npm installation.

```powershell
Set-Location -LiteralPath "C:\path\to\KK-FRONTEND-v0.2.0"
pwsh -NoProfile -ExecutionPolicy Bypass -File ".\START-KK-FRONTEND.ps1"
```

Requirements:

```text
Node 22+
pnpm
Git
GitHub CLI only when private GitHub repository access is needed
```

The WebApp opens at:

```text
http://127.0.0.1:4317
```

## macOS start

```bash
cd /path/to/KK-FRONTEND-v0.2.0
./START-KK-FRONTEND.command
```

## Recommended Suno reference settings

```text
Reference URL: https://suno.com/discover
Mode: Fast Deep
Max canonical routes: 60
Deep-scan locale variants separately: OFF
Browser: Visible
Include route regex: blank
Exclude route regex: blank
```

This configuration inventories locale aliases but avoids running 70+ profiles separately for `/ja`, `/ko`, `/pt-pt`, and similar copies.

## Resume behavior

Within the same KK-FRONTEND session, running the same scan again reuses existing:

- route fingerprints,
- deep profile JSON,
- screenshots,
- responsive-boundary evidence,
- downloaded asset manifest/files.

Use **Stop Scan Safely** rather than terminating the whole server when possible. Then use the same session and click **Scan / Resume Reference**.

## Important accuracy boundary

Fast Deep is an optimization of evidence collection, not a claim that duplicated routes were individually deep-rendered. Every canonical route is fingerprinted; only unique visual structures get expensive deep responsive capture. `Extreme` remains available when the user explicitly wants every canonical route deep-scanned.

Native iOS/Safari/Android rendering still requires native-device or device-cloud verification; desktop Chromium evidence is not relabeled as native proof.
