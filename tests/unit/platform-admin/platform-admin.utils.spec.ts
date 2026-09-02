// tests/unit/platform-admin/platform-admin.utils.spec.ts
//
// Pure-function tests for the Platform Admin module.
//
// Same rationale as tests/unit/observability/*: this repo's Jest runs
// under `testEnvironment: 'node'` with no jsdom and no React Testing
// Library, so components cannot be rendered in a test. Everything worth
// asserting therefore lives in ../utils and the components stay
// declarative -- which is why these are plain-function tests rather
// than a gap in coverage.

import {
  ORG_UNIT_TYPE_LABELS,
  buildOrgUnitTree,
  canManageOrgUnitsFor,
  countOrgUnitsByType,
  eligibleParents,
  flattenOrgUnitTree,
  formatDate,
  formatSeats,
  isSameOrganization,
  orgUnitStatusPresentation,
  orgUnitTypeLabel,
  organizationRouteId,
  organizationStatusLabel,
  organizationStatusPresentation,
  organizationTierLabel,
  tenantIdentifier,
  toCreateOrgUnitPayload,
  toCreateOrganizationPayload,
  validateCreateOrgUnit,
  validateCreateOrganization,
} from '@/frontend/modules/platform-admin/utils/platform-admin.utils';
import { ALLOWED_PARENT_TYPES } from '@/modules/tenancy/constants/hierarchy.constants';
import type { OrgUnitSummary, OrgUnitType } from '@/frontend/modules/platform-admin/types';

function unit(over: Partial<OrgUnitSummary> & { _id: string }): OrgUnitSummary {
  return {
    organizationId: 'willsgrove-farm-enterprises-9e80ed',
    type: 'branch',
    name: over._id,
    path: [],
    depth: 0,
    status: 'active',
    ...over,
  } as OrgUnitSummary;
}

// ─────────────────────────────────────────────────────────────────────
describe('organization status presentation', () => {
  it('shows suspended as destructive and archived as merely muted', () => {
    // The distinction that matters operationally: a suspended tenant is
    // live and cut off, with someone probably waiting on it; an
    // archived one is a closed account nobody is blocked by. Rendering
    // both as "not active" flattens an urgent state into a filing one.
    expect(organizationStatusPresentation('suspended').badgeVariant).toBe('destructive');
    expect(organizationStatusPresentation('archived').badgeVariant).toBe('secondary');
    expect(organizationStatusPresentation('suspended').dotClassName).not.toBe(
      organizationStatusPresentation('archived').dotClassName
    );
  });

  it('shows active as the only healthy state', () => {
    expect(organizationStatusPresentation('active').dotClassName).toBe('bg-success');
  });

  it('never renders an unrecognised status as healthy', () => {
    // A status this build has never heard of must not arrive wearing
    // the same green dot as 'active'.
    for (const value of ['pending_deletion', '', null, undefined, 'ACTIVE']) {
      expect(organizationStatusPresentation(value).dotClassName).not.toBe('bg-success');
    }
  });

  it('labels an unknown status verbatim so an operator can report it', () => {
    expect(organizationStatusLabel('pending_deletion')).toBe('pending_deletion');
    expect(organizationStatusLabel(null)).toBe('Unknown');
    expect(organizationStatusLabel('active')).toBe('Active');
  });

  it('labels every subscription tier the backend defines', () => {
    expect(organizationTierLabel('free')).toBe('Free');
    expect(organizationTierLabel('professional')).toBe('Professional');
    expect(organizationTierLabel('enterprise')).toBe('Enterprise');
    expect(organizationTierLabel(undefined)).toBe('Unknown');
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('tenant identity', () => {
  it('prefers tenantId, which is the value business rows actually join on', () => {
    expect(
      tenantIdentifier({ tenantId: 'willsgrove-farm-enterprises-9e80ed', slug: 'something-else' })
    ).toBe('willsgrove-farm-enterprises-9e80ed');
  });

  it('falls back to the slug for rows written before tenantId existed', () => {
    expect(tenantIdentifier({ slug: 'toyota-zimbabwe-63078f' })).toBe('toyota-zimbabwe-63078f');
  });

  it('returns null rather than an ObjectId when neither is present', () => {
    // Showing a Mongo _id in a column labelled "Tenant ID" hands an
    // operator a value that matches nothing anywhere in the database.
    expect(tenantIdentifier({ slug: '' })).toBeNull();
    expect(tenantIdentifier({ tenantId: '   ', slug: '' })).toBeNull();
  });

  it('routes by slug, falling back to _id only when there is no slug', () => {
    expect(organizationRouteId({ _id: '68b0f1', slug: 'willsgrove-9e80ed' })).toBe(
      'willsgrove-9e80ed'
    );
    expect(organizationRouteId({ _id: '68b0f1', slug: '' })).toBe('68b0f1');
  });

  it('matches an organization by any identifier it is known by', () => {
    const org = { _id: '68b0f1', slug: 'willsgrove-9e80ed', tenantId: 'willsgrove-9e80ed' };

    expect(isSameOrganization(org, 'willsgrove-9e80ed')).toBe(true);
    expect(isSameOrganization(org, '68b0f1')).toBe(true);
    // A hand-typed URL is not necessarily lowercase.
    expect(isSameOrganization(org, '  WILLSGROVE-9E80ED  ')).toBe(true);
  });

  it('does not match a different organization', () => {
    const org = { _id: '68b0f1', slug: 'willsgrove-9e80ed', tenantId: 'willsgrove-9e80ed' };
    expect(isSameOrganization(org, 'toyota-zimbabwe-63078f')).toBe(false);
  });

  it('fails closed on missing input', () => {
    expect(isSameOrganization(null, 'willsgrove')).toBe(false);
    expect(isSameOrganization({ _id: 'x', slug: 'y' }, null)).toBe(false);
    expect(isSameOrganization({ _id: 'x', slug: 'y' }, '   ')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('canManageOrgUnitsFor -- the constraint that shapes the detail page', () => {
  // /api/tenancy/org-units resolves organizationId from the CALLER'S
  // SESSION on both GET and POST, and the create path spreads the
  // session tenant LAST over the body. So the org-unit section may only
  // be shown when the viewed organization IS the caller's own -- or a
  // platform admin sees their own branches under someone else's name,
  // and "Add branch" lands in the wrong tenant with a 200 response.
  const own = { _id: '68b0f1', slug: 'willsgrove-9e80ed', tenantId: 'willsgrove-9e80ed' };
  const other = { _id: '9c22aa', slug: 'toyota-zimbabwe-63078f', tenantId: 'toyota-zimbabwe-63078f' };

  it('allows management of the caller s own organization', () => {
    expect(canManageOrgUnitsFor(own, 'willsgrove-9e80ed')).toBe(true);
  });

  it('REFUSES another organization, however the page was reached', () => {
    expect(canManageOrgUnitsFor(other, 'willsgrove-9e80ed')).toBe(false);
  });

  it('fails closed with no session tenant', () => {
    expect(canManageOrgUnitsFor(own, null)).toBe(false);
    expect(canManageOrgUnitsFor(own, undefined)).toBe(false);
    expect(canManageOrgUnitsFor(own, '')).toBe(false);
  });

  it('fails closed when the organization has not loaded yet', () => {
    expect(canManageOrgUnitsFor(null, 'willsgrove-9e80ed')).toBe(false);
    expect(canManageOrgUnitsFor(undefined, 'willsgrove-9e80ed')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('buildOrgUnitTree', () => {
  it('nests children under their parent and orders shallower types first', () => {
    const tree = buildOrgUnitTree([
      unit({ _id: 'team-1', type: 'team', name: 'Alpha', parentId: 'dept-1' }),
      unit({ _id: 'dept-1', type: 'department', name: 'Logistics', parentId: 'branch-1' }),
      unit({ _id: 'branch-1', type: 'branch', name: 'Harare' }),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0]._id).toBe('branch-1');
    expect(tree[0].children[0]._id).toBe('dept-1');
    expect(tree[0].children[0].children[0]._id).toBe('team-1');
  });

  it('reports level as distance from the root, not the stored absolute depth', () => {
    const tree = buildOrgUnitTree([
      unit({ _id: 'branch-1', type: 'branch', depth: 0 }),
      unit({ _id: 'dept-1', type: 'department', parentId: 'branch-1', depth: 1 }),
    ]);

    expect(tree[0].level).toBe(0);
    expect(tree[0].children[0].level).toBe(1);
  });

  it('sorts siblings by type then name, deterministically', () => {
    const tree = buildOrgUnitTree([
      unit({ _id: 'b', type: 'branch', name: 'Zulu' }),
      unit({ _id: 'a', type: 'branch', name: 'Alpha' }),
      unit({ _id: 'c', type: 'branch', name: 'Mike' }),
    ]);

    expect(tree.map((n) => n.name)).toEqual(['Alpha', 'Mike', 'Zulu']);
  });

  it('promotes an orphan to the top level instead of dropping it', () => {
    // Reachable from real data: the list read is filterable by `type`
    // and `parentId`, so a partial fetch genuinely can omit a parent. A
    // branch that VANISHES from an admin screen is worse than one shown
    // at the wrong indentation -- the operator can see it either way,
    // and only one of those is recoverable by looking.
    const tree = buildOrgUnitTree([
      unit({ _id: 'dept-1', type: 'department', name: 'Orphan', parentId: 'missing-branch' }),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0]._id).toBe('dept-1');
    expect(tree[0].level).toBe(0);
  });

  it('terminates on a cycle rather than hanging the tab', () => {
    // HierarchyValidationService prevents creating one, but this must
    // not infinite-loop if historical data contains one: an infinite
    // loop in a render path takes the browser tab down.
    const tree = buildOrgUnitTree([
      unit({ _id: 'a', type: 'department', parentId: 'b' }),
      unit({ _id: 'b', type: 'department', parentId: 'a' }),
    ]);

    expect(flattenOrgUnitTree(tree)).toHaveLength(2);
    expect(tree.every((n) => n.level === 0)).toBe(true);
  });

  it('terminates on a self-referencing unit', () => {
    const tree = buildOrgUnitTree([unit({ _id: 'a', type: 'branch', parentId: 'a' })]);
    expect(flattenOrgUnitTree(tree)).toHaveLength(1);
  });

  it('never loses or duplicates a unit', () => {
    const units = [
      unit({ _id: 'branch-1', type: 'branch' }),
      unit({ _id: 'dept-1', type: 'department', parentId: 'branch-1' }),
      unit({ _id: 'orphan', type: 'team', parentId: 'gone' }),
      unit({ _id: 'cycle-a', type: 'fleet', parentId: 'cycle-b' }),
      unit({ _id: 'cycle-b', type: 'fleet', parentId: 'cycle-a' }),
    ];

    const flattened = flattenOrgUnitTree(buildOrgUnitTree(units));
    const ids = flattened.map((n) => n._id).sort();

    expect(ids).toEqual(['branch-1', 'cycle-a', 'cycle-b', 'dept-1', 'orphan']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('handles an empty or malformed list without throwing', () => {
    expect(buildOrgUnitTree([])).toEqual([]);
    expect(buildOrgUnitTree(undefined as unknown as OrgUnitSummary[])).toEqual([]);
  });

  it('flattens depth-first, so an indented table reads top to bottom', () => {
    const tree = buildOrgUnitTree([
      unit({ _id: 'branch-1', type: 'branch', name: 'Harare' }),
      unit({ _id: 'dept-1', type: 'department', name: 'Logistics', parentId: 'branch-1' }),
      unit({ _id: 'branch-2', type: 'branch', name: 'Zvishavane' }),
    ]);

    expect(flattenOrgUnitTree(tree).map((n) => n._id)).toEqual([
      'branch-1',
      'dept-1',
      'branch-2',
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('eligibleParents', () => {
  const units = [
    unit({ _id: 'branch-1', type: 'branch' }),
    unit({ _id: 'dept-1', type: 'department' }),
    unit({ _id: 'workshop-1', type: 'workshop' }),
    unit({ _id: 'fleet-1', type: 'fleet' }),
  ];

  it('offers nothing for a type that must be top level', () => {
    // ALLOWED_PARENT_TYPES.branch is null.
    expect(eligibleParents(units, 'branch', ALLOWED_PARENT_TYPES)).toEqual([]);
  });

  it('offers only the parent types the server will accept', () => {
    // Mirrors the real map rather than a restated copy, so this fails
    // if ALLOWED_PARENT_TYPES changes and the UI is not updated.
    const forDepartment = eligibleParents(units, 'department', ALLOWED_PARENT_TYPES);
    expect(forDepartment.map((u) => u._id)).toEqual(['branch-1']);

    const forFleet = eligibleParents(units, 'fleet', ALLOWED_PARENT_TYPES);
    expect(forFleet.map((u) => u._id).sort()).toEqual(['branch-1', 'dept-1', 'workshop-1']);
  });

  it('excludes a unit from being its own parent', () => {
    const forTeam = eligibleParents(units, 'team', ALLOWED_PARENT_TYPES, { excludeId: 'dept-1' });
    expect(forTeam.map((u) => u._id)).not.toContain('dept-1');
  });

  it('agrees with ALLOWED_PARENT_TYPES for every declared type', () => {
    for (const type of Object.keys(ORG_UNIT_TYPE_LABELS) as OrgUnitType[]) {
      const allowed = ALLOWED_PARENT_TYPES[type];
      const result = eligibleParents(units, type, ALLOWED_PARENT_TYPES);
      if (allowed === null) {
        expect(result).toEqual([]);
      } else {
        expect(result.every((u) => allowed.includes(u.type))).toBe(true);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('countOrgUnitsByType', () => {
  it('counts every declared type, including the zeroes', () => {
    const counts = countOrgUnitsByType([
      unit({ _id: 'a', type: 'branch' }),
      unit({ _id: 'b', type: 'branch' }),
      unit({ _id: 'c', type: 'fleet' }),
    ]);

    expect(counts.branch).toBe(2);
    expect(counts.fleet).toBe(1);
    // Present as 0 rather than absent, so a caller can render the full
    // ladder without checking for undefined.
    expect(counts.department).toBe(0);
    expect(counts.team).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('validateCreateOrganization', () => {
  const valid = { name: 'Willsgrove', ownerName: 'Jane Moyo', ownerEmail: 'jane@example.com' };

  it('accepts a complete form', () => {
    expect(validateCreateOrganization(valid)).toEqual({});
  });

  it('requires a name, which is the one thing the server also enforces', () => {
    expect(validateCreateOrganization({ ...valid, name: '' }).name).toBeDefined();
    expect(validateCreateOrganization({ ...valid, name: '   ' }).name).toBeDefined();
  });

  it('requires the owner fields even though the server does not', () => {
    // OrganizationController reads body.ownerEmail/ownerName with no
    // validation at all. An organization created with a blank owner
    // email produces a member row nobody can be contacted through, and
    // nothing server-side stops it.
    expect(validateCreateOrganization({ ...valid, ownerEmail: '' }).ownerEmail).toBeDefined();
    expect(validateCreateOrganization({ ...valid, ownerName: '' }).ownerName).toBeDefined();
  });

  it('rejects a malformed email', () => {
    for (const email of ['jane', 'jane@', '@example.com', 'jane @example.com']) {
      expect(validateCreateOrganization({ ...valid, ownerEmail: email }).ownerEmail).toBeDefined();
    }
  });

  it('rejects an over-long name', () => {
    expect(validateCreateOrganization({ ...valid, name: 'x'.repeat(121) }).name).toBeDefined();
  });

  it('trims on the way to the wire', () => {
    expect(
      toCreateOrganizationPayload({
        name: '  Willsgrove  ',
        ownerName: ' Jane ',
        ownerEmail: ' jane@example.com ',
      })
    ).toEqual({ name: 'Willsgrove', ownerName: 'Jane', ownerEmail: 'jane@example.com' });
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('validateCreateOrgUnit', () => {
  it('accepts a top-level branch with no parent', () => {
    expect(
      validateCreateOrgUnit({ type: 'branch', name: 'Harare', parentId: null }, ALLOWED_PARENT_TYPES)
    ).toEqual({});
  });

  it('rejects a branch given a parent', () => {
    // ALLOWED_PARENT_TYPES.branch is null: branches are the top level.
    const errors = validateCreateOrgUnit(
      { type: 'branch', name: 'Harare', parentId: 'dept-1' },
      ALLOWED_PARENT_TYPES
    );
    expect(errors.parentId).toBeDefined();
  });

  it('requires a parent for every type that must nest', () => {
    // Without this the server returns a ValidationError the operator
    // has to decode from a toast.
    for (const type of ['department', 'workshop', 'fleet', 'team'] as OrgUnitType[]) {
      const errors = validateCreateOrgUnit({ type, name: 'X', parentId: null }, ALLOWED_PARENT_TYPES);
      expect(errors.parentId).toBeDefined();
    }
  });

  it('enforces the same length limits as orgUnitCreateSchema', () => {
    expect(validateCreateOrgUnit({ type: 'branch', name: '' }, ALLOWED_PARENT_TYPES).name).toBeDefined();
    expect(
      validateCreateOrgUnit({ type: 'branch', name: 'x'.repeat(101) }, ALLOWED_PARENT_TYPES).name
    ).toBeDefined();
    expect(
      validateCreateOrgUnit(
        { type: 'branch', name: 'ok', code: 'x'.repeat(31) },
        ALLOWED_PARENT_TYPES
      ).code
    ).toBeDefined();
    expect(
      validateCreateOrgUnit({ type: 'branch', name: 'x'.repeat(100) }, ALLOWED_PARENT_TYPES).name
    ).toBeUndefined();
  });

  it('rejects a type outside the closed set', () => {
    expect(validateCreateOrgUnit({ type: 'region', name: 'X' }, ALLOWED_PARENT_TYPES).type).toBeDefined();
    expect(validateCreateOrgUnit({ name: 'X' }, ALLOWED_PARENT_TYPES).type).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('toCreateOrgUnitPayload', () => {
  it('omits an empty code rather than sending an empty string', () => {
    // orgUnitCreateSchema types code as optional, so "" is ACCEPTED and
    // stored as a blank code that then renders as an empty column
    // forever. Absent and empty are different things.
    const payload = toCreateOrgUnitPayload({ type: 'branch', name: 'Harare', code: '   ' });
    expect('code' in payload).toBe(false);
  });

  it('keeps a real code, trimmed', () => {
    expect(toCreateOrgUnitPayload({ type: 'branch', name: 'Harare', code: ' HRE ' }).code).toBe('HRE');
  });

  it('omits an empty managerId', () => {
    expect('managerId' in toCreateOrgUnitPayload({ type: 'branch', name: 'X', managerId: '' })).toBe(
      false
    );
  });

  it('sends parentId as an explicit null for a top-level unit', () => {
    // An explicit null says "top level"; an omitted key says
    // "unspecified", and the two should not be conflated on the wire.
    const payload = toCreateOrgUnitPayload({ type: 'branch', name: 'Harare' });
    expect(payload.parentId).toBeNull();
  });

  it('carries a real parentId through unchanged', () => {
    expect(
      toCreateOrgUnitPayload({ type: 'department', name: 'Logistics', parentId: 'branch-1' }).parentId
    ).toBe('branch-1');
  });

  it('trims the name', () => {
    expect(toCreateOrgUnitPayload({ type: 'branch', name: '  Harare  ' }).name).toBe('Harare');
  });

  it('never emits a field the server schema does not accept', () => {
    // orgUnitCreateSchema declares exactly: type, name, code, parentId,
    // managerId, metadata. Notably NOT organizationId -- the controller
    // overrides it from the session regardless, so sending one would be
    // a lie about what the request does.
    const payload = toCreateOrgUnitPayload({
      type: 'department',
      name: 'Logistics',
      code: 'LOG',
      parentId: 'branch-1',
      managerId: 'user-1',
    });

    for (const key of Object.keys(payload)) {
      expect(['type', 'name', 'code', 'parentId', 'managerId']).toContain(key);
    }
    expect('organizationId' in payload).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('org unit presentation', () => {
  it('labels every type in the ladder', () => {
    expect(orgUnitTypeLabel('branch')).toBe('Branch');
    expect(orgUnitTypeLabel('workshop')).toBe('Workshop');
    expect(orgUnitTypeLabel('region')).toBe('region');
    expect(orgUnitTypeLabel(null)).toBe('Unknown');
  });

  it('shows only an active unit as healthy', () => {
    expect(orgUnitStatusPresentation('active').dotClassName).toBe('bg-success');
    expect(orgUnitStatusPresentation('inactive').dotClassName).not.toBe('bg-success');
    expect(orgUnitStatusPresentation(undefined).dotClassName).not.toBe('bg-success');
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('formatting', () => {
  it('renders an em dash rather than "Invalid Date"', () => {
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate(null)).toBe('—');
    expect(formatDate('')).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
  });

  it('formats a real date', () => {
    expect(formatDate('2026-03-15T00:00:00.000Z')).not.toBe('—');
    expect(formatDate(new Date('2026-03-15T00:00:00.000Z'))).not.toBe('—');
  });

  it('formats seats as used / total', () => {
    expect(formatSeats({ seats: 5, usedSeats: 2 })).toBe('2 / 5');
  });

  it('does not invent a seat count that is not there', () => {
    // A fabricated "0 / 0" reads as a real, fully-consumed plan.
    expect(formatSeats(null)).toBe('—');
    expect(formatSeats(undefined)).toBe('—');
    expect(formatSeats({})).toBe('—');
    expect(formatSeats({ seats: 5 })).toBe('— / 5');
  });
});
