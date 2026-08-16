// tests/security/attention-ownership-resolver.spec.ts
//
// PHASE 0, ITEM 1: adversarial tests for the resolver that fixes the
// core bug this pass exists for -- an AttentionItem must be persisted
// scoped to the org unit of the entity it is ABOUT, never the org unit
// the requester happened to have active. Every scenario the audit
// explicitly asked for (Harare-user/Bulawayo-vehicle, cross-tenant,
// missing entity, ambiguous plate is covered by
// vehicle-identity-resolver.spec.ts since this resolver delegates to
// it for the 'vehicle' target kind) is exercised here at the
// resolver's own boundary, independent of needsAttentionService.

import { AttentionOwnershipResolver } from '../../modules/attention/services/attention-ownership.resolver';
import { vehicleRepository } from '../../modules/vehicles/repositories/vehicle.repository';
import { driverRepository } from '../../modules/drivers/repositories/driver.repository';
import { expenseRepository } from '../../modules/expenses/repositories/expense.repository';
import { resolveOrganization } from '../../server/tenancy/organization-resolver';

jest.mock('../../modules/vehicles/repositories/vehicle.repository', () => ({
  vehicleRepository: { findById: jest.fn(), findByLicensePlates: jest.fn() },
}));
jest.mock('../../modules/drivers/repositories/driver.repository', () => ({
  driverRepository: { findById: jest.fn() },
}));
jest.mock('../../modules/expenses/repositories/expense.repository', () => ({
  expenseRepository: { findById: jest.fn() },
}));
jest.mock('../../server/tenancy/organization-resolver', () => ({
  resolveOrganization: jest.fn(),
}));

const mockedVehicleFindById = vehicleRepository.findById as jest.Mock;
const mockedDriverFindById = driverRepository.findById as jest.Mock;
const mockedExpenseFindById = expenseRepository.findById as jest.Mock;
const mockedResolveOrganization = resolveOrganization as jest.Mock;

const TENANT = 'willsgrove-farm-enterprises-9e80ed';
const HARARE_BRANCH = 'branch-harare';
const BULAWAYO_BRANCH = 'branch-bulawayo';

const resolver = new AttentionOwnershipResolver();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AttentionOwnershipResolver.resolveOrgUnitId', () => {
  it('THE CORE BUG: a Harare-active caller surfacing an item about a Bulawayo vehicle resolves to Bulawayo, not the caller\'s active org unit', async () => {
    // The resolver never even sees "the caller's active org unit" -- it
    // isn't part of AttentionOwnerTarget or its inputs at all, which is
    // structurally how this fix prevents the bug from recurring: there
    // is no active-org-unit value available to fall back to.
    mockedVehicleFindById.mockResolvedValue({ _id: 'vehicle-byo', orgUnitId: BULAWAYO_BRANCH });

    const orgUnitId = await resolver.resolveOrgUnitId(TENANT, { kind: 'vehicle', vehicleId: 'vehicle-byo' });

    expect(orgUnitId).toBe(BULAWAYO_BRANCH);
    expect(mockedVehicleFindById).toHaveBeenCalledWith('vehicle-byo', TENANT);
  });

  it('Harare user + Harare vehicle -> resolves Harare', async () => {
    mockedVehicleFindById.mockResolvedValue({ _id: 'vehicle-hre', orgUnitId: HARARE_BRANCH });
    const orgUnitId = await resolver.resolveOrgUnitId(TENANT, { kind: 'vehicle', vehicleId: 'vehicle-hre' });
    expect(orgUnitId).toBe(HARARE_BRANCH);
  });

  it('CROSS-TENANT: a vehicleId belonging to a different tenant never resolves (fails closed, does not leak the other tenant\'s orgUnitId)', async () => {
    // findById is itself tenant-scoped; simulate its real contract --
    // it returns null when the id does not belong to the tenant passed in.
    mockedVehicleFindById.mockImplementation(async (_id: string, tenantId: string) =>
      tenantId === TENANT ? null : { _id: 'vehicle-1', orgUnitId: BULAWAYO_BRANCH }
    );

    const orgUnitId = await resolver.resolveOrgUnitId(TENANT, { kind: 'vehicle', vehicleId: 'vehicle-1' });

    expect(orgUnitId).toBeNull();
  });

  it('MISSING VEHICLE: fails closed rather than guessing', async () => {
    mockedVehicleFindById.mockResolvedValue(null);
    const orgUnitId = await resolver.resolveOrgUnitId(TENANT, { kind: 'vehicle', vehicleId: 'ghost' });
    expect(orgUnitId).toBeNull();
  });

  it('a vehicle that exists but has no orgUnitId of its own (unbackfilled) resolves to null, not undefined-as-truthy or a guess', async () => {
    mockedVehicleFindById.mockResolvedValue({ _id: 'vehicle-1', orgUnitId: undefined });
    const orgUnitId = await resolver.resolveOrgUnitId(TENANT, { kind: 'vehicle', vehicleId: 'vehicle-1' });
    expect(orgUnitId).toBeNull();
  });

  it('NO TARGET (fleet_health-style multi-vehicle recommendation): "none" always resolves to null', async () => {
    const orgUnitId = await resolver.resolveOrgUnitId(TENANT, { kind: 'none' });
    expect(orgUnitId).toBeNull();
    expect(mockedVehicleFindById).not.toHaveBeenCalled();
  });

  it('an undefined target (caller omitted ownerTarget entirely) resolves to null without touching any repository', async () => {
    const orgUnitId = await resolver.resolveOrgUnitId(TENANT, undefined);
    expect(orgUnitId).toBeNull();
    expect(mockedVehicleFindById).not.toHaveBeenCalled();
    expect(mockedDriverFindById).not.toHaveBeenCalled();
  });

  it('a vehicle target with an empty/missing vehicleId fails closed without a lookup', async () => {
    expect(await resolver.resolveOrgUnitId(TENANT, { kind: 'vehicle', vehicleId: undefined })).toBeNull();
    expect(await resolver.resolveOrgUnitId(TENANT, { kind: 'vehicle', vehicleId: '' })).toBeNull();
    expect(mockedVehicleFindById).not.toHaveBeenCalled();
  });

  it('driver target resolves via the standalone drivers table (tbldrivers), not organization.members', async () => {
    mockedDriverFindById.mockResolvedValue({ _id: 'driver-1', orgUnitId: HARARE_BRANCH });
    const orgUnitId = await resolver.resolveOrgUnitId(TENANT, { kind: 'driver', driverId: 'driver-1' });
    expect(orgUnitId).toBe(HARARE_BRANCH);
    expect(mockedResolveOrganization).not.toHaveBeenCalled();
  });

  it('organization-member target (driver_risk) resolves via organization.members[].orgUnitId, by userId', async () => {
    mockedResolveOrganization.mockResolvedValue({
      _id: TENANT,
      members: [
        { userId: 'user-harare-driver', orgUnitId: HARARE_BRANCH },
        { userId: 'user-bulawayo-driver', orgUnitId: BULAWAYO_BRANCH },
      ],
    });

    const orgUnitId = await resolver.resolveOrgUnitId(TENANT, {
      kind: 'organization-member',
      userId: 'user-bulawayo-driver',
    });

    expect(orgUnitId).toBe(BULAWAYO_BRANCH);
    expect(mockedDriverFindById).not.toHaveBeenCalled();
  });

  it('organization-member target fails closed when the member has no orgUnitId (org-wide access, not scoped to a branch)', async () => {
    mockedResolveOrganization.mockResolvedValue({
      _id: TENANT,
      members: [{ userId: 'user-hq-admin' }],
    });

    const orgUnitId = await resolver.resolveOrgUnitId(TENANT, { kind: 'organization-member', userId: 'user-hq-admin' });

    expect(orgUnitId).toBeNull();
  });

  it('organization-member target fails closed when no member matches the userId', async () => {
    mockedResolveOrganization.mockResolvedValue({ _id: TENANT, members: [] });
    const orgUnitId = await resolver.resolveOrgUnitId(TENANT, { kind: 'organization-member', userId: 'ghost-user' });
    expect(orgUnitId).toBeNull();
  });

  it('organization-member target fails closed when the organization itself cannot be resolved', async () => {
    mockedResolveOrganization.mockResolvedValue(null);
    const orgUnitId = await resolver.resolveOrgUnitId(TENANT, { kind: 'organization-member', userId: 'user-1' });
    expect(orgUnitId).toBeNull();
  });

  it('expense target resolves the expense\'s own orgUnitId (already inherited from its vehicle at write time)', async () => {
    mockedExpenseFindById.mockResolvedValue({ _id: 'expense-1', orgUnitId: BULAWAYO_BRANCH });
    const orgUnitId = await resolver.resolveOrgUnitId(TENANT, { kind: 'expense', expenseId: 'expense-1' });
    expect(orgUnitId).toBe(BULAWAYO_BRANCH);
  });

  it('org-unit-direct target passes the caller-supplied value straight through (compliance/maintenance fast path)', async () => {
    const orgUnitId = await resolver.resolveOrgUnitId(TENANT, { kind: 'org-unit-direct', orgUnitId: HARARE_BRANCH });
    expect(orgUnitId).toBe(HARARE_BRANCH);
    // No repository lookups for this fast path -- it trusts a value
    // already read under this tenant's scope by the caller.
    expect(mockedVehicleFindById).not.toHaveBeenCalled();
    expect(mockedDriverFindById).not.toHaveBeenCalled();
  });

  it('org-unit-direct target with a null/undefined value fails closed', async () => {
    expect(await resolver.resolveOrgUnitId(TENANT, { kind: 'org-unit-direct', orgUnitId: null })).toBeNull();
    expect(await resolver.resolveOrgUnitId(TENANT, { kind: 'org-unit-direct', orgUnitId: undefined })).toBeNull();
  });

  it('FAIL CLOSED ON ERROR: a repository throwing never propagates -- resolves to null instead of crashing the whole feed refresh', async () => {
    mockedVehicleFindById.mockRejectedValue(new Error('mongo connection reset'));

    await expect(
      resolver.resolveOrgUnitId(TENANT, { kind: 'vehicle', vehicleId: 'vehicle-1' })
    ).resolves.toBeNull();
  });

  it('resolves multiple items concurrently to their own distinct org units without cross-contamination', async () => {
    mockedVehicleFindById.mockImplementation(async (vehicleId: string) => {
      if (vehicleId === 'vehicle-hre') return { _id: 'vehicle-hre', orgUnitId: HARARE_BRANCH };
      if (vehicleId === 'vehicle-byo') return { _id: 'vehicle-byo', orgUnitId: BULAWAYO_BRANCH };
      return null;
    });

    const [hre, byo] = await Promise.all([
      resolver.resolveOrgUnitId(TENANT, { kind: 'vehicle', vehicleId: 'vehicle-hre' }),
      resolver.resolveOrgUnitId(TENANT, { kind: 'vehicle', vehicleId: 'vehicle-byo' }),
    ]);

    expect(hre).toBe(HARARE_BRANCH);
    expect(byo).toBe(BULAWAYO_BRANCH);
  });
});
