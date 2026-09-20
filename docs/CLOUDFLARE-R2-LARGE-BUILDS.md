# Cloudflare R2 large-build overflow

KK-FRONTEND v0.9.3 uses a three-stage transport so Whole Page designs do not need to be reduced merely because Vercel Functions have a small request/response body ceiling.

## Transport order

1. JSON request under 3.8 MB → normal Vercel JSON request.
2. Larger request → browser gzip → Vercel raw gzip request when compressed bytes are under 3.8 MB.
3. If compressed bytes are still too large → 2 MB chunks → Vercel → private Cloudflare R2 temporary objects → server reconstructs the request.
4. Generated ZIP entries are DEFLATE-compressed.
5. If the final API response is still too large, the ZIP is written to private R2 and the browser receives a short-lived presigned download URL instead of base64 ZIP bytes.

This keeps the application and compiler on Vercel. R2 is only an overflow transport/storage layer.

## Why R2

Cloudflare R2 Standard currently includes a free monthly allowance of 10 GB-month storage, 1 million Class A operations, 10 million Class B operations, and free Internet egress. The application uses private S3-compatible objects and temporary AWS Signature V4 URLs.

## Required Vercel Production environment variables

Create one private R2 bucket, for example:

```text
kk-frontend-large-builds
```

Create an R2 API token limited to that bucket with Object Read & Write permissions. Add these only to the Vercel server environment:

```text
KK_FRONTEND_R2_ACCOUNT_ID
KK_FRONTEND_R2_ACCESS_KEY_ID
KK_FRONTEND_R2_SECRET_ACCESS_KEY
KK_FRONTEND_R2_BUCKET
```

Never place these values in browser JavaScript, public files, Git, screenshots, or documentation.

## Object cleanup

Use a one-day lifecycle expiration for prefix:

```text
kk-frontend/tmp/
```

The input chunks are deleted immediately after a build attempt. The output ZIP is intentionally left available for its short-lived signed download URL, so the lifecycle rule is the final cleanup safety net.

Example Wrangler lifecycle command:

```bash
npx wrangler r2 bucket lifecycle add kk-frontend-large-builds --expire-days 1 --prefix "kk-frontend/tmp/"
```

Verify the exact Wrangler syntax installed on your machine before applying a lifecycle mutation.

## No browser CORS configuration is required by this implementation

Large request chunks go browser → same-origin Vercel → R2 server-side. Large ZIP downloads use a presigned R2 navigation URL with Content-Disposition set to attachment. Browser JavaScript does not directly PUT or fetch private R2 objects.

## Verification

After deployment:

```text
GET /api/health
version = 0.9.3
compressedBuildTransport = true
largeBuildOverflow = cloudflare-r2   # when configured
```

And:

```text
GET /api/reference-design/transport/status
compression = true
overflow.ready = true
```

A 4–5 MB Whole Page evidence payload should normally use gzip and avoid R2. R2 is reserved for larger or poorly-compressible payloads and oversized ZIP responses.
