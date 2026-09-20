# KK-FRONTEND v0.4.1

## Reference → DESIGN.md Accuracy Hardening

This release upgrades the web-only reference extractor from a working capture prototype to a stricter evidence-first implementation contract.

### Fixed

- Verify requested Desktop 1440×900, Tablet 820×1180 and Mobile 390×844 against the browser-reported viewport.
- Reload the reference after applying each viewport so responsive state is measured at the intended size.
- Prioritize semantic region identity over generic animation classification.
- Remove script/runtime text noise from region labels.
- Preserve exact CSS media/container conditions instead of inventing semantic breakpoint names.
- Do not promote one animation sample into a global timing/easing token.
- Map known page viewport/content/responsive fields into the supplied DESIGN.md template.
- Stop treating evidence confidence as a visual similarity score.
- Stop claiming 100% component coverage for representative evidence.
- Correct the DEISGN.md heading typo.
- Remove candidate-list horizontal overflow.

### Output quality

- DESIGN.md now starts with machine-readable YAML metadata.
- Adds a compact Verified Evidence Summary.
- Adds exact viewport verification and a cross-viewport semantic region matrix.
- Adds observed-token frequency evidence without inventing semantic brand roles.
- Adds concise hover/focus and runtime-motion evidence.
- Adds confidence reasons and explicit restrictions.
- Detailed evidence is separated into DESIGN-EVIDENCE.json.
- Inline data URLs are omitted and response size is guarded for production delivery.

### Security

- Revalidates the final navigation URL.
- Guards navigation and subresource requests against localhost and restricted network destinations.
- Covers private IPv4, CGNAT, link-local, benchmark, multicast, IPv6 ULA/link-local/multicast, and IPv4-mapped IPv6 forms.

### Compatibility

No new runtime dependency is required. Existing Browserless configuration continues to use BROWSERLESS_TOKEN or BROWSERLESS_WS_ENDPOINT.
