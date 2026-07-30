// frontend/modules/vehicles/components/analytics/VehicleExpenseAnalyticsPanel.tsx
//
// Vehicle-Level Analytics: the "Expenses" branch of a vehicle's Analytics
// tab. Composes the SAME chart components rendered on the fleet-wide
// ExpenseAnalyticsPage -- the only difference is `licensePlate` threaded
// into every hook call, narrowing each chart's aggregation to this one
// vehicle via AnalyticsScope server-side. Charts that only make sense at
// fleet scope (top vehicles ranking, vehicle breakdown, average cost per
// vehicle) are intentionally omitted -- they remain fleet-only on
// ExpenseAnalyticsPage, mirroring the Fuel panel's precedent.

'use client';

import { useState } from 'react';
import { ExpenseStatsCards } from '@/frontend/modules/expenses/components/ExpenseStatsCards';
import { ExpenseAnalyticsFilterBar, type ExpenseAnalyticsDateRange } from '@/frontend/modules/expenses/components/ExpenseAnalyticsFilterBar';
import { ExpenseCategoryChart } from '@/frontend/modules/expenses/components/ExpenseCategoryChart';
import { ExpenseWaterfallChart } from '@/frontend/modules/expenses/components/ExpenseWaterfallChart';
import { ExpenseParetoChart } from '@/frontend/modules/expenses/components/ExpenseParetoChart';
import { ExpenseCategoryOverTimeChart } from '@/frontend/modules/expenses/components/ExpenseCategoryOverTimeChart';
import { ExpenseTopCategoriesChart } from '@/frontend/modules/expenses/components/ExpenseTopCategoriesChart';
import { ExpenseAmountDistributionChart } from '@/frontend/modules/expenses/components/ExpenseAmountDistributionChart';
import { ExpenseCalendarHeatmapChart } from '@/frontend/modules/expenses/components/ExpenseCalendarHeatmapChart';
import { ExpenseHeatmapChart } from '@/frontend/modules/expenses/components/ExpenseHeatmapChart';
import { JobTripExpenseChart } from '@/frontend/modules/expenses/components/JobTripExpenseChart';
import { ExpenseOutliersWidget } from '@/frontend/modules/expenses/components/ExpenseOutliersWidget';
import { TopExpenseTransactionsChart } from '@/frontend/modules/expenses/components/TopExpenseTransactionsChart';

interface VehicleExpenseAnalyticsPanelProps {
  licensePlate: string;
}

export function VehicleExpenseAnalyticsPanel({ licensePlate }: VehicleExpenseAnalyticsPanelProps) {
  const [dateRange, setDateRange] = useState<ExpenseAnalyticsDateRange>({});

  return (
    <div className="space-y-6">
      <ExpenseAnalyticsFilterBar value={dateRange} onChange={setDateRange} />

      <ExpenseStatsCards licensePlate={licensePlate} />

      <ExpenseWaterfallChart dateRange={dateRange} licensePlate={licensePlate} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ExpenseCategoryChart licensePlate={licensePlate} />
        <ExpenseTopCategoriesChart dateRange={dateRange} licensePlate={licensePlate} />
      </div>

      <ExpenseCategoryOverTimeChart dateRange={dateRange} licensePlate={licensePlate} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ExpenseOutliersWidget dateRange={dateRange} licensePlate={licensePlate} />
        <TopExpenseTransactionsChart dateRange={dateRange} licensePlate={licensePlate} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ExpenseAmountDistributionChart dateRange={dateRange} licensePlate={licensePlate} />
        <ExpenseParetoChart dateRange={dateRange} licensePlate={licensePlate} />
      </div>

      <ExpenseCalendarHeatmapChart dateRange={dateRange} licensePlate={licensePlate} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ExpenseHeatmapChart dateRange={dateRange} licensePlate={licensePlate} />
        <JobTripExpenseChart dateRange={dateRange} licensePlate={licensePlate} />
      </div>
    </div>
  );
}