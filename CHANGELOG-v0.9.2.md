# KK-FRONTEND v0.9.2

## Fixed

- Prevent HTTP 413 on `POST /api/reference-design/build` by removing redundant full-project source from Build API requests.
- Reuse the server-analyzed Project Fit profile during compilation.
- Send only the target original source file for existing-project exports, or portable assets for new/standalone exports.
- Add a 4 MB client request-size preflight.
- Align Express JSON parsing with a 4 MB safe web budget and return a clear local 413 message.
- Remove duplicate generated file contents and full layout model from the Build API JSON response while preserving ZIP download and preview functionality.

## Verification target

- Syntax checks.
- Selftest v0.9.2.
- Full internal test suite, including the new slim-build-payload regression test.
- `src/web/reference-design.*` and `public/reference-design.*` parity.
