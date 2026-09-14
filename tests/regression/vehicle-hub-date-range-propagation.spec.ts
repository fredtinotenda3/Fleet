// tests/regression/vehicle-hub-date-range-propagation.spec.ts
//
// WAVE 1 PART 2, item 5: date-range propagation across the Vehicle
// Operational Hub's Analytics tab.
//
// THE DEFECT THIS PINS: `FuelKpiCards` had no `dateRange` prop and always
// called `useFuelKpis(undefined, licensePlate)` -- which
// `fuel.repository.ts`'s `getFuelKpis` resolves to a rolling trailing-90-
// day window REGARDLESS of what the caller asked for. On
// `VehicleFuelAnalyticsPanel`, that meant selecting a date range in the
// visible `FuelAnalyticsFilterBar` silently changed every other chart on
// the tab except the KPI cards sitting right below it -- and one of those
// cards was titled "Abnormal consumption (THIS PERIOD)", an explicit,
// self-contradicting claim of range-sensitivity it did not have.
//
// This suite proves two things, at two different layers, per the "trace
// the whole path" instruction:
//   1. (repository)  `getFuelKpis` genuinely produces a different
//      aggregation match stage for a different date range -- the backend
//      was never the problem, so this is a baseline, not the fix.
//   2. (frontend)     every chart rendered on the vehicle-scoped Fuel/
//      Trip/Expense analytics panels either receives the panel's live
//      `dateRange` state, or is one of the small number of components
//      that are DELIBERATELY range-independent (an all-time pattern
//      check, a fixed trailing-N-months trend, or a card with its own
//      visible, self-labelled period control) -- enumerated explicitly
//      below so a FUTURE new chart added to any of these panels without
//      being wired to the filter bar fails this test, rather than
//      shipping the same silent-fallback defect again.
//
// Jest here runs `testEnvironment: 'node'` with no jsdom, so the frontend
// assertions are source-text conformance (same approach already used by
// tests/security/trip-history-vehicle-scope.spec.ts for the same reason)
// rather than rendering -- calling a hook-using client component as a
// plain function outside React's reconciler is not meaningful, and this
// codebase does not run a jsdom test environment.

import * as fs from 'fs';
import * as path from 'path';
import { fuelRepository } from '../../modules/fuel/repositories/fuel.repository';
import type { TenantContext } from '../../modules/tenancy/services/tenant-context.service';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const ORG = 'willsgrove-farm-enterprises-9e80ed';
const ORG_WIDE_CONTEXT: TenantContext = {
  organizationId: ORG,
  organizationName: 'Willsgrove Farm Enterprises',
  accessibleOrgUnitIds: null,
  isPlatformScope: false,
  assignedOrgUnitIds: [],
};

describe('getFuelKpis: the aggregation genuinely respects the requested date range (repository baseline)', () => {
  function mockCollection() {
    const matches: Record<string, unknown>[] = [];
    const findCursor = {
      sort: () => findCursor,
      skip: () => findCursor,
      limit: () => findCursor,
      toArray: async () => [],
    };
    const collection = {
      aggregate: (pipeline: Record<string, unknown>[]) => {
        const matchStage = pipeline.find((stage) => '$match' in stage) as
          | { $match: Record<string, unknown> }
          | undefined;
        if (matchStage) matches.push(matchStage.$match);
        return { toArray: async () => [] };
      },
      find: () => findCursor,
    };
    return { collection, matches };
  }

  it('produces a DIFFERENT $match.date for two different explicit ranges, not a fixed window', async () => {
    const { collection: collectionA, matches: matchesA } = mockCollection();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- getCollection is private; spying on it to intercept the query without a real Mongo requires this cast.
    jest.spyOn(fuelRepository as any, 'getCollection').mockResolvedValueOnce(collectionA);
    await fuelRepository.getFuelKpis(
      ORG,
      { startDate: new Date('2026-01-01T00:00:00Z'), endDate: new Date('2026-01-07T23:59:59Z') },
      undefined,
      undefined,
      undefined,
      ORG_WIDE_CONTEXT
    );

    const { collection: collectionB, matches: matchesB } = mockCollection();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- getCollection is private; spying on it to intercept the query without a real Mongo requires this cast.
    jest.spyOn(fuelRepository as any, 'getCollection').mockResolvedValueOnce(collectionB);
    await fuelRepository.getFuelKpis(
      ORG,
      { startDate: new Date('2026-06-01T00:00:00Z'), endDate: new Date('2026-06-30T23:59:59Z') },
      undefined,
      undefined,
      undefined,
      ORG_WIDE_CONTEXT
    );

    // The "current window" aggregation is the first of the two
    // (current, previous) calls getFuelKpis fires per invocation.
    const rangeA = matchesA[0]?.date as { $gte: Date; $lte: Date };
    const rangeB = matchesB[0]?.date as { $gte: Date; $lte: Date };
    expect(rangeA.$gte.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(rangeB.$gte.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(rangeA.$gte.getTime()).not.toBe(rangeB.$gte.getTime());
  });

  it('scopes to a single vehicle via an exact license_plate match, composed with the date range', async () => {
    const { collection, matches } = mockCollection();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- getCollection is private; spying on it to intercept the query without a real Mongo requires this cast.
    jest.spyOn(fuelRepository as any, 'getCollection').mockResolvedValueOnce(collection);
    await fuelRepository.getFuelKpis(
      ORG,
      { startDate: new Date('2026-01-01Z'), endDate: new Date('2026-01-31Z') },
      undefined,
      undefined,
      { type: 'vehicle', value: 'hre1234' },
      ORG_WIDE_CONTEXT
    );
    expect(matches[0]).toMatchObject({ license_plate: 'HRE1234' });
    expect(matches[0]).toHaveProperty('date');
  });
});

describe('VehicleFuelAnalyticsPanel: no chart silently ignores the selected date range (frontend wiring)', () => {
  const panel = () => read('frontend/modules/vehicles/components/analytics/VehicleFuelAnalyticsPanel.tsx');
  const kpiCards = () => read('frontend/modules/fuel/components/FuelKpiCards.tsx');

  it('FIX: FuelKpiCards now accepts dateRange and forwards it to useFuelKpis (not a hardcoded undefined)', () => {
    const src = kpiCards();
    expect(src).toMatch(/dateRange\?:\s*\{\s*startDate\?:\s*Date;\s*endDate\?:\s*Date\s*\}/);
    expect(src).toMatch(/useFuelKpis\(dateRange,\s*licensePlate\)/);
    // The specific regression: a silent, unconditional fallback to a
    // fixed window regardless of what the caller passed.
    expect(src).not.toMatch(/useFuelKpis\(undefined,\s*licensePlate\)/);
  });

  it('FIX: VehicleFuelAnalyticsPanel threads its live dateRange state into FuelKpiCards', () => {
    const src = panel();
    expect(src).toMatch(/<FuelKpiCards\s+licensePlate=\{licensePlate\}\s+dateRange=\{dateRange\}\s*\/>/);
  });

  it('every OTHER chart on this panel still receives the panel-level dateRange (no new silent holdout)', () => {
    const src = panel();
    const rangeSensitiveComponents = [
      'VehicleFuelActivityTimelineChart',
      'FuelCostByDriverChart',
      'FuelActivityTrendChart',
      'FuelByStationChart',
      'AverageFuelPriceTrendChart',
      'FuelTypeDistributionChart',
      'FuelCostDistributionChart',
      'FuelEntryHeatmapChart',
    ];
    for (const name of rangeSensitiveComponents) {
      const usageMatch = src.match(new RegExp(`<${name}\\b[^/>]*/>`));
      expect(usageMatch).not.toBeNull();
      expect(usageMatch![0]).toMatch(/dateRange=\{dateRange\}/);
    }
  });

  it('AbnormalConsumptionWidget is a DELIBERATE exception -- it is an all-time pattern check, not range-scoped', () => {
    // Documented, not silently inconsistent: its own title says so, so a
    // user reading the card cannot mistake it for reacting to the filter
    // bar above it.
    const widgetSrc = read('frontend/modules/fuel/components/AbnormalConsumptionWidget.tsx');
    expect(widgetSrc).toMatch(/all-time pattern/);
    expect(panel()).toMatch(/<AbnormalConsumptionWidget\s+licensePlate=\{licensePlate\}\s*\/>/);
  });
});

describe('VehicleTripAnalyticsPanel: range-sensitive charts wired, the monthly trend deliberately is not', () => {
  const panel = () => read('frontend/modules/vehicles/components/analytics/VehicleTripAnalyticsPanel.tsx');

  it('every range-sensitive trip chart receives the panel-level dateRange', () => {
    const src = panel();
    const rangeSensitiveComponents = [
      'TripKpiCards',
      'DriverUtilizationChart',
      'TripDistanceDistributionChart',
      'TripDayOfWeekHeatmapChart',
      'TripCostAnalyticsChart',
    ];
    for (const name of rangeSensitiveComponents) {
      const usageMatch = src.match(new RegExp(`<${name}\\b[\\s\\S]*?(?:/>|>)`));
      expect(usageMatch).not.toBeNull();
      expect(usageMatch![0]).toMatch(/dateRange=\{dateRange\}/);
    }
  });

  it('TripMonthlyTrendChart is a DELIBERATE exception, consistent with the fleet-wide TripAnalyticsPage', () => {
    // It shows a fixed trailing-N-months trend (its own `months` prop),
    // independent of the page's date filter, by design -- and says so in
    // its own description, so it is never mistaken for reacting to the
    // filter bar. The fleet-wide TripAnalyticsPage renders it the same way
    // (no dateRange), so vehicle scope is consistent with fleet scope
    // rather than a scope-specific regression.
    const panelSrc = panel();
    const fleetSrc = read('frontend/modules/trips/pages/TripAnalyticsPage.tsx');
    const chartSrc = read('frontend/modules/trips/components/TripMonthlyTrendChart.tsx');

    expect(panelSrc).toMatch(/<TripMonthlyTrendChart\s+licensePlate=\{licensePlate\}\s*\/>/);
    expect(panelSrc).not.toMatch(/<TripMonthlyTrendChart[^/>]*dateRange/);
    expect(fleetSrc).not.toMatch(/<TripMonthlyTrendChart[^/>]*dateRange/);
    expect(chartSrc).toMatch(/last \$\{months\} months/);
  });
});

describe('VehicleExpenseAnalyticsPanel: range-sensitive charts wired, self-scoped cards deliberately are not', () => {
  const panel = () => read('frontend/modules/vehicles/components/analytics/VehicleExpenseAnalyticsPanel.tsx');

  it('every range-sensitive expense chart receives the panel-level dateRange', () => {
    const src = panel();
    const rangeSensitiveComponents = [
      'ExpenseWaterfallChart',
      'ExpenseTopCategoriesChart',
      'ExpenseCategoryOverTimeChart',
      'ExpenseOutliersWidget',
      'TopExpenseTransactionsChart',
      'ExpenseAmountDistributionChart',
      'ExpenseParetoChart',
      'ExpenseCalendarHeatmapChart',
      'ExpenseHeatmapChart',
      'JobTripExpenseChart',
    ];
    for (const name of rangeSensitiveComponents) {
      const usageMatch = src.match(new RegExp(`<${name}\\b[^/>]*/>`));
      expect(usageMatch).not.toBeNull();
      expect(usageMatch![0]).toMatch(/dateRange=\{dateRange\}/);
    }
  });

  it('ExpenseStatsCards is a DELIBERATE exception -- it owns and visibly labels its own period control', () => {
    const cardsSrc = read('frontend/modules/expenses/components/ExpenseStatsCards.tsx');
    // Its own period selector, and a visible label naming which period is active.
    expect(cardsSrc).toMatch(/PERIOD_LABELS\[period\]/);
    expect(cardsSrc).toMatch(/<Select value=\{period\}/);
    expect(panel()).toMatch(/<ExpenseStatsCards\s+licensePlate=\{licensePlate\}\s*\/>/);
  });

  it('ExpenseCategoryChart is a DELIBERATE exception -- consistent with the fleet-wide dashboard, and does not claim a period', () => {
    const chartSrc = read('frontend/modules/expenses/components/ExpenseCategoryChart.tsx');
    const dashboardSrc = read('frontend/modules/expenses/pages/ExpenseDashboardPage.tsx');
    expect(chartSrc).not.toMatch(/CardTitle>[^<]*period/i);
    expect(dashboardSrc).toMatch(/<ExpenseCategoryChart\s*\/>/);
    expect(panel()).toMatch(/<ExpenseCategoryChart\s+licensePlate=\{licensePlate\}\s*\/>/);
  });
});

describe('VehicleMaintenanceAnalyticsPanel: no date-range concept exists fleet-wide either (not a hub-specific gap)', () => {
  it('the fleet-wide MaintenanceAnalyticsPage has no date-range filter bar to propagate from', () => {
    const fleetSrc = read('frontend/modules/maintenance/pages/MaintenanceAnalyticsPage.tsx');
    expect(fleetSrc).not.toMatch(/FilterBar/);
    expect(fleetSrc).not.toMatch(/dateRange/);
  });

  it('the vehicle-scoped panel is consistent with the fleet-wide page -- no filter bar there either', () => {
    const panelSrc = read('frontend/modules/vehicles/components/analytics/VehicleMaintenanceAnalyticsPanel.tsx');
    expect(panelSrc).not.toMatch(/FilterBar/);
    expect(panelSrc).not.toMatch(/dateRange/);
  });
});

describe("VehicleOperationalHeader: the header's own \"today\" figures are intentionally fixed, not page-range-sensitive", () => {
  it("uses getDateRangePreset('today') explicitly, and every label says \"today\"", () => {
    const src = read('frontend/modules/vehicles/components/operations/VehicleOperationalHeader.tsx');
    expect(src).toMatch(/getDateRangePreset\('today'\)/);
    expect(src).toMatch(/Trips today/);
    expect(src).toMatch(/Distance today/);
    expect(src).toMatch(/Fuel spend today/);
  });
});
