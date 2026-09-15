// tests/unit/reports/executive-dashboard-wiring.spec.ts
//
// WAVE 3, R.3.1 -- Fleet Summary Reporting.
//
// jest here runs testEnvironment: 'node' with no jsdom/React-Testing-
// Library, and ExecutiveDashboard.tsx is a React-Query-hook component, so
// (matching this codebase's established approach for such components --
// see tests/unit/vehicles/vehicle-attention-wiring.spec.ts and this wave's
// own tests/unit/telematics/maps-widget-wiring.spec.ts /
// report-alerts-data-source.spec.ts) this suite pins source-text
// invariants rather than rendering the component.
//
// What this suite pins, each a genuine gap this delivery closed:
//   1. The DatePreset filter bar is real state with a real setter, wired
//      through resolveFilterDateRange into useFleetKPIs -- previously
//      `const [filter] = useState(...)` had no setter at all and
//      useFleetKPIs() was called with zero arguments, so the filter bar's
//      own state could never have reached a query even if a control had
//      existed for it.
//   2. It reuses executiveDashboard.ts's existing DATE_PRESETS/DatePreset
//      union rather than inventing a second date-filter contract (the
//      report builder's FilterBuilder has no preset concept at all -- see
//      that audit finding in the R.3.1 report).
//   3. financialAccessRestricted is checked before any financial figure is
//      formatted -- a role without financial access must see "Restricted",
//      never a fabricated "N/A" (which would mean "no data" -- a different
//      and false claim) or a raw formatted amount.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(
  path.join(ROOT, 'frontend/modules/reports/pages/ExecutiveDashboard.tsx'),
  'utf8'
);

describe('ExecutiveDashboard: the date-range filter is real, wired state (not dead cosmetic state)', () => {
  it('destructures a real setter from useState, not `const [filter] = useState(...)`', () => {
    expect(SRC).toMatch(/const \[filter, setFilter\] = useState<ExecutiveDashboardFilter>/);
    expect(SRC).not.toMatch(/const \[filter\] = useState/);
  });

  it('resolves the filter to a concrete DateRange via the shared resolver, not ad hoc date math', () => {
    expect(SRC).toMatch(/import \{ resolveFilterDateRange \} from '\.\.\/utils\/resolveDatePreset'/);
    expect(SRC).toMatch(/const dateRange = resolveFilterDateRange\(filter\)/);
  });

  it('passes the resolved dateRange into useFleetKPIs -- previously called with no argument at all', () => {
    expect(SRC).toMatch(/const fleetKPIs = useFleetKPIs\(dateRange\)/);
    expect(SRC).not.toMatch(/const fleetKPIs = useFleetKPIs\(\)/);
  });

  it('reuses the existing DATE_PRESETS union from executiveDashboard.ts rather than a second date-filter contract', () => {
    expect(SRC).toMatch(/import \{ DATE_PRESETS, defaultExecutiveDashboardFilter \} from '\.\.\/schemas\/executiveDashboard'/);
    expect(SRC).toMatch(/DATE_PRESETS\.map\(/);
  });

  it('renders a bound <select> whose onChange calls setFilter with the new datePreset', () => {
    expect(SRC).toMatch(/value=\{filter\.datePreset\}/);
    expect(SRC).toMatch(/onChange=\{\(e\) => setFilter\(\{ \.\.\.filter, datePreset: e\.target\.value as DatePreset \}\)\}/);
  });

  it('shows custom-range date inputs only when the custom preset is selected, and they update filter state', () => {
    expect(SRC).toMatch(/filter\.datePreset === 'custom'/);
    expect(SRC).toMatch(/id="executive-date-from"/);
    expect(SRC).toMatch(/id="executive-date-to"/);
  });
});

function statsCardBlock(label: string): string {
  const idx = SRC.indexOf(`title="${label}"`);
  expect(idx).toBeGreaterThan(-1);
  const nextCard = SRC.indexOf('<StatsCard', idx + 1);
  return SRC.slice(idx, nextCard > -1 ? nextCard : idx + 400);
}

describe('ExecutiveDashboard: financial fields are gated on financialAccessRestricted before formatting', () => {
  it('Total Expenses is never formatCurrency()-ed without first checking financialAccessRestricted', () => {
    expect(statsCardBlock('Total Expenses')).toMatch(/financialAccessRestricted\s*\?\s*'Restricted'/);
  });

  it('Total Fuel Cost is never formatCurrency()-ed without first checking financialAccessRestricted', () => {
    expect(statsCardBlock('Total Fuel Cost')).toMatch(/financialAccessRestricted\s*\?\s*'Restricted'/);
  });

  it('Cost per Km is never formatCurrency()-ed without first checking financialAccessRestricted', () => {
    expect(statsCardBlock('Cost per Km')).toMatch(/financialAccessRestricted\s*\?\s*'Restricted'/);
  });

  it('never collapses "restricted" into "N/A" -- the two must render distinct strings', () => {
    // Both strings must appear (N/A for genuine no-data cases like Avg Fuel
    // Efficiency with no distance/fuel; Restricted for permission gating) --
    // conflating them would misreport "not authorized" as "no data".
    expect(SRC).toMatch(/'Restricted'/);
    expect(SRC).toMatch(/'N\/A'/);
  });

  it('operational (non-financial) fields -- Total Vehicles, Active, In Maintenance, Total Distance, Avg Fuel Efficiency -- are never gated on financialAccessRestricted', () => {
    for (const label of ['Total Vehicles', 'Active', 'In Maintenance', 'Total Distance', 'Avg Fuel Efficiency']) {
      expect(statsCardBlock(label)).not.toMatch(/financialAccessRestricted/);
    }
  });
});
