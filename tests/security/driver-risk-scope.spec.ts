// tests/security/driver-risk-scope.spec.ts
//
// Proves driverRiskService.calculateDriverRisk() is org-unit scoped the
// same way fleetHealthService.calculateHealthScore() is: a caller with a
// narrowed TenantContext only sees drivers assigned to an accessible org
// unit, and only their trips/telematics within that scope feed the score.
//
// FIX (scorecard showing every organization member as a "driver"): this
// suite used to mock resolveOrganization()/organization.members and
// asserted that every org member -- including non-driver roles -- was
// scored. That was pinning the bug in place, not testing a fix. The
// roster now comes from driverRepository (the real tbldrivers
// collection, the same source the Drivers table and the vehicle
// assignment picker use), so this suite mocks driverRepository instead
// and adds an explicit regression test proving organization members who
// are not drivers never appear on the scorecard.

import { driverRiskService } from '../../modules/ai/services/driver-risk.service';
import { driverRepository } from '../../modules/drivers/repositories/driver.repository';
import { tripRepository } from '../../modules/trips/repositories/trip.repository';
import { telematicsRepository } from '../../modules/telematics/repositories/telematics.repository';
import { TenantContext } from '../../modules/tenancy/services/tenant-context.service';

jest.mock('../../modules/drivers/repositories/driver.repository', () => ({
  driverRepository: { findAll: jest.fn(), findAllInScope: jest.fn() },
}));
jest.mock('../../modules/trips/repositories/trip.repository', () => ({
  tripRepository: { findMany: jest.fn() },
}));
jest.mock('../../modules/telematics/repositories/telematics.repository', () => ({
  telematicsRepository: { findMany: jest.fn() },
}));

const mockedFindAll = driverRepository.findAll as jest.Mock;
const mockedFindAllInScope = driverRepository.findAllInScope as jest.Mock;
const mockedTripFindMany = tripRepository.findMany as jest.Mock;
const mockedTelematicsFindMany = telematicsRepository.findMany as jest.Mock;

const ORG = 'willsgrove-farm-enterprises-9e80ed';
const HARARE_BRANCH = 'branch-harare';
const BULAWAYO_BRANCH = 'branch-bulawayo';

const hareDriver = {
  _id: 'driver-harare-1',
  tenantId: ORG,
  name: 'Harare Driver',
  email: 'harare.driver@example.com',
  status: 'active' as const,
  orgUnitId: HARARE_BRANCH,
};

const bulawayoDriver = {
  _id: 'driver-bulawayo-1',
  tenantId: ORG,
  name: 'Bulawayo Driver',
  email: 'bulawayo.driver@example.com',
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
    mockedFindAll.mockResolvedValue([hareDriver, bulawayoDriver]);
    // findAllInScope simulates the repository's own org-unit filtering
    // (see DriverRepository.findAllInScope) so this suite doesn't
    // duplicate that logic -- it just needs to return the scoped subset.
    mockedFindAllInScope.mockImplementation(async (context: TenantContext) => {
      if (context.accessibleOrgUnitIds === null) return [hareDriver, bulawayoDriver];
      return [hareDriver, bulawayoDriver].filter((d) =>
        context.accessibleOrgUnitIds!.includes(d.orgUnitId)
      );
    });
    mockedTripFindMany.mockResolvedValue([]);
    mockedTelematicsFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('with no context (org-wide caller), scores every real driver', async () => {
    const result = await driverRiskService.calculateDriverRisk(ORG);

    expect(mockedFindAll).toHaveBeenCalledWith(ORG);
    expect(result.success).toBe(true);
    expect(result.total).toBe(2);
    const ids = result.results.map((r) => r.entityId).sort();
    expect(ids).toEqual(['driver-bulawayo-1', 'driver-harare-1']);
  });

  it('with a Harare-only context, excludes the Bulawayo driver entirely', async () => {
    const context = makeScopedContext([HARARE_BRANCH]);
    const result = await driverRiskService.calculateDriverRisk(ORG, context);

    expect(mockedFindAllInScope).toHaveBeenCalledWith(context);
    expect(result.success).toBe(true);
    expect(result.total).toBe(1);
    expect(result.results.map((r) => r.entityId)).toEqual(['driver-harare-1']);
  });

  it('with a Harare-only context, the trip query includes the org-unit filter', async () => {
    const context = makeScopedContext([HARARE_BRANCH]);
    await driverRiskService.calculateDriverRisk(ORG, context);

    expect(mockedTripFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        driver_id: hareDriver._id,
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

  it('an empty driver store produces zero scored drivers', async () => {
    mockedFindAll.mockResolvedValue([]);
    mockedFindAllInScope.mockResolvedValue([]);

    const result = await driverRiskService.calculateDriverRisk(ORG);

    expect(result.success).toBe(true);
    expect(result.total).toBe(0);
    expect(result.results).toEqual([]);
  });

  it('REGRESSION: organization members who are not real drivers never appear on the scorecard', async () => {
    // Same shape the bug produced: an organization with accountants,
    // auditors, and managers as members, but only one real tbldrivers
    // record. The roster must come entirely from driverRepository, so
    // no member-derived entry (by email/role) can leak in.
    mockedFindAll.mockResolvedValue([hareDriver]);

    const result = await driverRiskService.calculateDriverRisk(ORG);

    expect(result.total).toBe(1);
    const names = result.results.map((r) =>
      r.success ? (r as { data: { driverName: string } }).data.driverName : undefined
    );
    expect(names).toEqual(['Harare Driver']);
    expect(
      names.some((n) => /manager|accountant|auditor|mechanic|dispatcher/i.test(String(n)))
    ).toBe(false);
  });
});
