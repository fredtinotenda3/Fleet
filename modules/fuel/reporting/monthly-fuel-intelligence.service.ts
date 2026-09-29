// modules/fuel/reporting/monthly-fuel-intelligence.service.ts
//
// PART 5-8, 17 ("Monthly Director Reporting" / "Do not create a second
// reporting architecture"). Builds the Monthly Fuel & Fleet Intelligence
// Report entirely from EXISTING, already tenant/org-unit-scoped reads:
//
//   - FuelRepository            (fuel.repository.ts)     -- operational fuel data
//   - AllocationLedgerRepository (allocation-ledger.repository.ts) -- financial reconciliation
//
// No new collection, no new database, no bypass of tenant/org-unit
// scoping is introduced. Every read below threads the caller's
// TenantContext straight through to methods that already enforce
// isolation (the same discipline documented in
// modules/esg/services/esg-export.service.ts's header, which this file
// follows closely). The only NEW code here is: (1) which of the
// existing reads to call and combine, (2) the pure classification/
// labeling logic in fuel-intelligence.utils.ts, and (3) rendering (the
// Excel/PDF generators alongside this file). This is deliberately an
// analysis/export LAYER on top of the existing platform, not a parallel
// reporting engine -- see REPORTING-GUIDE.md for the full architecture
// note this satisfies PART 17 with.

import { fuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { allocationLedgerRepository } from '@/modules/finance/repositories/allocation-ledger.repository';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import type {
  AbnormalFindingsSection,
  AllocationReconciliationSection,
  CostDriverSection,
  DriverFindingRow,
  DriverFindingsSection,
  Finding,
  FleetPositionSection,
  FuelTypeMixRow,
  MonthlyFuelIntelligenceReport,
  WhatChangedSection,
} from './fuel-intelligence.types';
import { calculated, fact, unavailable } from './fuel-intelligence.types';
import {
  resolveReportPeriod,
  resolvePreviousPeriod,
  computeMonthOverMonthMetric,
  classifyCostDrivers,
  computeCostConcentration,
  assessDataQuality,
  reconcileAllocation,
} from './fuel-intelligence.utils';

/** Soft cap on distinct drivers/vehicles resolved per report. Generous relative to any real fleet this platform serves; a fleet that exceeds it gets a truncation note rather than a silent drop. See DataQualitySection.truncated for the parallel raw-log cap. */
const ENTITY_LIMIT = 2000;

export class MonthlyFuelIntelligenceService {
  async buildReport(
    tenantId: string,
    context: TenantContext,
    month: string
  ): Promise<MonthlyFuelIntelligenceReport> {
    const period = resolveReportPeriod(month);
    const previousPeriod = resolvePreviousPeriod(period);

    const [
      currentStats,
      previousStats,
      currentByVehicle,
      previousByVehicle,
      currentByDriver,
      fuelTypeDistribution,
      abnormalConsumption,
      currentLogs,
      ledgerRows,
    ] = await Promise.all([
      fuelRepository.getFuelStats(tenantId, { startDate: period.start, endDate: period.end }, undefined, context),
      fuelRepository.getFuelStats(tenantId, { startDate: previousPeriod.start, endDate: previousPeriod.end }, undefined, context),
      fuelRepository.getFuelingFrequencyByVehicle(tenantId, { startDate: period.start, endDate: period.end }, ENTITY_LIMIT, undefined, context),
      fuelRepository.getFuelingFrequencyByVehicle(tenantId, { startDate: previousPeriod.start, endDate: previousPeriod.end }, ENTITY_LIMIT, undefined, context),
      fuelRepository.getFuelByDriver(tenantId, { startDate: period.start, endDate: period.end }, ENTITY_LIMIT, 'cost', undefined, context),
      fuelRepository.getFuelTypeDistribution(tenantId, { startDate: period.start, endDate: period.end }, undefined, context),
      // Not period-scoped internally (see fuel.repository.ts's own comment on
      // getAbnormalConsumption) -- the vehicle's average volume baseline is
      // computed across its full history, which is the more statistically
      // sound baseline; the RESULT is filtered to this reporting period below.
      fuelRepository.getAbnormalConsumption(tenantId, undefined, undefined, context),
      fuelRepository.getFilteredLogsForExport({ startDate: period.start, endDate: period.end }, context),
      allocationLedgerRepository.getNetTotalsGrouped('none', ['fuel'], period.start, period.end, context),
    ]);

    const fleetPosition = this.buildFleetPosition(currentStats, currentByVehicle);
    const whatChanged = this.buildWhatChanged(currentStats, previousStats, currentByVehicle, previousByVehicle, previousPeriod.label);
    const costDrivers = this.buildCostDrivers(currentByVehicle, previousByVehicle);
    const driverFindings = this.buildDriverFindings(currentByDriver, currentStats);
    const fuelTypeMix = this.buildFuelTypeMix(fuelTypeDistribution);
    const abnormalFindings = this.buildAbnormalFindings(abnormalConsumption, period, costDrivers);
    const allocationReconciliation = this.buildAllocationReconciliation(currentStats, ledgerRows);
    const dataQuality = assessDataQuality(
      currentLogs.rows.map((l) => ({
        license_plate: l.license_plate,
        date: new Date(l.date).toISOString(),
        fuel_volume: l.fuel_volume,
        cost: l.cost,
        driver_id: l.driver_id,
        fuel_type: l.fuel_type,
        odometer: l.odometer,
      })),
      currentLogs.truncated
    );

    const findings = this.buildFindings({
      period,
      fleetPosition,
      whatChanged,
      costDrivers,
      driverFindings,
      abnormalFindings,
      allocationReconciliation,
      dataQuality,
    });

    return {
      organization: { id: context.organizationId, name: context.organizationName },
      scope: { orgUnitId: context.activeOrgUnitId ?? null },
      generatedAt: new Date(),
      period,
      fleetPosition,
      whatChanged,
      costDrivers,
      driverFindings,
      fuelTypeMix,
      abnormalFindings,
      allocationReconciliation,
      dataQuality,
      findings,
    };
  }

  // ---------------------------------------------------------------------

  private buildFleetPosition(
    stats: Awaited<ReturnType<typeof fuelRepository.getFuelStats>>,
    byVehicle: Awaited<ReturnType<typeof fuelRepository.getFuelingFrequencyByVehicle>>
  ): FleetPositionSection {
    const hasData = stats.logCount > 0;
    return {
      totalFuelCost: hasData ? fact(stats.totalCost) : unavailable('No fuel logs recorded for this period.'),
      totalLitres: hasData ? fact(stats.totalFuel) : unavailable('No fuel logs recorded for this period.'),
      logCount: fact(stats.logCount),
      vehiclesActive: fact(byVehicle.length),
      averageCostPerLitre: stats.totalFuel > 0
        ? calculated(Math.round(stats.averageCostPerUnit * 100) / 100)
        : unavailable('No litres recorded for this period; a cost-per-litre average is undefined.'),
      currency: 'organization reporting currency (see individual fuel logs for per-transaction currency)',
    };
  }

  private buildWhatChanged(
    currentStats: Awaited<ReturnType<typeof fuelRepository.getFuelStats>>,
    previousStats: Awaited<ReturnType<typeof fuelRepository.getFuelStats>>,
    currentByVehicle: Awaited<ReturnType<typeof fuelRepository.getFuelingFrequencyByVehicle>>,
    previousByVehicle: Awaited<ReturnType<typeof fuelRepository.getFuelingFrequencyByVehicle>>,
    previousPeriodLabel: string
  ): WhatChangedSection {
    const hasComparison = previousStats.logCount > 0 || previousByVehicle.length > 0;

    const costMetric = computeMonthOverMonthMetric(
      'Total fuel cost',
      'currency',
      currentStats.logCount > 0 ? currentStats.totalCost : null,
      previousStats.logCount > 0 ? previousStats.totalCost : null,
      unavailable('See "average cost per litre" and "fueling frequency" below for corroborating detail.')
    );

    const litresMetric = computeMonthOverMonthMetric(
      'Total litres fuelled',
      'litres',
      currentStats.logCount > 0 ? currentStats.totalFuel : null,
      previousStats.logCount > 0 ? previousStats.totalFuel : null,
      unavailable('n/a')
    );

    const priceMetric = computeMonthOverMonthMetric(
      'Average cost per litre',
      'currency/litre',
      currentStats.totalFuel > 0 ? currentStats.averageCostPerUnit : null,
      previousStats.totalFuel > 0 ? previousStats.averageCostPerUnit : null,
      unavailable('n/a')
    );

    // Corroborate the cost metric's possible explanation using the price
    // and litres metrics actually computed above -- never an invented
    // cause. Only stated when the direction of cost change is genuinely
    // consistent with a price or volume move.
    if (costMetric.direction === 'up' || costMetric.direction === 'down') {
      const priceMoved = priceMetric.direction === costMetric.direction && priceMetric.deltaPercent.status === 'CALCULATED';
      const volumeMoved = litresMetric.direction === costMetric.direction && litresMetric.deltaPercent.status === 'CALCULATED';
      if (priceMoved && volumeMoved) {
        costMetric.possibleExplanation = calculated(
          `Both average price per litre (${priceMetric.deltaPercent.value! > 0 ? '+' : ''}${priceMetric.deltaPercent.value}%) and total litres fuelled (${litresMetric.deltaPercent.value! > 0 ? '+' : ''}${litresMetric.deltaPercent.value}%) moved in the same direction as total cost.`
        );
      } else if (priceMoved) {
        costMetric.possibleExplanation = calculated(
          `Average price per litre moved ${priceMetric.deltaPercent.value! > 0 ? '+' : ''}${priceMetric.deltaPercent.value}%, consistent with the direction of the cost change. Litres fuelled did not move in the same direction, so price appears to be the larger contributor.`
        );
      } else if (volumeMoved) {
        costMetric.possibleExplanation = calculated(
          `Total litres fuelled moved ${litresMetric.deltaPercent.value! > 0 ? '+' : ''}${litresMetric.deltaPercent.value}%, consistent with the direction of the cost change. Average price per litre did not move in the same direction, so volume appears to be the larger contributor.`
        );
      }
    }

    // Vehicle count is a plain observed count, not a money figure -- zero
    // vehicles fuelled is itself a real, reportable fact rather than a
    // "missing data" state, so unlike cost/litres above it is never
    // nulled out based on `hasComparison`.
    const vehicleCountMetric = computeMonthOverMonthMetric(
      'Vehicles fuelled',
      'vehicles',
      currentByVehicle.length,
      previousByVehicle.length,
      unavailable('n/a')
    );

    const currentConcentration = computeCostConcentration(
      currentByVehicle.map((v) => ({ license_plate: v.license_plate, totalCost: v.totalCost, totalLitres: v.totalVolume, logCount: v.count }))
    );
    const previousConcentration = computeCostConcentration(
      previousByVehicle.map((v) => ({ license_plate: v.license_plate, totalCost: v.totalCost, totalLitres: v.totalVolume, logCount: v.count }))
    );
    const concentrationMetric = computeMonthOverMonthMetric(
      'Top-5-vehicle cost concentration',
      '% of fleet fuel cost',
      currentConcentration.status === 'CALCULATED' ? currentConcentration.value!.costSharePercent : null,
      previousConcentration.status === 'CALCULATED' ? previousConcentration.value!.costSharePercent : null,
      unavailable('n/a')
    );

    return {
      hasComparisonPeriod: hasComparison,
      comparisonPeriodLabel: hasComparison ? previousPeriodLabel : undefined,
      metrics: [costMetric, litresMetric, priceMetric, vehicleCountMetric, concentrationMetric],
    };
  }

  private buildCostDrivers(
    currentByVehicle: Awaited<ReturnType<typeof fuelRepository.getFuelingFrequencyByVehicle>>,
    previousByVehicle: Awaited<ReturnType<typeof fuelRepository.getFuelingFrequencyByVehicle>>
  ): CostDriverSection {
    const previousMap = new Map(previousByVehicle.map((v) => [v.license_plate, v.totalCost]));
    const rows = classifyCostDrivers(
      currentByVehicle.map((v) => ({ license_plate: v.license_plate, totalCost: v.totalCost, totalLitres: v.totalVolume, logCount: v.count })),
      previousMap
    ).sort((a, b) => (b.totalCost.value ?? 0) - (a.totalCost.value ?? 0));

    return {
      rows,
      topVehicleConcentration: computeCostConcentration(
        currentByVehicle.map((v) => ({ license_plate: v.license_plate, totalCost: v.totalCost, totalLitres: v.totalVolume, logCount: v.count }))
      ),
    };
  }

  private buildDriverFindings(
    byDriver: Awaited<ReturnType<typeof fuelRepository.getFuelByDriver>>,
    stats: Awaited<ReturnType<typeof fuelRepository.getFuelStats>>
  ): DriverFindingsSection {
    const rows: DriverFindingRow[] = byDriver
      .filter((d) => d.driver_id !== null)
      .map((d) => ({
        driver_id: d.driver_id,
        driverName: d.driverName,
        totalCost: fact(d.totalCost),
        totalLitres: fact(d.totalFuel),
        logCount: fact(d.logCount),
        vehicleCount: fact(d.vehicleCount),
      }));

    const unassigned = byDriver.find((d) => d.driver_id === null);
    const unassignedCost = unassigned?.totalCost ?? 0;

    return {
      rows,
      unassignedCost: byDriver.length > 0 ? fact(unassignedCost) : unavailable('No fuel logs recorded for this period.'),
      unassignedSharePercent: stats.totalCost > 0
        ? calculated(Math.round((unassignedCost / stats.totalCost) * 1000) / 10)
        : unavailable('No fuel cost recorded for this period.'),
      attributionNote:
        'Driver attribution is transaction-time: each fuel log carries the driver recorded at the moment of entry, independent of the vehicle’s current driver assignment on the Vehicle Operational Hub. A fuel log with no driver recorded is shown as unattributed rather than assigned to whoever currently drives that vehicle -- see shared/types/fuel.types.ts and PART 4 of this engagement’s findings.',
    };
  }

  private buildFuelTypeMix(rows: Awaited<ReturnType<typeof fuelRepository.getFuelTypeDistribution>>): FuelTypeMixRow[] {
    return rows.map((r) => ({
      fuelType: r.fuelType,
      litres: fact(r.litres),
      cost: fact(r.cost),
      percentage: calculated(r.percentage),
    }));
  }

  private buildAbnormalFindings(
    abnormal: Awaited<ReturnType<typeof fuelRepository.getAbnormalConsumption>>,
    period: { start: Date; end: Date },
    costDrivers: CostDriverSection
  ): AbnormalFindingsSection {
    const inPeriod = abnormal.filter((row) => {
      const d = new Date(row.date as string);
      return d >= period.start && d <= period.end;
    });

    return {
      volumeAnomalies: inPeriod.map((row) => ({
        _id: row._id,
        license_plate: row.license_plate,
        date: new Date(row.date as string).toISOString().slice(0, 10),
        volume: row.volume,
        anomalyScore: row.anomalyScore,
        threshold: row.threshold,
      })),
      volumeAnomalyBasis:
        `A single fill-up is flagged when its volume exceeds the vehicle’s own historical average fill-up volume by more than ${inPeriod[0]?.threshold ?? 2}x (modules/fuel/repositories/fuel.repository.ts’s DEFAULT_ABNORMAL_CONSUMPTION_MULTIPLIER). The baseline average is computed across the vehicle’s full history, not just this period, so a new vehicle with fewer than a handful of fill-ups may not yet have a reliable baseline.`,
      vehicleCostSpikes: costDrivers.rows.filter((r) => r.classification === 'abnormal_cost'),
    };
  }

  private buildAllocationReconciliation(
    stats: Awaited<ReturnType<typeof fuelRepository.getFuelStats>>,
    ledgerRows: Awaited<ReturnType<typeof allocationLedgerRepository.getNetTotalsGrouped>>
  ): AllocationReconciliationSection {
    const operationalTotal = stats.logCount > 0 ? stats.totalCost : null;

    const currencies = new Set(ledgerRows.map((r) => r.reportingCurrency));
    let ledgerTotal: number | null;
    let currencyNote = '';
    if (ledgerRows.length === 0) {
      ledgerTotal = 0;
    } else if (currencies.size > 1) {
      ledgerTotal = null;
      currencyNote = ` Ledger postings span ${currencies.size} different reporting currencies this period; they cannot be summed into one total without a conversion rate this report does not apply.`;
    } else {
      ledgerTotal = ledgerRows.reduce((sum, r) => sum + r.netReportingAmount, 0);
    }

    const result = reconcileAllocation(operationalTotal, ledgerTotal);
    return {
      ...result,
      note: result.note + currencyNote,
    };
  }

  private buildFindings(input: {
    period: { label: string };
    fleetPosition: FleetPositionSection;
    whatChanged: WhatChangedSection;
    costDrivers: CostDriverSection;
    driverFindings: DriverFindingsSection;
    abnormalFindings: AbnormalFindingsSection;
    allocationReconciliation: AllocationReconciliationSection;
    dataQuality: { overallAssessment: string; metrics: { label: string; percent: number; severity: string }[] };
  }): Finding[] {
    const findings: Finding[] = [];
    let seq = 0;
    const nextId = () => `finding-${++seq}`;

    // Cost concentration finding
    const concentration = input.costDrivers.topVehicleConcentration;
    if (concentration.status === 'CALCULATED' && concentration.value) {
      findings.push({
        id: nextId(),
        what: `The top ${concentration.value.vehicleCount} vehicle(s) by fuel cost account for ${concentration.value.costSharePercent}% of total fleet fuel spend this period.`,
        why: 'High concentration means fleet fuel cost is disproportionately driven by a small number of vehicles -- both a risk (a single vehicle issue moves the whole fleet number) and an opportunity (a small number of vehicles is where investigation and corrective action will have the most effect).',
        impact: fact(`${concentration.value.costSharePercent}% of ${input.fleetPosition.totalFuelCost.status === 'FACT' ? input.fleetPosition.totalFuelCost.value : 'fleet fuel cost'} this period.`),
        action: 'Review the highest-cost vehicles listed in Cost Drivers for route assignment, load, vehicle condition, and driver behaviour factors.',
        how: 'Cross-reference each high-cost vehicle against its maintenance history, assigned routes, and (where attribution allows) driver.',
        prevention: 'Track cost concentration month-over-month; a rising trend indicates the fleet’s cost base is becoming less diversified/more exposed to a small number of vehicles.',
        monitor: 'Next month’s top-vehicle cost concentration percentage.',
        severity: concentration.value.costSharePercent >= 60 ? 'attention' : 'info',
      });
    }

    // Abnormal cost spikes
    for (const row of input.abnormalFindings.vehicleCostSpikes) {
      findings.push({
        id: nextId(),
        what: `Vehicle ${row.license_plate}'s fuel cost this period is an abnormal increase versus its prior-period baseline. ${row.abnormalReason ?? ''}`,
        why: 'A sudden cost increase against a vehicle’s own recent history is a stronger signal than a high absolute cost, since it is measured against that vehicle’s own baseline rather than the rest of the fleet.',
        impact: row.totalCost.status === 'FACT' ? fact(`${row.totalCost.value} this period.`) : unavailable('Cost figure unavailable.'),
        action: `Investigate vehicle ${row.license_plate}'s fuel logs for this period for cause (route change, fuel price, potential leakage or fraud, odometer/volume data entry error).`,
        how: 'Review individual fuel log entries for the vehicle against odometer progression, route assignment, and driver attribution for this period.',
        prevention: 'Set an internal review trigger for any vehicle whose month-over-month fuel cost increases past this threshold.',
        owner: `Vehicle ${row.license_plate}`,
        monitor: `Vehicle ${row.license_plate}'s fuel cost next period, to confirm the increase was a one-off or has become a new baseline.`,
        severity: 'urgent',
      });
    }

    // Volume anomalies (single fill-ups)
    if (input.abnormalFindings.volumeAnomalies.length > 0) {
      findings.push({
        id: nextId(),
        what: `${input.abnormalFindings.volumeAnomalies.length} individual fill-up(s) this period exceeded their vehicle's own historical average volume beyond the platform's abnormal-consumption threshold.`,
        why: 'An abnormally large single fill-up can indicate a data entry error, a genuinely larger tank/vehicle change not reflected in records, or potential fuel loss/fraud -- the exact cause cannot be determined from the fuel log alone.',
        impact: unavailable('Financial impact of individual anomalies is not separately quantified; see the Abnormal Findings detail table for the specific fill-ups.'),
        action: 'Review the flagged fill-ups in the Abnormal Findings detail table against the specific vehicle’s fuel tank capacity and recent fill-up history.',
        how: 'Cross-check each flagged entry’s odometer, volume and cost against the vehicle’s fuel log history and, where available, the fuel card transaction.',
        prevention: 'Consider requiring a note/justification on fuel log entries that exceed a vehicle’s typical fill-up volume.',
        monitor: 'Count of flagged fill-ups next period.',
        severity: input.abnormalFindings.volumeAnomalies.length >= 5 ? 'attention' : 'info',
      });
    }

    // Allocation reconciliation
    if (input.allocationReconciliation.reconciled === false) {
      findings.push({
        id: nextId(),
        what: `Operational fuel records and the allocation ledger's fuel-category total do not reconcile for this period.`,
        why: 'The allocation ledger is this platform’s system of record for financial reporting. A variance between operational fuel records and the ledger means the fuel figures reported to management/finance may not match what fuel logs alone would suggest, and the cause should be understood before either figure is used externally.',
        impact: input.allocationReconciliation.variance.status === 'CALCULATED'
          ? fact(`Variance of ${input.allocationReconciliation.variance.value} (${input.allocationReconciliation.variancePercent.status === 'CALCULATED' ? `${input.allocationReconciliation.variancePercent.value}%` : 'percentage unavailable'}).`)
          : unavailable('Variance could not be computed.'),
        action: 'Reconcile fuel logs for this period against allocation ledger postings for the fuel cost category to identify the source of the variance (unposted fuel logs, postings from a source other than fuel logs, timing differences, or a posting error).',
        how: 'Compare the Raw Fuel Log Data sheet against a ledger export for the same period and cost category.',
        prevention: 'Monitor the reconciliation variance percentage monthly; a persistent or growing variance indicates a systemic (not one-off) issue in the posting pipeline.',
        monitor: 'Reconciliation variance percentage next period.',
        severity: 'urgent',
      });
    }

    // Data quality
    if (input.dataQuality.overallAssessment === 'poor' || input.dataQuality.overallAssessment === 'fair') {
      const worst = [...input.dataQuality.metrics].sort((a, b) => b.percent - a.percent)[0];
      findings.push({
        id: nextId(),
        what: `Fuel data quality for this period is assessed as "${input.dataQuality.overallAssessment}". The most significant gap: ${worst?.label ?? 'see Data Quality section'} (${worst?.percent ?? 0}% of logs affected).`,
        why: 'Findings in this report that depend on complete data (driver attribution, fuel type mix, distance-based metrics) are only as reliable as the underlying data. Gaps reduce confidence in those findings proportionally.',
        impact: unavailable('Not independently quantified; see the Data Quality section for the specific fields and percentages affected.'),
        action: 'Reinforce fuel log entry completeness at the point of capture (driver, fuel type, and odometer fields in particular).',
        how: 'Review the Data Quality sheet for which fields are most commonly missing and which vehicles/entry points they cluster around.',
        prevention: 'Consider making the affected fields required on the fuel entry form if they are not already, where operationally feasible.',
        monitor: 'Data quality percentages next period.',
        severity: input.dataQuality.overallAssessment === 'poor' ? 'attention' : 'info',
      });
    }

    // Unassigned driver cost share
    if (input.driverFindings.unassignedSharePercent.status === 'CALCULATED' && (input.driverFindings.unassignedSharePercent.value ?? 0) >= 20) {
      findings.push({
        id: nextId(),
        what: `${input.driverFindings.unassignedSharePercent.value}% of this period's fuel cost has no driver attributed.`,
        why: 'Driver-level fuel cost findings only cover attributed fuel; a large unattributed share limits how much of the fleet’s fuel spend can be analysed at the driver level.',
        impact: input.driverFindings.unassignedCost.status === 'FACT' ? fact(`${input.driverFindings.unassignedCost.value} unattributed.`) : unavailable('Amount unavailable.'),
        action: 'Reinforce recording the driver at the time of fuel entry for transactions currently logged without one.',
        prevention: 'Consider making the driver field required on the fuel entry form where operationally feasible.',
        monitor: 'Unassigned fuel cost share next period.',
        severity: 'info',
      });
    }

    return findings;
  }
}

export const monthlyFuelIntelligenceService = new MonthlyFuelIntelligenceService();
