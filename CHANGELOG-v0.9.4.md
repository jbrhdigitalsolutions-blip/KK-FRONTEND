# KK-FRONTEND v0.9.4

## Pixel Accurate reference renderer

v0.9.4 separates true visual-reference reconstruction from target-content adaptation.

### Accurate mode

- Accurate is now **Pixel Accurate — reference geometry/content**.
- Accurate mode forces `reference-exact` content so screenshot certification compares like-for-like content instead of placeholders or target copy.
- Preserves fidelity-critical DOM ancestors instead of flattening semantic nodes into generic sections.
- Preserves direct text separately from descendant text to avoid duplicated copy.
- Preserves original image `src`, `srcset`, sizes, loading hints and media attributes.
- Captures and sanitizes inline SVG markup; scripts, foreignObject and event-handler attributes are removed.
- Preserves computed background images, borders, flex/grid details, typography, overflow and transition styles.
- Reconstructs ::before / ::after pseudo-elements.
- Reconstructs sampled :hover / :focus visual states.
- Reconstructs captured Web Animations keyframes when evidence contains usable keyframes.
- Carries readable non-inline @font-face rules.
- Adds a reference `<base>` URL so safe relative public assets can resolve.
- Keeps desktop/tablet/mobile measured style overrides.

### Balanced / Inspired

Balanced and Inspired retain the existing target-content / placeholder-oriented semantic workflow.

### Safety

Pixel Accurate does not execute reference scripts. Inline SVG is sanitized and unsafe javascript/vbscript URLs are rejected by generated attribute/CSS helpers. Private/local reference-network restrictions remain unchanged.

### Verification target

- Syntax checks.
- v0.9.4 selftest.
- Full internal test suite.
- Pixel Accurate regression covering SVG, reference media URLs, background assets, pseudo-elements, fonts and hover/focus states.
- Compact evidence regression covering required hierarchy ancestors.
