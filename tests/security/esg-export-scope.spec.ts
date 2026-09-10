// tests/security/esg-export-scope.spec.ts
//
// The ESG/Insurance export is, like the row-based exports covered by
// export-scope-conformance.spec.ts, a highest-consequence read path:
// its output is handed to a third party and kept. Two properties are
// asserted here:
//
//   1. Behavioural -- esgExportService.buildExport() threads the
//      caller's TenantContext into every underlying source
//      (fleetHealthService, driverRiskService, complianceService),
//      and never falls back to an unscoped read.
//   2. Structural -- esg.controller.ts resolves a full TenantContext
//      via resolveTenantContext(req) before calling the service, the
//      same helper every other export controller uses (see
//      export-scope-conformance.spec.ts's header for why a
//      tenantId-only signature is the leak shape this guards against).
//
// Also covers the data-minimization default: named driver risk rows
// are omitted unless the caller explicitly opts in.

import * as fs from 'fs';
import * as path from 'path';
import { esgExportService } from '../../modules/esg/services/esg-export.service';
import { fleetHealthService } from '../../modules/ai/services/fleet-health.service';
import { driverRiskService } from '../../modules/ai/services/driver-risk.service';
import { complianceService } from '../../modules/compliance/services/compliance.service';
import { TenantContext } from '../../modules/tenancy/services/tenant-context.service';

jest.mock('../../modules/ai/services/fleet-health.service', () => ({
  fleetHealthService: { calculateHealthScore: jest.fn() },
}));
jest.mock('../../modules/ai/services/driver-risk.service', () => ({
  driverRiskService: { calculateDriverRisk: jest.fn() },
}));
jest.mock('../../modules/compliance/services/compliance.service', () => ({
  complianceService: { listRules: jest.fn(), listInScope: jest.fn(), list: jest.fn() },
}));

const mockedHealthScore = fleetHealthService.calculateHealthScore as jest.Mock;
const mockedDriverRisk = driverRiskService.calculateDriverRisk as jest.Mock;
const mockedListRules = complianceService.listRules as jest.Mock;
const mockedListInScope = complianceService.listInScope as jest.Mock;
const mockedList = complianceService.list as jest.Mock;

const TENANT = 'willsgrove-farm-enterprises-9e80ed';
const HARARE_BRANCH = 'branch-harare';

function makeScopedContext(accessibleOrgUnitIds: string[] | null): TenantContext {
  return {
    organizationId: TENANT,
    organizationName: 'Willsgrove Farm Enterprises',
    accessibleOrgUnitIds,
    assignedOrgUnitIds: accessibleOrgUnitIds ?? [],
    isPlatformScope: false,
  } as TenantContext;
}

const emptyBatch = { success: true, results: [], total: 0, succeeded: 0, failed: 0, timestamp: new Date() };
const emptyPage = { data: [], pagination: { page: 1, limit: 500, total: 0, totalPages: 0, hasNext: false, hasPrev: false } };
const emptyHealth = { success: true, data: null, timestamp: new Date() };

describe('esgExportService.buildExport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedHealthScore.mockResolvedValue(emptyHealth);
    mockedDriverRisk.mockResolvedValue(emptyBatch);
    mockedListRules.mockResolvedValue([]);
    mockedListInScope.mockResolvedValue(emptyPage);
    mockedList.mockResolvedValue(emptyPage);
  });

  it('threads the caller TenantContext into every underlying source', async () => {
    const context = makeScopedContext([HARARE_BRANCH]);

    await esgExportService.buildExport(TENANT, context, { format: 'json' });

    expect(mockedHealthScore).toHaveBeenCalledWith(TENANT, context);
    expect(mockedDriverRisk).toHaveBeenCalledWith(TENANT, context);
    // Scoped callers must go through listInScope, never the unscoped list().
    expect(mockedListInScope).toHaveBeenCalledWith(undefined, undefined, { page: 1, limit: 500 }, context);
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('omits named driver risk rows unless includeDriverNames is explicitly set', async () => {
    const context = makeScopedContext(null);
    mockedDriverRisk.mockResolvedValue({
      ...emptyBatch,
      results: [
        { entityId: 'driver-1', success: true, data: { driverId: 'driver-1', driverName: 'Tendai Moyo', overallScore: 92, riskLevel: 'critical' } },
      ],
    });

    const withoutNames = await esgExportService.buildExport(TENANT, context, { format: 'json' });
    expect(withoutNames.driverRisk.highRiskDrivers).toBeUndefined();
    expect(withoutNames.driverRisk.distribution.critical).toBe(1);

    const withNames = await esgExportService.buildExport(TENANT, context, {
      format: 'json',
      includeDriverNames: true,
    });
    expect(withNames.driverRisk.highRiskDrivers).toEqual([
      { driverId: 'driver-1', driverName: 'Tendai Moyo', riskLevel: 'critical', overallScore: 92 },
    ]);
  });

  /*
    ─────────────────────────────────────────────────────────────────
    THE COMPOSITE SCORE, AND WHY THIS TEST CHANGED SHAPE
    ─────────────────────────────────────────────────────────────────
    This block previously asserted only `0 <= value <= 100`. Every
    fixture in this file describes a COMPLETELY EMPTY organisation --
    no vehicles scored, no drivers assessed, no compliance records --
    and the old implementation answered 60/100 for it:

        fleetHealth 0 * 0.4  +  compliance 100 * 0.3  +  safety 100 * 0.3

    All three inputs were invented. Two were "perfect" scores for
    populations of zero; the third was the worst possible score for a
    fleet that does not exist. And 60 sat comfortably inside `0..100`,
    so the assertion passed -- a range check cannot tell a measurement
    from a fabrication. That figure is printed into an ESG disclosure
    PDF handed to insurers and auditors.

    So the assertions are now about WHICH inputs were measured, and
    the two branches are tested separately.
  */
  it('refuses to score an organisation with nothing to measure', async () => {
    const context = makeScopedContext(null);
    const result = await esgExportService.buildExport(TENANT, context, { format: 'json' });

    expect(result.compositeScore.value).toBeNull();
    expect(result.compositeScore.excludedComponents.sort()).toEqual([
      'compliance rate',
      'driver safety',
      'fleet health score',
    ]);
    expect(result.compositeScore.methodology).toMatch(/not measured/i);
    // and the section figure it drew on is null too, not 0/100
    expect(result.fleetHealth.overallScore).toBeNull();
  });

  it('renormalises the weights over the components that WERE measured, and says so', async () => {
    const context = makeScopedContext(null);
    // Drivers assessed, nothing else. Driver safety carries 30% of the
    // published weighting; with the other two unmeasurable it must carry
    // 100% of THIS score rather than being diluted by two invented terms.
    mockedDriverRisk.mockResolvedValue({
      ...emptyBatch,
      results: [
        { entityId: 'd1', success: true, data: { driverId: 'd1', driverName: 'A', overallScore: 20, riskLevel: 'low' } },
        { entityId: 'd2', success: true, data: { driverId: 'd2', driverName: 'B', overallScore: 90, riskLevel: 'critical' } },
      ],
    });

    const result = await esgExportService.buildExport(TENANT, context, { format: 'json' });

    // 1 of 2 drivers high/critical -> safety = 50, and it is the only term.
    expect(result.compositeScore.value).toBe(50);
    expect(result.compositeScore.excludedComponents.sort()).toEqual([
      'compliance rate',
      'fleet health score',
    ]);
    expect(result.compositeScore.methodology).toContain('100% driver safety');
    expect(result.compositeScore.methodology).toMatch(/renormalised/i);
  });

  it('scores a measurable organisation on the published weighting', async () => {
    const context = makeScopedContext(null);
    mockedHealthScore.mockResolvedValue({
      success: true,
      timestamp: new Date(),
      data: {
        overallScore: 80,
        vehicleScores: [{ vehicleId: 'v1', licensePlate: 'AFU0078', score: 80, components: {} }],
        metrics: {
          averageVehicleAge: null,
          averageMileage: 0,
          maintenanceCompletionRate: null,
          overdueMaintenanceCount: 0,
          pendingMaintenanceCount: 0,
          fuelEfficiencyAverage: null,
        },
        trends: [],
        recommendations: [],
        timestamp: new Date(),
      },
    });
    mockedDriverRisk.mockResolvedValue({
      ...emptyBatch,
      results: [
        { entityId: 'd1', success: true, data: { driverId: 'd1', driverName: 'A', overallScore: 20, riskLevel: 'low' } },
      ],
    });
    mockedListRules.mockResolvedValue([{ _id: 'r1', name: 'Licence renewal' }]);
    mockedListInScope.mockResolvedValue({
      ...emptyPage,
      data: [{ ruleId: 'r1', entityType: 'driver', entityId: 'd1', status: 'resolved' }],
      pagination: { ...emptyPage.pagination, total: 1 },
    });

    const result = await esgExportService.buildExport(TENANT, context, { format: 'json' });

    // health 80*0.4 + compliance 100*0.3 + safety 100*0.3 = 92
    expect(result.compositeScore.value).toBe(92);
    expect(result.compositeScore.excludedComponents).toEqual([]);
    expect(result.compositeScore.methodology).toContain('40% fleet health score');
    expect(result.compositeScore.methodology).not.toMatch(/renormalised/i);
  });
});

describe('esg.controller.ts resolves a full TenantContext before exporting', () => {
  it('calls resolveTenantContext(req), not a tenantId-only helper', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../modules/esg/controllers/esg.controller.ts'),
      'utf8'
    );

    expect(src).toContain('resolveTenantContext(req)');
    expect(src).toContain('esgExportService.buildExport(tenantId, context');
  });
});
