// tests/unit/analytics/data-quality-coverage.service.spec.ts
//
// PART 11 -- the Data Quality / Coverage service's two load-bearing
// properties:
//   1. Six INDEPENDENT percentages, never blended into one score.
//   2. An empty fleet (0 vehicles in scope) reports zero metrics rather
//      than dividing by zero or fabricating 100%/0% figures.

import { DataQualityCoverageService } from '@/modules/analytics/services/data-quality-coverage.service';
import { vehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import connectToDatabase from '@/infrastructure/database/mongodb';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';

jest.mock('@/modules/vehicles/repositories/vehicle.repository', () => ({
  vehicleRepository: { getFilteredVehiclesInScope: jest.fn() },
}));
jest.mock('@/modules/tenancy/services/tenant-scope.service', () => ({
  tenantScopeService: { buildFilter: jest.fn(() => ({})) },
}));
jest.mock('@/infrastructure/database/mongodb', () => jest.fn());

const mockedVehicleRepo = vehicleRepository as jest.Mocked<typeof vehicleRepository>;
const mockedConnect = connectToDatabase as unknown as jest.Mock;

const CONTEXT: TenantContext = {
  organizationId: 'org-1',
  organizationName: 'Test Fleet Co',
  accessibleOrgUnitIds: null,
  isPlatformScope: false,
} as TenantContext;

function vehicle(overrides: Partial<{ license_plate: string; odometer: number; currentDriverId: string }>) {
  return {
    _id: `veh-${overrides.license_plate ?? Math.random()}`,
    license_plate: overrides.license_plate ?? 'ABC123',
    odometer: overrides.odometer,
    currentDriverId: overrides.currentDriverId,
  };
}

function mockDb(distinctResults: {
  activeDevices?: string[];
  recentFuel?: string[];
  recentTrips?: string[];
  anyMaintenance?: string[];
}) {
  const distinct = jest
    .fn()
    .mockResolvedValueOnce(distinctResults.activeDevices ?? [])
    .mockResolvedValueOnce(distinctResults.recentFuel ?? [])
    .mockResolvedValueOnce(distinctResults.recentTrips ?? [])
    .mockResolvedValueOnce(distinctResults.anyMaintenance ?? []);

  mockedConnect.mockResolvedValue({
    collection: () => ({ distinct }),
  });
  return distinct;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('DataQualityCoverageService.getCoverage', () => {
  it('returns no metrics for an empty fleet rather than dividing by zero', async () => {
    mockedVehicleRepo.getFilteredVehiclesInScope.mockResolvedValue({
      data: [],
      pagination: { total: 0, page: 1, limit: 10_000, totalPages: 0 },
    } as never);
    const distinct = jest.fn();
    mockedConnect.mockResolvedValue({ collection: () => ({ distinct }) });

    const service = new DataQualityCoverageService();
    const report = await service.getCoverage(CONTEXT);

    expect(report.totalVehicles).toBe(0);
    expect(report.metrics).toEqual([]);
    // The early return happens BEFORE any of the sibling-collection
    // queries -- no distinct() call is made against an empty fleet.
    expect(distinct).not.toHaveBeenCalled();
  });

  it('computes six independent coverage percentages, never a blended score', async () => {
    const vehicles = [
      vehicle({ license_plate: 'ABC100', odometer: 12000, currentDriverId: 'drv-1' }),
      vehicle({ license_plate: 'ABC200', odometer: undefined, currentDriverId: undefined }),
      vehicle({ license_plate: 'ABC300', odometer: 5000, currentDriverId: 'drv-2' }),
      vehicle({ license_plate: 'ABC400', odometer: undefined, currentDriverId: undefined }),
    ];
    mockedVehicleRepo.getFilteredVehiclesInScope.mockResolvedValue({
      data: vehicles,
      pagination: { total: 4, page: 1, limit: 10_000, totalPages: 1 },
    } as never);

    mockDb({
      activeDevices: ['veh-ABC100'], // 1 of 4 -> 25%
      recentFuel: ['ABC100', 'ABC200', 'ABC300'], // 3 of 4 -> 75%
      recentTrips: ['ABC100'], // 1 of 4 -> 25%
      anyMaintenance: ['ABC100', 'ABC200', 'ABC300', 'ABC400'], // 4 of 4 -> 100%
    });

    const service = new DataQualityCoverageService();
    const report = await service.getCoverage(CONTEXT);

    expect(report.totalVehicles).toBe(4);
    expect(report.metrics).toHaveLength(6);

    const byLabel = Object.fromEntries(report.metrics.map((m) => [m.label, m]));

    expect(byLabel['GPS / telematics coverage']).toMatchObject({ coveredCount: 1, totalCount: 4, percent: 25 });
    // Odometer known: ABC100 (12000) and ABC300 (5000) -> 2 of 4 = 50%
    expect(byLabel['Odometer coverage']).toMatchObject({ coveredCount: 2, totalCount: 4, percent: 50 });
    expect(byLabel['Fuel record coverage']).toMatchObject({ coveredCount: 3, totalCount: 4, percent: 75 });
    // Driver assigned: ABC100 (drv-1), ABC300 (drv-2) -> 2 of 4 = 50%
    expect(byLabel['Driver assignment coverage']).toMatchObject({ coveredCount: 2, totalCount: 4, percent: 50 });
    expect(byLabel['Trip record coverage']).toMatchObject({ coveredCount: 1, totalCount: 4, percent: 25 });
    expect(byLabel['Maintenance record coverage']).toMatchObject({ coveredCount: 4, totalCount: 4, percent: 100 });

    // Every metric carries its own plain-English definition -- PART 11's
    // "explain what each percentage means" -- and none of them is
    // literally identical to another (the catch for a copy-pasted
    // definition string that forgot to change).
    const definitions = report.metrics.map((m) => m.definition);
    expect(new Set(definitions).size).toBe(definitions.length);
    definitions.forEach((d) => expect(d.length).toBeGreaterThan(10));

    // The whole point of PART 11: no combined/blended score field exists
    // anywhere on the report.
    expect(report).not.toHaveProperty('score');
    expect(report).not.toHaveProperty('overallScore');
    expect(report).not.toHaveProperty('dataQualityScore');
  });

  it('scopes every sibling collection query with the same tenant + org-unit filter used for the vehicle list', async () => {
    mockedVehicleRepo.getFilteredVehiclesInScope.mockResolvedValue({
      data: [vehicle({ license_plate: 'ABC100' })],
      pagination: { total: 1, page: 1, limit: 10_000, totalPages: 1 },
    } as never);
    const distinct = mockDb({});

    const service = new DataQualityCoverageService();
    await service.getCoverage(CONTEXT);

    expect(tenantScopeService.buildFilter).toHaveBeenCalledWith(CONTEXT, 'orgUnitId');
    distinct.mock.calls.forEach((call) => {
      const filter = call[1] as Record<string, unknown>;
      expect(filter).toMatchObject({ tenantId: CONTEXT.organizationId, isDeleted: { $ne: true } });
    });
  });
});
