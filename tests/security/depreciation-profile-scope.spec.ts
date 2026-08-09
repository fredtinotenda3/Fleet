// tests/security/depreciation-profile-scope.spec.ts
//
// DepreciationProfileRepository is the one repository in the finance
// module that is deliberately MUTABLE (see its file header: a profile is
// policy, not evidence, so a typo'd acquisition cost must be fixable).
// That makes its scoping the thing to pin down, because a mutable
// financial-policy record read without org-unit scope is worse than a
// leaked read: the service uses findByVehicleInScope to decide whether a
// profile already exists before writing, so an unscoped read would let a
// branch-scoped caller overwrite another branch's depreciation policy.
//
// Also pins the one immutability rule that DOES apply here: hardDelete
// is blocked, because a physical delete would orphan the depreciation
// postings in tblallocationledger that reference the profile.

import { DepreciationProfileRepository } from '../../modules/finance/repositories/depreciation-profile.repository';
import { FakeCollection } from '../helpers/fake-collection';
import type { VehicleDepreciationProfile } from '../../modules/finance/types/depreciation.types';
import type { TenantContext } from '../../modules/tenancy/services/tenant-context.service';

const TENANT = 'willsgrove-farm-enterprises-9e80ed';
const OTHER_TENANT = 'toyota-zimbabwe-63078f';
const HARARE = 'unit-harare';
const BULAWAYO = 'unit-bulawayo';
const VEHICLE = '507f1f77bcf86cd799439011';

const collection = new FakeCollection();

class TestDepreciationProfileRepository extends DepreciationProfileRepository {
  protected async getCollection(): Promise<any> {
    return collection as unknown as any;
  }
}

const repo = new TestDepreciationProfileRepository();

function contextFor(organizationId: string, accessibleOrgUnitIds: string[] | null): TenantContext {
  return {
    organizationId,
    organizationName: 'Test Org',
    accessibleOrgUnitIds,
    assignedOrgUnitIds: accessibleOrgUnitIds ?? [],
    isPlatformScope: false,
  } as unknown as TenantContext;
}

type CreateInput = Omit<
  VehicleDepreciationProfile,
  '_id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt' | 'updatedBy'
>;

function makeProfile(overrides: Partial<CreateInput> = {}): CreateInput {
  return {
    orgUnitId: HARARE,
    vehicleId: VEHICLE,
    method: 'straight-line',
    currency: 'USD',
    acquisitionCost: 30000,
    acquisitionDate: new Date('2024-01-01T00:00:00.000Z'),
    salvageValue: 5000,
    usefulLifeMonths: 60,
    createdBy: 'user-1',
    ...overrides,
  };
}

beforeEach(() => {
  collection.docs = [];
  collection.seenFilters = [];
});

describe('DepreciationProfileRepository -- mutable policy, scoped reads', () => {
  it('findByVehicleInScope returns the profile for an in-scope vehicle', async () => {
    await repo.create(makeProfile(), TENANT, 'user-1');

    const profile = await repo.findByVehicleInScope(VEHICLE, contextFor(TENANT, [HARARE]));
    expect(profile).not.toBeNull();
    expect(profile!.acquisitionCost).toBe(30000);
  });

  it('findByVehicleInScope hides a profile in another org unit', async () => {
    await repo.create(makeProfile({ orgUnitId: BULAWAYO }), TENANT, 'user-1');

    const profile = await repo.findByVehicleInScope(VEHICLE, contextFor(TENANT, [HARARE]));
    // Critical: null here makes the service treat it as "no profile
    // exists" and CREATE one rather than update Bulawayo's. Both
    // outcomes are correct precisely because the read was scoped.
    expect(profile).toBeNull();
  });

  it('findByVehicleInScope hides another tenant\'s profile', async () => {
    await repo.create(makeProfile(), OTHER_TENANT, 'user-x');

    const profile = await repo.findByVehicleInScope(VEHICLE, contextFor(TENANT, null));
    expect(profile).toBeNull();
  });

  it('fails closed on an empty accessible-unit set', async () => {
    await repo.create(makeProfile(), TENANT, 'user-1');

    expect(await repo.findByVehicleInScope(VEHICLE, contextFor(TENANT, []))).toBeNull();
    expect(await repo.findAllInScope(contextFor(TENANT, []))).toEqual([]);
  });

  it('findAllInScope returns only in-scope profiles', async () => {
    await repo.create(makeProfile({ orgUnitId: HARARE }), TENANT, 'u1');
    await repo.create(
      makeProfile({ orgUnitId: BULAWAYO, vehicleId: '507f1f77bcf86cd799439022' }),
      TENANT,
      'u2'
    );

    const harare = await repo.findAllInScope(contextFor(TENANT, [HARARE]));
    expect(harare).toHaveLength(1);
    expect(harare[0].orgUnitId).toBe(HARARE);

    const both = await repo.findAllInScope(contextFor(TENANT, [HARARE, BULAWAYO]));
    expect(both).toHaveLength(2);
  });

  it('scoped reads carry both the tenant filter and the org-unit predicate', async () => {
    await repo.create(makeProfile(), TENANT, 'u1');
    collection.seenFilters = [];

    await repo.findByVehicleInScope(VEHICLE, contextFor(TENANT, [HARARE]));

    const filter = collection.lastFilter();
    expect(filter.tenantId).toBe(TENANT);
    expect(filter.isDeleted).toEqual({ $ne: true });
    expect(filter.orgUnitId).toEqual({ $in: [HARARE] });
  });

  it('update() IS permitted -- a profile is correctable policy, unlike a ledger posting', async () => {
    const created = await repo.create(makeProfile(), TENANT, 'u1');

    const updated = await repo.update(
      String(created._id),
      { usefulLifeMonths: 72 } as never,
      TENANT,
      'u2'
    );

    expect(updated).not.toBeNull();
    expect(updated!.usefulLifeMonths).toBe(72);
  });

  it('hardDelete() throws ConflictError and never removes the row', async () => {
    const { ConflictError } = await import('../../server/errors/app.errors');
    await repo.create(makeProfile(), TENANT, 'u1');

    await expect(repo.hardDelete()).rejects.toBeInstanceOf(ConflictError);
    await expect(repo.hardDelete()).rejects.toThrow(/cannot be hard-deleted/);
    expect(collection.docs).toHaveLength(1);
  });
});
