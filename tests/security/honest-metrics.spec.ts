// tests/security/honest-metrics.spec.ts
//
// "A number a customer can act on has to have come from somewhere."
//
// ---------------------------------------------------------------------
// THE PATTERN
// ---------------------------------------------------------------------
// A metric that cannot be computed gets a default, the default is a
// number, and a number renders identically to a measurement. Three of
// these were found and fixed in an earlier round -- most memorably a
// fleet with no trips reporting "0.0 km/L", which passed the `< 8`
// recommendation test and persisted an attention item advising action,
// with an invented cost and an invented benefit, on a figure derived
// entirely from the ABSENCE of data. The same 0.0 was printed into an
// ESG disclosure PDF.
//
// This round found five more, all in the same shape:
//
//   averageDowntime            the literal 5, commented "Placeholder"
//   maintenanceCompletionRate  1.0 (PERFECT) for a fleet with no
//                              maintenance records at all
//   averageVehicleAge          `v.year || 2020`, feeding a "replacement
//                              planning" recommendation
//   MaintenanceForecast.estimatedCost
//                              a hard-coded 500 per reminder, summed
//                              into a figure a manager budgets against
//   FuelEfficiencyTrend.efficiency
//                              0 for a month with fuel but no trips,
//                              which PLOTS as efficiency collapsing
//   CostBreakdown.percentageChange
//                              0% ("flat") for a tenant with no previous
//                              period to compare against
//
// The rule is not "return null everywhere". It is: when the honest
// answer is "not measurable", say that, and make the type force every
// consumer to handle it.

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const fleetHealth = stripComments(read('modules/ai/services/fleet-health.service.ts'));
const fleetAnalytics = stripComments(read('modules/analytics/services/fleet-analytics.service.ts'));

describe('fleet health reports what it measured', () => {
  it('REGRESSION: averageDowntime is no longer the literal 5', () => {
    // It shipped as `averageDowntime: 5, // Placeholder - needs real
    // data` and was rendered on the fleet-health screen as a measured
    // figure. This platform records no downtime anywhere, so there is
    // nothing to average.
    expect(fleetHealth).not.toMatch(/averageDowntime:\s*\d/);
    expect(fleetHealth).toMatch(/averageDowntime:\s*null/);
  });

  it('REGRESSION: an empty maintenance history is not a perfect score', () => {
    // `maintenance.length > 0 ? done/total : 1` gave the BEST POSSIBLE
    // answer for the LEAST possible data -- the same shape as
    // calculateFuelScore returning 100 for a missing odometer.
    expect(fleetHealth).not.toMatch(/maintenanceCompletionRate:[\s\S]{0,160}:\s*1[,\s]/);
    expect(fleetHealth).toMatch(/maintenanceCompletionRate:[\s\S]{0,160}:\s*null/);
  });

  it('REGRESSION: a vehicle with no model year is not dated to 2020', () => {
    expect(fleetHealth).not.toMatch(/v\.year \|\| 2020/);
  });

  it('the age recommendation is skipped rather than fired on a null', () => {
    // `null > 10` is false in JS, so this would not have misfired -- but
    // relying on a coercion for a correctness property is how the next
    // edit reintroduces it.
    expect(fleetHealth).toMatch(/metrics\.averageVehicleAge !== null && metrics\.averageVehicleAge > 10/);
  });

  it('the types force consumers to handle the null', () => {
    for (const rel of [
      'modules/ai/types/ai.types.ts',
      'frontend/modules/leaderboard/types/ai-dashboard.types.ts',
    ]) {
      const types = read(rel);
      expect({ file: rel, downtime: /averageDowntime: number \| null/.test(types) }).toEqual({
        file: rel,
        downtime: true,
      });
      expect({ file: rel, age: /averageVehicleAge: number \| null/.test(types) }).toEqual({
        file: rel,
        age: true,
      });
      expect({
        file: rel,
        completion: /maintenanceCompletionRate: number \| null/.test(types),
      }).toEqual({ file: rel, completion: true });
    }
  });
});

/*
  ─────────────────────────────────────────────────────────────────────
  THE OVERALL SCORE ITSELF (empty-organisation round)
  ─────────────────────────────────────────────────────────────────────
  The six metrics above were the COMPONENTS. The headline number had
  exactly the same defect and was missed, because the guard looked like
  defensive programming rather than a default:

      Math.round(sum / Math.max(1, vehicleScores.length))

  `Math.max(1, ...)` prevents the NaN and then returns 0 -- reported
  with `success: true`, and rendered by three separate consumers as a
  red "0/100", a red 5xl "0%", and a red progress bar. An organisation
  that had not yet added its first vehicle was told its fleet was in the
  worst condition the product can express, on its first login.

  Behavioural, not source-text: the two earlier source-matching tests in
  this codebase both broke on refactors that were strictly better, so
  what is asserted here is the ANSWER, not the arithmetic that produced
  it.
*/
describe('the headline fleet health score', () => {
  const emptyRepo = { findMany: jest.fn(async () => []) };

  it('is null -- not 0 -- when no vehicle was scored', async () => {
    jest.isolateModules(() => {
      jest.doMock('@/modules/vehicles/repositories/vehicle.repository', () => ({
        vehicleRepository: emptyRepo,
      }));
      jest.doMock('@/modules/maintenance/repositories/maintenance.repository', () => ({
        maintenanceRepository: emptyRepo,
      }));
      jest.doMock('@/modules/expenses/repositories/expense.repository', () => ({
        expenseRepository: emptyRepo,
      }));
      jest.doMock('@/modules/trips/repositories/trip.repository', () => ({
        tripRepository: emptyRepo,
      }));
      jest.doMock('@/modules/fuel/repositories/fuel.repository', () => ({
        fuelRepository: emptyRepo,
      }));
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { fleetHealthService } = require('../../modules/ai/services/fleet-health.service');
    const result = await fleetHealthService.calculateHealthScore('empty-org-tenant');

    expect(result.success).toBe(true);
    expect(result.data.overallScore).toBeNull();
    expect(result.data.vehicleScores).toEqual([]);
    // and it invents no advice to go with the non-score
    expect(result.data.recommendations).toEqual([]);
  });

  it('the type forces every consumer to handle the null', () => {
    // Without this the three render sites compile against `number` and
    // the null reaches `score >= 70` as `false`, which is the RED
    // branch -- the exact rendering the fix exists to remove.
    const types = read('modules/ai/types/ai.types.ts');
    expect(types).toMatch(/overallScore: number \| null;/);
  });

  it('all three render sites branch on it', () => {
    const widget = read('frontend/shared/dashboards/widgets/AIRecommendationsWidget.tsx');
    const gauge = read('frontend/modules/reports/components/charts/FleetHealthGauge.tsx');
    const report = read('frontend/modules/reports/pages/AIReports.tsx');

    expect(widget).toMatch(/overallScore === null/);
    expect(gauge).toMatch(/score === null/);
    expect(report).toMatch(/Not measured/);
  });
});

describe('the ESG disclosure does not print a fabricated figure', () => {
  it('renders "Not measured" rather than a default', () => {
    // An ESG PDF is a document a customer files externally. A number in
    // it that came from nowhere is the highest-consequence version of
    // this defect.
    const pdf = read('modules/esg/generators/esg-pdf.generator.ts');
    expect(pdf).toMatch(/averageVehicleAgeYears === null[\s\S]{0,120}Not measured/);
    expect(pdf).toMatch(/maintenanceCompletionRate === null[\s\S]{0,120}Not measured/);
  });

  it('its empty-result shape uses null, not zero', () => {
    const service = read('modules/esg/services/esg-export.service.ts');
    expect(service).toMatch(/averageVehicleAgeYears: null/);
    expect(service).toMatch(/maintenanceCompletionRate: null/);
  });
});

describe('fleet analytics reports gaps as gaps', () => {
  it('REGRESSION: a month with no trips is not zero efficiency', () => {
    // `(tripsByMonth[m.month] || 0) / m.fuel` plots a data gap as a
    // collapse. A line that dives to the axis is read as an operational
    // emergency.
    expect(fleetAnalytics).not.toMatch(/\(tripsByMonth\[m\.month\] \|\| 0\) \/ m\.fuel/);
    expect(fleetAnalytics).toMatch(/efficiency: measurable \? distance \/ m\.fuel : null/);
  });

  it('REGRESSION: no previous period is not a 0% change', () => {
    expect(fleetAnalytics).toMatch(/previousPeriodStats\.total > 0[\s\S]{0,200}:\s*null/);
  });

  it('REGRESSION: a reminder with no estimate does not invent 500', () => {
    // And note the operator: `reminder.estimated_cost || 500` also
    // overwrote a GENUINE estimate of 0 with 500.
    expect(fleetAnalytics).not.toMatch(/averageCost = 500/);
    expect(fleetAnalytics).not.toMatch(/estimated_cost \|\| /);
    expect(fleetAnalytics).toMatch(
      /typeof reminder\.estimated_cost === 'number' \? reminder\.estimated_cost : null/
    );
  });

  it('the chart breaks the line rather than drawing through a gap', () => {
    // `connectNulls={false}` is what makes the null visible instead of
    // being interpolated away -- without it the honest data would render
    // as the dishonest chart.
    const overview = read('frontend/modules/reports/pages/AnalyticsOverview.tsx');
    expect(overview).toMatch(/connectNulls=\{false\}/);
    expect(overview).toMatch(/No estimate/);
  });

  it('an export of the trend leaves the cell blank, not zero', () => {
    // A spreadsheet outlives the caveat that was on screen beside it.
    const overview = read('frontend/modules/reports/pages/AnalyticsOverview.tsx');
    expect(overview).toMatch(/'Efficiency \(km\/L\)': f\.efficiency \?\? ''/);
  });
});
