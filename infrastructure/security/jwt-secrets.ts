// infrastructure/security/jwt-secrets.ts
//
// ---------------------------------------------------------------------
// THE ONE PLACE A JWT SIGNING SECRET IS RESOLVED
// ---------------------------------------------------------------------
// Both halves of the token path resolved their own secret, with the same
// literal fallback:
//
//   token.service.ts       process.env.NEXTAUTH_SECRET || 'default-secret-change-in-production'
//   edge-token-verify.ts   process.env.NEXTAUTH_SECRET || 'default-secret-change-in-production'
//
// token.service.ts did carry a production guard, and the message it
// printed said "Refusing to rely on default secrets for signing" -- but
// it was a `console.error` with nothing after it. Nothing threw, nothing
// exited, and signing continued with a secret that is published in this
// repository.
//
// That is a complete authentication bypass, not a hardening nit. Anyone
// holding this source can mint an HS256 token with
// `roles: ['super_admin']`, and `getAuthContextFromAccessToken` maps
// SUPER_ADMIN to `isPlatformAdmin`, which every repository treats as
// "skip tenant filtering". One forged Authorization header reads and
// writes every tenant on the deployment. The `sessionId` claim is
// optional, so no session record is needed either.
//
// ---------------------------------------------------------------------
// WHY IT THROWS IN EVERY ENVIRONMENT, NOT JUST PRODUCTION
// ---------------------------------------------------------------------
// A "production-only" guard is the shape that failed here. `NODE_ENV`
// is not a security boundary: a staging box, a preview deployment, a
// container started without its env file, or a `next build` that runs
// with NODE_ENV unset all sail past it -- and each of those talks to a
// real database. The failure is also silent, so the deployment that
// needed the guard most is the one that never notices it fired.
//
// Failing to start is the correct behaviour for a missing signing key.
// It is loud, it happens before any request is served, and the message
// says exactly what to do. The cost is one line in a developer's env
// file; the alternative cost is every tenant's data.
//
// Deriving a random per-process secret in development was considered and
// rejected: the Node and Edge runtimes are separate processes, so each
// would derive a different one and every request would fail verification
// with a confusing error instead of a clear one.
//
// EDGE-SAFE: no Node built-ins, no imports. `middleware.ts` and
// `edge-token-verify.ts` run in the Edge runtime.

/**
 * Fallbacks that shipped in this repository. Rejected by exact value:
 * setting the variable TO one of these is the same exposure as leaving
 * it unset, and is the likelier mistake once a guard exists (someone
 * copies the literal out of an old file to "make it start").
 */
const PUBLISHED_DEFAULTS = new Set([
  'default-secret-change-in-production',
  'default-refresh-secret-change-in-production',
  'change-me',
  'changeme',
  'secret',
]);

/**
 * Below this, an HS256 key is brute-forceable offline. 32 bytes of
 * base64 (`openssl rand -base64 32`) is 44 characters, which is what
 * SECURITY-CREDENTIALS.md instructs, so this floor rejects only genuine
 * mistakes.
 */
const MIN_SECRET_LENGTH = 24;

function resolve(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(
      `[security] ${name} is not set. The application will not start without it: ` +
        'a JWT signing secret has no safe default, and the fallback this replaced ' +
        'allowed anyone holding the source to forge a super-admin token for any tenant. ' +
        `Generate one with \`openssl rand -base64 32\` and set ${name} in the environment.`
    );
  }

  if (PUBLISHED_DEFAULTS.has(value)) {
    throw new Error(
      `[security] ${name} is set to a placeholder value that is published in this ` +
        `repository. Generate a real one with \`openssl rand -base64 32\`.`
    );
  }

  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `[security] ${name} is only ${value.length} characters. An HS256 key shorter than ` +
        `${MIN_SECRET_LENGTH} characters is brute-forceable offline. Generate one with ` +
        '`openssl rand -base64 32`.'
    );
  }

  return value;
}

/** The access-token signing/verification secret. Throws if unusable. */
export function getAccessSecret(): string {
  return resolve('NEXTAUTH_SECRET', process.env.NEXTAUTH_SECRET);
}

/**
 * The refresh-token signing secret. Throws if unusable.
 *
 * Deliberately NOT defaulted to the access secret: they have different
 * lifetimes and different blast radii, and a shared key means a leaked
 * access secret also mints refresh tokens.
 */
export function getRefreshSecret(): string {
  return resolve('REFRESH_TOKEN_SECRET', process.env.REFRESH_TOKEN_SECRET);
}
