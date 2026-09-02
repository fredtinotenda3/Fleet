// tests/unit/platform-admin/platform-access.utils.spec.ts
//
// Pure-function tests for the Users / Roles & Permissions / API keys /
// Audit log slice (frontend/modules/platform-admin/utils/
// platform-access.utils.ts).
//
// No React/jsdom involved -- this repo's jest.config.js runs under
// testEnvironment: 'node' with no React Testing Library wired up (see
// the sibling platform-admin.utils.spec.ts for the same convention), so
// these functions are deliberately dependency-free specifically so
// their logic can be verified directly.
//
// The behaviours that MATTER most here are the ones that gate a write
// or state a scope. Those are asserted first and hardest: a directory
// that silently omits people, a status badge that says a dead key is
// live, or a permission check that fails open are all bugs a reader
// cannot detect by looking at the screen.

import {
  ASSIGNABLE_ORGANIZATION_ROLES,
  Permission,
  Role,
  rolePermissions,
} from '@/server/permissions/roles';
import {
  apiKeyStatusLabel,
  apiKeyStatusPresentation,
  applyDirectoryFilters,
  auditActionLabel,
  auditSeverityLabel,
  assignableRoleOptions,
  buildStaticRoleDefinitions,
  buildUserDirectory,
  canFilterAuditLogByTenant,
  canManageMembersFor,
  canViewAuditLog,
  customRolePermissionKeys,
  effectiveApiKeyStatus,
  effectiveCustomRolePermissions,
  endOfDayIso,
  filterDirectory,
  formatAuditTimestamp,
  groupPermissionsByCategory,
  memberStatusLabel,
  memberStatusPresentation,
  mergePermissionCatalogue,
  permissionKeyLabel,
  roleLabel,
  shortHash,
  sortDirectory,
  startOfDayIso,
  summariseDirectory,
  toAuditLogQuery,
  toCreateApiKeyPayload,
  validateCreateApiKey,
  validateInviteMember,
  validateRoleChange,
} from '@/frontend/modules/platform-admin/utils/platform-access.utils';
import type {
  ApiKeySummary,
  CustomRole,
  PermissionDefinition,
  PlatformOrganization,
} from '@/frontend/modules/platform-admin/types';

// ─── Fixtures ──────────────────────────────────────────────────────────

function organization(overrides: Partial<PlatformOrganization> = {}): PlatformOrganization {
  return {
    _id: 'org-1',
    name: 'Acme Haulage',
    slug: 'acme-haulage',
    branding: {} as never,
    settings: {} as never,
    subscription: { tier: 'professional', seats: 10, usedSeats: 3 } as never,
    features: {} as never,
    status: 'active',
    ownerId: 'user-owner',
    members: [],
    ...overrides,
  } as PlatformOrganization;
}

function member(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    email: 'a@example.com',
    name: 'Ada',
    role: 'fleet_manager',
    permissions: [],
    status: 'active',
    ...overrides,
  } as never;
}

function apiKey(overrides: Partial<ApiKeySummary> = {}): ApiKeySummary {
  return {
    _id: 'key-1',
    organizationId: 'org-1',
    name: 'Nightly sync',
    keyPrefix: 'fk_abc123',
    permissions: ['vehicle:view'],
    status: 'active',
    createdByUserId: 'user-1',
    ...overrides,
  };
}

// ─── The write gate ────────────────────────────────────────────────────

describe('canManageMembersFor', () => {
  // This is the fail-closed guard standing in for a missing server-side
  // check: OrganizationService.getOrganization IGNORES its tenantId
  // argument, so the member routes honour whatever organization id the
  // URL names. Every one of these cases must resolve to false unless
  // the organization is provably the caller's own.

  it('permits writes for the caller’s own organization, matched by tenant slug', () => {
    expect(canManageMembersFor(organization(), 'acme-haulage')).toBe(true);
  });

  it('permits writes when matched by the explicit tenantId field', () => {
    const org = { ...organization(), tenantId: 'acme-tenant' };
    expect(canManageMembersFor(org, 'acme-tenant')).toBe(true);
  });

  it('permits writes when matched by Mongo _id', () => {
    expect(canManageMembersFor(organization(), 'org-1')).toBe(true);
  });

  it('refuses writes for a different organization', () => {
    expect(canManageMembersFor(organization(), 'other-tenant')).toBe(false);
  });

  it('fails closed with no session tenant', () => {
    expect(canManageMembersFor(organization(), null)).toBe(false);
    expect(canManageMembersFor(organization(), undefined)).toBe(false);
    // An empty string is the session store's deliberate "no tenant
    // claim" sentinel and must never match.
    expect(canManageMembersFor(organization(), '')).toBe(false);
    expect(canManageMembersFor(organization(), '   ')).toBe(false);
  });

  it('fails closed with no organization loaded', () => {
    expect(canManageMembersFor(null, 'acme-haulage')).toBe(false);
    expect(canManageMembersFor(undefined, 'acme-haulage')).toBe(false);
  });

  it('tolerates case and whitespace in a hand-typed identifier', () => {
    expect(canManageMembersFor(organization(), '  ACME-Haulage ')).toBe(true);
  });
});

// ─── Users directory ───────────────────────────────────────────────────

describe('buildUserDirectory', () => {
  it('flattens members across organizations and tags each with its organization', () => {
    const result = buildUserDirectory([
      organization({ _id: 'org-1', name: 'Acme', members: [member()] }),
      organization({
        _id: 'org-2',
        name: 'Beta',
        slug: 'beta',
        members: [member({ userId: 'user-2', email: 'b@example.com', name: 'Bo' })],
      }),
    ]);

    expect(result.users).toHaveLength(2);
    expect(result.users.map((user) => [user.email, user.organizationName])).toEqual([
      ['a@example.com', 'Acme'],
      ['b@example.com', 'Beta'],
    ]);
    expect(result.organizationsScanned).toBe(2);
  });

  it('reports the directory as partial only when the listing says more pages exist', () => {
    // Taken from the listing's own pagination.hasNext, never guessed --
    // this drives the page's "this is a partial directory" banner, and
    // getting it wrong means an operator reads an incomplete list as
    // complete.
    expect(buildUserDirectory([organization()], { hasNextPage: true }).partial).toBe(true);
    expect(buildUserDirectory([organization()], { hasNextPage: false }).partial).toBe(false);
    expect(buildUserDirectory([organization()]).partial).toBe(false);
  });

  it('includes pending invites, flagged, with no user id', () => {
    const result = buildUserDirectory([
      organization({
        invites: [
          {
            _id: 'inv-1',
            organizationId: 'org-1',
            email: 'new@example.com',
            role: 'driver',
            invitedBy: 'user-owner',
            token: 'super-secret-token',
            expiresAt: new Date('2026-12-01'),
            status: 'pending',
          },
        ] as never,
      }),
    ]);

    expect(result.users).toHaveLength(1);
    expect(result.users[0]).toMatchObject({
      email: 'new@example.com',
      status: 'invited',
      isPendingInvite: true,
      // There is no account behind a pending invite, so there is no id
      // to report.
      userId: '',
    });
  });

  it('never carries the invite token into the directory', () => {
    // The token grants organization access to whoever holds it. It must
    // not reach a table cell, a React key, or anything else rendered.
    const result = buildUserDirectory([
      organization({
        invites: [
          {
            _id: 'inv-1',
            organizationId: 'org-1',
            email: 'new@example.com',
            role: 'driver',
            invitedBy: 'user-owner',
            token: 'super-secret-token',
            expiresAt: new Date('2026-12-01'),
            status: 'pending',
          },
        ] as never,
      }),
    ]);

    expect(JSON.stringify(result)).not.toContain('super-secret-token');
  });

  it('drops accepted, expired and cancelled invites', () => {
    // An accepted invite duplicates a member row; expired and cancelled
    // ones are not people anyone can act on.
    const result = buildUserDirectory([
      organization({
        invites: [
          { organizationId: 'org-1', email: 'x@example.com', role: 'driver', status: 'accepted' },
          { organizationId: 'org-1', email: 'y@example.com', role: 'driver', status: 'expired' },
          { organizationId: 'org-1', email: 'z@example.com', role: 'driver', status: 'cancelled' },
        ] as never,
      }),
    ]);

    expect(result.users).toEqual([]);
  });

  it('does not list someone twice when a pending invite exists for an existing member', () => {
    const result = buildUserDirectory([
      organization({
        members: [member({ email: 'Ada@Example.com' })],
        invites: [
          { organizationId: 'org-1', email: 'ada@example.com', role: 'driver', status: 'pending' },
        ] as never,
      }),
    ]);

    expect(result.users).toHaveLength(1);
    expect(result.users[0].isPendingInvite).toBe(false);
  });

  it('deduplicates a repeated member within one organization', () => {
    const result = buildUserDirectory([
      organization({ members: [member(), member()] }),
    ]);
    expect(result.users).toHaveLength(1);
  });

  it('keeps the same userId in two different organizations as two rows', () => {
    // One person can belong to two tenants; they are two memberships
    // with independent roles and statuses, and collapsing them would
    // hide one.
    const result = buildUserDirectory([
      organization({ _id: 'org-1', members: [member()] }),
      organization({ _id: 'org-2', slug: 'beta', members: [member({ status: 'suspended' })] }),
    ]);

    expect(result.users).toHaveLength(2);
  });

  it('survives malformed input rather than throwing on an admin screen', () => {
    expect(buildUserDirectory(null).users).toEqual([]);
    expect(buildUserDirectory(undefined).users).toEqual([]);
    expect(buildUserDirectory([] as never).users).toEqual([]);
    expect(buildUserDirectory([null as never]).users).toEqual([]);
    expect(buildUserDirectory([organization({ members: undefined as never })]).users).toEqual([]);
    expect(
      buildUserDirectory([organization({ members: [member({ userId: '' })] })]).users
    ).toEqual([]);
  });

  it('carries the canonical tenant identifier for cross-referencing', () => {
    const result = buildUserDirectory([organization({ members: [member()] })]);
    expect(result.users[0].organizationTenantId).toBe('acme-haulage');
  });
});

describe('filterDirectory', () => {
  const users = buildUserDirectory([
    organization({ _id: 'org-1', name: 'Acme', members: [member()] }),
    organization({
      _id: 'org-2',
      name: 'Beta Freight',
      slug: 'beta',
      members: [member({ userId: 'u2', email: 'bo@beta.test', name: 'Bo', role: 'driver' })],
    }),
  ]).users;

  it('matches on email, name and organization, case-insensitively', () => {
    expect(filterDirectory(users, 'ADA')).toHaveLength(1);
    expect(filterDirectory(users, 'beta.test')).toHaveLength(1);
    expect(filterDirectory(users, 'freight')).toHaveLength(1);
  });

  it('does NOT match on role', () => {
    // Typing "driver" to find a person and getting every driver in the
    // fleet is a worse result than no match; role is a separate exact
    // filter.
    expect(filterDirectory(users, 'driver')).toHaveLength(0);
  });

  it('returns everything for an empty or whitespace query', () => {
    expect(filterDirectory(users, '')).toHaveLength(2);
    expect(filterDirectory(users, '   ')).toHaveLength(2);
  });

  it('does not mutate the input array', () => {
    const snapshot = users.map((user) => user.email);
    filterDirectory(users, 'ada');
    expect(users.map((user) => user.email)).toEqual(snapshot);
  });
});

describe('applyDirectoryFilters', () => {
  const users = buildUserDirectory([
    organization({
      _id: 'org-1',
      members: [
        member(),
        member({ userId: 'u2', email: 'b@x.test', role: 'driver', status: 'suspended' }),
      ],
    }),
  ]).users;

  it('filters by status, role and organization independently', () => {
    expect(applyDirectoryFilters(users, { status: 'suspended' })).toHaveLength(1);
    expect(applyDirectoryFilters(users, { role: 'driver' })).toHaveLength(1);
    expect(applyDirectoryFilters(users, { organizationId: 'org-1' })).toHaveLength(2);
    expect(applyDirectoryFilters(users, { organizationId: 'org-9' })).toHaveLength(0);
  });

  it('treats "all" and an unset filter as no filter', () => {
    expect(applyDirectoryFilters(users, { status: 'all', role: 'all', organizationId: 'all' })).toHaveLength(2);
    expect(applyDirectoryFilters(users, {})).toHaveLength(2);
  });

  it('combines filters conjunctively', () => {
    expect(applyDirectoryFilters(users, { status: 'active', role: 'driver' })).toHaveLength(0);
  });
});

describe('sortDirectory', () => {
  it('orders by organization, then name, then email', () => {
    const users = buildUserDirectory([
      organization({ _id: 'o2', name: 'Zeta', members: [member({ name: 'Ann' })] }),
      organization({
        _id: 'o1',
        name: 'Alpha',
        slug: 'alpha',
        members: [
          member({ userId: 'b', name: 'Bea', email: 'bea@x.test' }),
          member({ userId: 'a', name: 'Al', email: 'al@x.test' }),
        ],
      }),
    ]).users;

    expect(sortDirectory(users).map((user) => user.name)).toEqual(['Al', 'Bea', 'Ann']);
  });

  it('sorts unnamed members after named ones rather than first', () => {
    const users = buildUserDirectory([
      organization({
        members: [
          member({ userId: 'a', name: '', email: 'zz@x.test' }),
          member({ userId: 'b', name: 'Bea', email: 'bb@x.test' }),
        ],
      }),
    ]).users;

    expect(sortDirectory(users).map((user) => user.email)).toEqual(['bb@x.test', 'zz@x.test']);
  });

  it('does not mutate its input', () => {
    const users = buildUserDirectory([organization({ members: [member()] })]).users;
    const snapshot = [...users];
    sortDirectory(users);
    expect(users).toEqual(snapshot);
  });
});

describe('summariseDirectory', () => {
  it('counts each status, and counts nothing for an unrecognised one', () => {
    const users = buildUserDirectory([
      organization({
        members: [
          member({ userId: 'a', status: 'active' }),
          member({ userId: 'b', status: 'invited' }),
          member({ userId: 'c', status: 'suspended' }),
          member({ userId: 'd', status: 'archived' }),
        ],
      }),
    ]).users;

    expect(summariseDirectory(users)).toEqual({
      total: 4,
      active: 1,
      invited: 1,
      suspended: 1,
    });
  });
});

describe('memberStatusPresentation / memberStatusLabel', () => {
  it('gives suspended a destructive treatment and invited a merely pending one', () => {
    expect(memberStatusPresentation('suspended').badgeVariant).toBe('destructive');
    expect(memberStatusPresentation('invited').badgeVariant).toBe('secondary');
    expect(memberStatusPresentation('active').dotClassName).toContain('success');
  });

  it('never renders an unrecognised status as healthy', () => {
    const presentation = memberStatusPresentation('who-knows');
    expect(presentation.dotClassName).not.toContain('success');
    expect(presentation.badgeVariant).toBe('secondary');
  });

  it('shows an unrecognised status verbatim rather than as "Unknown"', () => {
    expect(memberStatusLabel('deprovisioned')).toBe('deprovisioned');
    expect(memberStatusLabel(null)).toBe('Unknown');
  });
});

// ─── Roles ─────────────────────────────────────────────────────────────

describe('roleLabel', () => {
  it('labels every known role', () => {
    expect(roleLabel('super_admin')).toBe('Super Admin');
    expect(roleLabel('fleet_manager')).toBe('Fleet Manager');
  });

  it('title-cases an unrecognised role rather than hiding it', () => {
    // A member row can carry a legacy value no longer in the enum, and
    // the operator investigating is exactly who needs to see which.
    expect(roleLabel('legacy_ops_lead')).toBe('Legacy Ops Lead');
    expect(roleLabel(null)).toBe('Unknown');
  });
});

describe('buildStaticRoleDefinitions', () => {
  const definitions = buildStaticRoleDefinitions();

  it('covers every Role in the enum exactly once', () => {
    const roles = definitions.map((definition) => definition.role);
    expect(new Set(roles).size).toBe(roles.length);
    expect(roles.slice().sort()).toEqual((Object.values(Role) as string[]).slice().sort());
  });

  it('reports the permission set the server actually enforces', () => {
    // Read from rolePermissions rather than an endpoint, so drift is
    // impossible by construction. This asserts it stays that way.
    for (const definition of definitions) {
      expect(definition.permissions).toEqual(rolePermissions[definition.role]);
    }
  });

  it('marks only SUPER_ADMIN as a platform role', () => {
    const platform = definitions.filter((definition) => definition.isPlatformRole);
    expect(platform.map((definition) => definition.role)).toEqual([Role.SUPER_ADMIN]);
  });

  it('marks the organization owner as non-assignable', () => {
    // ORGANIZATION_OWNER is in ORGANIZATION_ROLES but not the
    // assignable subset: it is set at creation and moved by an explicit
    // transfer, never a generic role update.
    const owner = definitions.find((definition) => definition.role === Role.ORGANIZATION_OWNER);
    expect(owner?.isAssignable).toBe(false);
    expect(owner?.isPlatformRole).toBe(false);
  });

  it('agrees with ASSIGNABLE_ORGANIZATION_ROLES exactly', () => {
    const assignable = definitions
      .filter((definition) => definition.isAssignable)
      .map((definition) => definition.role)
      .sort();
    expect(assignable).toEqual((ASSIGNABLE_ORGANIZATION_ROLES as string[]).slice().sort());
  });

  it('orders the widest role first', () => {
    for (let i = 1; i < definitions.length; i += 1) {
      expect(definitions[i - 1].permissions.length).toBeGreaterThanOrEqual(
        definitions[i].permissions.length
      );
    }
  });
});

describe('assignableRoleOptions', () => {
  const options = assignableRoleOptions();

  it('never offers super_admin or organization_owner', () => {
    // Both would be rejected by the member endpoint -- one is outside
    // ORGANIZATION_ROLES, the other outside the assignable subset.
    const values = options.map((option) => option.value);
    expect(values).not.toContain('super_admin');
    expect(values).not.toContain('organization_owner');
  });

  it('is sorted by label for a stable dropdown', () => {
    const labels = options.map((option) => option.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });
});

describe('validateRoleChange', () => {
  it('accepts a real change to an assignable role', () => {
    expect(validateRoleChange({ currentRole: 'driver', nextRole: 'fleet_manager' })).toEqual({});
  });

  it('refuses to change the organization owner’s role', () => {
    // The server refuses this outright (CANNOT_MODIFY_OWNER); blocking
    // it here means an explanation instead of a decoded toast.
    const errors = validateRoleChange({ currentRole: 'organization_owner', nextRole: 'driver' });
    expect(errors.role).toMatch(/owner/i);
  });

  it('refuses a role outside the assignable set', () => {
    expect(validateRoleChange({ currentRole: 'driver', nextRole: 'super_admin' }).role).toBeTruthy();
    expect(
      validateRoleChange({ currentRole: 'driver', nextRole: 'organization_owner' }).role
    ).toBeTruthy();
  });

  it('refuses a no-op change', () => {
    // It would write an audit entry recording a change that did not
    // happen.
    expect(validateRoleChange({ currentRole: 'driver', nextRole: 'driver' }).role).toBeTruthy();
  });

  it('requires a role to be chosen', () => {
    expect(validateRoleChange({ currentRole: 'driver', nextRole: '' }).role).toBeTruthy();
    expect(validateRoleChange({ currentRole: 'driver', nextRole: '   ' }).role).toBeTruthy();
  });
});

describe('validateInviteMember', () => {
  it('accepts a valid email and assignable role', () => {
    expect(validateInviteMember({ email: 'new@example.com', role: 'driver' })).toEqual({});
  });

  it('requires an email — the only place this is checked', () => {
    // OrganizationController.inviteMember has no zod schema and
    // OrganizationService.addMember validates only the role and seat
    // count, so a blank or malformed address would be stored as an
    // invitation nobody can accept.
    expect(validateInviteMember({ email: '', role: 'driver' }).email).toBeTruthy();
    expect(validateInviteMember({ email: 'not-an-email', role: 'driver' }).email).toBeTruthy();
    expect(validateInviteMember({ email: 'missing@domain', role: 'driver' }).email).toBeTruthy();
  });

  it('refuses to invite a second organization owner', () => {
    // The server would accept it (addMember validates against the wider
    // ORGANIZATION_ROLES), but it contradicts the one-owner rule
    // enforced everywhere else and there is no transfer endpoint to
    // undo it with.
    expect(
      validateInviteMember({ email: 'new@example.com', role: 'organization_owner' }).role
    ).toBeTruthy();
  });

  it('requires a role', () => {
    expect(validateInviteMember({ email: 'new@example.com', role: '' }).role).toBeTruthy();
  });
});

// ─── Permissions ───────────────────────────────────────────────────────

describe('mergePermissionCatalogue', () => {
  it('keeps every registry definition as sent', () => {
    const registry: PermissionDefinition[] = [
      {
        key: 'vehicle:transfer',
        label: 'Transfer vehicle',
        category: 'vehicle',
        requiresResourceScope: true,
        isCustom: true,
      },
    ];

    const merged = mergePermissionCatalogue(registry);
    expect(merged.find((definition) => definition.key === 'vehicle:transfer')).toEqual(registry[0]);
  });

  it('adds static permissions the registry never registered', () => {
    // The registry is NOT a superset of the enum: a Permission that
    // bootstrapPermissionRegistry never registered is simply absent.
    // Showing only the registry would omit enforceable permissions from
    // the screen whose job is to say what a role can do.
    const merged = mergePermissionCatalogue([]);
    const keys = new Set(merged.map((definition) => definition.key));

    for (const permission of Object.values(Permission)) {
      expect(keys.has(String(permission))).toBe(true);
    }
  });

  it('derives a category from the key namespace for unregistered permissions', () => {
    const merged = mergePermissionCatalogue([]);
    const vehicleView = merged.find((definition) => definition.key === 'vehicle:view');
    expect(vehicleView?.category).toBe('vehicle');
    expect(vehicleView?.isCustom).toBe(false);
  });

  it('lets the registry definition win over the synthesised one', () => {
    const merged = mergePermissionCatalogue([
      {
        key: 'vehicle:view',
        label: 'See vehicles',
        category: 'Fleet',
        requiresResourceScope: false,
        isCustom: false,
      },
    ]);

    const entry = merged.find((definition) => definition.key === 'vehicle:view');
    expect(entry?.label).toBe('See vehicles');
    expect(entry?.category).toBe('Fleet');
  });

  it('tolerates null, undefined and malformed rows', () => {
    expect(mergePermissionCatalogue(null).length).toBeGreaterThan(0);
    expect(mergePermissionCatalogue(undefined).length).toBeGreaterThan(0);
    expect(mergePermissionCatalogue([{ key: '' } as never]).length).toBeGreaterThan(0);
  });
});

describe('groupPermissionsByCategory', () => {
  const definitions: PermissionDefinition[] = [
    { key: 'b:2', label: 'B2', category: 'beta', requiresResourceScope: false, isCustom: false },
    { key: 'a:1', label: 'A1', category: 'alpha', requiresResourceScope: false, isCustom: false },
    { key: 'b:1', label: 'B1', category: 'beta', requiresResourceScope: false, isCustom: false },
  ];

  it('groups by category, sorted, with sorted keys inside', () => {
    const grouped = groupPermissionsByCategory(definitions);
    expect(grouped.map((group) => group.category)).toEqual(['alpha', 'beta']);
    expect(grouped[1].permissions.map((permission) => permission.key)).toEqual(['b:1', 'b:2']);
  });

  it('files a definition with no category under a visible bucket, not a blank one', () => {
    const grouped = groupPermissionsByCategory([
      { key: 'x:1', label: 'X', category: '', requiresResourceScope: false, isCustom: false },
    ]);
    expect(grouped[0].category).toBe('Uncategorised');
  });

  it('skips malformed rows rather than throwing', () => {
    expect(groupPermissionsByCategory([null as never, { label: 'x' } as never])).toEqual([]);
  });
});

describe('permissionKeyLabel', () => {
  it('turns a key into readable prose', () => {
    expect(permissionKeyLabel('vehicle:view')).toBe('Vehicle view');
    expect(permissionKeyLabel('custom_role:manage')).toBe('Custom role manage');
  });

  it('returns an empty string for an empty key', () => {
    expect(permissionKeyLabel('')).toBe('');
  });
});

// ─── Custom roles ──────────────────────────────────────────────────────

function customRole(overrides: Partial<CustomRole> = {}): CustomRole {
  return {
    _id: 'role-1',
    organizationId: 'org-1',
    name: 'Depot Lead',
    permissions: [],
    customPermissionKeys: [],
    scopeType: 'branch',
    isSystem: false,
    status: 'active',
    version: 1,
    ...overrides,
  };
}

describe('customRolePermissionKeys', () => {
  it('unions static permissions with dynamic keys, deduplicated and sorted', () => {
    const keys = customRolePermissionKeys(
      customRole({
        permissions: [Permission.VEHICLE_VIEW, Permission.VEHICLE_VIEW],
        customPermissionKeys: ['vehicle:transfer'],
      })
    );

    expect(keys).toEqual(['vehicle:transfer', 'vehicle:view']);
  });

  it('tolerates missing arrays', () => {
    expect(
      customRolePermissionKeys({ permissions: undefined as never, customPermissionKeys: undefined as never })
    ).toEqual([]);
  });
});

describe('effectiveCustomRolePermissions', () => {
  it('includes everything the base role grants', () => {
    // CustomRole.permissions is ADDITIVE on top of baseRole, so
    // rendering only the explicit list would understate what the role
    // can do on the one screen that exists to answer that.
    const role = customRole({
      baseRole: Role.DRIVER,
      permissions: [Permission.VEHICLE_VIEW],
    });

    const result = effectiveCustomRolePermissions(role);
    const driverGrants = (rolePermissions[Role.DRIVER] ?? []).map(String);

    expect(result.inherited).toEqual([...driverGrants].sort());
    expect(result.direct).toEqual(['vehicle:view']);
    for (const grant of driverGrants) expect(result.all).toContain(grant);
    expect(result.all).toContain('vehicle:view');
  });

  it('keeps inherited and direct separate rather than flattening them', () => {
    const result = effectiveCustomRolePermissions(
      customRole({ baseRole: Role.DRIVER, permissions: [] })
    );
    expect(result.direct).toEqual([]);
    expect(result.inherited.length).toBeGreaterThan(0);
  });

  it('reports no inheritance when there is no base role', () => {
    const result = effectiveCustomRolePermissions(
      customRole({ permissions: [Permission.VEHICLE_VIEW] })
    );
    expect(result.inherited).toEqual([]);
    expect(result.all).toEqual(['vehicle:view']);
  });

  it('does not double-count a permission granted both ways', () => {
    const driverGrant = (rolePermissions[Role.DRIVER] ?? [])[0];
    const result = effectiveCustomRolePermissions(
      customRole({ baseRole: Role.DRIVER, permissions: [driverGrant] })
    );
    expect(result.all.filter((key) => key === String(driverGrant))).toHaveLength(1);
  });
});

// ─── API keys ──────────────────────────────────────────────────────────

describe('effectiveApiKeyStatus', () => {
  const now = new Date('2026-09-02T12:00:00.000Z');

  it('reports a past-expiry key as expired even though the wire says active', () => {
    // ApiKey.status is never swept to 'expired' by a job -- expiry is
    // checked at authentication time in ApiKeyService.verify -- so
    // rendering the stored value verbatim tells an operator a dead key
    // is live.
    const key = apiKey({ status: 'active', expiresAt: '2026-09-01T00:00:00.000Z' });
    expect(key.status).toBe('active');
    expect(effectiveApiKeyStatus(key, now)).toBe('expired');
  });

  it('treats the exact expiry instant as expired', () => {
    expect(
      effectiveApiKeyStatus(apiKey({ expiresAt: now.toISOString() }), now)
    ).toBe('expired');
  });

  it('leaves a future expiry active', () => {
    expect(
      effectiveApiKeyStatus(apiKey({ expiresAt: '2027-01-01T00:00:00.000Z' }), now)
    ).toBe('active');
  });

  it('leaves a key with no expiry active', () => {
    expect(effectiveApiKeyStatus(apiKey({ expiresAt: null }), now)).toBe('active');
    expect(effectiveApiKeyStatus(apiKey({ expiresAt: undefined }), now)).toBe('active');
  });

  it('lets revocation win over expiry', () => {
    // A revoked key is revoked regardless of its dates, and that is the
    // more serious fact.
    expect(
      effectiveApiKeyStatus(
        apiKey({ status: 'revoked', expiresAt: '2027-01-01T00:00:00.000Z' }),
        now
      )
    ).toBe('revoked');
  });

  it('ignores an unparseable expiry rather than declaring the key dead', () => {
    expect(effectiveApiKeyStatus(apiKey({ expiresAt: 'not-a-date' }), now)).toBe('active');
  });
});

describe('apiKeyStatusPresentation / apiKeyStatusLabel', () => {
  it('separates active, expired and revoked visually', () => {
    expect(apiKeyStatusPresentation('active').dotClassName).toContain('success');
    expect(apiKeyStatusPresentation('expired').badgeVariant).toBe('secondary');
    expect(apiKeyStatusPresentation('revoked').badgeVariant).toBe('destructive');
  });

  it('never renders an unknown status as healthy', () => {
    expect(apiKeyStatusPresentation('mystery').dotClassName).not.toContain('success');
    expect(apiKeyStatusLabel('mystery')).toBe('mystery');
  });
});

describe('validateCreateApiKey', () => {
  const now = new Date('2026-09-02T12:00:00.000Z');

  it('accepts a valid key request', () => {
    expect(
      validateCreateApiKey({ name: 'Sync', permissions: ['vehicle:view'] }, now)
    ).toEqual({});
  });

  it('mirrors the server schema: name 1-100, at least one permission', () => {
    expect(validateCreateApiKey({ name: '', permissions: ['a'] }, now).name).toBeTruthy();
    expect(
      validateCreateApiKey({ name: 'x'.repeat(101), permissions: ['a'] }, now).name
    ).toBeTruthy();
    expect(validateCreateApiKey({ name: 'Sync', permissions: [] }, now).permissions).toBeTruthy();
    expect(
      validateCreateApiKey({ name: 'Sync', permissions: undefined }, now).permissions
    ).toBeTruthy();
  });

  it('rejects an expiry in the past — the one rule the server does not have', () => {
    // apiKeyCreateSchema accepts any date, so without this a key could
    // be minted dead on arrival.
    const errors = validateCreateApiKey(
      { name: 'Sync', permissions: ['a'], expiresAt: '2026-09-01' },
      now
    );
    expect(errors.expiresAt).toBeTruthy();
  });

  it('rejects an unparseable expiry', () => {
    expect(
      validateCreateApiKey({ name: 'Sync', permissions: ['a'], expiresAt: 'soon' }, now).expiresAt
    ).toBeTruthy();
  });

  it('accepts no expiry at all', () => {
    expect(
      validateCreateApiKey({ name: 'Sync', permissions: ['a'], expiresAt: null }, now)
    ).toEqual({});
  });
});

describe('toCreateApiKeyPayload', () => {
  it('trims, deduplicates and sends an explicit null for no expiry', () => {
    // The schema is .nullable().optional(); an explicit null says "no
    // expiry" where an omitted key says "unspecified".
    expect(
      toCreateApiKeyPayload({ name: '  Sync  ', permissions: ['a', 'a', 'b'], expiresAt: '' })
    ).toEqual({ name: 'Sync', permissions: ['a', 'b'], expiresAt: null });
  });

  it('normalises a date input into an ISO string', () => {
    const payload = toCreateApiKeyPayload({
      name: 'Sync',
      permissions: ['a'],
      expiresAt: '2027-01-01',
    });
    expect(payload.expiresAt).toMatch(/^2027-01-01T/);
  });

  it('drops empty permission entries', () => {
    expect(
      toCreateApiKeyPayload({ name: 'Sync', permissions: ['a', '', 'b'] }).permissions
    ).toEqual(['a', 'b']);
  });
});

// ─── Audit log ─────────────────────────────────────────────────────────

describe('toAuditLogQuery', () => {
  it('drops empty strings rather than sending them', () => {
    // An empty filter would pass the schema and then match nothing, so
    // the operator would see an empty table and no reason for it.
    expect(
      toAuditLogQuery({ action: '   ', userId: '', entityType: '', entityId: '' })
    ).toEqual({});
  });

  it('keeps only recognised category and severity values', () => {
    expect(toAuditLogQuery({ category: 'security' }).category).toBe('security');
    expect(toAuditLogQuery({ category: 'nonsense' }).category).toBeUndefined();
    expect(toAuditLogQuery({ severity: 'critical' }).severity).toBe('critical');
    expect(toAuditLogQuery({ severity: 'catastrophic' }).severity).toBeUndefined();
  });

  it('clamps limit to the server cap instead of letting it 400', () => {
    expect(toAuditLogQuery({ limit: 5000 }, { maxLimit: 100 }).limit).toBe(100);
    expect(toAuditLogQuery({ limit: 0 }).limit).toBe(1);
    expect(toAuditLogQuery({ limit: 25 }).limit).toBe(25);
  });

  it('clamps page to at least 1', () => {
    expect(toAuditLogQuery({ page: -3 }).page).toBe(1);
  });

  it('widens the end date to cover the whole day selected', () => {
    // A date input hands back midnight, so an unwidened endDate of
    // "today" excludes everything that happened today -- the entries
    // most likely being looked for.
    const query = toAuditLogQuery({ endDate: '2026-09-02' });
    expect(query.endDate).toBeDefined();
    expect(new Date(query.endDate!).getHours()).toBe(23);
    expect(new Date(query.endDate!).getMinutes()).toBe(59);
  });

  it('anchors the start date to the beginning of its day', () => {
    const query = toAuditLogQuery({ startDate: '2026-09-02' });
    expect(new Date(query.startDate!).getHours()).toBe(0);
  });

  it('drops an unparseable date rather than sending Invalid Date', () => {
    expect(toAuditLogQuery({ startDate: 'yesterday', endDate: 'soon' })).toEqual({});
  });

  it('sends tenantId only for a super admin', () => {
    // AuditLogController silently OVERWRITES tenantId with the caller's
    // own for anyone else, so sending it would show a different result
    // than the form claims, with no error.
    expect(toAuditLogQuery({ tenantId: 'acme' }, { isSuperAdmin: true }).tenantId).toBe('acme');
    expect(toAuditLogQuery({ tenantId: 'acme' }, { isSuperAdmin: false }).tenantId).toBeUndefined();
    expect(toAuditLogQuery({ tenantId: 'acme' }).tenantId).toBeUndefined();
  });

  it('truncates over-long values to the server’s field limits', () => {
    const query = toAuditLogQuery({ action: 'x'.repeat(500), userId: 'y'.repeat(500) });
    expect(query.action).toHaveLength(200);
    expect(query.userId).toHaveLength(100);
  });
});

describe('startOfDayIso / endOfDayIso', () => {
  it('returns undefined for empty and unparseable input', () => {
    expect(startOfDayIso('')).toBeUndefined();
    expect(startOfDayIso('   ')).toBeUndefined();
    expect(startOfDayIso(null)).toBeUndefined();
    expect(endOfDayIso('nope')).toBeUndefined();
  });

  it('brackets the same day', () => {
    const start = new Date(startOfDayIso('2026-09-02')!);
    const end = new Date(endOfDayIso('2026-09-02')!);
    expect(start.getTime()).toBeLessThan(end.getTime());
    expect(start.getDate()).toBe(end.getDate());
  });
});

describe('auditActionLabel / auditSeverityLabel / formatAuditTimestamp / shortHash', () => {
  it('humanises an action without losing the original elsewhere', () => {
    expect(auditActionLabel('MEMBER_ROLE_UPDATED')).toBe('Member role updated');
    expect(auditActionLabel(null)).toBe('Unknown action');
  });

  it('labels severities and shows an unknown one verbatim', () => {
    expect(auditSeverityLabel('critical')).toBe('Critical');
    expect(auditSeverityLabel('fatal')).toBe('fatal');
  });

  it('formats a timestamp with both date and time, and never "Invalid Date"', () => {
    // An audit entry's time of day is the point, unlike formatDate.
    expect(formatAuditTimestamp('2026-09-02T10:30:00.000Z')).toMatch(/\d/);
    expect(formatAuditTimestamp('garbage')).toBe('—');
    expect(formatAuditTimestamp(null)).toBe('—');
  });

  it('shortens a hash without padding or faking a missing one', () => {
    expect(shortHash('abcdef0123456789abcdef')).toBe('abcdef012345…');
    expect(shortHash('short')).toBe('short');
    expect(shortHash('')).toBe('—');
    expect(shortHash(null)).toBe('—');
  });
});

describe('canFilterAuditLogByTenant / canViewAuditLog', () => {
  it('mirrors AuthContext.isSuperAdmin, which includes the organization owner', () => {
    // Deliberately NOT stricter than the server: this endpoint uses
    // context.isSuperAdmin (true for both roles), unlike the platform
    // routes which add a literal SUPER_ADMIN check.
    expect(canFilterAuditLogByTenant([Role.SUPER_ADMIN])).toBe(true);
    expect(canFilterAuditLogByTenant([Role.ORGANIZATION_OWNER])).toBe(true);
    expect(canFilterAuditLogByTenant([Role.FLEET_MANAGER])).toBe(false);
  });

  it('fails closed on missing roles', () => {
    expect(canFilterAuditLogByTenant(null)).toBe(false);
    expect(canFilterAuditLogByTenant(undefined)).toBe(false);
    expect(canFilterAuditLogByTenant([])).toBe(false);
    expect(canViewAuditLog(null)).toBe(false);
    expect(canViewAuditLog([])).toBe(false);
  });

  it('resolves audit-log view through the same permission service the route gates on', () => {
    expect(canViewAuditLog([Role.SUPER_ADMIN])).toBe(true);
    expect(canViewAuditLog([Role.DRIVER])).toBe(false);
  });
});
