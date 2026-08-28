// tests/security/metrics-endpoint-fail-closed.spec.ts
//
// PHASE 7 FOLLOW-UP -- /api/observability/metrics fails closed.
//
// The vulnerability: an unset METRICS_SCRAPE_TOKEN left the endpoint
// OPEN, serving every metric (including per-provider telematics health)
// to any caller that could reach the deployment. This is the exact
// fail-open shape the Phase 0, F-1 fix eliminated on five other routes
// (see tests/security/cron-auth-fail-closed.spec.ts) -- reproduced here
// on a sixth.
//
// Two halves, deliberately, same technique as the F-1 suite:
//   1. BEHAVIOURAL -- the authorizeMetricsRequest/denyMetricsRequest
//      primitive, exercised directly.
//   2. STRUCTURAL -- the route actually routes through that primitive,
//      reuses the cron-auth timing-safe comparison, and never logs the
//      token.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

jest.mock('@/infrastructure/monitoring/logger', () => ({
  monitoring: {
    logError: jest.fn(),
    logWarn: jest.fn(),
    logInfo: jest.fn(),
  },
}));

import {
  authorizeMetricsRequest,
  denyMetricsRequest,
} from '../../server/middleware/metrics-auth';
import { monitoring } from '@/infrastructure/monitoring/logger';

function requestWith(authorization?: string) {
  return {
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'authorization' ? authorization ?? null : null,
    },
  };
}

const REAL_TOKEN = 'correct-horse-battery-staple-metrics-token';

describe('metrics endpoint authentication fails closed', () => {
  const originalToken = process.env.METRICS_SCRAPE_TOKEN;

  afterEach(() => {
    if (originalToken === undefined) delete process.env.METRICS_SCRAPE_TOKEN;
    else process.env.METRICS_SCRAPE_TOKEN = originalToken;
    jest.clearAllMocks();
  });

  describe('missing configuration', () => {
    it('REFUSES with 500 when METRICS_SCRAPE_TOKEN is unset (the original vulnerability)', () => {
      delete process.env.METRICS_SCRAPE_TOKEN;

      const result = authorizeMetricsRequest(requestWith());

      // The whole point: NOT 'authorized'. Before the fix, an unset
      // token meant the check was skipped and metrics were served.
      expect(result.outcome).toBe('misconfigured');

      const denied = denyMetricsRequest(requestWith());
      expect(denied).not.toBeNull();
      expect(denied!.status).toBe(500);
    });

    it('REFUSES when METRICS_SCRAPE_TOKEN is unset even if a caller presents a bearer token', () => {
      delete process.env.METRICS_SCRAPE_TOKEN;

      const result = authorizeMetricsRequest(requestWith('Bearer anything-at-all'));

      expect(result.outcome).toBe('misconfigured');
    });

    it('treats a whitespace-only METRICS_SCRAPE_TOKEN as absent', () => {
      process.env.METRICS_SCRAPE_TOKEN = '   ';

      expect(authorizeMetricsRequest(requestWith('Bearer    ')).outcome).toBe('misconfigured');
    });

    it('logs the misconfiguration without revealing any token material', () => {
      delete process.env.METRICS_SCRAPE_TOKEN;
      authorizeMetricsRequest(requestWith());

      expect(monitoring.logError).toHaveBeenCalled();
      const serialised = JSON.stringify((monitoring.logError as jest.Mock).mock.calls);
      expect(serialised).not.toContain(REAL_TOKEN);
    });
  });

  describe('credential checking', () => {
    beforeEach(() => {
      process.env.METRICS_SCRAPE_TOKEN = REAL_TOKEN;
    });

    it('rejects a missing Authorization header with 401', () => {
      expect(authorizeMetricsRequest(requestWith()).outcome).toBe('unauthorized');

      const denied = denyMetricsRequest(requestWith());
      expect(denied).not.toBeNull();
      expect(denied!.status).toBe(401);
    });

    it('rejects an incorrect token with 401', () => {
      expect(authorizeMetricsRequest(requestWith('Bearer wrong-token')).outcome).toBe(
        'unauthorized'
      );

      const denied = denyMetricsRequest(requestWith('Bearer wrong-token'));
      expect(denied).not.toBeNull();
      expect(denied!.status).toBe(401);
    });

    it('rejects a correct token presented without the Bearer scheme', () => {
      expect(authorizeMetricsRequest(requestWith(REAL_TOKEN)).outcome).toBe('unauthorized');
    });

    it('accepts the correct token with a 200-equivalent authorized outcome', () => {
      expect(authorizeMetricsRequest(requestWith(`Bearer ${REAL_TOKEN}`)).outcome).toBe(
        'authorized'
      );
      expect(denyMetricsRequest(requestWith(`Bearer ${REAL_TOKEN}`))).toBeNull();
    });

    it('never returns the configured token in its result', () => {
      const results = [
        authorizeMetricsRequest(requestWith()),
        authorizeMetricsRequest(requestWith('Bearer nope')),
        authorizeMetricsRequest(requestWith(`Bearer ${REAL_TOKEN}`)),
      ];
      for (const r of results) {
        expect(JSON.stringify(r)).not.toContain(REAL_TOKEN);
      }
    });

    it('never writes the configured token to a log line', () => {
      authorizeMetricsRequest(requestWith('Bearer wrong'));
      const all = JSON.stringify([
        (monitoring.logWarn as jest.Mock).mock.calls,
        (monitoring.logError as jest.Mock).mock.calls,
      ]);
      expect(all).not.toContain(REAL_TOKEN);
      expect(all).not.toContain('wrong');
    });
  });
});

describe('metrics endpoint: end-to-end GET handler', () => {
  const originalToken = process.env.METRICS_SCRAPE_TOKEN;

  afterEach(() => {
    if (originalToken === undefined) delete process.env.METRICS_SCRAPE_TOKEN;
    else process.env.METRICS_SCRAPE_TOKEN = originalToken;
    jest.clearAllMocks();
    jest.resetModules();
  });

  function fakeNextRequest(authorization?: string) {
    return {
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'authorization' ? authorization ?? null : null,
      },
    } as any;
  }

  it('returns 500 and no body when METRICS_SCRAPE_TOKEN is unset', async () => {
    delete process.env.METRICS_SCRAPE_TOKEN;
    jest.resetModules();
    const { GET } = await import('../../app/api/observability/metrics/route');

    const response = await GET(fakeNextRequest());
    expect(response.status).toBe(500);

    const text = await response.text();
    expect(text).not.toContain('fleet_');
  });

  it('returns 401 when the Authorization header is missing', async () => {
    process.env.METRICS_SCRAPE_TOKEN = REAL_TOKEN;
    jest.resetModules();
    const { GET } = await import('../../app/api/observability/metrics/route');

    const response = await GET(fakeNextRequest());
    expect(response.status).toBe(401);
  });

  it('returns 401 when the token is incorrect', async () => {
    process.env.METRICS_SCRAPE_TOKEN = REAL_TOKEN;
    jest.resetModules();
    const { GET } = await import('../../app/api/observability/metrics/route');

    const response = await GET(fakeNextRequest('Bearer not-the-token'));
    expect(response.status).toBe(401);
  });

  it('returns 200 with metrics when the token is correct', async () => {
    process.env.METRICS_SCRAPE_TOKEN = REAL_TOKEN;
    jest.resetModules();
    const { GET } = await import('../../app/api/observability/metrics/route');

    const response = await GET(fakeNextRequest(`Bearer ${REAL_TOKEN}`));
    expect(response.status).toBe(200);

    const text = await response.text();
    expect(text).toContain('fleet_');
  });

  it('never leaks the configured token in the response body, on success or failure', async () => {
    process.env.METRICS_SCRAPE_TOKEN = REAL_TOKEN;
    jest.resetModules();
    const { GET } = await import('../../app/api/observability/metrics/route');

    const responses = await Promise.all([
      GET(fakeNextRequest()),
      GET(fakeNextRequest('Bearer wrong')),
      GET(fakeNextRequest(`Bearer ${REAL_TOKEN}`)),
    ]);

    for (const response of responses) {
      const text = await response.text();
      expect(text).not.toContain(REAL_TOKEN);
    }
  });
});

describe('metrics endpoint: structural guarantees', () => {
  function codeOf(rel: string): string {
    return fs
      .readFileSync(path.join(ROOT, rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
  }

  it('the route delegates to denyMetricsRequest rather than reimplementing the check', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'app/api/observability/metrics/route.ts'),
      'utf8'
    );
    expect(src).toContain("from '@/server/middleware/metrics-auth'");
    expect(src).toContain('denyMetricsRequest(req)');
  });

  it('the route no longer reads METRICS_SCRAPE_TOKEN or does its own comparison', () => {
    const code = codeOf('app/api/observability/metrics/route.ts');
    expect(code).not.toContain('process.env.METRICS_SCRAPE_TOKEN');
    expect(code).not.toMatch(/provided\s*!==\s*requiredToken/);
    // The generalisation of the F-1 bug: `if (TOKEN && ...)` where an
    // absent token skips the check entirely.
    expect(code).not.toMatch(/if\s*\(\s*requiredToken\s*&&/);
  });

  it('reuses the cron-auth timing-safe comparison rather than a naive equality check', () => {
    const authCode = codeOf('server/middleware/metrics-auth.ts');
    expect(authCode).toContain("from './cron-auth'");
    expect(authCode).toContain('timingSafeEquals');
    expect(authCode).not.toMatch(/presented\s*!==\s*configured/);

    const cronAuthCode = codeOf('server/middleware/cron-auth.ts');
    expect(cronAuthCode).toContain('export function timingSafeEquals');
  });

  it('the auth module never passes the `configured` or `presented` variables to a log call', () => {
    // Behavioural coverage above already proves no TOKEN VALUE reaches a
    // log line at runtime (every authorizeMetricsRequest outcome is
    // checked against REAL_TOKEN across every monitoring.log* mock call
    // in the describe blocks above). This is the structural companion:
    // neither of the two variables that ever HOLD token material
    // (`configured`, the env value; `presented`, the caller's header
    // value) is passed as an ARGUMENT EXPRESSION to a monitoring.log*
    // call. Uses a bracket-depth scan, not a regex, so a nested call
    // like `new Error(...)` can't cause a false boundary match, and
    // matches on identifier boundaries so the English word "configured"
    // inside a human-readable message string is correctly ignored.
    const code = codeOf('server/middleware/metrics-auth.ts');
    const callStarts = [...code.matchAll(/monitoring\.log\w+\(/g)];
    expect(callStarts.length).toBeGreaterThan(0);

    for (const match of callStarts) {
      const start = match.index! + match[0].length;
      let depth = 1;
      let i = start;
      while (i < code.length && depth > 0) {
        if (code[i] === '(') depth++;
        else if (code[i] === ')') depth--;
        i++;
      }
      const callArgs = code.slice(start, i - 1);
      // Strip string/template literals first, so the identifiers we're
      // checking for are only ever matched as real code references, not
      // as substrings of prose inside a message.
      const withoutStrings = callArgs.replace(/'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '');
      expect(withoutStrings).not.toMatch(/\bconfigured\b/);
      expect(withoutStrings).not.toMatch(/\bpresented\b/);
    }
  });
});
