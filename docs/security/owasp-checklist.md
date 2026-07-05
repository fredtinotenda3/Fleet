# OWASP Top 10 (2021) — Pass Log, Slice 6d

Status of each category against the current codebase, and what this
slice added or hardened. This is a living checklist, not a certification.

## A01 — Broken Access Control
- **Mitigated**: `server/middleware/with-auth.ts` centralizes permission
  checks; `modules/security/services/permission-engine.service.ts`
  (Slice 6a) provides RBAC + resource-scoped ABAC with explicit deny
  precedence. `middleware.ts` gates page routes at the edge.
- **This slice**: SSO connection CRUD gated behind new
  `SSO_CONNECTION_VIEW`/`MANAGE` permissions; MFA endpoints are
  self-service-only by design (operate on the caller's own `userId`,
  never an id from the request body).

## A02 — Cryptographic Failures
- **This slice**: `infrastructure/secrets/encryption.service.ts` adds
  AES-256-GCM envelope encryption for MFA TOTP secrets and SSO client
  secrets at rest — previously nothing in the codebase encrypted
  secondary secrets before persisting them (API keys and refresh tokens
  were already hashed, not encrypted, since they only need equality
  checks, not decryption).
- **Follow-up**: rotate `SECRETS_ENCRYPTION_KEY` via
  `infrastructure/secrets/secrets-manager.service.ts` + a re-encryption
  migration once a KMS-backed provider is wired in for production.

## A03 — Injection
- **Mitigated**: all DB writes go through parameterized MongoDB driver
  calls (no string-built queries); `server/middleware/sanitize-input.ts`
  and `shared/validations/*.schema.ts` (Zod) validate/sanitize request
  bodies before they reach a repository.
- **No change needed this slice.**

## A04 — Insecure Design
- **This slice**: MFA login flow deliberately avoids server-held
  challenge tokens for the browser/API login paths — every attempt
  re-verifies the password, so there's no separate challenge-token
  lifecycle to get wrong (expiry, replay, fixation). SSO scaffolding is
  explicitly labeled as such in code comments, flagging the
  provisioning gap (no auto-created `OrganizationMember` row) rather
  than silently shipping a half-finished trust boundary.

## A05 — Security Misconfiguration
- **This slice**: `infrastructure/security/security-headers.ts` adds
  CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
  Permissions-Policy, COOP/CORP, and HSTS (production only) to every
  API response (via `server/utils/response.utils.ts`) and page response
  (via `middleware.ts`). Previously no security headers were set at all.
- **Follow-up**: move CSP off `unsafe-inline`/`unsafe-eval` once a
  nonce-based strategy is adopted in `next.config.ts`.

## A06 — Vulnerable and Outdated Components
- No dependency changes required by this slice beyond the *optional*
  `@aws-sdk/client-secrets-manager` (lazy-imported, only loaded when
  `SECRETS_PROVIDER=aws`).

## A07 — Identification and Authentication Failures
- **This slice — the core of Slice 6d**: adds TOTP-based MFA
  (`modules/security/services/mfa.service.ts`) with backup codes,
  wired into both the NextAuth credentials flow (`lib/authOptions.ts`)
  and the API token flow (`modules/security/controllers/token.controller.ts`).
  Brute-force lockout (Slice 6c) and MFA now compose: a locked account
  is rejected before any password/MFA comparison runs.
- SSO/OIDC scaffolding (`modules/security/services/sso.service.ts`,
  `app/api/auth/[...nextauth]/route.ts`) gives enterprise customers a
  path to federate identity instead of local passwords, gated behind
  per-organization connection configuration.

## A08 — Software and Data Integrity Failures
- **Mitigated**: existing audit hash-chain (Slice 6c,
  `modules/security/services/audit-chain.service.ts`) already covers
  tamper-evidence for the audit log. MFA/SSO admin actions
  (enroll/disable/create/update/delete) all write through `auditLog.log()`.

## A09 — Security Logging and Monitoring Failures
- **This slice**: MFA enrollment, disablement, backup-code regeneration,
  low-backup-code warnings, and SSO connection CRUD all emit structured
  audit entries with `category: 'security'`, feeding the same immutable
  ledger as every other security event.

## A10 — Server-Side Request Forgery (SSRF)
- **This slice introduces one new outbound-fetch surface**:
  `SsoService.tryDiscover()` fetches `<issuer>/.well-known/openid-configuration`
  using an admin-supplied `issuer` URL. Mitigations in place: the fetch
  is wrapped in try/catch with a 5s timeout, is *only* reachable via
  `SSO_CONNECTION_MANAGE` (organization-owner tier), and failures fall
  back to explicit `authorizationEndpoint`/`tokenEndpoint`/etc. fields
  rather than blocking connection creation.
  - **Follow-up**: add an allow-list or DNS-resolution check against
    RFC1918 / link-local ranges before the discovery fetch, since an
    org admin is a lower-trust actor than platform staff and SSRF via
    a malicious `issuer` value pointing at internal infrastructure is
    the realistic residual risk here.