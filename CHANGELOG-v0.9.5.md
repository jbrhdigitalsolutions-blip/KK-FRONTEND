# KK-FRONTEND v0.9.5

## Fixed

- Fixed `POST /api/reference-design/generate` returning HTTP 400 for large Whole Page Pixel Accurate captures.
- Removed pretty-printed machine evidence from the response path to reduce avoidable JSON size.
- Added lossless gzip + base64 transport for large `DESIGN-EVIDENCE.json` responses.
- Added browser-side `DecompressionStream` decoding before Project Fit / Build uses the evidence.
- Preserved direct JSON transport for small captures.
- Added HTTP 413 only for the rare case where the response still exceeds the hard budget after lossless compression.
- Added runtime health marker: `compressedReferenceEvidence: true`.

## Safety

- Authentication secrets are checked against the uncompressed markdown/evidence before transport encoding.
- Pixel Accurate evidence is not intentionally pruned by this fix.
- Existing build request compression and optional Cloudflare R2 overflow behavior are unchanged.

## Verification

- Regression coverage includes direct small evidence transport and a >2.75 MB synthetic whole-page evidence payload.
- Large-payload test verifies gzip round-trip byte-for-byte equality.
- Source and Vercel static copies remain required to be byte-identical by the existing test suite.
