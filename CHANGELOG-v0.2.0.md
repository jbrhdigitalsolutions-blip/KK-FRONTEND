# KK-FRONTEND v0.2.0

## Performance / completeness changes

- Replaced `route × ~70 full profiles` default strategy with two-pass Fast Deep scanning.
- Added locale alias normalization and canonical route families.
- Added desktop/mobile route fingerprints for every canonical route.
- Added structural visual clustering and representative deep scans.
- Added shared CSS capture plus route-specific CSS evidence.
- Added compact exact probes for every discovered CSS breakpoint at `-1 / exact / +1`.
- Added meaningful-breakpoint promotion to full snapshots.
- Added fingerprint screenshots for every canonical route.
- Added global/incremental asset de-duplication.
- Added safe pause/resume/stop and partial audit artifacts.
- Added same-session scan resume from already generated profile/screenshot/fingerprint files.
- Added ETA/work-unit telemetry.
- Added route include/exclude filters and locale-variant switch.
- Added recent-session restore in the WebApp.
- Removed dependency on npm in the Windows launcher; pnpm is used directly.
- Fixed duplicate live-progress log rendering.

## Compatibility

The target scanning, comparison, plan, Git worktree and verification engines remain present. Comparison now reads v0.2 representative-route evidence when available while retaining compatibility with v0.1 route arrays.
