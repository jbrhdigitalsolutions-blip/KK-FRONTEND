# KK-FRONTEND v0.6.0 — No-Code Design Compiler

## User workflow
- Added Build Page directly after DESIGN.md generation.
- No coding agent, prompt engineering, or source editing is required.
- Added Standalone HTML, React + Vite, and Next.js output modes.
- Added Safe placeholders and Reference labels content modes.
- Added Accurate, Balanced, and Inspired fidelity modes.
- Added live sandboxed generated-page preview.
- Added Desktop 1440, Tablet 820, and Mobile 390 preview controls.
- Added Build / Reference / Split comparison modes.
- Added Download Project ZIP.

## Compiler
- New `src/no-code/compiler.mjs`.
- Consumes `kk-reference-design-evidence-compact/v2`.
- Derives a deterministic design-token set from verified rendered evidence.
- Builds a semantic layout model from selected Header, Hero, Section, Card, Grid, Footer and other captured regions.
- Carries verified viewport anchors into the build manifest.
- Counts unresolved DESIGN.md fields rather than inventing missing values.
- Produces `kk-no-code-design-build/v1` and `DESIGN-BUILD.json`.
- Includes an internal dependency-free ZIP writer for generated text projects.

## API
- Added `POST /api/reference-design/build`.
- Build response is guarded to the safe web response budget.
- Existing project/source migration paths are untouched.

## Verification
- Added focused no-code compiler tests covering HTML, React, Next.js, ZIP signature, semantic labels, verified viewports and invalid-evidence rejection.
