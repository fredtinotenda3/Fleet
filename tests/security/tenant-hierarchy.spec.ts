// tests/security/tenant-hierarchy.spec.ts
//
// Covers the two pieces of "true multi-tenancy" that are not about
// filtering rows:
//
//   1. The SHAPE of the ladder -- Platform > Organization > Branch >
//      Department > Workshop > Fleet > Users must be constructible.
//      Before the hierarchy constants were widened, it was not: a
//      workshop could only nest under a branch and a fleet could only
//      nest under a branch, so building the requested chain threw
//      ValidationError.
//
//   2. WHERE a user lands after login. Not a security boundary in
//      itself, but the difference between "isolation works" and "the
//      user believes the product is broken", which is the same thing
//      from the customer's side.

import {
  ALLOWED_PARENT_TYPES,
  TENANT_LEVEL_ORDER,
  TENANT_HIERARCHY_ORDER,
  TENANT_HIERARCHY_LABELS,
} from '../../modules/tenancy/constants/hierarchy.constants';
import { hierarchyValidationService } from '../../modules/tenancy/services/hierarchy-validation.service';
import { resolveLandingPath, isSafeRedirectPath } from '../../server/permissions/landing';
import { Role } from '../../server/permissions/roles';

describe('the requested ladder is constructible', () => {
  // The exact chain from the specification.
  it('allows Branch > Department > Workshop > Fleet', () => {
    expect(() => hierarchyValidationService.validateParentChild('branch', null)).not.toThrow();
    expect(() => hierarchyValidationService.validateParentChild('department', 'branch')).not.toThrow();
    expect(() => hierarchyValidationService.validateParentChild('workshop', 'department')).not.toThrow();
    expect(() => hierarchyValidationService.validateParentChild('fleet', 'workshop')).not.toThrow();
  });

  it('still allows the flatter shapes already in production', () => {
    // Backward compatibility. The widening must be a superset, or
    // existing customer trees become invalid on deploy.
    expect(() => hierarchyValidationService.validateParentChild('workshop', 'branch')).not.toThrow();
    expect(() => hierarchyValidationService.validateParentChild('fleet', 'branch')).not.toThrow();
    expect(() => hierarchyValidationService.validateParentChild('team', 'department')).not.toThrow();
  });

  it('keeps branches at the top level', () => {
    expect(() => hierarchyValidationService.validateParentChild('branch', 'department')).toThrow();
    expect(() => hierarchyValidationService.validateParentChild('branch', 'fleet')).toThrow();
  });

  it('refuses to nest a unit under an equal-or-deeper type', () => {
    // This is what prevents cycles and nonsense trees. Every rejection
    // below would otherwise let someone build a loop.
    expect(() => hierarchyValidationService.validateParentChild('department', 'fleet')).toThrow();
    expect(() => hierarchyValidationService.validateParentChild('department', 'department')).toThrow();
    expect(() => hierarchyValidationService.validateParentChild('workshop', 'fleet')).toThrow();
    expect(() => hierarchyValidationService.validateParentChild('fleet', 'team')).toThrow();
  });
});

describe('hierarchy ordering is internally consistent', () => {
  it('gives every type a distinct depth', () => {
    const depths = Object.values(TENANT_LEVEL_ORDER);
    expect(new Set(depths).size).toBe(depths.length);
  });

  it('only permits parents that are strictly shallower', () => {
    // The invariant that makes isAncestorLevel() meaningful. If a type
    // could nest under an equal-depth type, "is A above B" would have no
    // answer and permission cascade would be undefined.
    for (const [child, parents] of Object.entries(ALLOWED_PARENT_TYPES)) {
      if (parents === null) continue;
      for (const parent of parents) {
        expect(TENANT_LEVEL_ORDER[parent as keyof typeof TENANT_LEVEL_ORDER]).toBeLessThan(
          TENANT_LEVEL_ORDER[child as keyof typeof TENANT_LEVEL_ORDER]
        );
      }
    }
  });

  it('recognises workshop as sitting above fleet', () => {
    // Regression guard. Both were depth 2, so this was false in both
    // directions and a Workshop Manager could never be recognised as
    // above a fleet nested inside their own workshop.
    expect(hierarchyValidationService.isAncestorLevel('workshop', 'fleet')).toBe(true);
    expect(hierarchyValidationService.isAncestorLevel('fleet', 'workshop')).toBe(false);
  });

  it('orders branch above every other unit type', () => {
    for (const type of ['department', 'workshop', 'fleet', 'team'] as const) {
      expect(hierarchyValidationService.isAncestorLevel('branch', type)).toBe(true);
    }
  });

  it('labels and orders every level of the documented ladder', () => {
    expect(TENANT_HIERARCHY_ORDER).toEqual([
      'platform',
      'organization',
      'branch',
      'department',
      'workshop',
      'fleet',
      'team',
      'user',
    ]);
    for (const level of TENANT_HIERARCHY_ORDER) {
      expect(TENANT_HIERARCHY_LABELS[level]).toBeTruthy();
    }
  });
});

describe('post-login landing', () => {
  it('sends a platform admin to the platform console', () => {
    expect(resolveLandingPath([Role.SUPER_ADMIN])).toBe('/admin');
  });

  it('sends managers and owners to the dashboard', () => {
    expect(resolveLandingPath([Role.ORGANIZATION_OWNER])).toBe('/dashboard');
    expect(resolveLandingPath([Role.BRANCH_MANAGER])).toBe('/dashboard');
    expect(resolveLandingPath([Role.FLEET_MANAGER])).toBe('/dashboard');
  });

  it('sends a driver to trips, not to an empty dashboard', () => {
    // A DRIVER holds no ANALYTICS_VIEW or VEHICLE_VIEW, so every
    // dashboard widget is gated off for them. Landing there shows a
    // blank page, which reads as a broken product.
    expect(resolveLandingPath([Role.DRIVER])).toBe('/trips');
  });

  it('sends a mechanic to maintenance', () => {
    expect(resolveLandingPath([Role.MECHANIC])).toBe('/maintenance');
  });

  it('gives the richer destination when a user holds several roles', () => {
    expect(resolveLandingPath([Role.DRIVER, Role.FLEET_MANAGER])).toBe('/dashboard');
  });

  it('falls back safely for an unknown or empty role set', () => {
    expect(resolveLandingPath([])).toBe('/dashboard');
    expect(resolveLandingPath(['not-a-real-role'])).toBe('/dashboard');
  });
});

describe('callbackUrl cannot become an open redirect', () => {
  it('accepts site-relative paths', () => {
    expect(isSafeRedirectPath('/vehicles/123')).toBe(true);
    expect(isSafeRedirectPath('/dashboard')).toBe(true);
  });

  it('rejects absolute and protocol-relative URLs', () => {
    // The phishing primitive: a login link whose callbackUrl points off
    // site, so the victim authenticates and is then handed to an
    // attacker-controlled page that looks like a continuation of login.
    expect(isSafeRedirectPath('https://evil.example')).toBe(false);
    expect(isSafeRedirectPath('//evil.example')).toBe(false);
    expect(isSafeRedirectPath('http://evil.example/dashboard')).toBe(false);
    expect(isSafeRedirectPath('javascript:alert(1)')).toBe(false);
  });

  it('rejects backslash-obfuscated targets and empty values', () => {
    expect(isSafeRedirectPath('/\\evil.example')).toBe(false);
    expect(isSafeRedirectPath('')).toBe(false);
    expect(isSafeRedirectPath(null)).toBe(false);
    expect(isSafeRedirectPath(undefined)).toBe(false);
  });
});
