# KK-FRONTEND v0.8.0 — PROJECT-AWARE DESIGN BUILDER

v0.8.0 changes **Build Page** from a generic reference reconstruction into a project-aware workflow.

The key rule is simple: **Accurate mode is not unlocked until KK-FRONTEND has enough target-project evidence and real page content to make a defensible build.**

## Why this version exists

A reference screenshot alone is not enough to produce source that fits an existing application. The same visual design must still match the user's:

- frontend framework and version family;
- package manager and dependencies;
- current routes and target source file;
- TypeScript/JavaScript choice;
- CSS/Tailwind/CSS Modules/styling conventions;
- existing DESIGN.md/theme/token files;
- real brand, headline, body text, CTA labels and navigation labels;
- logo, hero and other relevant project assets.

v0.8.0 gathers that information before an Accurate build instead of hiding missing information behind generic placeholders.

## Project Fit Intake

After DESIGN.md generation the user chooses **Existing project** or **New project**.

For an existing project, users can upload selected files or a project folder. Recommended evidence includes:

```text
package.json
lockfile
DESIGN.md / design tokens / theme files
target page and relevant components
CSS / SCSS / Tailwind configuration
logo / hero / UI asset filenames
```

The browser excludes common generated/vendor folders and secret/private files such as `.env`, private keys, credential files and secret files. The server repeats those exclusions.

KK-FRONTEND detects:

- Next.js / React / HTML, plus Vue/Svelte identification;
- npm / pnpm / yarn / bun;
- TypeScript;
- Tailwind, CSS Modules, SCSS, styled-components, Emotion and plain CSS signals;
- Next.js routes;
- likely target page/source file;
- design documents;
- relevant public assets.

It then creates a **Project Fit score**, blockers and only the missing questions that materially affect the build.

## Accuracy gate

**Accurate** fidelity is disabled until required Project Fit evidence is ready. Missing project context cannot silently become invented source.

Balanced and Inspired modes remain available for exploratory work.

Project Fit readiness is not a pixel-similarity score. Reference evidence confidence and target-project readiness are shown separately.

## Same-viewport comparison

Build Preview now requests a fresh reference screenshot for the exact selected viewport:

- Desktop — 1440×900
- Tablet — 820×1180
- Mobile — 390×844

This corrects the earlier misleading comparison where a desktop reference screenshot could be shown beside a mobile generated preview.

## Existing-project ZIP

When an existing React, Next.js or HTML project is supplied, the export is a **project patch**, not an unrelated starter project.

The ZIP contains:

```text
project-patch/...
PROJECT-FIT.json
PATCH-MANIFEST.json
APPLY-WINDOWS.ps1
APPLY-MAC.command
INTEGRATION.md
DESIGN-BUILD.json
README.md
```

The apply scripts back up every replaced file before copying the patch and use the detected package manager when dependency installation is required.

## New-project ZIP

New HTML projects receive browser-ready source plus Windows/macOS start instructions.

New React/Next.js projects receive the generated source plus:

```text
PROJECT-FIT.json
SETUP-WINDOWS.ps1
SETUP-MAC.command
RUN.md
```

Small uploaded portable assets can be included in the ZIP. The web payload is intentionally bounded; large media should remain in the user's project/CDN and be referenced by project path.

## Platform requirements

**Windows**
- Windows 10/11
- Node.js 22+ for React/Next.js
- detected package manager
- PowerShell 7 recommended

**macOS**
- macOS 12+
- Node.js 22+ for React/Next.js
- detected package manager
- Terminal (zsh/bash)

Standalone HTML output requires only a modern browser.

## Accuracy boundary

v0.8.0 materially improves content, asset, stack, route and installation fit. It does **not** claim pixel-perfect certification merely because Project Fit reaches 100%. Pixel similarity requires an independent rendered screenshot-diff verification step.

---

# KK-FRONTEND v0.7.0 — AUTHENTICATED REFERENCE CAPTURE

v0.7.0 extends the no-code Design Explorer to reference pages that legitimately require authentication.

## Authentication modes

- **Public** — unchanged public-reference workflow.
- **Login form** — username/password with automatic field detection, optional login URL, and optional advanced CSS selectors.
- **Session cookie** — for an already-authorized browser session, including many MFA/SSO cases.
- **Access token / header** — an authentication header injected only into requests to the exact reference origin.
- **HTTP Basic** — Basic Authorization injected only into the exact reference origin.

Authentication is **ephemeral**. Credentials, passwords, cookies, and access tokens are not written to DESIGN.md, DESIGN-EVIDENCE.json, session files, logs, or persistent server storage. API responses carry only a sanitized authentication summary.

CAPTCHA and MFA are never bypassed. For a site whose interactive login requires MFA/SSO/CAPTCHA, authenticate normally in your own browser and use an authorized session cookie instead.

## Authenticated workflow

```text
Reference URL
→ Authentication (optional)
→ Inspect Design
→ Select Regions
→ Generate DESIGN.md + DESIGN-EVIDENCE.json
→ Build Page
→ Live Preview
→ Export project
```

Network SSRF protections remain active during login, redirects, target navigation, and subresource loading.

---

# KK-FRONTEND v0.6.0 — NO-CODE DESIGN COMPILER

v0.6.0 adds a deterministic **Build Page** workflow to the visual Design Explorer. A user can now go from a public reference website to a working frontend without a coding agent:

```text
Reference URL
→ Inspect Design
→ Select Whole Page or Visual Regions
→ Generate DESIGN.md + DESIGN-EVIDENCE.json
→ Build Page
→ Live Preview
→ Desktop / Tablet / Mobile review
→ Reference / Build / Split comparison
→ Download Project ZIP
```

## No-code compiler

- Compiles the verified compact evidence JSON directly; it does not prompt an AI coding agent.
- Supports standalone HTML, React + Vite and Next.js project outputs.
- Uses verified colors, typography, geometry, responsive anchors and selected semantic regions.
- Counts unresolved `UNKNOWN — DO NOT INVENT` fields instead of silently guessing them.
- Provides Safe placeholders or Reference labels content modes.
- Provides Accurate, Balanced and Inspired fidelity modes.
- Generates a deterministic `DESIGN-BUILD.json` manifest with the exported project.
- Creates a ZIP archive in-memory without modifying the user's existing project.

## Live visual review

The generated page renders immediately in a sandboxed iframe. Users can switch between Desktop, Tablet and Mobile preview anchors and compare the generated page with the captured reference in Build, Reference or Split modes.

> Evidence confidence remains evidence confidence. v0.6.0 does not claim a pixel-similarity score unless an independent screenshot-diff verification is actually performed.

---

# KK-FRONTEND v0.5.1 — VISUAL DESIGN EXPLORER + SOURCE-AWARE MIGRATION

v0.5.1 combines the source-aware migration foundation from v0.5.0 with a redesigned **no-code Design Explorer** at `/reference-design.html`.

## v0.5.1 Design Explorer

The reference picker now detects and organizes a much broader set of design-relevant regions:

- Structure: Header, Navigation, Sidebar, Workspace, Hero, Section, Grid, Card, List, Footer and Overlay.
- Controls: Button, Form, Input, Search, Tabs, Badge and interactive controls.
- Content: Typography and headings.
- Media: Image, Video, Carousel, Gallery, Icon, Logo and Avatar.
- Motion: meaningful animated regions without allowing motion labels to replace semantic identity.

Users can filter by design family, search by label/selector/text, select filtered results, click overlays directly, or use quick presets such as **Essential design**, Structure, Typography, Controls, Media and Motion.

Custom design selection is explicit and bounded to 30 regions. `DESIGN.md` preserves the selected region labels/kinds/families so the exported contract is readable by both humans and machines.

## v0.5.0 source-aware migration foundation included

This branch also carries the verified v0.5.0 foundation:

- machine-readable `design-contract.json`;
- target source intelligence and component/import/risk graphs;
- Reference → Target component mapping;
- bounded migration plans and allowed-file scopes;
- baseline/hash verification and safe rollback;
- post-change visual acceptance gate.

The Design Explorer itself does not require a coding agent: a user can inspect a public reference, choose the desired design visually and generate `DESIGN.md` + `DESIGN-EVIDENCE.json` directly. Source mutation remains separately safety-gated.

## UI direction

The dedicated Design Explorer is intentionally slim, glassy and low-noise. Long selectors no longer dominate the interface; semantic type, family, dimensions, motion/interactive/sticky signals and selection state are surfaced first.

---

# KK-FRONTEND v0.4.1 — VERIFIED REFERENCE → DESIGN.md

v0.4.1 hardens the web-only Reference → DESIGN.md workflow for **measurement truth, machine readability, professional output, and production safety**.

## What changed in v0.4.1

- Desktop, Tablet and Mobile captures are now **browser-verified** at exactly `1440×900`, `820×1180`, and `390×844`. Generation stops instead of publishing mislabeled viewport evidence.
- Every viewport is freshly navigated after its exact metrics are applied, preventing responsive state from leaking between sizes.
- Semantic region identity wins over motion: animated headers remain **Header**, navigation remains **Navigation**, etc.; motion is a separate badge.
- `DESIGN.md` is now a concise implementation contract with YAML metadata, a verified evidence summary, exact viewport table, responsive region matrix, observed tokens, state changes, motion evidence, confidence reasons, and explicit machine rules.
- Detailed evidence is available separately as `DESIGN-EVIDENCE.json`, compacted to semantic/interactive evidence instead of dumping the full raw DOM into Markdown.
- CSS media/container conditions are preserved exactly. The extractor does **not** invent XS/SM/MD/LG names.
- One observed animation is no longer promoted to a global duration/easing. Global values remain `UNKNOWN — DO NOT INVENT` unless repeated evidence establishes them.
- Evidence confidence is no longer presented as visual-match percentage. Pixel similarity requires a separate screenshot-diff verification.
- Component coverage is no longer falsely claimed as 100%; representative capture is identified explicitly.
- Inline data-URL assets are omitted from generated evidence payloads to avoid multi-megabyte output.
- Generated response size is guarded below the Vercel function response ceiling.
- Browser navigation and subresources are guarded against localhost/private/link-local/CGNAT/benchmark/multicast destinations, and the final redirect URL is revalidated.
- The template heading is corrected to `DESIGN.md`.
- Region list overflow is removed; long selectors wrap cleanly and animated regions receive a separate Motion badge.

### Output contract

```text
Reference URL
→ exact remote Chromium viewport verification
→ semantic region selection
→ measured responsive/state/motion evidence
→ DESIGN.md                    concise implementation contract
→ DESIGN-EVIDENCE.json         compact detailed machine evidence
```

A coding agent should treat `UNKNOWN — DO NOT INVENT` literally. Missing evidence is not permission to guess.

---


v0.4.0 adds a dedicated **Reference → DESIGN.md** workspace at `/reference-design.html`.

This workflow does not require a target project, local machine path, Git checkout, or locally installed browser. A user supplies a public reference URL, inspects a server-rendered capture, selects the whole page or exact regions, and downloads an evidence-first `DESIGN.md`.

## v0.4.0 flow

```text
Reference URL
→ Remote Chromium inspection
→ Whole Page or exact region selection
→ Desktop + Tablet + Mobile measurement
→ hover/focus + animation + responsive CSS evidence
→ deterministic supplied-template renderer
→ Download DESIGN.md
```

### Evidence rules

- Measurable values come from rendered browser evidence.
- Unverified values are emitted as `UNKNOWN — DO NOT INVENT`.
- The extractor does not submit forms or click destructive controls.
- Public `http(s)` URLs only in production web-only mode; private/local network targets are rejected.
- The capture verifies remote Chromium rendering. Safari/WebKit and Firefox rendering are not claimed as independently verified.
- Canvas/WebGL internals and inaccessible cross-origin stylesheet rules may remain unverified.

### Cloud browser configuration

Set one of these server-side environment variables:

```text
BROWSERLESS_TOKEN=
BROWSERLESS_WS_ENDPOINT=
```

`BROWSERLESS_TOKEN` uses the default Browserless production endpoint. `BROWSERLESS_WS_ENDPOINT` can provide a complete compatible WebSocket endpoint. Never expose either value in client-side code.

For local development only, private-address scanning can be deliberately enabled with:

```text
KK_REFERENCE_ALLOW_PRIVATE=true
```

Keep it unset/false in production.

---

## v0.3.0 — DESIGN PICKER + SOURCE GENERATOR

v0.3.0 adds a visual reference-design extraction workflow on top of the existing scanner/comparison/safe-execution system.

After a Reference Scan, the WebApp can now expose scanned design evidence as selectable:

- Sections
- Components
- Text design
- Animations

The Design Picker overlays these entities directly on the captured reference screenshot. Each selection retains its exact route, viewport, selector, DOMRect, computed style and animation evidence.

**Generate Source Code** reconstructs an equivalent implementation for the connected target technology:

- React / Next.js → JSX + CSS
- Vue / Nuxt → Vue + CSS
- Svelte → Svelte + CSS
- Other targets → HTML + CSS

Generated source is reconstructed from VERIFIED runtime evidence. It is not represented as the reference site's proprietary original source code. Literal reference text is excluded by default, and reference asset URLs are not embedded unless explicitly authorized.

Artifacts include:

```text
reference-entities.json
design-selection.json
generated-source/
├─ generation.json
├─ reference-design-selection.css
└─ framework-specific component
```

## v0.3.0 flow

```text
Reference Scan
→ Load Design Picker
→ choose Route + Viewport
→ select Section / Component / Text / Animation
→ inspect VERIFIED evidence
→ Generate Source Code
→ map into target project
→ existing Plan / Safe Workspace / Verification flow
```

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

Target implementation still requires explicit user approval. Clean Git projects use an isolated worktree; non-Git or dirty-Git projects use a protected safe copy. The original project remains unchanged until the user deliberately chooses what to integrate.

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
