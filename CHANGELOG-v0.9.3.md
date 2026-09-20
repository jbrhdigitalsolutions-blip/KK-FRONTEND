# KK-FRONTEND v0.9.3

## Large-build transport

- Removes the requirement to shrink Whole Page selections merely because the uncompressed Build request exceeds Vercel's 4.5 MB Function payload limit.
- Adds browser gzip transport for large Build requests.
- Adds a 3.8 MB direct-request safety margin.
- Adds optional Cloudflare R2 overflow transport for payloads that remain too large after gzip.
- Splits R2 overflow uploads into 2 MB same-origin chunks; R2 credentials never reach the browser.
- Signs temporary R2 sessions with an expiring HMAC ticket.
- Reconstructs and deletes temporary input chunks server-side.
- DEFLATE-compresses generated ZIP entries.
- Offloads oversized ZIP responses to private R2 and returns a short-lived presigned download URL.
- Keeps normal small builds on the existing direct Vercel path.
- Adds dependency-free AWS Signature V4 signing, transport tests and documentation.

## Required only for overflow beyond gzip

```text
KK_FRONTEND_R2_ACCOUNT_ID
KK_FRONTEND_R2_ACCESS_KEY_ID
KK_FRONTEND_R2_SECRET_ACCESS_KEY
KK_FRONTEND_R2_BUCKET
```

Current 4–5 MB text-heavy Whole Page evidence is expected to fit through the gzip path without R2. R2 provides the durable fallback for larger payloads and output ZIPs.
