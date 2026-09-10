// tests/security/hostile-review-round.spec.ts
//
// ---------------------------------------------------------------------
// SEVEN FINDINGS FROM AN ADVERSARIAL REVIEW, PINNED
// ---------------------------------------------------------------------
// The threat model was a single authenticated, LOW-privileged tenant
// user -- a workshop manager or branch manager in one branch of a
// multi-branch organisation, or an owner of a self-registered
// organisation -- trying to read or write another branch's or another
// tenant's data.
//
//   1  CRITICAL  a published JWT signing secret as a silent fallback
//   2  HIGH      cross-tenant audit ledger via a deprecated flag
//   3  HIGH      cross-tenant security events via the same flag
//   4  HIGH      report exports ran org-wide: scope died at the queue
//   5  HIGH      /api/vehicles/analytics: unscoped, and a cross-tenant
//                $lookup keyed on a plate an attacker can create
//   6  HIGH      the whole work-order module unscoped except create
//   7  MEDIUM    orgUnitId writable on vehicle update with no check
//
// Findings 2, 3 and 6 share one root cause worth stating plainly: a
// capability check was reused as a data-scoping check. `isSuperAdmin`
// is a deprecated alias of `canBypassRbac`, which is TRUE for
// ORGANIZATION_OWNER -- a self-service role. Its declaration says
// "Never use for data scoping" and three controllers did exactly that.
// The last test in this file is a codebase-wide guard against a fourth.

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const readRaw = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Comments quote the code they replaced; match against source only. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const read = (rel: string) => stripComments(readRaw(rel));

// ─────────────────────────────────────────────────────────────────────
// 1. The signing secret
// ─────────────────────────────────────────────────────────────────────
describe('a JWT signing secret has no fallback', () => {
  // Behavioural: the resolver is pure and reads process.env, so it can
  // be exercised directly rather than asserted about as text.
  //
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const secrets = require('../../infrastructure/security/jwt-secrets');

  const withEnv = (value: string | undefined, fn: () => void) => {
    const previous = process.env.NEXTAUTH_SECRET;
    if (value === undefined) delete process.env.NEXTAUTH_SECRET;
    else process.env.NEXTAUTH_SECRET = value;
    try {
      fn();
    } finally {
      if (previous === undefined) delete process.env.NEXTAUTH_SECRET;
      else process.env.NEXTAUTH_SECRET = previous;
    }
  };

  it('throws when unset, in EVERY environment', () => {
    /*
      The guard this replaced was `if (NODE_ENV === 'production')` and
      it only logged. NODE_ENV is not a security boundary: a staging
      box, a preview deployment or a container started without its env
      file all sail past it, and each talks to a real database. So the
      test asserts the behaviour with NODE_ENV untouched.
    */
    withEnv(undefined, () => {
      expect(() => secrets.getAccessSecret()).toThrow(/NEXTAUTH_SECRET is not set/);
    });
  });

  it('throws on the literal that used to be the fallback', () => {
    // Setting the variable TO the published default is the same
    // exposure as leaving it unset, and is the likelier mistake once a
    // guard exists.
    withEnv('default-secret-change-in-production', () => {
      expect(() => secrets.getAccessSecret()).toThrow(/published in this repository/);
    });
  });

  it('throws on a secret short enough to brute-force offline', () => {
    withEnv('short', () => {
      expect(() => secrets.getAccessSecret()).toThrow(/brute-forceable/);
    });
  });

  it('accepts a real secret', () => {
    withEnv('a'.repeat(44), () => {
      expect(secrets.getAccessSecret()).toBe('a'.repeat(44));
    });
  });

  it('no source file resolves a signing secret any other way', () => {
    /*
      The original defect existed in TWO files with the same literal --
      the Node signer and the Edge verifier -- and the Edge one had no
      guard at all. One resolver is what keeps them from drifting again.
    */
    const offenders: string[] = [];
    for (const rel of [
      'infrastructure/security/token.service.ts',
      'infrastructure/security/edge-token-verify.ts',
    ]) {
      const src = read(rel);
      if (/process\.env\.(NEXTAUTH_SECRET|REFRESH_TOKEN_SECRET)\s*\|\|/.test(src)) {
        offenders.push(rel);
      }
    }
    expect({ inlineFallbacks: offenders }).toEqual({ inlineFallbacks: [] });
  });

  it('the refresh secret is separate from the access secret', () => {
    // Different lifetimes, different blast radii. Defaulting one to the
    // other means a leaked access secret also mints refresh tokens.
    const src = read('infrastructure/security/jwt-secrets.ts');
    expect(src).toMatch(/REFRESH_TOKEN_SECRET/);
    expect(src).not.toMatch(/REFRESH_TOKEN_SECRET\s*\|\|\s*process\.env\.NEXTAUTH_SECRET/);
  });

  it('the deployment configs supply both', () => {
    // The app now refuses to start without REFRESH_TOKEN_SECRET, so a
    // config that sets only NEXTAUTH_SECRET is a broken deploy.
    expect(readRaw('docker-compose.yml')).toMatch(/REFRESH_TOKEN_SECRET/);
    expect(readRaw('.github/workflows/ci.yml')).toMatch(/REFRESH_TOKEN_SECRET/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2 + 3. The deprecated-alias leaks
// ─────────────────────────────────────────────────────────────────────
describe('security reads are gated on platform admin, not on RBAC bypass', () => {
  it('the audit log scopes on isPlatformAdmin', () => {
    /*
      `context.isSuperAdmin ? filters.tenantId : context.tenantId` let
      any ORGANIZATION_OWNER pass ?tenantId=<victim-slug> and receive
      that organisation's entire audit ledger. Creating an organisation
      carries no permission, so the attack cost was one signup.
    */
    const src = read('modules/security/controllers/audit-log.controller.ts');
    expect(src).not.toMatch(/context\.isSuperAdmin/);
    expect(src).toMatch(/context\.isPlatformAdmin \? filters\.tenantId : context\.tenantId/);
    expect(src).toMatch(/!context\.isPlatformAdmin && entry\.tenantId !== context\.tenantId/);
  });

  it('threat events and lockouts scope on isPlatformAdmin', () => {
    // Worse than the audit log: the fallback was `undefined`, and both
    // repositories apply the tenant predicate only when it is truthy --
    // so an org owner did not even have to name a target tenant.
    const src = read('modules/security/controllers/threat-detection.controller.ts');
    expect(src).not.toMatch(/context\.isSuperAdmin/);
    expect(src).toMatch(/context\.isPlatformAdmin \? undefined : context\.tenantId/);
  });

  it('the premise holds: isSuperAdmin is still true for a non-platform role', () => {
    // If this ever stops being true the two tests above stop meaning
    // what they say, so the reason for them is pinned alongside them.
    const ctx = read('server/auth/auth-context.ts');
    expect(ctx).toMatch(/canBypassRbac\s*=\s*isPlatformAdmin \|\| roles\.includes\(Role\.ORGANIZATION_OWNER\)/);
    expect(ctx).toMatch(/isSuperAdmin: canBypassRbac/);
  });

  it('NO controller anywhere scopes a data read on isSuperAdmin', () => {
    /*
      The codebase-wide guard. `isSuperAdmin` remains legitimate for
      CAPABILITY decisions (may this user hard-delete, may they manage
      any session) -- what it may never do is decide WHICH ROWS come
      back. The two are distinguishable in text: a scoping use puts the
      flag next to a tenantId.
    */
    function walk(dir: string, out: string[] = []): string[] {
      if (!fs.existsSync(dir)) return out;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        if (entry.name === '__tests__') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (entry.name.endsWith('.controller.ts')) out.push(full);
      }
      return out;
    }

    const offenders: string[] = [];
    for (const file of walk(path.join(ROOT, 'modules'))) {
      const src = stripComments(fs.readFileSync(file, 'utf8'));
      const pattern = /isSuperAdmin[^\n;]{0,80}tenantId/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(src))) {
        offenders.push(
          `${path.relative(ROOT, file)}:${src.slice(0, match.index).split('\n').length}`
        );
      }
    }

    expect({ tenantScopedOnRbacBypass: offenders }).toEqual({ tenantScopedOnRbacBypass: [] });
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. Scope across the queue boundary
// ─────────────────────────────────────────────────────────────────────
describe('a report export carries the requester scope into the worker', () => {
  it('the scope is frozen onto the execution record at request time', () => {
    /*
      The controller resolved a TenantContext (and its comment says why)
      and `generate()` accepted it as a parameter it never read. The
      file is produced later, in a worker, in another process, so the
      engine got `undefined` -- and `orgUnitPredicate`'s
      `if (!context) return {}` made every DOWNLOADED export
      organization-wide while the on-screen preview stayed scoped.
    */
    const service = read('modules/reporting/services/report-execution.service.ts');
    expect(service).toMatch(/requestedOrgUnitIds: context \? context\.accessibleOrgUnitIds : null/);
    expect(service).toMatch(/rehydrateScope/);
    expect(service).toMatch(/const scope = context \?\? this\.rehydrateScope\(execution, tenantId\)/);
  });

  it('rehydration FAILS CLOSED on a record written before the field existed', () => {
    // `undefined` must become `[]` (matches nothing), never `null`
    // (org-wide) -- otherwise the leak is preserved for exactly the
    // rows already in flight.
    const service = read('modules/reporting/services/report-execution.service.ts');
    expect(service).toMatch(/execution\.requestedOrgUnitIds === undefined \? \[\] : execution\.requestedOrgUnitIds/);
  });

  it('a SCHEDULED report freezes the creator scope onto the job too', () => {
    // The recurring path is worse than the ad-hoc one, because its
    // output is emailed to a recipient list.
    const scheduler = read('modules/reporting/services/report-scheduler.service.ts');
    expect(scheduler).toMatch(/accessibleOrgUnitIds: string\[\] \| null/);
    expect(scheduler).toMatch(/orgUnitIds: accessibleOrgUnitIds/);

    const worker = read('workers/report-execution.worker.ts');
    expect(worker).toMatch(/payload\.orgUnitIds/);

    const service = read('modules/reporting/services/report-execution.service.ts');
    expect(service).toMatch(/requestedOrgUnitIds === undefined \? \[\] : requestedOrgUnitIds/);
  });

  it('every syncSchedule caller passes a resolved scope', () => {
    for (const rel of [
      'modules/reporting/controllers/report-definition.controller.ts',
      'app/api/reports/schedule/route.ts',
    ]) {
      const src = read(rel);
      expect({ file: rel, resolves: src.includes('scheduleContext.accessibleOrgUnitIds') }).toEqual({
        file: rel,
        resolves: true,
      });
    }
  });

  it('the premise holds: the engine treats a missing context as org-wide', () => {
    // This is what made the dropped context a leak rather than an
    // inconvenience, so it is pinned rather than assumed.
    const engine = read('modules/reporting/services/report-query.engine.ts');
    expect(engine).toMatch(/if \(!context\) return \{\}/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. The analytics endpoint
// ─────────────────────────────────────────────────────────────────────
describe('vehicle analytics is scoped, inside and out', () => {
  it('the CQRS path carries a TenantContext end to end', () => {
    // The repository method had always accepted a context; the query,
    // handler and service between the controller and it had no
    // parameter to carry one, so it arrived undefined and the aggregate
    // ran organization-wide.
    expect(read('modules/vehicles/queries/get-vehicle-analytics.query.ts')).toMatch(
      /context\?: TenantContext/
    );
    expect(read('modules/vehicles/queries/handlers/get-vehicle-analytics.handler.ts')).toMatch(
      /query\.context/
    );
    expect(read('modules/vehicles/services/vehicle-query.service.ts')).toMatch(
      /new GetVehicleAnalyticsQuery\(tenantId, startDate, endDate, context\)/
    );
    expect(read('modules/vehicles/controllers/vehicle.controller.ts')).toMatch(
      /getVehicleAnalytics\(\s*tenantId,\s*startDate,\s*endDate,\s*tenantContext\s*\)/
    );
  });

  it('no $lookup sub-pipeline joins on a plate without a tenant predicate', () => {
    /*
      The exploit: `license_plate` is not globally unique and an
      attacker can simply CREATE a colliding one. Register an
      organisation (self-service), add a vehicle carrying the target's
      plate, call the endpoint, and read that tenant's totalExpenses,
      totalFuelCost and totalFuelVolume.

      A $lookup sub-pipeline is a fresh query over the whole joined
      collection; the outer $match does not reach into it.
    */
    const src = read('modules/vehicles/repositories/vehicle.repository.ts');
    const subPipelines = src.match(/let: \{ plate: '\$license_plate' \},[\s\S]{0,700}?as: '/g) ?? [];

    expect(subPipelines.length).toBeGreaterThanOrEqual(3);
    subPipelines.forEach((block, i) => {
      const scoped = /joinScope|isSuperAdmin \? \{\} : \{ tenantId \}/.test(block);
      expect({ subPipeline: i, tenantScoped: scoped }).toEqual({ subPipeline: i, tenantScoped: true });
    });
  });

  it('the analytics join narrows by org unit as well as tenant', () => {
    // Without it a branch-scoped caller sees their own branch's
    // vehicles carrying costs summed across every branch -- a subtler
    // leak, and a wrong number besides.
    const src = read('modules/vehicles/repositories/vehicle.repository.ts');
    expect(src).toMatch(/const joinScope[\s\S]{0,300}buildFilter\(context, 'orgUnitId'\)/);
  });

  it('the trip cost joins carry the tenant too', () => {
    const src = read('modules/trips/repositories/trip.repository.ts');
    const blocks = src.match(/let: \{ tripId: \{ \$toString: '\$_id' \} \},[\s\S]{0,500}?as: '/g) ?? [];
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    for (const block of blocks) {
      expect(/isSuperAdmin \? \{\} : \{ tenantId \}/.test(block)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 6. Work orders
// ─────────────────────────────────────────────────────────────────────
describe('every work-order operation is org-unit scoped', () => {
  it('the controller resolves a TenantContext everywhere, not a bare tenantId', () => {
    /*
      `create` was scope-checked and nothing else was. A workshop
      manager scoped to one workshop could list every branch's job
      queue with its costs, cancel another branch's work orders, and
      consume another branch's spare-part stock.
    */
    const src = read('modules/workorders/controllers/workorder.controller.ts');
    expect(src).not.toMatch(/getTenantFromRequest/);
    expect((src.match(/resolveTenantContext\(req\)/g) ?? []).length).toBeGreaterThanOrEqual(7);
  });

  it('the list endpoint uses the scoped repository query', () => {
    // `getFilteredInScope` existed all along and only the attention
    // queue used it, while the list endpoint itself ran unscoped.
    const controller = read('modules/workorders/controllers/workorder.controller.ts');
    expect(controller).toMatch(/workOrderService\.listInScope\(/);

    const service = read('modules/workorders/services/workorder.service.ts');
    expect(service).toMatch(/listInScope[\s\S]{0,300}getFilteredInScope/);
  });

  it('every by-id operation asserts scope before acting', () => {
    const service = read('modules/workorders/services/workorder.service.ts');
    expect(service).toMatch(/private assertInScope/);
    expect(service).toMatch(/canAccessRecord/);

    // One call per by-id operation: get, assign, changeStatus,
    // consumeParts, recordLabor.
    const calls = (service.match(/this\.assertInScope\(/g) ?? []).length;
    expect({ assertInScopeCalls: calls }).toEqual({ assertInScopeCalls: 5 });
  });

  it('consumeParts checks scope BEFORE it moves stock', () => {
    // The check has to precede the side effect: inventory movement is
    // not undone by a later throw.
    const service = readRaw('modules/workorders/services/workorder.service.ts');
    const body = service.slice(service.indexOf('async consumeParts('));
    const assertAt = body.indexOf('this.assertInScope(');
    const consumeAt = body.indexOf('inventoryService.consumeStock(');
    expect(assertAt).toBeGreaterThan(-1);
    expect(consumeAt).toBeGreaterThan(assertAt);
  });

  it('an out-of-scope work order reads as NOT FOUND, never FORBIDDEN', () => {
    // A 403 confirms the record exists, which is itself a disclosure
    // across the boundary the caller may not see across.
    const service = read('modules/workorders/services/workorder.service.ts');
    expect(service).toMatch(/assertInScope[\s\S]{0,200}NotFoundError\('Work order not found'\)/);
    expect(service).not.toMatch(/assertInScope[\s\S]{0,200}ForbiddenError/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 7. Mass assignment
// ─────────────────────────────────────────────────────────────────────
describe('orgUnitId cannot be reassigned outside the caller scope', () => {
  it('vehicle update routes the field through the same resolver as create', () => {
    /*
      `orgUnitId` is on UpdateVehicleHandler's ALLOWED_FIELDS and was
      copied straight from the body. A branch manager could move a
      vehicle -- and its whole cost history -- into a branch they
      cannot see: indistinguishable from data loss to the branch that
      owned it.

      The CREATE path already refused this via
      `resolveCreationOrgUnitId`. Reusing it, rather than writing a
      second rule, is what keeps create and update from disagreeing.
    */
    const src = read('modules/vehicles/controllers/vehicle.controller.ts');
    expect(src).toMatch(/'orgUnitId' in body[\s\S]{0,300}resolveCreationOrgUnitId\(\s*tenantContext,/);
  });

  it('the resolver it reuses still refuses an out-of-scope unit', () => {
    const utils = read('server/utils/tenant-context.utils.ts');
    expect(utils).toMatch(
      /accessibleOrgUnitIds\.includes\(requested\)[\s\S]{0,200}ForbiddenError/
    );
  });

  it('an update that never mentions orgUnitId is untouched', () => {
    // The guard is inside an `in body` test, so an ordinary edit does
    // not acquire an org-unit resolution it never asked for -- which
    // would fail for a caller with no assignment.
    const src = read('modules/vehicles/controllers/vehicle.controller.ts');
    const update = src.slice(src.indexOf('async updateVehicle('));
    const guardAt = update.indexOf("'orgUnitId' in body");
    const resolveAt = update.indexOf('resolveCreationOrgUnitId');

    // The resolver call must sit INSIDE the presence guard, not before
    // it: an unconditional call would make every ordinary edit acquire
    // an org-unit resolution it never asked for, which throws outright
    // for a caller who has no assignment.
    expect(guardAt).toBeGreaterThan(-1);
    expect(resolveAt).toBeGreaterThan(guardAt);
  });
});
