// tests/unit/reports/fleet-summary-partial-degradation.spec.ts
//
// WAVE 3, R.3.1 HARDENING -- role-aware partial data + permission-safe
// degradation.
//
// Root cause this delivery closes: ExecutiveDashboard.tsx's page-level
// loading/error gate blocked on FIVE independent hooks
// (useExecutiveDashboard, useFleetKPIs, useFuelTrendsWidget,
// useExpenseBreakdownWidget, useMaintenanceWidget) with a single OR --
// `isError || fleetKPIs.isError || fuelTrends.isError ||
// expenseBreakdown.isError || maintenanceWidget.isError`. /api/fuellogs and
// /api/expenses each require their own permission (FUEL_VIEW/EXPENSE_VIEW)
// independent of the ANALYTICS_VIEW + REPORT_VIEW that gets a caller onto
// the page and past the fleetKPIs call. WORKSHOP_MANAGER holds the latter
// two but neither of the former (see tests/security/
// fleet-summary-financial-access.spec.ts), so its 403 from /api/fuellogs
// or /api/expenses tripped the ENTIRE page's error gate -- hiding
// composition/activity figures (Total Vehicles, Active, In Maintenance,
// Total Distance) that role IS authorized to see. This was NOT a security
// leak (server-side authorization was already correct); it was a
// frontend integration defect that made permitted data unreachable.
//
// A second, related data-truth bug was found while fixing the above:
// useFuelTrendsWidget and useMaintenanceWidget computed their merged
// `data` object as `isLoading ? undefined : {...}` -- on a genuine error
// (permission-denied OR a real 5xx), `isLoading` becomes false while the
// underlying query `.data` stays undefined, so `?? []`/`?? 0` fallbacks
// silently produced a FABRICATED zero ("0 L, $0.00 fuel this period",
// "0 overdue, 0 upcoming") indistinguishable from a fleet that genuinely
// had no activity. ZERO must never stand in for ERROR or RESTRICTED.
//
// This suite is source-conformance (jest runs testEnvironment: 'node',
// no DOM/QueryClientProvider -- matching this codebase's established
// approach for React-Query-hook components; see maps-widget-wiring.spec.ts
// and this wave's own executive-dashboard-wiring.spec.ts) plus direct,
// real execution of the one piece of this fix that IS a plain function:
// isForbiddenError().

import * as fs from 'fs';
import * as path from 'path';
import { ApiError, isForbiddenError } from '@/shared/utils/api-client.utils';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const DASHBOARD_SRC = read('frontend/modules/reports/pages/ExecutiveDashboard.tsx');
const HOOKS_SRC = read('frontend/modules/dashboard/hooks/useDashboardData.ts');
const FUEL_CHART_SRC = read('frontend/modules/reports/components/charts/FuelTrendChart.tsx');
const EXPENSE_CHART_SRC = read('frontend/modules/reports/components/charts/ExpenseBreakdownChart.tsx');
const MAINTENANCE_CHART_SRC = read('frontend/modules/reports/components/charts/MaintenanceChart.tsx');

describe('isForbiddenError: the real, executable logic behind every Restricted/Error distinction below', () => {
  it('is true for a 403 ApiError, regardless of its error code string', () => {
    expect(isForbiddenError(new ApiError('Insufficient permissions', 403, 'FORBIDDEN'))).toBe(true);
    expect(isForbiddenError(new ApiError('nope', 403, 'SOMETHING_ELSE'))).toBe(true);
  });

  it('is false for a genuine server/network failure -- a 500 is an Error, not Restricted', () => {
    expect(isForbiddenError(new ApiError('Internal server error', 500, 'INTERNAL_ERROR'))).toBe(false);
  });

  it('is false for a 401 (unauthenticated is not the same as unauthorized)', () => {
    expect(isForbiddenError(new ApiError('Authentication required', 401, 'UNAUTHORIZED'))).toBe(false);
  });

  it('is false for a plain Error, undefined, or null -- never throws on a non-ApiError value', () => {
    expect(isForbiddenError(new Error('network drop'))).toBe(false);
    expect(isForbiddenError(undefined)).toBe(false);
    expect(isForbiddenError(null)).toBe(false);
  });
});

describe('useFuelTrendsWidget / useMaintenanceWidget: data truth on error (regression guard)', () => {
  it('useFuelTrendsWidget no longer fabricates a zero result on error -- data is undefined on isLoading OR isError', () => {
    const idx = HOOKS_SRC.indexOf('export function useFuelTrendsWidget');
    const body = HOOKS_SRC.slice(idx, HOOKS_SRC.indexOf('\n}', idx));
    expect(body).toMatch(/isLoading \|\| isError\s*\n?\s*\?\s*undefined/);
    expect(body).not.toMatch(/data:\s*isLoading\s*\n?\s*\?\s*undefined/); // the old, buggy condition
  });

  it('useFuelTrendsWidget exposes `error` so callers can distinguish restricted from a genuine failure', () => {
    const idx = HOOKS_SRC.indexOf('export function useFuelTrendsWidget');
    const body = HOOKS_SRC.slice(idx, HOOKS_SRC.indexOf('\n}', idx));
    expect(body).toMatch(/error:\s*monthlyQuery\.error\s*\?\?\s*statsQuery\.error/);
  });

  it('useMaintenanceWidget no longer fabricates a zero result on error -- data is undefined on isLoading OR isError', () => {
    const idx = HOOKS_SRC.indexOf('export function useMaintenanceWidget');
    const body = HOOKS_SRC.slice(idx, HOOKS_SRC.indexOf('\n}', idx));
    expect(body).toMatch(/isLoading \|\| isError\s*\?\s*undefined/);
  });

  it('useMaintenanceWidget exposes `error` so callers can distinguish restricted from a genuine failure', () => {
    const idx = HOOKS_SRC.indexOf('export function useMaintenanceWidget');
    const body = HOOKS_SRC.slice(idx, HOOKS_SRC.indexOf('\n}', idx));
    expect(body).toMatch(/error:\s*overdueQuery\.error\s*\?\?\s*upcomingQuery\.error/);
  });

  it('useExpenseBreakdownWidget is untouched -- it already returns the raw useQuery result (data genuinely undefined on error via react-query\'s own select short-circuit)', () => {
    const idx = HOOKS_SRC.indexOf('export function useExpenseBreakdownWidget');
    const body = HOOKS_SRC.slice(idx, HOOKS_SRC.indexOf('\n}', idx));
    expect(body).toMatch(/return useQuery\(/);
  });

  it('a genuine successful zero (real API response of 0 fuel/0 overdue) still flows through unchanged -- only the ERROR path changed, not the SUCCESS path', () => {
    // The fix widened the ternary's condition (isLoading -> isLoading ||
    // isError); it must not have touched what happens in the "else" branch
    // on an actual success. statsQuery.data?.totalFuel ?? 0 / overdue.length
    // are exactly the pre-existing real-zero computations, untouched.
    const fuelIdx = HOOKS_SRC.indexOf('export function useFuelTrendsWidget');
    const fuelBody = HOOKS_SRC.slice(fuelIdx, HOOKS_SRC.indexOf('\n}', fuelIdx));
    expect(fuelBody).toMatch(/totalVolume: statsQuery\.data\?\.totalFuel \?\? 0/);
    expect(fuelBody).toMatch(/totalCost: statsQuery\.data\?\.totalCost \?\? 0/);

    const maintIdx = HOOKS_SRC.indexOf('export function useMaintenanceWidget');
    const maintBody = HOOKS_SRC.slice(maintIdx, HOOKS_SRC.indexOf('\n}', maintIdx));
    expect(maintBody).toMatch(/overdueCount: overdue\.length/);
  });
});

describe('Chart components: Restricted and Error are distinct states, checked before the empty-data branch', () => {
  /**
   * Searches only the function BODY (from its `export function` signature
   * onward), not the file as a whole -- each component's JSDoc prop
   * comments above the signature legitimately mention "No X data
   * available" in prose (explaining what isRestricted must not be
   * confused with), which would otherwise out-rank the real code branches
   * in a whole-file search and produce a false pass/fail unrelated to
   * actual branch order.
   */
  function assertRestrictedBeforeEmpty(
    src: string,
    fnSignature: RegExp,
    restrictedText: RegExp,
    emptyText: RegExp
  ) {
    const bodyStart = src.search(fnSignature);
    expect(bodyStart).toBeGreaterThan(-1);
    const body = src.slice(bodyStart);
    const restrictedIdx = body.search(restrictedText);
    const emptyIdx = body.search(emptyText);
    expect(restrictedIdx).toBeGreaterThan(-1);
    expect(emptyIdx).toBeGreaterThan(-1);
    expect(restrictedIdx).toBeLessThan(emptyIdx);
  }

  it('FuelTrendChart: isRestricted is checked before the "no data" branch, and renders distinct text', () => {
    assertRestrictedBeforeEmpty(FUEL_CHART_SRC, /export function FuelTrendChart/, /if \(isRestricted\)/, /No fuel data available/);
    expect(FUEL_CHART_SRC).toMatch(/Restricted -- you do not have permission/);
  });

  it('FuelTrendChart: isError is a separate branch from isRestricted, checked before "no data"', () => {
    assertRestrictedBeforeEmpty(FUEL_CHART_SRC, /export function FuelTrendChart/, /if \(isError\)/, /No fuel data available/);
    expect(FUEL_CHART_SRC).toMatch(/Couldn't load fuel trend data/);
  });

  it('ExpenseBreakdownChart: isRestricted is checked before the "no data" branch, and renders distinct text', () => {
    assertRestrictedBeforeEmpty(EXPENSE_CHART_SRC, /export function ExpenseBreakdownChart/, /if \(isRestricted\)/, /No expense data available/);
    expect(EXPENSE_CHART_SRC).toMatch(/Restricted -- you do not have permission/);
  });

  it('MaintenanceChart: isRestricted is checked before the "no data" branch, and renders distinct text', () => {
    assertRestrictedBeforeEmpty(MAINTENANCE_CHART_SRC, /export function MaintenanceChart/, /if \(isRestricted\)/, /No maintenance data/);
    expect(MAINTENANCE_CHART_SRC).toMatch(/Restricted -- you do not have permission/);
  });

  it('none of the three charts ever collapse isRestricted and isError into the same rendered string', () => {
    for (const src of [FUEL_CHART_SRC, EXPENSE_CHART_SRC, MAINTENANCE_CHART_SRC]) {
      expect(src).toMatch(/Restricted --/);
      expect(src).toMatch(/Couldn't load/);
      // The two branches must be distinct `if` statements, not a shared condition.
      expect(src).toMatch(/if \(isRestricted\)/);
      expect(src).toMatch(/if \(isError\)/);
    }
  });
});

describe('ExecutiveDashboard: the page no longer fails globally because one independent widget is restricted', () => {
  it('the page-level loading gate no longer blocks on fuelTrends/expenseBreakdown/maintenanceWidget', () => {
    const gateIdx = DASHBOARD_SRC.indexOf('if (isLoading || fleetKPIs.isLoading)');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(DASHBOARD_SRC).not.toMatch(/if \(isLoading \|\| fleetKPIs\.isLoading \|\| fuelTrends\.isLoading/);
  });

  it('the page-level error gate no longer blocks on fuelTrends/expenseBreakdown/maintenanceWidget', () => {
    const gateIdx = DASHBOARD_SRC.indexOf('if (isError || fleetKPIs.isError)');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(DASHBOARD_SRC).not.toMatch(/if \(isError \|\| fleetKPIs\.isError \|\| fuelTrends\.isError/);
  });

  it('computes restricted-ness for all three widgets via the shared isForbiddenError() helper, not ad hoc status checks', () => {
    expect(DASHBOARD_SRC).toMatch(/import \{ isForbiddenError \} from '@\/shared\/utils\/api-client\.utils'/);
    expect(DASHBOARD_SRC).toMatch(/const fuelTrendsRestricted = isForbiddenError\(fuelTrends\.error\)/);
    expect(DASHBOARD_SRC).toMatch(/const expenseBreakdownRestricted = isForbiddenError\(expenseBreakdown\.error\)/);
    expect(DASHBOARD_SRC).toMatch(/const maintenanceRestricted = isForbiddenError\(maintenanceWidget\.error\)/);
  });

  it('passes real (not hardcoded false) isLoading through to each of the three charts', () => {
    expect(DASHBOARD_SRC).not.toMatch(/<FuelTrendChart[\s\S]{0,200}isLoading=\{false\}/);
    expect(DASHBOARD_SRC).not.toMatch(/<ExpenseBreakdownChart[\s\S]{0,200}isLoading=\{false\}/);
    expect(DASHBOARD_SRC).not.toMatch(/<MaintenanceChart[\s\S]{0,200}isLoading=\{false\}/);
    expect(DASHBOARD_SRC).toMatch(/<FuelTrendChart[\s\S]{0,200}isLoading=\{fuelTrends\.isLoading\}/);
    expect(DASHBOARD_SRC).toMatch(/<ExpenseBreakdownChart[\s\S]{0,200}isLoading=\{expenseBreakdown\.isLoading\}/);
    expect(DASHBOARD_SRC).toMatch(/<MaintenanceChart[\s\S]{0,200}isLoading=\{maintenanceWidget\.isLoading\}/);
  });

  it('passes isRestricted and a restriction-exclusive isError into each of the three charts', () => {
    expect(DASHBOARD_SRC).toMatch(/<FuelTrendChart[\s\S]{0,300}isRestricted=\{fuelTrendsRestricted\}[\s\S]{0,100}isError=\{fuelTrends\.isError && !fuelTrendsRestricted\}/);
    expect(DASHBOARD_SRC).toMatch(/<ExpenseBreakdownChart[\s\S]{0,300}isRestricted=\{expenseBreakdownRestricted\}[\s\S]{0,100}isError=\{expenseBreakdown\.isError && !expenseBreakdownRestricted\}/);
    expect(DASHBOARD_SRC).toMatch(/<MaintenanceChart[\s\S]{0,300}isRestricted=\{maintenanceRestricted\}[\s\S]{0,100}isError=\{maintenanceWidget\.isError && !maintenanceRestricted\}/);
  });

  it('fleetKPIs itself is unaffected -- still a page-level blocking dependency (it is not part of this fix\'s scope: it never 403s for WORKSHOP_MANAGER, which holds ANALYTICS_VIEW)', () => {
    expect(DASHBOARD_SRC).toMatch(/if \(isLoading \|\| fleetKPIs\.isLoading\)/);
    expect(DASHBOARD_SRC).toMatch(/if \(isError \|\| fleetKPIs\.isError\)/);
  });
});
