// modules/expenses/reporting/monthly-expense-intelligence.service.ts
//
// Builds the Monthly Expense Intelligence Report -- mirrors
// modules/fuel/reporting/monthly-fuel-intelligence.service.ts (the
// Monthly Fuel & Fleet Intelligence Report) entirely from EXISTING,
// already tenant/org-unit-scoped reads:
//
//   - ExpenseRepository          (expense.repository.ts)     -- operational expense data
//   - AllocationLedgerRepository (allocation-ledger.repository.ts) -- financial reconciliation
//
// No new collection, no new database, no bypass of tenant/org-unit
// scoping is introduced. Every read below threads the caller's
// TenantContext straight through to methods that already enforce
// isolation. This is deliberately an analysis/export LAYER on top of
// the existing platform, not a parallel reporting engine -- same
// discipline the fuel report's own header documents.
//
// WHAT WAS KEPT FROM THE FUEL REPORT, UNCHANGED IN SPIRIT:
//   - the Labeled<T> FACT/CALCULATED/ESTIMATED/UNAVAILABLE/
//     DATA_QUALITY_ISSUE discipline for every number
//   - Fleet Position -> Expense Position, What Changed, Cost Drivers,
//     Allocation Reconciliation, Data Quality, Findings
//
// WHAT WAS ADAPTED:
//   - Fuel Type Mix -> Category Mix, built from
//     ExpenseRepository.getExpenseCategorySummary (which already computes
//     its own MoM change server-side, unlike getFuelTypeDistribution)
//   - Abnormal Findings' individual-transaction signal: fuel flags a
//     single fill-up whose VOLUME exceeds the vehicle's own historical
//     average by a fixed multiplier; expenses have no equivalent
//     physical-volume signal, so this uses
//     ExpenseRepository.getExpenseOutliers instead -- transactions whose
//     AMOUNT is a statistical (z-score) outlier against their own
//     category's mean for the period. Already built, already available,
//     and a more rigorous basis than inventing a fixed-multiplier
//     equivalent would have been.
//
// WHAT WAS DELIBERATELY LEFT OUT:
//   - Driver Findings. Expense has no driver field at all (only vehicle,
//     category, amount, job/trip) -- there is nothing to group by. This
//     was an explicit scoping decision, not an oversight: inventing a
//     derived driver attribution (e.g. via each vehicle's CURRENT
//     Operational Hub driver) would repeat exactly the silent
//     vehicle-driver coupling this engagement just finished removing
//     from the fuel module's display layer.

import { expenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { allocationLedgerRepository } from '@/modules/finance/repositories/allocation-ledger.repository';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import type {
  AbnormalFindingsSection,
  AllocationReconciliationSection,
  CategoryMixRow,
  CostDriverSection,
  ExpensePositionSection,
  Finding,
  MonthlyExpenseIntelligenceReport,
  WhatChangedSection,
} from './expense-intelligence.types';
import { calculated, fact, unavailable } from './expense-intelligence.types';
import {
  resolveReportPeriod,
  resolvePreviousPeriod,
  computeMonthOverMonthMetric,
  classifyCostDrivers,
  computeCostConcentration,
  assessDataQuality,
  reconcileAllocation,
  EXPENSE_OUTLIER_Z_THRESHOLD,
} from './expense-intelligence.utils';

/** Soft cap on distinct vehicles/categories resolved per report -- same rationale and same value as fuel's ENTITY_LIMIT. */
const ENTITY_LIMIT = 2000;

export class MonthlyExpenseIntelligenceService {
  async buildReport(
    tenantId: string,
    context: TenantContext,
    month: string
  ): Promise<MonthlyExpenseIntelligenceReport> {
    const period = resolveReportPeriod(month);
    const previousPeriod = resolvePreviousPeriod(period);

    const [
      currentStats,
      previousStats,
      currentByVehicle,
      previousByVehicle,
      categorySummary,
      outliers,
      currentExpenses,
      ledgerRows,
    ] = await Promise.all([
      expenseRepository.getExpenseStats(tenantId, { startDate: period.start, endDate: period.end }, undefined, context),
      expenseRepository.getExpenseStats(tenantId, { startDate: previousPeriod.start, endDate: previousPeriod.end }, undefined, context),
      expenseRepository.getTopVehiclesByExpense(tenantId, { startDate: period.start, endDate: period.end }, ENTITY_LIMIT, undefined, context),
      expenseRepository.getTopVehiclesByExpense(tenantId, { startDate: previousPeriod.start, endDate: previousPeriod.end }, ENTITY_LIMIT, undefined, context),
      expenseRepository.getExpenseCategorySummary(tenantId, { startDate: period.start, endDate: period.end }, undefined, context),
      expenseRepository.getExpenseOutliers(tenantId, { startDate: period.start, endDate: period.end }, EXPENSE_OUTLIER_Z_THRESHOLD, ENTITY_LIMIT, undefined, context),
      expenseRepository.getFilteredExpensesForExport({ startDate: period.start, endDate: period.end }, context),
      allocationLedgerRepository.getNetTotalsGrouped('none', ['expense'], period.start, period.end, context),
    ]);

    const expensePosition = this.buildExpensePosition(currentStats, currentByVehicle);
    const whatChanged = this.buildWhatChanged(currentStats, previousStats, currentByVehicle, previousByVehicle, previousPeriod.label);
    const costDrivers = this.buildCostDrivers(currentByVehicle, previousByVehicle);
    const categoryMix = this.buildCategoryMix(categorySummary);
    const abnormalFindings = this.buildAbnormalFindings(outliers, costDrivers);
    const allocationReconciliation = this.buildAllocationReconciliation(currentStats, ledgerRows);
    const dataQuality = assessDataQuality(
      currentExpenses.rows.map((e) => ({
        license_plate: e.license_plate,
        date: new Date(e.date).toISOString(),
        amount: e.amount,
        category: e.expense_type?.name ?? null,
      })),
      currentExpenses.truncated
    );

    const findings = this.buildFindings({
      expensePosition,
      costDrivers,
      abnormalFindings,
      allocationReconciliation,
      dataQuality,
    });

    return {
      organization: { id: context.organizationId, name: context.organizationName },
      scope: { orgUnitId: context.activeOrgUnitId ?? null },
      generatedAt: new Date(),
      period,
      expensePosition,
      whatChanged,
      costDrivers,
      categoryMix,
      abnormalFindings,
      allocationReconciliation,
      dataQuality,
      findings,
    };
  }

  // ---------------------------------------------------------------------

  /**
   * ExpenseStats does not carry a raw total-count field the way
   * FuelStats.logCount does -- it is derivable (`total / average`) but
   * that inverts a rounded figure, which is exactly the kind of
   * imprecision this report's Labeled<T> discipline exists to avoid.
   * Summing byType's per-category totals also doesn't recover a count.
   * Rather than accept that imprecision, this sums
   * getTopVehiclesByExpense's own per-vehicle expenseCount -- already an
   * exact FACT figure, already fetched for Cost Drivers, so nothing
   * extra is queried for it. NOTE: this means transactionCount (and
   * anything derived from it, like averageCostPerTransaction) excludes
   * any expense transaction whose vehicle association is missing/null --
   * getTopVehiclesByExpense groups by vehicle, so an unassociated expense
   * has no row to be counted in. That gap is exactly what
   * DataQualitySection's "missing vehicle association" style metrics
   * exist to surface; it is not silently absorbed here.
   */
  private buildExpensePosition(
    stats: Awaited<ReturnType<typeof expenseRepository.getExpenseStats>>,
    byVehicle: Awaited<ReturnType<typeof expenseRepository.getTopVehiclesByExpense>>
  ): ExpensePositionSection {
    const totalCount = byVehicle.reduce((sum, v) => sum + v.expenseCount, 0);
    const hasData = stats.total > 0 || totalCount > 0;
    return {
      totalExpenseCost: hasData ? fact(stats.total) : unavailable('No expenses recorded for this period.'),
      transactionCount: fact(totalCount),
      vehiclesWithExpenses: fact(byVehicle.length),
      averageCostPerTransaction: totalCount > 0
        ? calculated(Math.round((stats.total / totalCount) * 100) / 100, 'stats.total / transactionCount, rather than the repository’s own pre-rounded average, to stay consistent with the transactionCount figure this section actually reports.')
        : unavailable('No expense transactions recorded for this period; an average is undefined.'),
      currency: 'organization reporting currency (see individual expense transactions for per-transaction currency)',
    };
  }

  private buildWhatChanged(
    currentStats: Awaited<ReturnType<typeof expenseRepository.getExpenseStats>>,
    previousStats: Awaited<ReturnType<typeof expenseRepository.getExpenseStats>>,
    currentByVehicle: Awaited<ReturnType<typeof expenseRepository.getTopVehiclesByExpense>>,
    previousByVehicle: Awaited<ReturnType<typeof expenseRepository.getTopVehiclesByExpense>>,
    previousPeriodLabel: string
  ): WhatChangedSection {
    const currentCount = currentByVehicle.reduce((sum, v) => sum + v.expenseCount, 0);
    const previousCount = previousByVehicle.reduce((sum, v) => sum + v.expenseCount, 0);
    const hasComparison = previousStats.total > 0 || previousCount > 0;

    const costMetric = computeMonthOverMonthMetric(
      'Total expense cost',
      'currency',
      currentCount > 0 ? currentStats.total : null,
      previousCount > 0 ? previousStats.total : null,
      unavailable('See "average cost per transaction" and "transaction count" below for corroborating detail.')
    );

    const countMetric = computeMonthOverMonthMetric(
      'Expense transaction count',
      'transactions',
      currentCount > 0 ? currentCount : null,
      previousCount > 0 ? previousCount : null,
      unavailable('n/a')
    );

    const averageMetric = computeMonthOverMonthMetric(
      'Average cost per transaction',
      'currency/transaction',
      currentCount > 0 ? currentStats.average : null,
      previousCount > 0 ? previousStats.average : null,
      unavailable('n/a')
    );

    // Corroborate the cost metric's possible explanation using the
    // average and count metrics actually computed above -- never an
    // invented cause. Same corroboration logic as fuel's
    // price/litres-vs-cost check, applied to average/count instead.
    if (costMetric.direction === 'up' || costMetric.direction === 'down') {
      const averageMoved = averageMetric.direction === costMetric.direction && averageMetric.deltaPercent.status === 'CALCULATED';
      const countMoved = countMetric.direction === costMetric.direction && countMetric.deltaPercent.status === 'CALCULATED';
      if (averageMoved && countMoved) {
        costMetric.possibleExplanation = calculated(
          `Both average cost per transaction (${averageMetric.deltaPercent.value! > 0 ? '+' : ''}${averageMetric.deltaPercent.value}%) and transaction count (${countMetric.deltaPercent.value! > 0 ? '+' : ''}${countMetric.deltaPercent.value}%) moved in the same direction as total cost.`
        );
      } else if (averageMoved) {
        costMetric.possibleExplanation = calculated(
          `Average cost per transaction moved ${averageMetric.deltaPercent.value! > 0 ? '+' : ''}${averageMetric.deltaPercent.value}%, consistent with the direction of the cost change. Transaction count did not move in the same direction, so per-transaction cost appears to be the larger contributor.`
        );
      } else if (countMoved) {
        costMetric.possibleExplanation = calculated(
          `Transaction count moved ${countMetric.deltaPercent.value! > 0 ? '+' : ''}${countMetric.deltaPercent.value}%, consistent with the direction of the cost change. Average cost per transaction did not move in the same direction, so transaction volume appears to be the larger contributor.`
        );
      }
    }

    const vehicleCountMetric = computeMonthOverMonthMetric(
      'Vehicles with expenses',
      'vehicles',
      currentByVehicle.length,
      previousByVehicle.length,
      unavailable('n/a')
    );

    const currentConcentration = computeCostConcentration(
      currentByVehicle.map((v) => ({ license_plate: v.license_plate, totalCost: v.totalAmount, transactionCount: v.expenseCount }))
    );
    const previousConcentration = computeCostConcentration(
      previousByVehicle.map((v) => ({ license_plate: v.license_plate, totalCost: v.totalAmount, transactionCount: v.expenseCount }))
    );
    const concentrationMetric = computeMonthOverMonthMetric(
      'Top-5-vehicle cost concentration',
      '% of fleet expense cost',
      currentConcentration.status === 'CALCULATED' ? currentConcentration.value!.costSharePercent : null,
      previousConcentration.status === 'CALCULATED' ? previousConcentration.value!.costSharePercent : null,
      unavailable('n/a')
    );

    return {
      hasComparisonPeriod: hasComparison,
      comparisonPeriodLabel: hasComparison ? previousPeriodLabel : undefined,
      metrics: [costMetric, countMetric, averageMetric, vehicleCountMetric, concentrationMetric],
    };
  }

  private buildCostDrivers(
    currentByVehicle: Awaited<ReturnType<typeof expenseRepository.getTopVehiclesByExpense>>,
    previousByVehicle: Awaited<ReturnType<typeof expenseRepository.getTopVehiclesByExpense>>
  ): CostDriverSection {
    const previousMap = new Map(previousByVehicle.map((v) => [v.license_plate, v.totalAmount]));
    const rows = classifyCostDrivers(
      currentByVehicle.map((v) => ({ license_plate: v.license_plate, totalCost: v.totalAmount, transactionCount: v.expenseCount })),
      previousMap
    ).sort((a, b) => (b.totalCost.value ?? 0) - (a.totalCost.value ?? 0));

    return {
      rows,
      topVehicleConcentration: computeCostConcentration(
        currentByVehicle.map((v) => ({ license_plate: v.license_plate, totalCost: v.totalAmount, transactionCount: v.expenseCount }))
      ),
    };
  }

  private buildCategoryMix(rows: Awaited<ReturnType<typeof expenseRepository.getExpenseCategorySummary>>): CategoryMixRow[] {
    return rows.map((r) => ({
      category: r.category,
      cost: fact(r.total),
      count: fact(r.count),
      percentage: calculated(r.percentageOfTotal),
      momChangePercent: r.momChangePercent === null
        ? unavailable('No comparable prior-period data for this category.')
        : calculated(r.momChangePercent),
    }));
  }

  private buildAbnormalFindings(
    outliers: Awaited<ReturnType<typeof expenseRepository.getExpenseOutliers>>,
    costDrivers: CostDriverSection
  ): AbnormalFindingsSection {
    return {
      amountOutliers: outliers.map((row) => ({
        _id: row._id,
        license_plate: row.license_plate,
        category: row.category,
        date: row.date.slice(0, 10),
        amount: row.amount,
        categoryMean: row.categoryMean,
        categoryStdDev: row.categoryStdDev,
        zScore: row.zScore,
      })),
      outlierBasis:
        `A transaction is flagged when its amount is at least ${EXPENSE_OUTLIER_Z_THRESHOLD} standard deviations from the mean amount of its own category for this period (modules/expenses/repositories/expense.repository.ts's getExpenseOutliers). A category needs at least 3 transactions and non-zero variance before outliers are computed for it, so a category with very few transactions this period may not yet have a reliable baseline.`,
      vehicleCostSpikes: costDrivers.rows.filter((r) => r.classification === 'abnormal_cost'),
    };
  }

  private buildAllocationReconciliation(
    stats: Awaited<ReturnType<typeof expenseRepository.getExpenseStats>>,
    ledgerRows: Awaited<ReturnType<typeof allocationLedgerRepository.getNetTotalsGrouped>>
  ): AllocationReconciliationSection {
    const operationalTotal = stats.total > 0 ? stats.total : (Object.keys(stats.byType).length > 0 ? stats.total : null);

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
    expensePosition: ExpensePositionSection;
    costDrivers: CostDriverSection;
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
        what: `The top ${concentration.value.vehicleCount} vehicle(s) by expense cost account for ${concentration.value.costSharePercent}% of total fleet expense spend this period.`,
        why: 'High concentration means fleet expense cost is disproportionately driven by a small number of vehicles -- both a risk (a single vehicle issue moves the whole fleet number) and an opportunity (a small number of vehicles is where investigation and corrective action will have the most effect).',
        impact: fact(`${concentration.value.costSharePercent}% of ${input.expensePosition.totalExpenseCost.status === 'FACT' ? input.expensePosition.totalExpenseCost.value : 'fleet expense cost'} this period.`),
        action: 'Review the highest-cost vehicles listed in Cost Drivers for maintenance history, usage pattern, and repair frequency factors.',
        how: 'Cross-reference each high-cost vehicle against its maintenance history, category breakdown, and assigned routes/jobs.',
        prevention: 'Track cost concentration month-over-month; a rising trend indicates the fleet’s expense base is becoming less diversified/more exposed to a small number of vehicles.',
        monitor: 'Next month’s top-vehicle cost concentration percentage.',
        severity: concentration.value.costSharePercent >= 60 ? 'attention' : 'info',
      });
    }

    // Abnormal cost spikes (vehicle-level, month-over-month)
    for (const row of input.costDrivers.rows.filter((r) => r.classification === 'abnormal_cost')) {
      findings.push({
        id: nextId(),
        what: `Vehicle ${row.license_plate}'s expense cost this period is an abnormal increase versus its prior-period baseline. ${row.abnormalReason ?? ''}`,
        why: 'A sudden cost increase against a vehicle’s own recent history is a stronger signal than a high absolute cost, since it is measured against that vehicle’s own baseline rather than the rest of the fleet.',
        impact: row.totalCost.status === 'FACT' ? fact(`${row.totalCost.value} this period.`) : unavailable('Cost figure unavailable.'),
        action: `Investigate vehicle ${row.license_plate}'s expense transactions for this period for cause (a major repair, a category shift, or a data entry error).`,
        how: 'Review individual expense transactions for the vehicle for this period against its category breakdown and maintenance/job history.',
        prevention: 'Set an internal review trigger for any vehicle whose month-over-month expense cost increases past this threshold.',
        owner: `Vehicle ${row.license_plate}`,
        monitor: `Vehicle ${row.license_plate}'s expense cost next period, to confirm the increase was a one-off or has become a new baseline.`,
        severity: 'urgent',
      });
    }

    // Amount outliers (individual transactions)
    if (input.abnormalFindings.amountOutliers.length > 0) {
      findings.push({
        id: nextId(),
        what: `${input.abnormalFindings.amountOutliers.length} individual expense transaction(s) this period were statistical outliers against their own category's typical amount.`,
        why: 'An abnormally large single transaction relative to its category can indicate a data entry error, a genuinely unusual but legitimate cost, or an item mis-categorized -- the exact cause cannot be determined from the transaction record alone.',
        impact: unavailable('Financial impact of individual outliers is not separately quantified; see the Abnormal Findings detail table for the specific transactions.'),
        action: 'Review the flagged transactions in the Abnormal Findings detail table against the vehicle’s history and the category’s typical range.',
        how: 'Cross-check each flagged entry’s amount, category and description against the vehicle’s expense history and, where available, a receipt or invoice.',
        prevention: 'Consider requiring a note/justification on expense entries that exceed a category’s typical amount.',
        monitor: 'Count of flagged transactions next period.',
        severity: input.abnormalFindings.amountOutliers.length >= 5 ? 'attention' : 'info',
      });
    }

    // Allocation reconciliation
    if (input.allocationReconciliation.reconciled === false) {
      findings.push({
        id: nextId(),
        what: `Operational expense records and the allocation ledger's expense-category total do not reconcile for this period.`,
        why: 'The allocation ledger is this platform’s system of record for financial reporting. A variance between operational expense records and the ledger means the expense figures reported to management/finance may not match what expense transactions alone would suggest, and the cause should be understood before either figure is used externally.',
        impact: input.allocationReconciliation.variance.status === 'CALCULATED'
          ? fact(`Variance of ${input.allocationReconciliation.variance.value} (${input.allocationReconciliation.variancePercent.status === 'CALCULATED' ? `${input.allocationReconciliation.variancePercent.value}%` : 'percentage unavailable'}).`)
          : unavailable('Variance could not be computed.'),
        action: 'Reconcile expense transactions for this period against allocation ledger postings for the expense cost category to identify the source of the variance (unposted transactions, postings from a source other than expenses, timing differences, or a posting error).',
        how: 'Compare the Raw Expense Data sheet against a ledger export for the same period and cost category.',
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
        what: `Expense data quality for this period is assessed as "${input.dataQuality.overallAssessment}". The most significant gap: ${worst?.label ?? 'see Data Quality section'} (${worst?.percent ?? 0}% of transactions affected).`,
        why: 'Findings in this report that depend on complete data (category mix in particular) are only as reliable as the underlying data. Gaps reduce confidence in those findings proportionally.',
        impact: unavailable('Not independently quantified; see the Data Quality section for the specific fields and percentages affected.'),
        action: 'Reinforce expense entry completeness at the point of capture (category in particular).',
        how: 'Review the Data Quality sheet for which fields are most commonly missing and which vehicles/entry points they cluster around.',
        prevention: 'Consider making the affected fields required on the expense entry form if they are not already, where operationally feasible.',
        monitor: 'Data quality percentages next period.',
        severity: input.dataQuality.overallAssessment === 'poor' ? 'attention' : 'info',
      });
    }

    return findings;
  }
}

export const monthlyExpenseIntelligenceService = new MonthlyExpenseIntelligenceService();
