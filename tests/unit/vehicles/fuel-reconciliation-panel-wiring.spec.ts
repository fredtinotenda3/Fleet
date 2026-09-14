// tests/unit/vehicles/fuel-reconciliation-panel-wiring.spec.ts
//
// WAVE 1 PART 2, item 4: fuel/trip reconciliation -- the UI wiring.
//
// The calculation itself is covered exhaustively, and render-free, by
// tests/unit/vehicles/fuel-reconciliation.spec.ts. This suite covers the
// part that IS wiring: that the panel reuses existing hooks and the
// existing filter bar's date range rather than a new data source or a
// second, independent range control, and that the electric-vehicle gate
// is actually threaded from the same profile resolver the instrument
// cluster uses, not re-derived.
//
// Source-text conformance, not rendering: jest here runs
// `testEnvironment: 'node'` with no jsdom, and this panel calls
// `useFuelStats`/`useFuelKpis` (React Query hooks), which cannot be
// invoked outside a real React render. Same approach as
// tests/security/trip-history-vehicle-scope.spec.ts's frontend-wiring
// half, for the same reason.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('VehicleFuelReconciliationPanel: reuses existing infrastructure, introduces no new data source', () => {
  const src = () => read('frontend/modules/vehicles/components/analytics/VehicleFuelReconciliationPanel.tsx');

  it('calls the SAME fuel hooks used elsewhere on this page (useFuelStats, useFuelKpis) -- no new endpoint', () => {
    const s = src();
    expect(s).toMatch(/from '@\/frontend\/modules\/fuel\/hooks\/useFuel'/);
    expect(s).toMatch(/useFuelStats\(dateRange, licensePlate\)/);
    expect(s).toMatch(/useFuelKpis\(dateRange, licensePlate\)/);
    expect(s).toMatch(/useFuelStats\(baselineRange, licensePlate\)/);
    expect(s).toMatch(/useFuelKpis\(baselineRange, licensePlate\)/);
  });

  it('derives the baseline window from baselineWindowFor rather than a second hand-rolled calculation', () => {
    expect(src()).toMatch(/baselineWindowFor\(periodStart\)/);
  });

  it('delegates the actual reconciliation to computeFuelReconciliation -- no calculation duplicated inline', () => {
    const s = src();
    expect(s).toMatch(/computeFuelReconciliation\(\{/);
    // The six-way provenance vocabulary is rendered via the shared
    // label/explanation helpers, not restated ad hoc.
    expect(s).toMatch(/fuelProvenanceLabel/);
    expect(s).toMatch(/fuelProvenanceExplanation/);
  });

  it('a failed fetch is wired distinctly from a defensible-but-unavailable baseline, and from loading', () => {
    const s = src();
    expect(s).toMatch(/failed\.length > 0/);
    expect(s).toMatch(/onClick=\{retryAll\}/);
    expect(s).toMatch(/isLoading/);
    expect(s).toMatch(/!result\.isDefensible/);
  });

  it('electric vehicles render a NOT APPLICABLE state, not an empty or zeroed reconciliation', () => {
    const s = src();
    expect(s).toMatch(/isElectric \?/);
    expect(s).toMatch(/NOT APPLICABLE/);
  });
});

describe('VehicleFuelAnalyticsPanel: the reconciliation panel shares the filter bar’s dateRange -- no second range control', () => {
  const src = () => read('frontend/modules/vehicles/components/analytics/VehicleFuelAnalyticsPanel.tsx');

  it('passes the same dateRange state to both FuelKpiCards and VehicleFuelReconciliationPanel', () => {
    const s = src();
    expect(s).toMatch(/<FuelKpiCards\s+licensePlate=\{licensePlate\}\s+dateRange=\{dateRange\}\s*\/>/);
    expect(s).toMatch(/<VehicleFuelReconciliationPanel[\s\S]*?dateRange=\{dateRange\}[\s\S]*?\/>/);
    // Only one `useState<FuelAnalyticsDateRange>` in the whole file -- a
    // second one would mean a second, independent range control crept in.
    const dateRangeStateDeclarations = s.match(/useState<FuelAnalyticsDateRange>/g) ?? [];
    expect(dateRangeStateDeclarations.length).toBe(1);
  });

  it('forwards isElectric to the reconciliation panel rather than re-deriving it', () => {
    const s = src();
    expect(s).toMatch(/<VehicleFuelReconciliationPanel[\s\S]*?isElectric=\{isElectric\}[\s\S]*?\/>/);
    // A mention in a doc comment (explaining where the prop comes from) is
    // fine; an actual CALL here would mean it is being re-derived instead
    // of threaded through as a prop.
    expect(s).not.toMatch(/[^`/\s]vehicleProfileFor\(/);
  });
});

describe('isElectric is threaded from the same resolver the instrument cluster uses, not re-fetched', () => {
  it('VehicleDetailPage resolves it once via vehicleProfileFor and passes it down', () => {
    const s = read('frontend/modules/vehicles/pages/VehicleDetailPage.tsx');
    expect(s).toMatch(/from '\.\.\/utils\/vehicle-profile'/);
    expect(s).toMatch(
      /isElectric=\{vehicleProfileFor\(vehicle\.vehicle_type, vehicle\.fuel_type\)\.isElectric\}/
    );
  });

  it('VehicleAnalyticsPanel and VehicleFuelAnalyticsPanel both just forward it, no second resolution', () => {
    const analyticsPanel = read('frontend/modules/vehicles/components/analytics/VehicleAnalyticsPanel.tsx');
    expect(analyticsPanel).toMatch(
      /<VehicleFuelAnalyticsPanel licensePlate=\{licensePlate\} isElectric=\{isElectric\} \/>/
    );
    expect(analyticsPanel).not.toMatch(/vehicleProfileFor/);
  });
});
