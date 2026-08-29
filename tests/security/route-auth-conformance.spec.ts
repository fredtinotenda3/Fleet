// tests/security/route-auth-conformance.spec.ts
//
// S-1 -- the architectural gap named in the original audit and carried
// as "highest-leverage remaining item" through Phases 0-7.
//
// ---------------------------------------------------------------------
// THE GAP
// ---------------------------------------------------------------------
// `middleware.ts`'s matcher excludes non-versioned `/api/*`:
//
//   '/((?!_next/static|...|api/(?!v\\d+/).*).*)'
//
// so the 401 branch inside the middleware is effectively unreachable for
// the ~300 real route files. Every route is therefore SELF-DEFENDING,
// and a single omission is an open endpoint.
//
// That is not hypothetical. Three of the four CRITICAL findings in the
// original audit were routes that had forgotten their guard:
//
//   F-1  five cron routes with a fail-open `if (CRON_SECRET && ...)`
//   F-4  every workflow route on withSession() -- authenticated only,
//        no permission -- so any driver could approve any step
//   F-5  POST /api/telematics/ingest authenticated but unauthorized
//
// All three were fixed by hand in Phase 0. Nothing stopped the next one
// happening, and Phase 7 promptly demonstrated that: two new
// observability endpoints were protected only because they were wrapped
// deliberately, while `/api/observability/metrics` shipped fail-open.
//
// This test is the structural enforcement. It follows the pattern
// module-scope-conformance.spec.ts established for tenancy -- the one
// technique in this codebase with a track record of turning "someone
// forgot" from invisible into a red build.
//
// ---------------------------------------------------------------------
// HOW IT WORKS, AND WHY THE ALLOWLIST IS THE POINT
// ---------------------------------------------------------------------
// Every `app/api/**/route.ts` must EITHER use a recognised auth
// mechanism OR appear in PUBLIC_ROUTES below with a written reason.
//
// The allowlist is not a loophole, it is the control. Making a route
// public becomes a deliberate, reviewable edit to a file called
// "public routes" with a justification attached -- rather than the
// current situation, where making a route public is what happens when
// you forget to type `withAuth`.
//
// The list is also checked for STALE entries, so it cannot rot into a
// blanket exemption for paths that no longer exist.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const API_ROOT = path.join(ROOT, 'app/api');

/**
 * Mechanisms that constitute authentication on a route.
 *
 * Each is a real, load-bearing check somewhere in this codebase:
 *
 *   withAuth              the standard wrapper; resolves the auth
 *                         context, optionally enforces a Permission.
 *   withSession           authenticated-only, no permission. Recognised
 *                         because it IS authentication -- but see the
 *                         separate assertion below, because Phase 0's
 *                         F-4 was precisely a set of routes where
 *                         "authenticated" was mistaken for "authorized".
 *   denyCronRequest       the Phase 0 fail-closed scheduler guard.
 *   denyMetricsRequest    the Phase 7 follow-up equivalent for the
 *                         Prometheus scrape endpoint.
 *   getAuthContext        the underlying resolver; a route calling it
 *                         directly is doing its own 401.
 *   getTenantFromRequest  resolves a tenant from the auth context and
 *                         throws when there is none, so reaching it
 *                         implies authentication.
 */
const AUTH_MECHANISMS = [
  'withAuth',
  'withSession',
  'denyCronRequest',
  'denyMetricsRequest',
  'getAuthContext',
  'getTenantFromRequest',
  'resolveTenantContext',
  // lib/requireAuth.ts -- an older helper predating withAuth. Returns a
  // 401 NextResponse when there is no NextAuth session, and the route
  // returns it early. Genuinely authentication; recognised so the test
  // does not push a working route onto the public allowlist.
  'requireAuth',
] as const;

interface PublicRoute {
  route: string;
  reason: string;
}

/**
 * Routes that are deliberately reachable without authentication.
 *
 * EVERY ENTRY NEEDS A REASON. If you are adding one, the question to
 * answer is not "does this need auth?" but "what can an anonymous
 * caller do with this, and is that acceptable?".
 */
const PUBLIC_ROUTES: PublicRoute[] = [
  {
    route: 'app/api/auth/[...nextauth]/route.ts',
    reason: 'NextAuth handler. Authentication itself cannot require authentication.',
  },
  {
    route: 'app/api/auth/token/route.ts',
    reason: 'Credential exchange. Rate-limited and protected by account lockout (tblaccountlockouts).',
  },
  {
    route: 'app/api/auth/refresh/route.ts',
    reason: 'Refresh-token exchange. The refresh token IS the credential; revocation is checked centrally.',
  },
  {
    route: 'app/api/auth/revoke/route.ts',
    reason: 'Token revocation. Must work with an expired access token, or a user cannot log out of a compromised session.',
  },
  {
    route: 'app/api/auth/precheck/route.ts',
    reason: 'Pre-login lookup (does this email use SSO?). Rate-limited; returns no account data.',
  },
  {
    route: 'app/api/auth/sso/discover/route.ts',
    reason: 'SSO provider discovery for a domain, before any session exists. Rate-limited.',
  },
  {
    route: 'app/api/health/route.ts',
    reason: 'Liveness probe. Must answer before the app can authenticate anything; returns no tenant data.',
  },
  {
    route: 'app/api/health/ready/route.ts',
    reason: 'Readiness probe, polled by the orchestrator with no credentials. Returns dependency status only.',
  },
  {
    route: 'app/api/version/route.ts',
    reason: 'API version discovery. Static, no tenant data.',
  },
  {
    route: 'app/api/version/[version]/route.ts',
    reason: 'API version metadata. Static, no tenant data.',
  },
  {
    route: 'app/api/billing/plans/route.ts',
    reason: 'Public pricing catalogue. Contains no tenant or subscription data.',
  },
  {
    route: 'app/api/oauth/introspect/route.ts',
    reason:
      'RFC 7662 introspection. Authenticates the CALLER by client credentials in the request body, ' +
      'not by a user session — a session wrapper would make it unusable by the machine clients it exists for.',
  },
  {
    route: 'app/api/organizations/invites/accept/route.ts',
    reason:
      'Invite acceptance. The single-use invite token IS the credential; requiring a session would mean ' +
      'you must already be a member to become one.',
  },
  {
    route: 'app/api/organizations/invites/decline/route.ts',
    reason: 'Invite decline. Same reasoning as accept.',
  },
  {
    route: 'app/api/health/live/route.ts',
    reason: 'Liveness probe. Must answer before the app can authenticate anything; returns no tenant data.',
  },
  {
    route: 'app/api/oauth/token/route.ts',
    reason:
      'OAuth 2.0 token endpoint. Authenticates the CALLER by client credentials in the request body, ' +
      'not by a user session — the same reasoning as /oauth/introspect.',
  },
  {
    route: 'app/api/billing/webhook/route.ts',
    reason:
      'Payment-provider callback. Authenticated by PaynowClient.verifyResultHash() inside ' +
      'billingController.handleWebhook — a shared-secret hash over the payload. A session wrapper would ' +
      'make it unusable by the provider it exists for. NOTE: the verification lives in the controller, so ' +
      'the assertion below pins it there rather than in the route file.',
  },
  {
    route: 'app/api/trips/import/route.ts',
    reason:
      'RETIRED. Returns 501 unconditionally and touches no data — the controller method it called never ' +
      'existed. Kept as an honest 501 rather than a crash. Re-add auth if it is ever implemented.',
  },
  {
    route: 'app/api/vehicles/direct/route.ts',
    reason:
      'RETIRED. Returns a fixed response and touches no data. Previously opened its own MongoClient and ' +
      "wrote vehicles hardcoded to tenantId 'default', bypassing validation and tenant scope entirely.",
  },
  {
    route: 'app/api/workflows/instances/[id]/steps/[stepId]/route.ts',
    reason:
      'RETIRED (Phase 5). Returns 410 Gone and touches no data. Previously served instance read/cancel at a ' +
      'path whose [stepId] segment was required and then ignored.',
  },
];

function walkRoutes(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkRoutes(full, acc);
    else if (entry.name === 'route.ts') acc.push(path.relative(ROOT, full));
  }
  return acc;
}

/**
 * Source with comments stripped.
 *
 * Load-bearing, not cosmetic. Several routes in this codebase document
 * the vulnerability they fixed by NAMING the old mechanism -- e.g.
 * workflows/route.ts says "These handlers were wrapped in withSession()".
 * Matching on raw text would credit those files with an auth mechanism
 * they explicitly no longer use, which is the exact opposite of what
 * this test is for.
 */
function codeOf(rel: string): string {
  return fs
    .readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function hasAuthMechanism(rel: string): boolean {
  const code = codeOf(rel);
  return AUTH_MECHANISMS.some((m) => code.includes(m));
}

const ALL_ROUTES = walkRoutes(API_ROOT);
const PUBLIC_SET = new Set(PUBLIC_ROUTES.map((r) => r.route.replace(/\\/g, '/')));

const normalise = (p: string) => p.replace(/\\/g, '/');

describe('S-1: every API route is authenticated or explicitly public', () => {
  it('discovers a realistic number of routes', () => {
    // A walker that silently matches nothing would report success
    // forever, which is worse than no test at all.
    expect(ALL_ROUTES.length).toBeGreaterThan(200);
  });

  it('has no route that is neither protected nor allow-listed', () => {
    // THE assertion. This is what fails when somebody adds a route and
    // forgets `withAuth` -- the failure mode that produced three of the
    // four CRITICAL findings in the original audit.
    const unprotected = ALL_ROUTES.filter(
      (rel) => !PUBLIC_SET.has(normalise(rel)) && !hasAuthMechanism(rel)
    );

    expect(unprotected).toEqual([]);
  });

  it('has no stale entries in the public allowlist', () => {
    // Stops the allowlist rotting into a blanket exemption for paths
    // that no longer exist -- and catches a rename that would otherwise
    // silently leave the NEW path unguarded while the old entry keeps
    // the list looking maintained.
    const actual = new Set(ALL_ROUTES.map(normalise));
    const stale = PUBLIC_ROUTES.filter((r) => !actual.has(normalise(r.route)));

    expect(stale.map((r) => r.route)).toEqual([]);
  });

  it('gives every public route a written reason', () => {
    // The allowlist is the control, not the loophole: making a route
    // public must be a deliberate, reviewable act with a justification
    // attached — rather than what happens when you forget to type
    // `withAuth`.
    for (const entry of PUBLIC_ROUTES) {
      expect(entry.reason.trim().length).toBeGreaterThan(30);
    }
  });
});

describe('S-1: authenticated is not the same as authorized', () => {
  /**
   * Phase 0's F-4 was not a missing wrapper -- it was the WRONG one.
   * Every workflow route used withSession(), which proves only that
   * somebody is logged in, so any authenticated user (a driver, a
   * viewer) could approve any workflow step.
   *
   * `withSession` is still recognised as authentication above, because
   * it is. This asserts separately that nothing has gone back to using
   * it, so the distinction cannot quietly erode again.
   */
  it('no route uses withSession() as its only protection', () => {
    const offenders = ALL_ROUTES.filter((rel) => {
      const code = codeOf(rel);
      return code.includes('withSession') && !code.includes('withAuth');
    });

    expect(offenders).toEqual([]);
  });

  it('no route reintroduces the fail-open secret pattern', () => {
    // `if (SECRET && header !== SECRET)` — an unset variable skips the
    // check entirely. Fixed on five cron routes in Phase 0 (F-1) and on
    // the metrics endpoint in the Phase 7 follow-up.
    const offenders = ALL_ROUTES.filter((rel) => {
      const code = codeOf(rel);
      return /if\s*\(\s*[A-Z_]*SECRET[A-Z_]*\s*&&/.test(code);
    });

    expect(offenders).toEqual([]);
  });

  it('scheduler routes use the shared fail-closed guard', () => {
    const cronRoutes = ALL_ROUTES.filter(
      (rel) => normalise(rel).includes('/cron/') || normalise(rel).includes('process-timeouts')
    );

    expect(cronRoutes.length).toBeGreaterThan(0);
    for (const rel of cronRoutes) {
      expect(codeOf(rel)).toContain('denyCronRequest');
    }
  });
});

describe('S-1: cross-tenant surfaces require a platform permission', () => {
  /**
   * Observability endpoints read across tenants by design (provider
   * health, outbox backlog). A tenant-level role must not reach them
   * however many roles it holds, so they are gated on PLATFORM_VIEW --
   * which is filtered out of every tenant role by
   * PLATFORM_ONLY_PERMISSIONS.
   *
   * `/api/observability/metrics` is the documented exception: Prometheus
   * scrapers carry no session, so it uses a fail-closed bearer token
   * instead.
   */
  const OBSERVABILITY_ROUTES = ALL_ROUTES.filter((rel) =>
    normalise(rel).startsWith('app/api/observability/')
  );

  it('finds the observability routes', () => {
    expect(OBSERVABILITY_ROUTES.length).toBeGreaterThan(0);
  });

  it.each(OBSERVABILITY_ROUTES)('%s is authenticated', (rel) => {
    // Every observability route must be protected. The STRENGTH of the
    // gate varies legitimately: cross-tenant reads (provider health,
    // outbox backlog) need a platform permission, while a route scoped
    // to the caller's own tenant may use an ordinary one.
    expect(hasAuthMechanism(rel)).toBe(true);
  });

  it.each(['app/api/observability/telematics/providers/route.ts', 'app/api/observability/outbox/route.ts'])(
    '%s requires a PLATFORM-only permission because it reads across tenants',
    (rel) => {
      const code = codeOf(rel);
      expect(code.includes('PLATFORM_VIEW') || code.includes('PLATFORM_MANAGE')).toBe(true);
    }
  );

  it('the billing webhook verifies a provider signature', () => {
    // It is on the public allowlist because a payment provider cannot
    // present a session — but "public" must not mean "unauthenticated".
    // The shared-secret hash check is its credential, and this pins it.
    const controller = fs.readFileSync(
      path.join(ROOT, 'modules/billing/controllers/billing.controller.ts'),
      'utf8'
    );
    expect(controller).toContain('verifyResultHash');
  });

  it('the metrics scrape guard fails CLOSED on an unset token', () => {
    // The Phase 7 finding: an unset METRICS_SCRAPE_TOKEN previously left
    // every metric — including per-provider telematics health — servable
    // to anyone who could reach the deployment.
    // Comments stripped: the guard's own header QUOTES the old
    // fail-open code in order to explain what it replaced. An assertion
    // that cannot tell code from prose would fail on the explanation and
    // pressure whoever hits it into deleting the most useful comment in
    // the file.
    const guardPath = 'server/middleware/metrics-auth.ts';
    const code = fs.existsSync(path.join(ROOT, guardPath))
      ? codeOf(guardPath)
      : codeOf('app/api/observability/metrics/route.ts');

    expect(code).not.toMatch(/if\s*\(\s*requiredToken\s*\)/);
    // And positively: an absent token must REFUSE, not skip.
    expect(code).toMatch(/misconfigured|not configured|fail|refus/i);
  });
});
