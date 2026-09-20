# KK-FRONTEND v0.7.0 — Authenticated Reference Capture

## Added
- Public / Login form / Session cookie / Access token-header / HTTP Basic reference modes.
- Automatic username/email, password, and submit-control detection for common login forms.
- Optional advanced login selectors for non-standard forms.
- Two-step username → password login handling.
- Optional login success selector.
- Ephemeral cookie injection for already-authorized sessions.
- Same-origin-only authentication header injection.
- Authenticated capture status in the Design Explorer.

## Security
- Authentication secrets are never persisted by KK-FRONTEND.
- Reference API responses use no-store/no-cache headers.
- DESIGN.md and compact evidence include only sanitized auth metadata.
- Capture responses are checked for accidental password/cookie/token leakage.
- Private/local-network SSRF blocking remains active during authentication and capture.
- Forbidden request headers include Host, Cookie, Proxy-Authorization, and Vercel protection headers.
- CAPTCHA/MFA bypass is explicitly unsupported.

## UX
- Slim collapsible Authentication panel under Reference URL.
- Authentication method selector.
- Browser-friendly username/password fields.
- Session-cookie and access-token modes for advanced authentication.
- Secrets clear when starting a new reference.

## Compatibility
- Public reference behavior remains unchanged.
- Existing v0.6.0 No-Code Design Compiler and source-aware migration workflows remain available.
