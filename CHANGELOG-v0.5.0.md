# KK-FRONTEND v0.5.0 — Source-Aware Design Migration Foundation

## Added
- Machine-readable reference `design-contract.json` generated from verified runtime evidence.
- Deep target source intelligence with component/import/style/risk/hash graphs.
- Semantic Reference → Target component mapping with explicit INFERRED confidence.
- Real staged migration actions with hard allowed-file scopes and baseline SHA256 preconditions.
- Separation between reference-evidence confidence and post-implementation visual similarity.

## Safety
- This phase does not automatically mutate target source.
- Unmapped actions are marked `requiresMapping=true` and must stop instead of guessing.
- Plans preserve APIs, auth, routes, forms, state, business logic, analytics and accessibility behavior.
- Execution artifacts are isolated under `.kk-frontend/` and excluded from project apply-back.
- Agent changes are rejected if they escape the approved `allowedFiles` scope.
- Safe-copy apply now verifies original baseline hashes, backup hashes, every applied file hash, and rollback hashes.
- Verification is change-aware: CSS-only work avoids unnecessary generic tests, while runtime-source changes retain lint/typecheck/test/build checks when available.
- Apply-back is gated until post-change visual verification passes.
