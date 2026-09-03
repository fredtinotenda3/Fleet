// tests/security/organization-member-tenant-binding.spec.ts
//
// PLATFORM_ADMIN_BACKEND_GAPS.md, Gap 2 -- regression suite.
//
// THE VULNERABILITY: every organization-member write route
// (invite/suspend/restore/role-change/remove) takes the organization id
// from the URL and passes it, together with the caller's own tenantId,
// into `OrganizationService.getOrganization(organizationId, tenantId)`.
// That method resolved `organizationId` through `resolveOrganization()`
// and returned whatever it found -- `tenantId` was read by nothing. A
// caller holding `ORG_MEMBERS_MANAGE` in tenant A could therefore name
// tenant B's organization id in the path and the write would land in B.
// `withAuth` checks permission, not resource ownership, so nothing else
// in the request path caught this.
//
// THE FIX: `getOrganization` now requires the resolved organization's
// `tenantId` to match the caller's `tenantId` (via the new
// `matchesTenant` helper in server/tenancy/tenant-scope.ts) unless the
// caller is platform-scoped (`isPlatformScope`, true only for a literal
// SUPER_ADMIN -- see server/auth/auth-context.ts). A mismatch throws
// NotFoundError (404), not a 403, so a cross-tenant probe cannot use the
// response to confirm the id is real.
//
// Exercised through the REAL OrganizationService and OrganizationRepository
// (backed by FakeCollection), and through the REAL resolveOrganization()
// or single-source resolver -- not a mock of the tenant check itself --
// so this proves the actual behaviour of the fixed code path, the same
// approach tests/security/anomaly-ownership.spec.ts uses. Infra with no
// bearing on the authorization decision (audit log, websocket, queue,
// event bus) is stubbed so the suite runs without a live Mongo/Redis/etc.

import { OrganizationService } from '../../modules/organizations/services/organization.service';
import { OrganizationRepository } from '../../modules/organizations/repositories/organization.repository';
import { NotFoundError } from '../../server/errors/app.errors';
import { PLATFORM_SCOPE_TENANT_ID } from '../../server/tenancy/tenant-scope';
import { FakeCollection } from '../helpers/fake-collection';

// ---------------------------------------------------------------------
// Infra stubs -- none of these decide authorization, so they are
// replaced wholesale rather than exercised for real.
// ---------------------------------------------------------------------

jest.mock('../../infrastructure/monitoring/audit.logger', () => ({
  auditLog: {
    log: jest.fn().mockResolvedValue(undefined),
    logCreate: jest.fn().mockResolvedValue(undefined),
    logUpdate: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../infrastructure/websocket/server', () => ({
  webSocketManager: {
    emitToUser: jest.fn(),
    emitToTenant: jest.fn(),
  },
}));

jest.mock('../../infrastructure/queue/queue.service', () => {
  const actual = jest.requireActual('../../infrastructure/queue/queue.service');
  return {
    ...actual,
    queueService: { addJob: jest.fn().mockResolvedValue(undefined) },
  };
});

jest.mock('../../server/events/bus/EventBusFactory', () => ({
  EventBusFactory: {
    getInstance: () => ({ publish: jest.fn().mockResolvedValue(undefined) }),
  },
}));

// ---------------------------------------------------------------------
// The real repository, backed by an in-memory FakeCollection, swapped
// in for the module-level singleton that resolveOrganization() (the
// resolver getOrganization() delegates to) imports directly.
// ---------------------------------------------------------------------

const orgCollection = new FakeCollection();

/**
 * FakeCollection (tests/helpers/fake-collection.ts) matches filter keys
 * literally -- it does not implement MongoDB's dotted-path array
 * matching (`'members.userId': x`) or array update operators (`$push`,
 * `$pull`, positional `$`). OrganizationRepository's member-mutation
 * methods rely on exactly those (see updateMemberStatus, removeMember,
 * updateMemberRole, createInvite), so they are overridden here with
 * small, direct in-memory equivalents that operate on the same
 * `orgCollection.docs` this test seeds and asserts against. Everything
 * this suite actually exercises -- resolveOrganization() via
 * findBySlug/findById, and the tenant-binding check in
 * OrganizationService.getOrganization() -- goes through the real,
 * unmodified repository and collection.
 */
class TestOrganizationRepository extends OrganizationRepository {
  protected async getCollection(): Promise<any> {
    return orgCollection as unknown as any;
  }

  private findDoc(organizationId: string): any {
    return orgCollection.docs.find((d) => d._id === organizationId);
  }

  async updateMemberStatus(
    organizationId: string,
    userId: string,
    status: 'active' | 'suspended'
  ): Promise<boolean> {
    const org = this.findDoc(organizationId);
    const member = org?.members?.find((m: any) => m.userId === userId);
    if (!member) return false;
    member.status = status;
    return true;
  }

  async removeMember(organizationId: string, userId: string): Promise<boolean> {
    const org = this.findDoc(organizationId);
    if (!org) return false;
    const before = org.members.length;
    org.members = org.members.filter((m: any) => m.userId !== userId);
    return org.members.length < before;
  }

  async updateMemberRole(organizationId: string, userId: string, role: string): Promise<boolean> {
    const org = this.findDoc(organizationId);
    const member = org?.members?.find((m: any) => m.userId === userId);
    if (!member) return false;
    member.role = role;
    return true;
  }

  async createInvite(organizationId: string, invite: any): Promise<boolean> {
    const org = this.findDoc(organizationId);
    if (!org) return false;
    org.invites = org.invites || [];
    org.invites.push(invite);
    return true;
  }

  async incrementUsedSeats(organizationId: string, delta: number): Promise<boolean> {
    const org = this.findDoc(organizationId);
    if (!org) return false;
    org.subscription.usedSeats += delta;
    return true;
  }
}

const testOrganizationRepository = new TestOrganizationRepository();

jest.mock('../../modules/organizations/repositories/organization.repository', () => {
  const actual = jest.requireActual('../../modules/organizations/repositories/organization.repository');
  return { ...actual, organizationRepository: undefined };
});

describe('Gap 2: organization member writes are bound to the caller tenant', () => {
  const TENANT_A = 'tenant-a-haulage';
  const TENANT_B = 'tenant-b-logistics';

  // Deliberately real-looking 24-hex ObjectId strings: the repository's
  // member-mutation methods (updateMemberStatus, removeMember, ...)
  // match on `_id: new ObjectId(organizationId)`, so the id used in the
  // "URL" must be one of these, not a slug.
  const ORG_A_ID = '507f1f77bcf86cd799439011';
  const ORG_B_ID = '507f1f77bcf86cd799439022';

  let invalidateOrganizationCache: (tenantId?: string) => void;
  let service: OrganizationService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Point the module registry's singleton at our fake-backed instance
    // so resolveOrganization() (imported independently by
    // organization-resolver.ts) sees the same data this test seeds.
    (
      require('../../modules/organizations/repositories/organization.repository') as any
    ).organizationRepository = testOrganizationRepository;

    // resolveOrganization() memoizes per process for 30s; without
    // clearing it, an org resolved in one test would leak into the
    // next even though the FakeCollection was reseeded.
    invalidateOrganizationCache =
      require('../../server/tenancy/organization-resolver').invalidateOrganizationCache;
    invalidateOrganizationCache();

    orgCollection.seed([
      {
        _id: ORG_A_ID,
        tenantId: TENANT_A,
        name: 'Tenant A Haulage',
        slug: TENANT_A,
        status: 'active',
        isDeleted: false,
        ownerId: 'owner-a',
        subscription: { tier: 'professional', planId: 'pro', status: 'active', seats: 10, usedSeats: 2, startDate: new Date(), features: [] },
        members: [
          { userId: 'owner-a', email: 'owner-a@example.com', name: 'Owner A', role: 'organization_owner', permissions: [], status: 'active', joinedAt: new Date() },
          { userId: 'member-a-1', email: 'member-a-1@example.com', name: 'Member A1', role: 'fleet_manager', permissions: [], status: 'active', joinedAt: new Date() },
        ],
        invites: [],
      },
      {
        _id: ORG_B_ID,
        tenantId: TENANT_B,
        name: 'Tenant B Logistics',
        slug: TENANT_B,
        status: 'active',
        isDeleted: false,
        ownerId: 'owner-b',
        subscription: { tier: 'professional', planId: 'pro', status: 'active', seats: 10, usedSeats: 2, startDate: new Date(), features: [] },
        members: [
          { userId: 'owner-b', email: 'owner-b@example.com', name: 'Owner B', role: 'organization_owner', permissions: [], status: 'active', joinedAt: new Date() },
          { userId: 'member-b-1', email: 'member-b-1@example.com', name: 'Member B1', role: 'fleet_manager', permissions: [], status: 'active', joinedAt: new Date() },
        ],
        invites: [],
      },
    ]);

    service = new OrganizationService(testOrganizationRepository);
  });

  async function expectNotFound(promise: Promise<unknown>) {
    await expect(promise).rejects.toBeInstanceOf(NotFoundError);
    try {
      await promise;
      throw new Error('expected the promise to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundError);
      expect((error as NotFoundError).statusCode).toBe(404);
    }
  }

  // ---------------------------------------------------------------
  // Cross-tenant writes: tenant A caller, tenant B's organization id.
  // ---------------------------------------------------------------

  describe('a tenant A caller cannot act on tenant B members', () => {
    it('suspend: returns 404, not 403, and does not suspend the member', async () => {
      await expectNotFound(
        service.suspendMember(ORG_B_ID, 'member-b-1', 'attacker', TENANT_A)
      );

      const orgB = orgCollection.docs.find((d) => d._id === ORG_B_ID) as any;
      const member = orgB.members.find((m: any) => m.userId === 'member-b-1');
      expect(member.status).toBe('active');
    });

    it('restore: returns 404, not 403', async () => {
      // Seed member-b-1 as already suspended so restore would otherwise
      // be a legal state transition -- isolating the assertion to the
      // tenant check rather than the "not currently suspended" guard.
      const orgB = orgCollection.docs.find((d) => d._id === ORG_B_ID) as any;
      orgB.members.find((m: any) => m.userId === 'member-b-1').status = 'suspended';

      await expectNotFound(
        service.restoreMember(ORG_B_ID, 'member-b-1', 'attacker', TENANT_A)
      );

      expect(orgB.members.find((m: any) => m.userId === 'member-b-1').status).toBe('suspended');
    });

    it('change role: returns 404, not 403, and does not change the role', async () => {
      await expectNotFound(
        service.updateMemberRole(ORG_B_ID, 'member-b-1', 'organization_admin', 'attacker', TENANT_A)
      );

      const orgB = orgCollection.docs.find((d) => d._id === ORG_B_ID) as any;
      expect(orgB.members.find((m: any) => m.userId === 'member-b-1').role).toBe('fleet_manager');
    });

    it('remove: returns 404, not 403, and does not remove the member', async () => {
      await expectNotFound(
        service.removeMember(ORG_B_ID, 'member-b-1', 'attacker', TENANT_A)
      );

      const orgB = orgCollection.docs.find((d) => d._id === ORG_B_ID) as any;
      expect(orgB.members.some((m: any) => m.userId === 'member-b-1')).toBe(true);
    });

    it('invite: returns 404, not 403, and does not create an invite', async () => {
      await expectNotFound(
        service.addMember(ORG_B_ID, 'newperson@example.com', 'fleet_manager', 'attacker', TENANT_A)
      );

      const orgB = orgCollection.docs.find((d) => d._id === ORG_B_ID) as any;
      expect(orgB.invites).toHaveLength(0);
    });

    it('the reverse direction is equally blocked: a tenant B caller cannot reach tenant A', async () => {
      await expectNotFound(
        service.suspendMember(ORG_A_ID, 'member-a-1', 'attacker', TENANT_B)
      );
    });
  });

  // ---------------------------------------------------------------
  // Same-tenant writes keep working.
  // ---------------------------------------------------------------

  describe('same-tenant member operations continue to work', () => {
    it('suspend succeeds for a caller acting on their own organization', async () => {
      await expect(
        service.suspendMember(ORG_A_ID, 'member-a-1', 'org-a-admin', TENANT_A)
      ).resolves.toBeUndefined();
    });

    it('restore succeeds for a caller acting on their own organization', async () => {
      const orgA = orgCollection.docs.find((d) => d._id === ORG_A_ID) as any;
      orgA.members.find((m: any) => m.userId === 'member-a-1').status = 'suspended';

      await expect(
        service.restoreMember(ORG_A_ID, 'member-a-1', 'org-a-admin', TENANT_A)
      ).resolves.toBeUndefined();
    });

    it('role change succeeds for a caller acting on their own organization', async () => {
      await expect(
        service.updateMemberRole(ORG_A_ID, 'member-a-1', 'organization_admin', 'org-a-admin', TENANT_A)
      ).resolves.toBeUndefined();
    });

    it('remove succeeds for a caller acting on their own organization', async () => {
      await expect(
        service.removeMember(ORG_A_ID, 'member-a-1', 'org-a-admin', TENANT_A)
      ).resolves.toBeUndefined();
    });

    it('invite succeeds for a caller acting on their own organization', async () => {
      await expect(
        service.addMember(ORG_A_ID, 'newperson@example.com', 'fleet_manager', 'org-a-admin', TENANT_A)
      ).resolves.toMatchObject({ email: 'newperson@example.com' });
    });
  });

  // ---------------------------------------------------------------
  // Platform-scoped / super-admin access still works.
  // ---------------------------------------------------------------

  describe('platform-scoped access is preserved', () => {
    it('getOrganization does not enforce tenant binding for a platform-scoped caller', async () => {
      const orgB = await service.getOrganization(ORG_B_ID, PLATFORM_SCOPE_TENANT_ID);
      expect(orgB.tenantId).toBe(TENANT_B);
    });

    it('a platform-scoped caller can suspend a member in any organization', async () => {
      await expect(
        service.suspendMember(ORG_B_ID, 'member-b-1', 'super-admin-1', PLATFORM_SCOPE_TENANT_ID)
      ).resolves.toBeUndefined();
    });

    it('a platform-scoped caller can change role for a member in any organization', async () => {
      await expect(
        service.updateMemberRole(
          ORG_A_ID,
          'member-a-1',
          'organization_admin',
          'super-admin-1',
          PLATFORM_SCOPE_TENANT_ID
        )
      ).resolves.toBeUndefined();
    });

    it('PlatformService-style direct resolution (bypassing getOrganization) is unaffected', async () => {
      // PlatformService.getOrganization calls resolveOrganization()
      // directly rather than through OrganizationService.getOrganization,
      // and is gated on the literal Role.SUPER_ADMIN at the controller.
      // This asserts that path still resolves cross-tenant, i.e. the
      // fix lives in the tenant-binding check and not in
      // resolveOrganization() itself.
      const { resolveOrganization } = require('../../server/tenancy/organization-resolver');
      const orgB = await resolveOrganization(ORG_B_ID);
      expect(orgB?.tenantId).toBe(TENANT_B);
    });
  });

  // ---------------------------------------------------------------
  // Not-found stays not-found (no behavioural change for a genuinely
  // missing organization).
  // ---------------------------------------------------------------

  it('a nonexistent organization id still 404s for any caller', async () => {
    await expectNotFound(
      service.suspendMember('507f1f77bcf86cd799439099', 'member-a-1', 'org-a-admin', TENANT_A)
    );
  });
});
