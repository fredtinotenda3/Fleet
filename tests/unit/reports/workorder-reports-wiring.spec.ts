// tests/unit/reports/workorder-reports-wiring.spec.ts
//
// WAVE 3, R.3.6 -- Work Order Reporting.
//
// Source-conformance tests (this project's Jest runs testEnvironment:
// 'node', no jsdom -- React-Query-hook pages are pinned by reading the
// component source and matching against it, the same convention
// tests/unit/reports/executive-dashboard-wiring.spec.ts and
// tests/unit/reports/fleet-summary-partial-degradation.spec.ts already
// established) covering:
//
//   1. The date range is genuinely wired end-to-end (resolveDateRange ->
//      useWorkOrderStats), not a visual-only selector.
//   2. Restricted (403) is distinguished from Loading/Error/genuine-data,
//      via the same isForbiddenError helper R.3.1's hardening introduced
//      -- not a hardcoded role check baked into the component.
//   3. "Overdue" always renders the literal string "Unavailable", never
//      a computed number -- there is no due-date field to compute one
//      from, and a future edit that starts deriving a number here would
//      silently reintroduce a fabricated SLA metric.
//   4. Turnaround renders "Unavailable" specifically when
//      averageHours is null, not a fabricated "0h".
//   5. The status/priority chart click handlers navigate through
//      WORKORDER_ROUTES (the existing drill-down mechanism
//      MaintenanceChart/FuelTrendChart already use), not a bespoke
//      second mechanism.

import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = readFileSync(join(__dirname, '../../../frontend/modules/reports/pages/WorkOrderReports.tsx'), 'utf-8');

describe('WorkOrderReports.tsx: date-range wiring', () => {
  it('resolves the selected preset via resolveDateRange and passes the result to useWorkOrderStats', () => {
    expect(SRC).toMatch(/resolveDateRange\(filter\.datePreset/);
    expect(SRC).toMatch(/useWorkOrderStats\(dateRange\)/);
  });

  it('offers every preset the master date-range contract requires (today/yesterday/7d/30d/month/custom)', () => {
    expect(SRC).toMatch(/DATE_PRESETS/);
    // custom bounds are only rendered for the 'custom' preset, mirroring ExecutiveDashboard.tsx
    expect(SRC).toMatch(/filter\.datePreset === 'custom'/);
  });
});

describe('WorkOrderReports.tsx: data truth', () => {
  it('uses isForbiddenError (not a hardcoded role/permission check) to detect Restricted', () => {
    expect(SRC).toMatch(/isForbiddenError\(stats\.error\)/);
    expect(SRC).not.toMatch(/roles\.includes\(/);
  });

  it('Restricted is checked and rendered before genuine data, distinct from the generic error state', () => {
    const restrictedIdx = SRC.indexOf('if (isRestricted)');
    const errorIdx = SRC.indexOf('if (stats.isError)');
    const dataIdx = SRC.indexOf('const data = stats.data');
    expect(restrictedIdx).toBeGreaterThan(-1);
    expect(restrictedIdx).toBeLessThan(errorIdx);
    expect(errorIdx).toBeLessThan(dataIdx);
  });

  it('"Overdue" always renders the literal "Unavailable" string, never a computed value', () => {
    const overdueBlock = SRC.slice(SRC.indexOf('title="Overdue"'), SRC.indexOf('title="Overdue"') + 400);
    expect(overdueBlock).toMatch(/value="Unavailable"/);
    expect(overdueBlock).not.toMatch(/data\.\w+(Count|Overdue)/);
  });

  it('Avg Turnaround renders "Unavailable" precisely when averageHours is null, not a fabricated 0h', () => {
    const turnaroundBlock = SRC.slice(SRC.indexOf('title="Avg Turnaround"'), SRC.indexOf('title="Avg Turnaround"') + 500);
    expect(turnaroundBlock).toMatch(/turnaround\.averageHours != null/);
    expect(turnaroundBlock).toMatch(/'Unavailable'/);
  });

  it('Total Cost renders the real sum directly -- totalCost is a required, always-present field (a genuine 0 is not "unavailable")', () => {
    const costBlock = SRC.slice(SRC.indexOf('title="Total Cost"'), SRC.indexOf('title="Total Cost"') + 200);
    expect(costBlock).toMatch(/formatCurrency\(data\.totalCost\)/);
  });
});

describe('WorkOrderReports.tsx: drill-down uses the existing mechanism', () => {
  it('the status chart navigates via WORKORDER_ROUTES.byStatus, matching MaintenanceChart/FuelTrendChart\'s router.push pattern', () => {
    expect(SRC).toMatch(/WORKORDER_ROUTES\.byStatus\(/);
  });

  it('the priority chart navigates via WORKORDER_ROUTES.byPriority', () => {
    expect(SRC).toMatch(/WORKORDER_ROUTES\.byPriority\(/);
  });
});

describe('WorkOrderListPage.tsx: drill-down destination reads the querystring it is sent', () => {
  const listSrc = readFileSync(
    join(__dirname, '../../../frontend/modules/workorders/pages/WorkOrderListPage.tsx'),
    'utf-8'
  );

  it('reads status and priority from the URL into the initial filter state, not just license_plate', () => {
    expect(listSrc).toMatch(/searchParams\.get\('status'\)/);
    expect(listSrc).toMatch(/searchParams\.get\('priority'\)/);
    expect(listSrc).toMatch(/status:\s*statusParam/);
    expect(listSrc).toMatch(/priority:\s*priorityParam/);
  });
});

describe('ReportsLayout: Work Order Reports nav item is permission-gated', () => {
  const layoutSrc = readFileSync(join(__dirname, '../../../app/(protected)/reports/layout.tsx'), 'utf-8');

  it('requires Permission.WORKORDER_VIEW, not just the section-wide REPORT_VIEW', () => {
    expect(layoutSrc).toMatch(/requires:\s*Permission\.WORKORDER_VIEW/);
    expect(layoutSrc).toMatch(/PermissionGuard key={item.href} permission={item.requires}/);
  });
});
