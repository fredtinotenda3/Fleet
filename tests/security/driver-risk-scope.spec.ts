// tests/security/driver-risk-scope.spec.ts
//
// Proves driverRiskService.calculateDriverRisk() is org-unit scoped the
// same way fleetHealthService.calculateHealthScore() is: a caller with a
// narrowed TenantContext only sees drivers assigned to an accessible org
// unit, and only their trips/telematics within that scope feed the score.
//
// Mirrors the mocking style of
// tests/security/org-unit-descendants-objectid.spec.ts -- mock the
// repositories at the boundary this service actually calls, rather than
// standing up a real Mongo connection.

import { driverRiskService } from '../../modules/ai/services/driver-risk.service';
import { resolveOrganization } from '../../server/tenancy/organization-resolver';
import { tripRepository } from '../../modules/trips/repositories/trip.repository';
import { telematicsRepository } from '../../modules/telematics/repositories/telematics.repository';
import { TenantContext } from '../../modules/tenancy/services/tenant-context.service';

jest.mock('../../server/tenancy/organization-resolver', () => ({
  resolveOrganization: jest.fn(),
}));
jest.mock('../../modules/trips/repositories/trip.repository', () => ({
  tripRepository: { findMany: jest.fn() },
}));
jest.mock('../../modules/telematics/repositories/telematics.repository', () => ({
  telematicsRepository: { findMany: jest.fn() },
}));

const mockedResolveOrganization = resolveOrganization as jest.Mock;
const mockedTripFindMany = tripRepository.findMany as jest.Mock;
const mockedTelematicsFindMany = telematicsRepository.findMany as jest.Mock;

const ORG = 'willsgrove-farm-enterprises-9e80ed';
const HARARE_BRANCH = 'branch-harare';
const BULAWAYO_BRANCH = 'branch-bulawayo';

const hareDriver = {
  userId: 'user-harare-driver',
  name: 'Harare Driver',
  email: 'harare@example.com',
  role: 'member',
  permissions: [],
  status: 'active' as const,
  orgUnitId: HARARE_BRANCH,
};

const bulawayoDriver = {
  userId: 'user-bulawayo-driver',
  name: 'Bulawayo Driver',
  email: 'bulawayo@example.com',
  role: 'member',
  permissions: [],
  status: 'active' as const,
  orgUnitId: BULAWAYO_BRANCH,
};

function makeScopedContext(accessibleOrgUnitIds: string[] | null): TenantContext {
  return {
    organizationId: ORG,
    organizationName: 'Willsgrove Farm Enterprises',
    accessibleOrgUnitIds,
    assignedOrgUnitIds: accessibleOrgUnitIds ?? [],
    isPlatformScope: false,
  };
}

describe('driver-risk org-unit scoping', () => {
  beforeEach(() => {
    mockedResolveOrganization.mockResolvedValue({
      _id: ORG,
      name: 'Willsgrove Farm Enterprises',
      members: [hareDriver, bulawayoDriver],
    });
    mockedTripFindMany.mockResolvedValue([]);
    mockedTelematicsFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('with no context (org-wide caller), scores every member', async () => {
    const result = await driverRiskService.calculateDriverRisk(ORG);

    expect(result.success).toBe(true);
    expect(result.total).toBe(2);
    const ids = result.results.map((r) => r.entityId).sort();
    expect(ids).toEqual(['user-bulawayo-driver', 'user-harare-driver']);
  });

  it('with a Harare-only context, excludes the Bulawayo driver entirely', async () => {
    const context = makeScopedContext([HARARE_BRANCH]);
    const result = await driverRiskService.calculateDriverRisk(ORG, context);

    expect(result.success).toBe(true);
    expect(result.total).toBe(1);
    expect(result.results.map((r) => r.entityId)).toEqual(['user-harare-driver']);
  });

  it('with a Harare-only context, the trip query includes the org-unit filter', async () => {
    const context = makeScopedContext([HARARE_BRANCH]);
    await driverRiskService.calculateDriverRisk(ORG, context);

    expect(mockedTripFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        driver_id: hareDriver.userId,
        orgUnitId: { $in: [HARARE_BRANCH] },
      }),
      ORG
    );
  });

  it('with accessibleOrgUnitIds resolved to an empty array, fails closed (zero drivers, zero data)', async () => {
    const context = makeScopedContext([]);
    const result = await driverRiskService.calculateDriverRisk(ORG, context);

    expect(result.success).toBe(true);
    expect(result.total).toBe(0);
    expect(mockedTripFindMany).not.toHaveBeenCalled();
  });

  it('a member with no orgUnitId is invisible to a scope-narrowed caller (fail-closed, matches driver.tenancy-addendum precedent)', async () => {
    mockedResolveOrganization.mockResolvedValue({
      _id: ORG,
      name: 'Willsgrove Farm Enterprises',
      members: [{ ...hareDriver, orgUnitId: undefined }, bulawayoDriver],
    });

    const context = makeScopedContext([HARARE_BRANCH]);
    const result = await driverRiskService.calculateDriverRisk(ORG, context);

    expect(result.total).toBe(0);
  });
});
