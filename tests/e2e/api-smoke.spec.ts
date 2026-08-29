// tests/e2e/api-smoke.spec.ts
//
// HARDENING (item 3) -- replacing `echo "no e2e suite yet" && exit 0`.
//
// ---------------------------------------------------------------------
// WHAT "E2E" MEANS HERE, STATED PLAINLY
// ---------------------------------------------------------------------
// These import the REAL exported route handlers and invoke them with a
// real `NextRequest`. That exercises the genuine article: the
// `withAuth` wrapper, the permission check, the auth-context resolver,
// the controller, and the error mapping.
//
// It does NOT go over HTTP. There is no server, no `middleware.ts`, and
// no network. Calling it "end to end" without saying so would overstate
// it, so: this is an API-CONTRACT smoke suite, one layer below true E2E.
//
// That layer is where the risk actually lives in this codebase.
// `middleware.ts`'s matcher excludes non-versioned `/api/*` (finding
// S-1), so for ~300 routes the wrapper IS the entire security boundary --
// there is no outer layer for a true E2E test to catch that these do
// not. Three of the four CRITICAL findings in the original audit were
// routes whose handler-level guard was wrong or missing.
//
// ---------------------------------------------------------------------
// NO NEW DEPENDENCY
// ---------------------------------------------------------------------
// supertest / next-test-api-route-handler would need a running server
// (or a shim for one) to add anything over calling the handler directly.
// What was needed instead was a Jest transform: `jose` v6 is ESM-only
// with no CommonJS build, so any test importing a handler that reaches
// the auth chain died on `Unexpected token 'export'`. jest.config.js now
// transforms jose and @panva only -- every other node_modules package is
// still skipped, so the cost does not fall on the whole suite.
//
// ---------------------------------------------------------------------
// NO DATABASE
// ---------------------------------------------------------------------
// Nothing here needs Mongo. The assertions are about the AUTH BOUNDARY,
// which is reached and answered before any handler touches a
// repository -- an unauthenticated request is refused without a query.
// The health endpoints report their dependency status truthfully whether
// or not a database is reachable, which is the behaviour under test.

import { NextRequest } from 'next/server';

/** A request with no credentials of any kind. */
function anonymous(path: string, init?: RequestInit): NextRequest {
  return new NextRequest(`http://localhost${path}`, init);
}

/** A request carrying a syntactically valid but bogus bearer token. */
function withBogusToken(path: string, init: RequestInit = {}): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    ...init,
    headers: { ...(init.headers || {}), authorization: 'Bearer not-a-real-token' },
  });
}

describe('E2E smoke: health endpoints', () => {
  it('liveness answers 200 without credentials', async () => {
    // Must answer before the app can authenticate anything -- an
    // orchestrator polls it with no credentials at all.
    const { GET } = await import('@/app/api/health/live/route');
    const res = await GET();

    expect(res.status).toBe(200);
  });

  it('liveness leaks no dependency detail', async () => {
    // A liveness probe is the most-scraped unauthenticated surface in
    // the deployment. It should say "the process is up", not describe
    // the infrastructure behind it.
    const { GET } = await import('@/app/api/health/live/route');
    const body = JSON.stringify(await (await GET()).json()).toLowerCase();

    expect(body).not.toContain('mongodb://');
    expect(body).not.toContain('redis://');
    expect(body).not.toContain('password');
    expect(body).not.toContain('secret');
  });

  it('readiness answers and reports its dependency checks', async () => {
    // 200 or 503 are BOTH correct: 503 is the honest answer when Mongo
    // is unreachable, which it is in this environment. What matters is
    // that it answers rather than throwing, and that it reports the
    // checks it ran.
    const { GET } = await import('@/app/api/health/ready/route');
    const res = await GET();

    expect([200, 503]).toContain(res.status);

    const body = await res.json();
    expect(body.checks).toBeDefined();
    expect(body.checks.database).toBeDefined();
    expect(body.checks.redis).toBeDefined();
  });

  it('readiness never puts a connection string in its error text', async () => {
    // The check captures `String(error)` from a failed connect, which is
    // exactly where a driver can echo the URI back -- credentials and
    // all.
    const { GET } = await import('@/app/api/health/ready/route');
    const body = JSON.stringify(await (await GET()).json());

    expect(body).not.toMatch(/mongodb(\+srv)?:\/\/[^"]*:[^"@]*@/);
    expect(body.toLowerCase()).not.toContain('password');
  });
});

describe('E2E smoke: authentication flow', () => {
  it('a protected route refuses an anonymous caller with 401', async () => {
    // THE assertion this suite exists for. Not a mock: the real
    // `withAuth` wrapper resolves a real (absent) auth context and
    // returns the real 401.
    const { GET } = await import('@/app/api/vehicles/route');
    const res = await GET(anonymous('/api/vehicles'));

    expect(res.status).toBe(401);
  });

  it('a protected route refuses a bogus bearer token', async () => {
    // A token that is syntactically plausible but does not verify must
    // be refused the same way as no token -- not accepted, and not a 500.
    const { GET } = await import('@/app/api/vehicles/route');
    const res = await GET(withBogusToken('/api/vehicles'));

    expect(res.status).toBe(401);
  });

  it('refusal carries no stack trace or internal detail', async () => {
    const { GET } = await import('@/app/api/vehicles/route');
    const body = JSON.stringify(await (await GET(anonymous('/api/vehicles'))).json());

    expect(body).not.toContain('at ');
    expect(body).not.toContain('node_modules');
    expect(body.toLowerCase()).not.toContain('secret');
  });

  it('a protected WRITE is refused too, not just a read', async () => {
    // Worth asserting separately: a wrapper applied to GET and forgotten
    // on POST is a live write endpoint, and reads are the ones people
    // remember to test.
    const { POST } = await import('@/app/api/vehicles/route');
    const res = await POST(
      anonymous('/api/vehicles', {
        method: 'POST',
        body: JSON.stringify({ license_plate: 'TEST123' }),
        headers: { 'content-type': 'application/json' },
      })
    );

    expect(res.status).toBe(401);
  });
});

describe('E2E smoke: authorization is separate from authentication', () => {
  it('a cross-tenant observability route refuses an anonymous caller', async () => {
    // Gated on PLATFORM_VIEW, a platform-only permission. Anonymous must
    // fail at authentication before permission is even considered.
    const { GET } = await import('@/app/api/observability/outbox/route');
    const res = await GET(anonymous('/api/observability/outbox'));

    expect(res.status).toBe(401);
  });

  it('the metrics scrape endpoint fails closed without a token', async () => {
    // Phase 7 follow-up: an unset METRICS_SCRAPE_TOKEN previously left
    // every metric servable to anyone who could reach the deployment.
    const saved = process.env.METRICS_SCRAPE_TOKEN;
    delete process.env.METRICS_SCRAPE_TOKEN;

    try {
      const { GET } = await import('@/app/api/observability/metrics/route');
      const res = await GET(anonymous('/api/observability/metrics'));

      // NOT 200. Either a 401 or a 500 misconfiguration answer is
      // correct; serving metrics is not.
      expect(res.status).not.toBe(200);
    } finally {
      if (saved === undefined) delete process.env.METRICS_SCRAPE_TOKEN;
      else process.env.METRICS_SCRAPE_TOKEN = saved;
    }
  });
});

describe('E2E smoke: scheduler endpoints fail closed', () => {
  it('a cron route refuses when CRON_SECRET is unset', async () => {
    // Phase 0, F-1. These routes revoke permission grants, flush the
    // permission cache and enumerate every tenant. An unset secret used
    // to skip the check entirely.
    const saved = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;

    try {
      const { GET } = await import('@/app/api/security/expire-grants/route');
      const res = await GET(anonymous('/api/security/expire-grants'));

      expect(res.status).not.toBe(200);
      // 500, because the fault is ours (unconfigured), not the caller's.
      expect(res.status).toBe(500);
    } finally {
      if (saved === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = saved;
    }
  });

  it('a cron route refuses a wrong secret with 401', async () => {
    const saved = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'the-real-secret';

    try {
      const { GET } = await import('@/app/api/security/expire-grants/route');
      const res = await GET(
        new NextRequest('http://localhost/api/security/expire-grants', {
          headers: { authorization: 'Bearer wrong-secret' },
        })
      );

      expect(res.status).toBe(401);
    } finally {
      if (saved === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = saved;
    }
  });

  it('a cron refusal never echoes the configured secret', async () => {
    const saved = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'super-secret-cron-value';

    try {
      const { GET } = await import('@/app/api/security/expire-grants/route');
      const res = await GET(
        new NextRequest('http://localhost/api/security/expire-grants', {
          headers: { authorization: 'Bearer wrong' },
        })
      );
      const body = JSON.stringify(await res.json());

      expect(body).not.toContain('super-secret-cron-value');
    } finally {
      if (saved === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = saved;
    }
  });
});

describe('E2E smoke: public routes stay reachable', () => {
  it('the version endpoint answers without credentials', async () => {
    // The allowlist in route-auth-conformance.spec.ts claims these are
    // deliberately public. This checks the claim is true rather than
    // aspirational -- a route allow-listed as public that actually 401s
    // is a broken endpoint hiding behind a justification.
    const mod = await import('@/app/api/version/route');
    const res = await (mod.GET as (r: NextRequest) => Promise<Response>)(
      anonymous('/api/version')
    );

    expect(res.status).toBeLessThan(500);
    expect(res.status).not.toBe(401);
  });
});
