// frontend/modules/expenses/pages/ExpenseAnalyticsPage.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileSpreadsheet, Printer } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { downloadXlsxTemplate } from '@/shared/utils/excel-parser.utils';
import {
  ExpenseAnalyticsFilterBar,
  type ExpenseAnalyticsDateRange,
  ExpenseWaterfallChart,
  RunningMonthlySpendChart,
  ExpenseCategoryOverTimeChart,
  ExpenseTopCategoriesChart,
  TopVehiclesByExpenseChart,
  VehicleExpenseBreakdownChart,
  VehicleAverageCostChart,
  ExpenseOutliersWidget,
  TopExpenseTransactionsChart,
  ExpenseAmountDistributionChart,
  ExpenseParetoChart,
  ExpenseCalendarHeatmapChart,
  ExpenseHeatmapChart,
  JobTripExpenseChart,
} from '../components';
import {
  useExpenseCategorySummary,
  useTopVehiclesByExpense,
  useTopExpenseTransactions,
  useExpenseMonthlyTrends,
} from '../hooks/useExpenses';
import { formatDate } from '@/shared/utils/date.utils';
import { EXPENSE_ROUTES } from '../routes';

export function ExpenseAnalyticsPage() {
  const router = useRouter();
  const [dateRange, setDateRange] = useState<ExpenseAnalyticsDateRange>({});

  // Reuses the same cached queries the charts below already populate --
  // this does not add extra network calls.
  const { data: categorySummary } = useExpenseCategorySummary(dateRange);
  const { data: topVehicles } = useTopVehiclesByExpense(dateRange, 10);
  const { data: topTransactions } = useTopExpenseTransactions(dateRange, 10);
  const { data: monthlyTrends } = useExpenseMonthlyTrends(12);

  function handleExportReport() {
    const wb: Array<{ sheet: string; headers: string[]; rows: Array<Record<string, unknown>> }> = [];

    wb.push({
      sheet: 'Monthly Trend',
      headers: ['Month', 'Total'],
      rows: (monthlyTrends ?? []).map((m) => ({ Month: m.month, Total: m.total })),
    });
    wb.push({
      sheet: 'Category Summary',
      headers: ['Category', 'Total', 'Count', 'Average', 'Min', 'Max', 'Top Vehicle', '% of Total', 'Latest Date'],
      rows: (categorySummary ?? []).map((c) => ({
        Category: c.category,
        Total: c.total,
        Count: c.count,
        Average: c.average,
        Min: c.min,
        Max: c.max,
        'Top Vehicle': c.topVehicle ?? '',
        '% of Total': c.percentageOfTotal,
        'Latest Date': c.latestDate ? formatDate(c.latestDate, 'yyyy-MM-dd') : '',
      })),
    });
    wb.push({
      sheet: 'Top Vehicles',
      headers: ['Vehicle', 'Total', 'Count', 'Average', 'Top Category'],
      rows: (topVehicles ?? []).map((v) => ({
        Vehicle: v.license_plate,
        Total: v.totalAmount,
        Count: v.expenseCount,
        Average: v.average,
        'Top Category': v.topCategory,
      })),
    });
    wb.push({
      sheet: 'Top Transactions',
      headers: ['Date', 'Vehicle', 'Category', 'Amount', 'Description'],
      rows: (topTransactions ?? []).map((t) => ({
        Date: formatDate(t.date, 'yyyy-MM-dd'),
        Vehicle: t.license_plate,
        Category: t.category,
        Amount: t.amount,
        Description: t.description ?? '',
      })),
    });

    // downloadXlsxTemplate writes one sheet per call; build a single
    // workbook with multiple sheets by writing the first one via the
    // shared helper's underlying SheetJS calls would require exposing
    // book_append_sheet -- simplest reuse here is one file per sheet
    // group is unnecessary; call per-sheet exports instead so nothing
    // new needs to be added to excel-parser.utils.ts.
    wb.forEach((s) => downloadXlsxTemplate(s.headers, s.rows, `expense-report-${s.sheet.toLowerCase().replace(/\s+/g, '-')}.xlsx`, s.sheet));
  }

  return (
    <div className="space-y-6 print:space-y-4">
      <PageHeader
        title="Expense analytics"
        description="Executive expense insights -- cost composition, drivers, and anomalies."
        breadcrumbs={[{ label: 'Expenses', href: EXPENSE_ROUTES.dashboard }, { label: 'Analytics' }]}
        actions={
          <div className="flex items-center gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={handleExportReport}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> Export report (Excel)
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" /> Print / PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push(EXPENSE_ROUTES.dashboard)}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back to expenses
            </Button>
          </div>
        }
      />

      <div className="print:hidden">
        <ExpenseAnalyticsFilterBar value={dateRange} onChange={setDateRange} />
      </div>

      {/* Executive summary: how total spend is composed, and its trajectory */}
      <ExpenseWaterfallChart dateRange={dateRange} />
      <RunningMonthlySpendChart />

      {/* Category and vehicle drivers */}
      <ExpenseCategoryOverTimeChart dateRange={dateRange} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ExpenseTopCategoriesChart dateRange={dateRange} />
        <TopVehiclesByExpenseChart dateRange={dateRange} />
      </div>
      <VehicleExpenseBreakdownChart dateRange={dateRange} />
      <VehicleAverageCostChart dateRange={dateRange} />

      {/* Needs-attention: outliers and the biggest single transactions */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ExpenseOutliersWidget dateRange={dateRange} />
        <TopExpenseTransactionsChart dateRange={dateRange} />
      </div>

      {/* Patterns: distribution, concentration, timing */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ExpenseAmountDistributionChart dateRange={dateRange} />
        <ExpenseParetoChart dateRange={dateRange} />
      </div>
      <ExpenseCalendarHeatmapChart dateRange={dateRange} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ExpenseHeatmapChart dateRange={dateRange} />
        <JobTripExpenseChart dateRange={dateRange} />
      </div>
    </div>
  );
}