// tests/security/add-member-direct-account-reuse.spec.ts
//
// Regression suite for a real, reported production incident: a
// Willsgrove member could not log in ("POST /api/auth/token 401") even
// though the password given to them looked correct.
//
// ROOT CAUSE: `OrganizationService.addMemberDirect()`'s "reuse an
// existing tbladmin account" branch (taken whenever the email being
// added already has a row in tbladmin -- a stale account from an
// earlier org, a partial earlier attempt, or a genuinely orphaned
// account) did nothing beyond linking that account to the new
// organization. Two fields the entire login/tenancy model depends on
// were left completely untouched, no matter what the admin filled into
// the "Add member" form:
//
//   Bug A -- password silently discarded. An admin-supplied password is
//   the whole point of "Add directly" (as opposed to "Invite by
//   email"). If the email already had an account, that typed password
//   was thrown away; the account kept whatever hash it already had. The
//   admin then hands the member a credential that looks right and does
//   not match -- exactly an "Invalid email or password" 401, with no
//   server-side error, because the request itself succeeded.
//
//   Bug B -- tenantId silently kept. The reused account's tenantId was
//   never updated to the organization it was just added to. Since a
//   tbladmin account carries exactly one tenantId (no multi-org session
//   support), an account still scoped to a different REAL organization
//   would keep authenticating into that other organization's data, not
//   this one's -- the opposite of "added as a member here," and exactly
//   what the client's "all organizations should log in and see their
//   own data only" requirement forbids.
//
// THE FIX: an explicitly supplied password is now always applied to a
// reused account. An unusable existing tenantId (missing, or a legacy
// 'default'/'system' sentinel) is safely claimed for the new
// organization. An existing tenantId that already belongs to a
// DIFFERENT real organization is refused outright (ConflictError) --
// consistent with this codebase's standing rule that tbladmin.tenantId
// is never silently rewritten outside the audited tenant-data-repair.ts
// pipeline -- rather than silently reassigning someone's account out
// from under their other organization.
//
// Exercised through the REAL OrganizationService, with a real
// OrganizationRepository backed by FakeCollection (the same scaffold
// tests/security/organization-member-tenant-binding.spec.ts already
// establishes for this module) and a minimal AdminUserRepository test
// double whose calls are asserted directly -- the class under test here
// is the SERVICE's decision logic, not Mongo's update mechanics (which
// the new repository methods reduce to a one-line $set, and are exactly
// as trustworthy as the pre-existing resetPassword() they are modelled
// on).

import bcrypt from 'bcryptjs';
import { OrganizationService } from '../../modules/organizations/services/organization.service';
import { OrganizationRepository } from '../../modules/organizations/repositories/organization.repository';
import { AdminUserRepository, AdminUserDoc } from '../../modules/organizations/repositories/admin-user.repository';
import { ConflictError } from '../../server/errors/app.errors';
import { FakeCollection } from '../helpers/fake-collection';

jest.mock('../../infrastructure/monitoring/audit.logger', () => ({
  auditLog: { log: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../../infrastructure/websocket/server', () => ({
  webSocketManager: { emitToUser: jest.fn(), emitToTenant: jest.fn() },
}));

jest.mock('../../infrastructure/queue/queue.service', () => {
  const actual = jest.requireActual('../../infrastructure/queue/queue.service');
  return { ...actual, queueService: { addJob: jest.fn().mockResolvedValue(undefined) } };
});

jest.mock('../../server/events/bus/EventBusFactory', () => ({
  EventBusFactory: { getInstance: () => ({ publish: jest.fn().mockResolvedValue(undefined) }) },
}));

const orgCollection = new FakeCollection();

/** Same override rationale as organization-member-tenant-binding.spec.ts:
 *  FakeCollection doesn't implement $push/$inc, which addMember/
 *  incrementUsedSeats rely on. */
class TestOrganizationRepository extends OrganizationRepository {
  protected async getCollection(): Promise<any> {
    return orgCollection as unknown as any;
  }

  async addMember(organizationId: string, member: any): Promise<boolean> {
    const org = orgCollection.docs.find((d) => d._id === organizationId) as any;
    if (!org) return false;
    org.members.push(member);
    return true;
  }

  async incrementUsedSeats(organizationId: string, delta: number): Promise<boolean> {
    const org = orgCollection.docs.find((d) => d._id === organizationId) as any;
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

/** Minimal, directly-controllable double: exercises the SERVICE's
 *  reuse-decision logic, not tbladmin's Mongo mechanics. */
function fakeAdminUserRepo(seed: AdminUserDoc[]) {
  const rows = new Map(seed.map((r) => [r._id!.toString(), { ...r }]));
  const findByEmail = jest.fn(async (email: string) => {
    const lower = email.toLowerCase();
    return [...rows.values()].find((r) => r.Email.toLowerCase() === lower) ?? null;
  });
  const create = jest.fn(async (data: Omit<AdminUserDoc, '_id' | 'createdAt' | 'updatedAt'>) => {
    const id = `new-${rows.size + 1}` as unknown as AdminUserDoc['_id'];
    const doc = { ...data, _id: id, Email: data.Email.toLowerCase() } as AdminUserDoc & { _id: NonNullable<AdminUserDoc['_id']> };
    rows.set(id!.toString(), doc);
    return doc;
  });
  const resetPassword = jest.fn(async (id: string, passwordHash: string) => {
    const row = rows.get(id);
    if (row) row.Password = passwordHash;
  });
  const setTenantId = jest.fn(async (id: string, tenantId: string) => {
    const row = rows.get(id);
    if (row) row.tenantId = tenantId;
  });
  const repo = { findByEmail, create, resetPassword, setTenantId } as unknown as AdminUserRepository;
  return { repo, rows, findByEmail, create, resetPassword, setTenantId };
}

describe('addMemberDirect: reused-account login/tenant bugs', () => {
  const TENANT_WILLSGROVE = 'willsgrove-farm-enterprises-9e80ed';
  const TENANT_OTHER_ORG = 'toyota-zimbabwe-63078f';
  const ORG_ID = '507f1f77bcf86cd799439011';

  let invalidateOrganizationCache: (tenantId?: string) => void;

  function seedOrg() {
    orgCollection.seed([
      {
        _id: ORG_ID,
        tenantId: TENANT_WILLSGROVE,
        name: 'Willsgrove Farm Enterprises',
        slug: TENANT_WILLSGROVE,
        status: 'active',
        isDeleted: false,
        ownerId: 'owner-willsgrove',
        subscription: {
          tier: 'professional',
          planId: 'pro',
          status: 'active',
          seats: 10,
          usedSeats: 1,
          startDate: new Date(),
          features: [],
        },
        members: [
          {
            userId: 'owner-willsgrove',
            email: 'owner@willsgrove.test',
            name: 'Owner',
            role: 'organization_owner',
            permissions: [],
            status: 'active',
            joinedAt: new Date(),
          },
        ],
        invites: [],
      },
    ]);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (
      require('../../modules/organizations/repositories/organization.repository') as any
    ).organizationRepository = testOrganizationRepository;
    invalidateOrganizationCache = require('../../server/tenancy/organization-resolver').invalidateOrganizationCache;
    invalidateOrganizationCache();
    seedOrg();
  });

  it('applies an admin-supplied password to a reused account instead of discarding it (Bug A)', async () => {
    const staleHash = await bcrypt.hash('old-forgotten-password', 10);
    const { repo, rows, resetPassword } = fakeAdminUserRepo([
      { _id: 'member-1' as any, Email: 'member@willsgrove.test', Password: staleHash, FirstName: 'Member' },
    ]);
    const service = new OrganizationService(testOrganizationRepository, repo);

    const result = await service.addMemberDirect(
      ORG_ID,
      { name: 'Member', email: 'member@willsgrove.test', role: 'fleet_manager', password: 'BrandNewPassw0rd!' },
      'admin-1',
      TENANT_WILLSGROVE
    );

    expect(resetPassword).toHaveBeenCalledWith('member-1', expect.any(String));
    expect(result.temporaryPassword).toBe('BrandNewPassw0rd!');
    expect(result.reusedExistingAccount).toBe(true);

    const stored = rows.get('member-1')!;
    await expect(bcrypt.compare('BrandNewPassw0rd!', stored.Password)).resolves.toBe(true);
    await expect(bcrypt.compare('old-forgotten-password', stored.Password)).resolves.toBe(false);
  });

  it('leaves the password untouched when the admin left it blank on a reused account', async () => {
    const staleHash = await bcrypt.hash('their-existing-password', 10);
    const { repo, rows, resetPassword } = fakeAdminUserRepo([
      { _id: 'member-2' as any, Email: 'member2@willsgrove.test', Password: staleHash, FirstName: 'Member Two' },
    ]);
    const service = new OrganizationService(testOrganizationRepository, repo);

    const result = await service.addMemberDirect(
      ORG_ID,
      { name: 'Member Two', email: 'member2@willsgrove.test', role: 'fleet_manager' },
      'admin-1',
      TENANT_WILLSGROVE
    );

    expect(resetPassword).not.toHaveBeenCalled();
    expect(result.temporaryPassword).toBeUndefined();
    const stored = rows.get('member-2')!;
    await expect(bcrypt.compare('their-existing-password', stored.Password)).resolves.toBe(true);
  });

  it('claims a reused account for this organization when its old tenantId is missing (Bug B, unset case)', async () => {
    const { repo, rows, setTenantId } = fakeAdminUserRepo([
      { _id: 'member-3' as any, Email: 'member3@willsgrove.test', Password: await bcrypt.hash('x', 10), FirstName: 'M3' },
    ]);
    const service = new OrganizationService(testOrganizationRepository, repo);

    await service.addMemberDirect(
      ORG_ID,
      { name: 'M3', email: 'member3@willsgrove.test', role: 'fleet_manager' },
      'admin-1',
      TENANT_WILLSGROVE
    );

    expect(setTenantId).toHaveBeenCalledWith('member-3', TENANT_WILLSGROVE);
    expect(rows.get('member-3')!.tenantId).toBe(TENANT_WILLSGROVE);
  });

  it('claims a reused account for this organization when its old tenantId is a legacy sentinel (Bug B, sentinel case)', async () => {
    const { repo, rows, setTenantId } = fakeAdminUserRepo([
      {
        _id: 'member-4' as any,
        Email: 'member4@willsgrove.test',
        Password: await bcrypt.hash('x', 10),
        FirstName: 'M4',
        tenantId: 'default',
      },
    ]);
    const service = new OrganizationService(testOrganizationRepository, repo);

    await service.addMemberDirect(
      ORG_ID,
      { name: 'M4', email: 'member4@willsgrove.test', role: 'fleet_manager' },
      'admin-1',
      TENANT_WILLSGROVE
    );

    expect(setTenantId).toHaveBeenCalledWith('member-4', TENANT_WILLSGROVE);
    expect(rows.get('member-4')!.tenantId).toBe(TENANT_WILLSGROVE);
  });

  it('refuses to reassign an account that already belongs to a DIFFERENT real organization', async () => {
    const { repo, rows, setTenantId, resetPassword } = fakeAdminUserRepo([
      {
        _id: 'member-5' as any,
        Email: 'member5@example.test',
        Password: await bcrypt.hash('their-real-password', 10),
        FirstName: 'M5',
        tenantId: TENANT_OTHER_ORG,
      },
    ]);
    const service = new OrganizationService(testOrganizationRepository, repo);

    await expect(
      service.addMemberDirect(
        ORG_ID,
        { name: 'M5', email: 'member5@example.test', role: 'fleet_manager', password: 'AttemptedTakeover1!' },
        'admin-1',
        TENANT_WILLSGROVE
      )
    ).rejects.toBeInstanceOf(ConflictError);

    // Nothing about the other organization's account was touched.
    expect(setTenantId).not.toHaveBeenCalled();
    expect(resetPassword).not.toHaveBeenCalled();
    expect(rows.get('member-5')!.tenantId).toBe(TENANT_OTHER_ORG);
    await expect(bcrypt.compare('their-real-password', rows.get('member-5')!.Password)).resolves.toBe(true);
  });

  it('is a no-op on tenantId when the reused account already belongs to this same organization', async () => {
    const { repo, setTenantId } = fakeAdminUserRepo([
      {
        _id: 'member-6' as any,
        Email: 'member6@willsgrove.test',
        Password: await bcrypt.hash('x', 10),
        FirstName: 'M6',
        tenantId: TENANT_WILLSGROVE,
      },
    ]);
    const service = new OrganizationService(testOrganizationRepository, repo);

    await service.addMemberDirect(
      ORG_ID,
      { name: 'M6', email: 'member6@willsgrove.test', role: 'fleet_manager' },
      'admin-1',
      TENANT_WILLSGROVE
    );

    expect(setTenantId).not.toHaveBeenCalled();
  });

  it('brand-new accounts (no prior tbladmin row) are unaffected by the reuse-path fix', async () => {
    const { repo, create, setTenantId, resetPassword } = fakeAdminUserRepo([]);
    const service = new OrganizationService(testOrganizationRepository, repo);

    const result = await service.addMemberDirect(
      ORG_ID,
      { name: 'Fresh Person', email: 'fresh@willsgrove.test', role: 'fleet_manager', password: 'FreshPassw0rd!' },
      'admin-1',
      TENANT_WILLSGROVE
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ Email: 'fresh@willsgrove.test', tenantId: TENANT_WILLSGROVE })
    );
    expect(result.temporaryPassword).toBe('FreshPassw0rd!');
    expect(result.reusedExistingAccount).toBe(false);
    // The reuse-only repair calls must never fire on the create path.
    expect(setTenantId).not.toHaveBeenCalled();
    expect(resetPassword).not.toHaveBeenCalled();
  });
});
