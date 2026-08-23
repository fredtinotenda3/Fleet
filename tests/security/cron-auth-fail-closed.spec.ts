// tests/security/cron-auth-fail-closed.spec.ts
//
// PHASE 0, F-1 regression suite.
//
// The vulnerability: five scheduler-invoked routes each carried
//
//   if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) return 401;
//
// so an UNSET CRON_SECRET skipped authentication entirely. Among the
// five: /api/workflows/process-timeouts enumerates every active tenant
// and returns the list, and /api/security/expire-grants mutates
// authorization grants and flushes the global permission cache.
//
// Two halves to this suite, deliberately:
//
//   1. BEHAVIOURAL tests of the shared primitive -- the actual decision
//      logic, exercised directly.
//   2. STRUCTURAL tests asserting every one of the five routes routes
//      THROUGH that primitive and that the fail-open pattern appears
//      nowhere in app/. Behavioural tests of the primitive cannot catch
//      a sixth route that reimplements the old check by hand, and that
//      is precisely how this bug spread to five routes in the first
//      place. Same technique as module-scope-conformance.spec.ts, which
//      is the pattern in this codebase with a track record.

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

import { authorizeCronRequest } from '../../server/middleware/cron-auth';
import { monitoring } from '@/infrastructure/monitoring/logger';

function requestWith(authorization?: string) {
  return {
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'authorization' ? authorization ?? null : null,
    },
  };
}

const REAL_SECRET = 'correct-horse-battery-staple-cron-secret';

describe('F-1: cron authentication fails closed', () => {
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
    jest.clearAllMocks();
  });

  describe('missing configuration', () => {
    it('REFUSES when CRON_SECRET is unset (the original vulnerability)', () => {
      delete process.env.CRON_SECRET;

      const result = authorizeCronRequest(requestWith(), '/test');

      // The whole point: NOT 'authorized'. Before the fix, an unset
      // secret meant the check was skipped and the operation ran.
      expect(result.outcome).toBe('misconfigured');
    });

    it('REFUSES when CRON_SECRET is unset even if a caller presents a bearer token', () => {
      delete process.env.CRON_SECRET;

      const result = authorizeCronRequest(requestWith('Bearer anything-at-all'), '/test');

      expect(result.outcome).toBe('misconfigured');
    });

    it('treats a whitespace-only CRON_SECRET as absent', () => {
      // A dashboard-entered "  " would otherwise satisfy a presence
      // check while being trivially guessable -- worse than an honest
      // misconfiguration because it LOOKS configured.
      process.env.CRON_SECRET = '   ';

      expect(authorizeCronRequest(requestWith('Bearer    '), '/test').outcome).toBe(
        'misconfigured'
      );
    });

    it('logs the misconfiguration without revealing any secret material', () => {
      delete process.env.CRON_SECRET;
      authorizeCronRequest(requestWith(), '/test');

      expect(monitoring.logError).toHaveBeenCalled();
      const serialised = JSON.stringify((monitoring.logError as jest.Mock).mock.calls);
      expect(serialised).not.toContain(REAL_SECRET);
    });
  });

  describe('credential checking', () => {
    beforeEach(() => {
      process.env.CRON_SECRET = REAL_SECRET;
    });

    it('rejects a missing Authorization header', () => {
      expect(authorizeCronRequest(requestWith(), '/test').outcome).toBe('unauthorized');
    });

    it('rejects an incorrect secret', () => {
      expect(
        authorizeCronRequest(requestWith('Bearer wrong-secret'), '/test').outcome
      ).toBe('unauthorized');
    });

    it('rejects a correct secret presented without the Bearer scheme', () => {
      expect(authorizeCronRequest(requestWith(REAL_SECRET), '/test').outcome).toBe(
        'unauthorized'
      );
    });

    it('rejects a secret that is a prefix of the real one', () => {
      expect(
        authorizeCronRequest(
          requestWith(`Bearer ${REAL_SECRET.slice(0, -1)}`),
          '/test'
        ).outcome
      ).toBe('unauthorized');
    });

    it('rejects a secret with the real one as its prefix', () => {
      expect(
        authorizeCronRequest(requestWith(`Bearer ${REAL_SECRET}x`), '/test').outcome
      ).toBe('unauthorized');
    });

    it('accepts the correct secret', () => {
      expect(
        authorizeCronRequest(requestWith(`Bearer ${REAL_SECRET}`), '/test').outcome
      ).toBe('authorized');
    });

    it('never returns the configured secret in its result', () => {
      const results = [
        authorizeCronRequest(requestWith(), '/test'),
        authorizeCronRequest(requestWith('Bearer nope'), '/test'),
        authorizeCronRequest(requestWith(`Bearer ${REAL_SECRET}`), '/test'),
      ];
      for (const r of results) {
        expect(JSON.stringify(r)).not.toContain(REAL_SECRET);
      }
    });

    it('never writes the configured secret to a log line', () => {
      authorizeCronRequest(requestWith('Bearer wrong'), '/test');
      const all = JSON.stringify([
        (monitoring.logWarn as jest.Mock).mock.calls,
        (monitoring.logError as jest.Mock).mock.calls,
      ]);
      expect(all).not.toContain(REAL_SECRET);
      expect(all).not.toContain('wrong');
    });
  });

  describe('timing-safe comparison', () => {
    it('uses crypto.timingSafeEqual rather than string equality', () => {
      // Structural: a naive `!==` short-circuits at the first differing
      // byte, leaking the length of the shared prefix and making the
      // secret recoverable byte-by-byte by a caller who can measure
      // response time.
      //
      // Comments are stripped before matching: this file's own doc
      // comment QUOTES the vulnerable idiom in order to explain it, and
      // an assertion that cannot tell code from prose would either fail
      // on the explanation or force the explanation to be deleted.
      const raw = fs.readFileSync(
        path.join(ROOT, 'server/middleware/cron-auth.ts'),
        'utf8'
      );
      const code = raw
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

      expect(code).toContain('timingSafeEqual');
      expect(code).not.toMatch(/presented\s*!==\s*configured/);
      expect(code).not.toMatch(/authHeader\s*!==\s*`Bearer/);
    });
  });
});

describe('F-1: every scheduled route uses the shared fail-closed guard', () => {
  const CRON_ROUTES = [
    'app/api/security/expire-grants/route.ts',
    'app/api/reminders/update-status/route.ts',
    'app/api/reminders/notify-overdue/route.ts',
    'app/api/cron/eagletrack-sync/route.ts',
    'app/api/workflows/process-timeouts/route.ts',
  ];

  it.each(CRON_ROUTES)('%s calls denyCronRequest', (rel) => {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    expect(src).toContain("from '@/server/middleware/cron-auth'");
    expect(src).toContain('denyCronRequest(req');
  });

  it.each(CRON_ROUTES)('%s no longer reads CRON_SECRET directly', (rel) => {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    expect(src).not.toContain('process.env.CRON_SECRET');
  });

  it('the fail-open pattern appears nowhere under app/', () => {
    // The generalisation of the bug: `if (SECRET && ...)` where an
    // absent secret skips the check. This is what would fail if someone
    // reintroduced the old idiom on a sixth route.
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === 'route.ts') {
          const src = fs.readFileSync(full, 'utf8');
          if (/if\s*\(\s*CRON_SECRET\s*&&/.test(src)) {
            offenders.push(path.relative(ROOT, full));
          }
        }
      }
    };
    walk(path.join(ROOT, 'app/api'));

    expect(offenders).toEqual([]);
  });
});
