// modules/notifications/authorization/__tests__/notification-broadcast.authorization.test.ts
//
// Verification scenarios for Phase C's write-path security fix. Mocks
// only tenantContextService.resolveContext() -- the one piece that
// needs a real database (UserScopeAssignment lookups,
// orgUnitRepository.getDescendantIds()) -- and exercises the real,
// unmocked permissionService (server/permissions/roles.ts) and
// tenantScopeService (modules/tenancy/services/tenant-scope.service.ts)
// so what's actually under test is the composition in
// authorizeBroadcast(), not a re-implementation of it.
//
// Each mocked resolveContext() return value is exactly what the real
// implementation would produce for that role, given its documented
// behaviour (FULL_ORG_UNIT_VISIBILITY_ROLES -> null;
// UserScopeAssignment + getDescendantIds() -> concrete id array) -- see
// tenant-context.service.ts's own comments for the contract being
// stood in for here.

import { authorizeBroadcast } from '../notification-broadcast.authorization';
import { tenantContextService } from '@/modules/tenancy/services/tenant-context.service';
import { ForbiddenError } from '@/server/errors/app.errors';

jest.mock('@/modules/tenancy/services/tenant-context.service', () => ({
  tenantContextService: { resolveContext: jest.fn() },
}));

const resolveContext = tenantContextService.resolveContext as jest.Mock;

const TENANT_ID = 'org-1';
const BRANCH_A = 'branch-a';
const BRANCH_A_DEPT = 'branch-a-dept-1';
const BRANCH_A_FLEET = 'branch-a-fleet-1';
const BRANCH_B = 'branch-b'; // sibling branch, outside Branch A's hierarchy
const FLEET_X = 'fleet-x';
const FLEET_X_CHILD_WORKSHOP = 'fleet-x-workshop-1';
const FLEET_Y = 'fleet-y'; // unrelated fleet
const WORKSHOP_Z = 'workshop-z';
const WORKSHOP_OTHER = 'workshop-other';

beforeEach(() => {
  resolveContext.mockReset();
});

describe('authorizeBroadcast -- requirement 4: Platform Admin (SUPER_ADMIN)', () => {
  it('may broadcast to any org unit', async () => {
    resolveContext.mockResolvedValue({
      organizationId: TENANT_ID,
      organizationName: TENANT_ID,
      accessibleOrgUnitIds: null, // unrestricted
    });

    await expect(
      authorizeBroadcast({
        userId: 'u-super',
        tenantId: TENANT_ID,
        roles: ['super_admin'],
        isSuperAdmin: true,
        targetOrgUnitId: BRANCH_B,
      })
    ).resolves.toMatchObject({ accessibleOrgUnitIds: null });
  });
});

describe('authorizeBroadcast -- requirement 5: Organization Owner / Admin', () => {
  it.each([['organization_owner'], ['organization_admin']])(
    '%s may broadcast anywhere within their organization',
    async (role) => {
      resolveContext.mockResolvedValue({
        organizationId: TENANT_ID,
        organizationName: TENANT_ID,
        accessibleOrgUnitIds: null,
      });

      await expect(
        authorizeBroadcast({
          userId: 'u-owner',
          tenantId: TENANT_ID,
          roles: [role],
          isSuperAdmin: false,
          targetOrgUnitId: WORKSHOP_OTHER,
        })
      ).resolves.toMatchObject({ accessibleOrgUnitIds: null });
    }
  );
});

describe('authorizeBroadcast -- requirement 6: Branch Manager', () => {
  const branchManagerContext = {
    organizationId: TENANT_ID,
    organizationName: TENANT_ID,
    accessibleOrgUnitIds: [BRANCH_A, BRANCH_A_DEPT, BRANCH_A_FLEET],
  };

  it('may broadcast within their own assigned branch', async () => {
    resolveContext.mockResolvedValue(branchManagerContext);
    await expect(
      authorizeBroadcast({
        userId: 'u-branch-mgr',
        tenantId: TENANT_ID,
        roles: ['branch_manager'],
        isSuperAdmin: false,
        targetOrgUnitId: BRANCH_A,
      })
    ).resolves.toBeDefined();
  });

  it('may broadcast to a descendant department/fleet inside their branch hierarchy', async () => {
    resolveContext.mockResolvedValue(branchManagerContext);
    await expect(
      authorizeBroadcast({
        userId: 'u-branch-mgr',
        tenantId: TENANT_ID,
        roles: ['branch_manager'],
        isSuperAdmin: false,
        targetOrgUnitId: BRANCH_A_DEPT,
      })
    ).resolves.toBeDefined();
  });

  it('CANNOT broadcast to a sibling branch outside their hierarchy -- 403', async () => {
    resolveContext.mockResolvedValue(branchManagerContext);
    await expect(
      authorizeBroadcast({
        userId: 'u-branch-mgr',
        tenantId: TENANT_ID,
        roles: ['branch_manager'],
        isSuperAdmin: false,
        targetOrgUnitId: BRANCH_B,
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('authorizeBroadcast -- requirement 7: Fleet Manager', () => {
  const fleetManagerContext = {
    organizationId: TENANT_ID,
    organizationName: TENANT_ID,
    accessibleOrgUnitIds: [FLEET_X, FLEET_X_CHILD_WORKSHOP],
  };

  it('may broadcast within their own assigned fleet hierarchy', async () => {
    resolveContext.mockResolvedValue(fleetManagerContext);
    await expect(
      authorizeBroadcast({
        userId: 'u-fleet-mgr',
        tenantId: TENANT_ID,
        roles: ['fleet_manager'],
        isSuperAdmin: false,
        targetOrgUnitId: FLEET_X_CHILD_WORKSHOP,
      })
    ).resolves.toBeDefined();
  });

  it('CANNOT broadcast to an unrelated fleet -- 403', async () => {
    resolveContext.mockResolvedValue(fleetManagerContext);
    await expect(
      authorizeBroadcast({
        userId: 'u-fleet-mgr',
        tenantId: TENANT_ID,
        roles: ['fleet_manager'],
        isSuperAdmin: false,
        targetOrgUnitId: FLEET_Y,
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('authorizeBroadcast -- requirement 8: Workshop Manager', () => {
  const workshopManagerContext = {
    organizationId: TENANT_ID,
    organizationName: TENANT_ID,
    accessibleOrgUnitIds: [WORKSHOP_Z],
  };

  it('may broadcast within their own assigned workshop', async () => {
    resolveContext.mockResolvedValue(workshopManagerContext);
    await expect(
      authorizeBroadcast({
        userId: 'u-workshop-mgr',
        tenantId: TENANT_ID,
        roles: ['workshop_manager'],
        isSuperAdmin: false,
        targetOrgUnitId: WORKSHOP_Z,
      })
    ).resolves.toBeDefined();
  });

  it('CANNOT broadcast to a different workshop -- 403', async () => {
    resolveContext.mockResolvedValue(workshopManagerContext);
    await expect(
      authorizeBroadcast({
        userId: 'u-workshop-mgr',
        tenantId: TENANT_ID,
        roles: ['workshop_manager'],
        isSuperAdmin: false,
        targetOrgUnitId: WORKSHOP_OTHER,
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('authorizeBroadcast -- requirement 9: non-management roles are denied outright', () => {
  it.each([['driver'], ['mechanic'], ['viewer'], ['accountant'], ['dispatcher'], ['auditor']])(
    '%s receives 403 without ever resolving org-unit scope',
    async (role) => {
      await expect(
        authorizeBroadcast({
          userId: 'u-non-mgmt',
          tenantId: TENANT_ID,
          roles: [role],
          isSuperAdmin: false,
          targetOrgUnitId: BRANCH_A, // even a plausible-looking target must still fail
        })
      ).rejects.toBeInstanceOf(ForbiddenError);

      // Fail-fast: role gate must reject before scope is even resolved,
      // so a forbidden caller never triggers a resolveContext() lookup.
      expect(resolveContext).not.toHaveBeenCalled();
    }
  );

  it('a role with no NOTIFICATION_BROADCAST grant cannot bypass via a crafted activeOrgUnitId header', async () => {
    await expect(
      authorizeBroadcast({
        userId: 'u-driver',
        tenantId: TENANT_ID,
        roles: ['driver'],
        isSuperAdmin: false,
        activeOrgUnitId: BRANCH_A,
        targetOrgUnitId: BRANCH_A,
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('authorizeBroadcast -- requirement 3: fail-closed on empty resolved scope', () => {
  it('a manager role with a permission grant but no live UserScopeAssignment (resolves to []) is denied', async () => {
    resolveContext.mockResolvedValue({
      organizationId: TENANT_ID,
      organizationName: TENANT_ID,
      accessibleOrgUnitIds: [], // assignment existed but resolved to nothing, e.g. deleted org unit
    });

    await expect(
      authorizeBroadcast({
        userId: 'u-branch-mgr-orphaned',
        tenantId: TENANT_ID,
        roles: ['branch_manager'],
        isSuperAdmin: false,
        targetOrgUnitId: BRANCH_A,
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});