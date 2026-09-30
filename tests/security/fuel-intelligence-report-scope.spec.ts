// tests/security/fuel-intelligence-report-scope.spec.ts
//
// PART 18 ("All changes must preserve tenant isolation, org-unit
// isolation, RBAC... Reporting/export layer must never allow cross-
// tenant access. Test: empty scope, wrong tenant, unauthorized user,
// missing permissions, cross-org-unit data, driver/vehicle attribution
// leakage, report export leakage.") for the new Monthly Fuel & Fleet
// Intelligence Report endpoint.
//
// Mirrors tests/security/esg-export-scope.spec.ts's two-property
// approach for the same class of endpoint (an aggregate report/export,
// not a raw row export already covered by
// export-scope-conformance.spec.ts):
//   1. Structural -- the controller resolves a full TenantContext via
//      resolveTenantContext(req), never a tenantId-only helper, and the
//      API route requires an explicit permission.
//   2. Behavioural -- the service threads that EXACT TenantContext
//      object into every underlying repository call, for every scope
//      shape (unrestricted, single-branch, and empty/fail-closed), and
//      never substitutes a broader one.

import * as fs from 'fs';
import * as path from 'path';
import { fuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { allocationLedgerRepository } from '@/modules/finance/repositories/allocation-ledger.repository';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';

jest.mock('@/modules/fuel/repositories/fuel.repository', () => ({
  fuelRepository: {
    getFuelStats: jest.fn(),
    getFuelingFrequencyByVehicle: jest.fn(),
    getFuelByDriver: jest.fn(),
    getFuelByAssignedDriver: jest.fn(),
    getFuelTypeDistribution: jest.fn(),
    getAbnormalConsumption: jest.fn(),
    getFilteredLogsForExport: jest.fn(),
  },
}));
jest.mock('@/modules/finance/repositories/allocation-ledger.repository', () => ({
  allocationLedgerRepository: {
    getNetTotalsGrouped: jest.fn(),
  },
}));

import { monthlyFuelIntelligenceService } from '../../modules/fuel/reporting/monthly-fuel-intelligence.service';

const mockedFuel = fuelRepository as jest.Mocked<typeof fuelRepository>;
const mockedLedger = allocationLedgerRepository as jest.Mocked<typeof allocationLedgerRepository>;

const ROOT = path.resolve(__dirname, '../..');
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

const EMPTY_STATS = { totalFuel: 0, totalCost: 0, averageCostPerUnit: 0, logCount: 0, efficiency: null, paymentBreakdown: [] };
const EMPTY_EXPORT = { rows: [], totalMatched: 0, truncated: false, exportCap: 50000 };

function mockAllEmpty() {
  mockedFuel.getFuelStats.mockResolvedValue(EMPTY_STATS as never);
  mockedFuel.getFuelingFrequencyByVehicle.mockResolvedValue([]);
  mockedFuel.getFuelByDriver.mockResolvedValue([]);
  mockedFuel.getFuelByAssignedDriver.mockResolvedValue([]);
  mockedFuel.getFuelTypeDistribution.mockResolvedValue([]);
  mockedFuel.getAbnormalConsumption.mockResolvedValue([]);
  mockedFuel.getFilteredLogsForExport.mockResolvedValue(EMPTY_EXPORT as never);
  mockedLedger.getNetTotalsGrouped.mockResolvedValue([]);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAllEmpty();
});

describe('fuel-intelligence.controller.ts: structural scoping', () => {
  const src = fs.readFileSync(path.join(ROOT, 'modules/fuel/controllers/fuel-intelligence.controller.ts'), 'utf8');

  it('resolves a full TenantContext via resolveTenantContext(req), not a tenantId-only helper', () => {
    expect(src).toContain('resolveTenantContext(req)');
    expect(src).toContain('monthlyFuelIntelligenceService.buildReport(tenantId, context');
  });

  it('never accepts a caller-supplied tenant/org id for the data itself (no tenantId read from query/body)', () => {
    expect(src).not.toMatch(/searchParams\.get\(['"]tenant/i);
    expect(src).not.toMatch(/req\.(body|json\(\))[^;]*tenantId/i);
  });
});

describe('app/api/fuel/monthly-intelligence-report/route.ts: requires an explicit permission', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app/api/fuel/monthly-intelligence-report/route.ts'), 'utf8');

  it('is wrapped in withAuth with a named permission, not left open', () => {
    expect(src).toMatch(/withAuth\(/);
    expect(src).toMatch(/permission:\s*Permission\.\w+/);
  });
});

describe('MonthlyFuelIntelligenceService: TenantContext threading across scope shapes', () => {
  it.each([
    ['unrestricted (platform/org-wide role)', null],
    ['single branch', [HARARE_BRANCH]],
    ['empty scope (assigned to nothing -- fail closed)', []],
  ])('threads the exact %s context object into every repository call, never a broadened one', async (_label, accessibleOrgUnitIds) => {
    const context = makeScopedContext(accessibleOrgUnitIds);

    await monthlyFuelIntelligenceService.buildReport(TENANT, context, '2026-09');

    for (const call of mockedFuel.getFuelStats.mock.calls) expect(call).toContain(context);
    for (const call of mockedFuel.getFuelingFrequencyByVehicle.mock.calls) expect(call).toContain(context);
    for (const call of mockedFuel.getFuelByAssignedDriver.mock.calls) expect(call).toContain(context);
    for (const call of mockedFuel.getFuelTypeDistribution.mock.calls) expect(call).toContain(context);
    for (const call of mockedFuel.getAbnormalConsumption.mock.calls) expect(call).toContain(context);
    for (const call of mockedFuel.getFilteredLogsForExport.mock.calls) expect(call).toContain(context);
    for (const call of mockedLedger.getNetTotalsGrouped.mock.calls) expect(call).toContain(context);
  });

  it('a caller scoped to one branch and a caller scoped to another never share a context object reference', async () => {
    const hararecontext = makeScopedContext([HARARE_BRANCH]);
    const bulawayoContext = makeScopedContext(['branch-bulawayo']);

    await monthlyFuelIntelligenceService.buildReport(TENANT, hararecontext, '2026-09');
    const hararecalls = mockedFuel.getFuelStats.mock.calls.length;

    jest.clearAllMocks();
    mockAllEmpty();
    await monthlyFuelIntelligenceService.buildReport(TENANT, bulawayoContext, '2026-09');

    // Each run's calls carry that run's own context, never leftover
    // state or a call carrying the other branch's context.
    for (const call of mockedFuel.getFuelStats.mock.calls) {
      expect(call).toContain(bulawayoContext);
      expect(call).not.toContain(hararecontext);
    }
    expect(hararecalls).toBeGreaterThan(0);
  });

  it('never falls back to calling a repository method with tenantId as the only scoping argument', async () => {
    const context = makeScopedContext([HARARE_BRANCH]);
    await monthlyFuelIntelligenceService.buildReport(TENANT, context, '2026-09');

    // Every mocked call must include at least one argument that is a
    // TenantContext-shaped object (has organizationId + accessibleOrgUnitIds),
    // not just the bare tenantId string.
    const allCalls = [
      ...mockedFuel.getFuelStats.mock.calls,
      ...mockedFuel.getFuelingFrequencyByVehicle.mock.calls,
      ...mockedFuel.getFuelByAssignedDriver.mock.calls,
      ...mockedFuel.getFuelTypeDistribution.mock.calls,
      ...mockedFuel.getAbnormalConsumption.mock.calls,
      ...mockedFuel.getFilteredLogsForExport.mock.calls,
      ...mockedLedger.getNetTotalsGrouped.mock.calls,
    ];
    expect(allCalls.length).toBeGreaterThan(0);
    for (const call of allCalls) {
      const hasContext = call.some(
        (arg) => arg && typeof arg === 'object' && 'organizationId' in arg && 'accessibleOrgUnitIds' in arg
      );
      expect(hasContext).toBe(true);
    }
  });
});
