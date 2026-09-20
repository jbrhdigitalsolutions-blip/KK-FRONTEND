# KK-FRONTEND v0.8.0 — Project-Aware Design Builder

## Build Preview correction
- The old generic preview is no longer treated as an Accurate result.
- Accurate fidelity is gated by Project Fit readiness.
- Build Preview now fetches a reference screenshot at the same Desktop, Tablet, or Mobile viewport being reviewed.
- Reference evidence confidence and target-project fit are displayed separately.

## Project Fit Intake
- Existing project / New project modes.
- Upload selected project files or a project folder.
- Detect stack, package manager, TypeScript, styling system, routes, target source file, design docs and asset filenames.
- Ask only for missing material information such as real brand, headline, body copy, CTA labels, navigation labels and required assets.
- Common secret/private files and generated/vendor folders are excluded in both browser and server analysis.

## Project-aware generation
- Real project content replaces generic Brand/Get started placeholders when provided.
- Existing public logo/hero paths are reused.
- Small uploaded new-project assets can be packaged into the ZIP.
- Auto output follows detected HTML / React / Next.js target.
- Vue/Svelte may be identified, but v0.8 does not falsely claim exact deterministic integration for them.

## Existing projects
- Export a bounded project patch at the detected/selected target source path.
- Include PROJECT-FIT.json and PATCH-MANIFEST.json.
- Include APPLY-WINDOWS.ps1 and APPLY-MAC.command.
- Apply scripts back up replaced files before copying.
- Preserve the user's package manager.

## New projects
- HTML: browser-ready source + Windows/macOS start scripts.
- React/Next.js: source + cross-platform setup scripts.
- Document Node.js 22+, package-manager and OS requirements.

## API
- POST /api/reference-design/project-fit
- POST /api/reference-design/preview
- POST /api/reference-design/build accepts projectContext

## Verification boundary
Project Fit is a readiness/compatibility measure, not a pixel-similarity score. v0.8 does not claim pixel-perfect certification without independent rendered screenshot comparison.
