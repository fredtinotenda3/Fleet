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

  it('reports the composite score alongside its methodology', async () => {
    const context = makeScopedContext(null);
    const result = await esgExportService.buildExport(TENANT, context, { format: 'json' });

    expect(result.compositeScore.value).toBeGreaterThanOrEqual(0);
    expect(result.compositeScore.value).toBeLessThanOrEqual(100);
    expect(result.compositeScore.methodology.length).toBeGreaterThan(0);
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
