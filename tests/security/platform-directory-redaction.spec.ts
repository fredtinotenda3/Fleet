// tests/security/platform-directory-redaction.spec.ts
//
// The platform directory is the ONE place in this codebase that reads
// across the tenant boundary by design. That inverts the usual risk: a
// secret leaked from a tenant-scoped endpoint exposes one customer, and
// a secret leaked from here exposes every customer at once.
//
// So two properties are asserted:
//
//   1. AUTHORISATION. Every route is gated twice -- withAuth on the
//      permission, and requirePlatformAdmin on the LITERAL
//      Role.SUPER_ADMIN. The second is load-bearing:
//      AuthContext.isSuperAdmin is ALSO true for organization_owner,
//      who is privileged only inside their own tenant.
//
//   2. REDACTION BY ALLOW-LIST. The projections name what is INCLUDED,
//      never what is deleted. A deny-list exposes a field added
//      tomorrow by default; an allow-list omits it by default. That
//      direction is the whole point, and it is what these tests pin.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SERVICE = 'modules/tenancy/services/platform-directory.service.ts';
const CONTROLLER = 'modules/tenancy/controllers/platform.controller.ts';
const serviceSrc = read(SERVICE);
const controllerSrc = read(CONTROLLER);

const ROUTES = [
  'app/api/platform/users/route.ts',
  'app/api/platform/api-keys/route.ts',
  'app/api/platform/roles/route.ts',
];

describe('platform directory: authorisation', () => {
  it.each(ROUTES)('%s requires PLATFORM_VIEW', (route) => {
    const src = read(route);
    expect(src).toMatch(/withAuth\(/);
    expect(src).toMatch(/Permission\.PLATFORM_VIEW/);
  });

  it.each(['listUsers', 'listApiKeys', 'listRoles'])(
    '%s calls requirePlatformAdmin before reading anything',
    (method) => {
      // Order matters: a permission check after the query has already
      // run has read the data. The assertion is that the guard appears
      // before the first service call in the method body.
      const start = controllerSrc.indexOf(`async ${method}(`);
      expect(start).toBeGreaterThan(-1);
      const body = controllerSrc.slice(start, controllerSrc.indexOf('\n  }\n', start));

      const guardAt = body.indexOf('requirePlatformAdmin');
      const readAt = body.indexOf('platformDirectoryService.');
      expect(guardAt).toBeGreaterThan(-1);
      expect(readAt).toBeGreaterThan(-1);
      expect(guardAt).toBeLessThan(readAt);
    }
  );

  it('requirePlatformAdmin checks the LITERAL SUPER_ADMIN role', () => {
    // NOT AuthContext.isSuperAdmin -- that flag is also true for
    // organization_owner, who must never read across tenants.
    expect(controllerSrc).toMatch(/roles\.includes\(Role\.SUPER_ADMIN\)/);
    const guard = controllerSrc.slice(
      controllerSrc.indexOf('async function requirePlatformAdmin'),
      controllerSrc.indexOf('export class PlatformController')
    );
    expect(guard).not.toMatch(/isSuperAdmin/);
  });
});

describe('platform directory: redaction', () => {
  it('REGRESSION: never projects a password field', () => {
    // tbladmin holds `Password`. A cross-tenant listing that included it
    // would hand over every account on the platform in one response.
    expect(serviceSrc).not.toMatch(/Password:\s*1/);
    expect(serviceSrc).not.toMatch(/password:\s*1/);
  });

  it('REGRESSION: never projects an API key hash', () => {
    expect(serviceSrc).not.toMatch(/keyHash:\s*1/);
  });

  it('the PlatformUser type has no credential fields', () => {
    const block = serviceSrc.slice(
      serviceSrc.indexOf('export interface PlatformUser'),
      serviceSrc.indexOf('export interface PlatformApiKey')
    );
    for (const forbidden of ['Password', 'password', 'keyHash', 'secret', 'token', 'mfa']) {
      expect(block.toLowerCase()).not.toContain(forbidden.toLowerCase() + ':');
    }
  });

  it('the PlatformApiKey type exposes the prefix but not the hash', () => {
    const block = serviceSrc.slice(
      serviceSrc.indexOf('export interface PlatformApiKey'),
      serviceSrc.indexOf('export interface PlatformCustomRole')
    );
    expect(block).toContain('keyPrefix');
    expect(block).not.toContain('keyHash');
  });

  it('uses allow-list projections, never delete-after-read', () => {
    // `delete row.keyHash` reads the secret into process memory and
    // relies on remembering to remove it. A projection never fetches it.
    expect(serviceSrc).not.toMatch(/delete\s+\w+\.(keyHash|Password|password)/);
    expect(serviceSrc).toMatch(/projection:\s*\{/);
  });

  it('custom roles expose a permission COUNT, not the grant list', () => {
    // Shipping every tenant's grants in one cross-tenant response is a
    // larger blast radius for no extra answer -- the platform view asks
    // "who has custom roles and are any unusually broad".
    const block = serviceSrc.slice(
      serviceSrc.indexOf('export interface PlatformCustomRole'),
      serviceSrc.indexOf('function escapeRegex')
    );
    expect(block).toContain('permissionCount');
    expect(block).not.toMatch(/permissions:\s*(string|Permission)\[\]/);
  });
});

describe('platform directory: query safety', () => {
  it('escapes the search term before building a regex', () => {
    // An unescaped search box over a cross-tenant collection is both an
    // injection surface and a trivial ReDoS.
    expect(serviceSrc).toMatch(/escapeRegex\(filters\.search\)/);
  });

  it('paginates rather than returning every row', () => {
    expect(serviceSrc).toMatch(/\.skip\(\(page - 1\) \* limit\)/);
    expect(serviceSrc).toMatch(/\.limit\(limit\)/);
  });
});

describe('telematics alert summary: scope', () => {
  const repoSrc = read('modules/telematics/repositories/telematics.repository.ts');
  const routeSrc = read('app/api/telematics/alerts/summary/route.ts');
  const telControllerSrc = read('modules/telematics/controllers/telematics.controller.ts');

  it('requires the same permission as the rows it counts', () => {
    // A summary readable by someone who cannot read the underlying
    // alerts is a leak wearing an aggregate as a disguise.
    expect(routeSrc).toMatch(/Permission\.VEHICLE_VIEW/);
    expect(read('app/api/telematics/vehicles/[vehicleId]/alerts/route.ts')).toMatch(
      /Permission\.VEHICLE_VIEW/
    );
  });

  it('resolves a full TenantContext, not a bare tenantId', () => {
    const start = telControllerSrc.indexOf('async getAlertSummary(');
    const body = telControllerSrc.slice(start, telControllerSrc.indexOf('\n  }\n', start));
    expect(body).toMatch(/resolveTenantContext\(req\)/);
    expect(body).not.toMatch(/getTenantFromRequest/);
  });

  it('applies the org-unit predicate, spread LAST', () => {
    // Aggregates are exactly where a leak reappears after the row-level
    // list is fixed -- the anomaly severity counts and the report
    // engine's $match both did precisely this.
    const start = repoSrc.indexOf('async getAlertSummaryInScope(');
    const body = repoSrc.slice(start, repoSrc.indexOf('\n  }\n', start));
    expect(body).toMatch(/\.\.\.this\.scopeOf\(context\)/);

    // The spread must be the last entry in the match object, so nothing
    // above it can override the scope key.
    const matchBlock = body.slice(body.indexOf('const match'), body.indexOf('};', body.indexOf('const match')));
    const scopeIdx = matchBlock.indexOf('...this.scopeOf(context)');
    const afterScope = matchBlock.slice(scopeIdx).replace('...this.scopeOf(context),', '');
    expect(afterScope.trim().replace(/[\s,]/g, '')).toBe('');
  });

  it('reports truncation rather than silently cutting the list', () => {
    // "the ten worst" must not be mistakable for "all of them".
    const start = repoSrc.indexOf('async getAlertSummaryInScope(');
    const body = repoSrc.slice(start, repoSrc.indexOf('\n  }\n', start));
    expect(body).toContain('topVehiclesTruncated');
    expect(body).toMatch(/topVehicleLimit \+ 1/);
  });
});
