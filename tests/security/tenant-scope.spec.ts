// tests/security/tenant-scope.spec.ts
//
// Guards the fail-closed tenant-scope contract. Every test here encodes a
// specific way the system previously leaked data across organizations. If
// one of these goes red, a cross-tenant breach has been reintroduced.
//
// Pure unit tests -- no database required, so they can gate every PR.

import {
  isLegacySentinelTenant,
  resolveTenantScope,
  assertUsableAsTenantId,
  isPlatformScope,
  TenantScopeError,
  PLATFORM_SCOPE_TENANT_ID,
  REJECTED_LEGACY_SENTINEL_TENANT_IDS,
} from '../../server/tenancy/tenant-scope';

const ORG_A = '68a1f2c4e5b7a9d3c1f04a11';
const ORG_B = '68a1f2c4e5b7a9d3c1f04b22';

describe('tenant scope resolution', () => {
  describe('a real organization id', () => {
    it('resolves to a tenant scope carrying that exact id', () => {
      expect(resolveTenantScope(ORG_A)).toEqual({ kind: 'tenant', tenantId: ORG_A });
    });

    it('never resolves to platform scope', () => {
      expect(isPlatformScope(ORG_A)).toBe(false);
      expect(isPlatformScope(ORG_B)).toBe(false);
    });

    it('trims incidental whitespace rather than failing', () => {
      expect(resolveTenantScope(`  ${ORG_A}  `)).toEqual({ kind: 'tenant', tenantId: ORG_A });
    });
  });

  describe('legacy sentinel values (the original breach)', () => {
    // These three strings used to mean "return every tenant's rows".
    // lib/authOptions.ts assigned 'default' to every account lacking a
    // tenantId, which is how one organization saw another's vehicles.
    it.each([...REJECTED_LEGACY_SENTINEL_TENANT_IDS])(
      'rejects %s instead of granting global access',
      (sentinel) => {
        expect(() => resolveTenantScope(sentinel)).toThrow(TenantScopeError);
      }
    );

    it('rejects them case-insensitively', () => {
      expect(() => resolveTenantScope('DEFAULT')).toThrow(TenantScopeError);
      expect(() => resolveTenantScope('Super_Admin')).toThrow(TenantScopeError);
    });

    it('explains the remedy in the error message', () => {
      expect(() => resolveTenantScope('default')).toThrow(/db:repair/);
    });
  });

  describe('missing scope fails closed', () => {
    it.each([undefined, null, '', '   '])('rejects %p', (value) => {
      expect(() => resolveTenantScope(value as string)).toThrow(TenantScopeError);
    });

    it('reports 403, not 500 — a scope failure is authorization, not a crash', () => {
      try {
        resolveTenantScope(undefined);
        throw new Error('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(TenantScopeError);
        expect((err as TenantScopeError).statusCode).toBe(403);
      }
    });
  });

  describe('platform scope is narrow and explicit', () => {
    it('is granted for the single dedicated sentinel', () => {
      expect(resolveTenantScope(PLATFORM_SCOPE_TENANT_ID)).toEqual({ kind: 'platform' });
    });

    it('is granted when isPlatformAdmin is explicitly true', () => {
      expect(resolveTenantScope(ORG_A, { isPlatformAdmin: true })).toEqual({ kind: 'platform' });
    });

    it('is NOT granted by isPlatformAdmin being falsy/absent', () => {
      expect(resolveTenantScope(ORG_A, {})).toEqual({ kind: 'tenant', tenantId: ORG_A });
      expect(resolveTenantScope(ORG_A, { isPlatformAdmin: false })).toEqual({
        kind: 'tenant',
        tenantId: ORG_A,
      });
    });

    it('cannot be reached by a truthy-but-not-true value', () => {
      // Guards against `isSuperAdmin: 'yes'` style coercion bugs.
      expect(
        resolveTenantScope(ORG_A, { isPlatformAdmin: 1 as unknown as boolean })
      ).toEqual({ kind: 'tenant', tenantId: ORG_A });
    });

    it('uses a sentinel no real organization id could collide with', () => {
      expect(PLATFORM_SCOPE_TENANT_ID).not.toMatch(/^[0-9a-f]{24}$/);
    });
  });

  describe('write guard (assertUsableAsTenantId)', () => {
    // This is the guard on BaseRepository.create(). Without it, an import
    // run by a mis-scoped user stamped tenantId:'default' onto every row
    // it created -- the write-side half of the reported bug.
    it('permits a real organization id', () => {
      expect(assertUsableAsTenantId(ORG_A)).toBe(ORG_A);
    });

    it('refuses to persist the platform sentinel', () => {
      expect(() => assertUsableAsTenantId(PLATFORM_SCOPE_TENANT_ID)).toThrow(TenantScopeError);
    });

    it('refuses to persist a legacy sentinel', () => {
      expect(() => assertUsableAsTenantId('default')).toThrow(TenantScopeError);
    });

    it('refuses to persist an empty owner', () => {
      expect(() => assertUsableAsTenantId('')).toThrow(TenantScopeError);
    });
  });

  describe('login gate (regression: a sentinel reached a scoped call)', () => {
    // authOptions.authorize() tested only for an EMPTY tenantId. 'default'
    // is a non-empty string, so it passed the gate and the first scoped
    // call (mfaService.isEnabled) threw TenantScopeError — whose message
    // then rendered verbatim on the public sign-in form.
    it('identifies every legacy sentinel as unusable for login', () => {
      for (const v of ['default', 'system', 'super_admin', 'DEFAULT', ' default ']) {
        expect(isLegacySentinelTenant(v)).toBe(true);
      }
    });

    it('does not flag a real organization slug or the platform sentinel', () => {
      expect(isLegacySentinelTenant('willsgrove-farm-enterprises-9e80ed')).toBe(false);
      expect(isLegacySentinelTenant(PLATFORM_SCOPE_TENANT_ID)).toBe(false);
    });

    it('does not flag empty or absent values — that is a separate branch', () => {
      for (const v of ['', undefined, null]) {
        expect(isLegacySentinelTenant(v)).toBe(false);
      }
    });

    it('the platform sentinel stays usable so admins can still log in', () => {
      expect(resolveTenantScope(PLATFORM_SCOPE_TENANT_ID)).toEqual({ kind: 'platform' });
    });
  });
});
