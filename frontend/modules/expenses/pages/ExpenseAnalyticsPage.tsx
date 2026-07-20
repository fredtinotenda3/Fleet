// frontend/modules/expenses/pages/ExpenseAnalyticsPage.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import {
  ExpenseAnalyticsFilterBar,
  type ExpenseAnalyticsDateRange,
  ExpenseCategoryOverTimeChart,
  ExpenseTopCategoriesChart,
  TopVehiclesByExpenseChart,
  VehicleExpenseBreakdownChart,
  ExpenseAmountDistributionChart,
  ExpenseParetoChart,
  ExpenseHeatmapChart,
  JobTripExpenseChart,
} from '../components';
import { EXPENSE_ROUTES } from '../routes';

export function ExpenseAnalyticsPage() {
  const router = useRouter();
  const [dateRange, setDateRange] = useState<ExpenseAnalyticsDateRange>({});

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expense analytics"
        description="Enterprise expense insights -- cost drivers, category trends, and vehicle/job breakdowns."
        breadcrumbs={[{ label: 'Expenses', href: EXPENSE_ROUTES.dashboard }, { label: 'Analytics' }]}
        actions={
          <Button variant="outline" size="sm" onClick={() => router.push(EXPENSE_ROUTES.dashboard)}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to expenses
          </Button>
        }
      />

      <ExpenseAnalyticsFilterBar value={dateRange} onChange={setDateRange} />

      <ExpenseCategoryOverTimeChart dateRange={dateRange} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ExpenseTopCategoriesChart dateRange={dateRange} />
        <TopVehiclesByExpenseChart dateRange={dateRange} />
      </div>

      <VehicleExpenseBreakdownChart dateRange={dateRange} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ExpenseAmountDistributionChart dateRange={dateRange} />
        <ExpenseParetoChart dateRange={dateRange} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ExpenseHeatmapChart dateRange={dateRange} />
        <JobTripExpenseChart dateRange={dateRange} />
      </div>
    </div>
  );
}