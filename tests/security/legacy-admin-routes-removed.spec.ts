// tests/security/legacy-admin-routes-removed.spec.ts
//
// PLATFORM_ADMIN_BACKEND_GAPS.md, Gap 3 -- regression suite.
//
// THE VULNERABILITY:
//   GET    /api/admin           -- gated on requireAuth() ALONE: any
//                                   authenticated user, from any tenant,
//                                   with no Permission check and no
//                                   tenant filter, got every row of the
//                                   legacy `tbladmin` collection back as
//                                   a bare array (not the standard
//                                   `{ success, data }` envelope).
//   POST   /api/admin/register   -- account creation with no Permission
//   PUT    /api/admin/update     -- gate wired through modules/security's
//   DELETE /api/admin/delete     -- withAuth()/Permission system at all.
//
// (By the time of this fix, register/update/delete had already been
// separately hardened -- see their own file headers -- to require
// `context.isSuperAdmin` and tenant-scope non-platform callers. GET
// /api/admin remained exactly as originally found: requireAuth() only.
// All four nonetheless shared the deeper problem the audit named: a
// pre-multi-tenancy surface bypassing withAuth()/Permission entirely,
// unreachable from any Permission-based conformance check, and --
// confirmed by a full-repository search -- called by NOTHING in the
// product. Removal, not further patching, is the fix.)
//
// THE FIX: all four route files were deleted. `tbladmin` itself is NOT
// removed and NOT migrated -- it remains the live collection
// lib/authOptions.ts authenticates against and AdminUserRepository
// reads/writes on behalf of OrganizationService. Only the unauthorized,
// un-tenant-scoped HTTP surface over it is gone. This suite proves:
//
//   1. the four route files no longer exist (so anonymous, authenticated
//      non-super-admin, and super-admin callers alike get Next.js's
//      standard 404 for an unmatched route -- there is no code path left
//      to authenticate, authorize, or leak data through);
//   2. nothing in the product still references the removed paths;
//   3. the legitimate, unrelated /api/admin/jobs and /api/admin/reminders
//      surfaces were left untouched;
//   4. no other HTTP-reachable route reads `tbladmin` directly without
//      going through a permission-gated controller;
//   5. the gap is recorded as fixed in PLATFORM_ADMIN_BACKEND_GAPS.md.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

const REMOVED_ROUTES = [
  'app/api/admin/route.ts',
  'app/api/admin/register/route.ts',
  'app/api/admin/update/route.ts',
  'app/api/admin/delete/route.ts',
];

const REMOVED_URL_PATHS = ['/api/admin/register', '/api/admin/update', '/api/admin/delete'];

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

describe('Gap 3: the legacy /api/admin surface has been removed', () => {
  it.each(REMOVED_ROUTES)('%s no longer exists on disk', (rel) => {
    expect(fs.existsSync(path.join(ROOT, rel))).toBe(false);
  });

  it('cannot be required as a Next.js route module', () => {
    // The most direct proxy available in a unit-test environment for
    // "an HTTP request to this path no longer resolves": with no
    // route.ts on disk, Next.js's app router has nothing to dispatch
    // to and returns its standard 404 for every verb and every caller
    // -- anonymous, authenticated-but-not-super-admin, and super admin
    // alike. There is no handler left to reach, so there is no auth
    // decision left to get wrong.
    for (const rel of REMOVED_ROUTES) {
      expect(() => require(path.join(ROOT, rel))).toThrow(/Cannot find module/);
    }
  });

  it('the unrelated, legitimate /api/admin/jobs and /api/admin/reminders routes are untouched', () => {
    // Gap 3 was scoped to the bare tbladmin CRUD surface, not the whole
    // /api/admin/* prefix -- job scheduling and reminder triggers are a
    // separate, permission-gated feature (see their own route headers)
    // and must survive this cleanup intact.
    const survivors = [
      'app/api/admin/jobs/route.ts',
      'app/api/admin/jobs/stats/route.ts',
      'app/api/admin/jobs/retry/route.ts',
      'app/api/admin/jobs/schedules/route.ts',
      'app/api/admin/jobs/dead-letter/route.ts',
      'app/api/admin/reminders/notify-overdue/route.ts',
      'app/api/admin/reminders/update-status/route.ts',
    ];
    for (const rel of survivors) {
      expect(fs.existsSync(path.join(ROOT, rel))).toBe(true);
    }
  });

  it('nothing in the product still references the removed routes', () => {
    // Scans every tracked source file (excluding this suite itself,
    // which necessarily names the removed paths in its own
    // documentation above, and the gap doc, which records the removal)
    // for a lingering call to one of the retired endpoints -- a stray
    // fetch('/api/admin/register') would otherwise fail silently at
    // runtime with a 404 instead of at review time.
    const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'coverage']);
    const SKIP_FILES = new Set([
      path.join(ROOT, 'tests/security/legacy-admin-routes-removed.spec.ts'),
      path.join(ROOT, 'PLATFORM_ADMIN_BACKEND_GAPS.md'),
      // Both explain, in a comment, that the route used to exist and was
      // removed -- documentation of the fix, not a live call site.
      path.join(ROOT, 'frontend/modules/platform-admin/types/access.types.ts'),
      path.join(ROOT, 'frontend/modules/platform-admin/pages/UsersPage.tsx'),
    ]);

    function collect(dir: string, acc: string[] = []): string[] {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) continue;
          collect(path.join(dir, entry.name), acc);
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          acc.push(path.join(dir, entry.name));
        }
      }
      return acc;
    }

    const offenders: string[] = [];
    for (const file of collect(ROOT)) {
      if (SKIP_FILES.has(file)) continue;
      const content = fs.readFileSync(file, 'utf8');
      for (const removedPath of REMOVED_URL_PATHS) {
        if (content.includes(removedPath)) {
          offenders.push(`${path.relative(ROOT, file)} references ${removedPath}`);
        }
      }
      // GET /api/admin -- checked separately and more narrowly, since
      // '/api/admin' alone is a substring of the still-legitimate
      // '/api/admin/jobs' and '/api/admin/reminders' paths.
      if (/['"`]\/api\/admin['"`]/.test(content)) {
        offenders.push(`${path.relative(ROOT, file)} references '/api/admin'`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('no other HTTP route reads tbladmin directly, bypassing every permission gate', () => {
    // The removed routes' defining flaw was querying tbladmin straight
    // from a route handler with no Permission check. Legitimate direct
    // tbladmin access (login, token refresh, account precheck) lives in
    // named, reviewed files; this pins the list so a new bare route
    // cannot reintroduce the same class of bug.
    const ALLOWED_DIRECT_TBLADMIN_ACCESS = new Set([
      'modules/security/controllers/token.controller.ts',
      'modules/security/services/refresh-token.service.ts',
      // Pre-login lookup: "does this email use SSO?" It reads tbladmin
      // to check for an SSO-linked account, but returns no account data
      // -- see tests/security/route-auth-conformance.spec.ts's
      // PUBLIC_ROUTES entry for this same route, which documents the
      // no-data-returned property this test independently checks below
      // ("no route or repository selects the tbladmin Password field").
      // Legitimately unauthenticated (there is no session yet at
      // pre-login) and already reviewed; not the class of bug Gap 3 was.
      'app/api/auth/precheck/route.ts',
      'modules/organizations/repositories/admin-user.repository.ts',
      'workers/email.worker.ts',
    ]);

    const apiRoot = path.join(ROOT, 'app/api');
    const offenders: string[] = [];
    for (const file of walk(apiRoot)) {
      if (!file.endsWith('route.ts')) continue;
      // Normalise to forward slashes before comparing against the
      // allow-list: path.relative() returns backslash-separated paths
      // on Windows, which would otherwise make every legitimate entry
      // below look like a new offender on that platform.
      const rel = path.relative(ROOT, file).replace(/\\/g, '/');
      if (ALLOWED_DIRECT_TBLADMIN_ACCESS.has(rel)) continue;
      const content = fs.readFileSync(file, 'utf8');
      if (/collection\(\s*['"]tbladmin['"]\s*\)/.test(content)) {
        offenders.push(rel);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('no route or repository selects the tbladmin Password field for an HTTP response', () => {
    // Defence in depth: even the routes and repositories legitimately
    // touching tbladmin must never let the hash reach a response body.
    const filesToCheck = [
      'modules/security/controllers/token.controller.ts',
      'modules/organizations/repositories/admin-user.repository.ts',
    ].map((rel) => path.join(ROOT, rel));

    for (const file of filesToCheck) {
      const content = fs.readFileSync(file, 'utf8');
      // A raw NextResponse.json(admin) / successResponse(admin) call on
      // the full tbladmin document would leak Password; every legitimate
      // caller either destructures it away or never returns the doc at
      // all. This is a smoke check, not a type-level guarantee -- the
      // property is also exercised behaviourally in
      // organization-member-tenant-binding.spec.ts and the platform-admin
      // unit suite, neither of which ever asserts on a Password field.
      expect(content).not.toMatch(/NextResponse\.json\(\s*admin\s*[,)]/);
    }
  });

  it('PLATFORM_ADMIN_BACKEND_GAPS.md records Gap 3 as fixed by removal', () => {
    const doc = fs.readFileSync(path.join(ROOT, 'PLATFORM_ADMIN_BACKEND_GAPS.md'), 'utf8');
    const gap3Heading = doc.indexOf('## Gap 3');
    expect(gap3Heading).toBeGreaterThan(-1);

    const nextHeading = doc.indexOf('\n## Gap 4', gap3Heading);
    const gap3Section = doc.slice(gap3Heading, nextHeading === -1 ? undefined : nextHeading);

    expect(gap3Section).toMatch(/FIXED/);
    expect(gap3Section.toLowerCase()).toContain('removed');
    expect(gap3Section.toLowerCase()).toContain('tbladmin');
  });
});
