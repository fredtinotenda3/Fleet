// frontend/modules/expenses/components/ExpenseOutliersWidget.tsx

'use client';

import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { useExpenseOutliers } from '../hooks/useExpenses';
import { useExpenseDrawer } from '../hooks/useExpenseDrawer';
import { ExpenseTransactionDrawer } from './ExpenseTransactionDrawer';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { formatDate } from '@/shared/utils/date.utils';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';
import type { ExpenseOutlierRow } from '@/shared/types/expense.types';

interface ExpenseOutliersWidgetProps {
  dateRange: ExpenseAnalyticsDateRange;
}

export function ExpenseOutliersWidget({ dateRange }: ExpenseOutliersWidgetProps) {
  const { data: outliers, isLoading, error } = useExpenseOutliers(dateRange, 2.5);
  const { open, setOpen, filter, openDrawer } = useExpenseDrawer();

  function handleClick(row: ExpenseOutlierRow) {
    const day = new Date(row.date);
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
    openDrawer({ label: `${row.license_plate} \u2014 ${formatDate(row.date)}`, license_plate: row.license_plate, startDate: start, endDate: end });
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Expense outliers</CardTitle></CardHeader>
        <CardContent><div className="h-24 rounded-lg skeleton" /></CardContent>
      </Card>
    );
  }

  if (error || !outliers || outliers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Expense outliers</CardTitle>
          <CardDescription>No unusual expenses detected in this range.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-warning/40 bg-warning-bg">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              <CardTitle>Expense outliers</CardTitle>
            </div>
            <Badge variant="outline" className="border-warning text-warning">{outliers.length} flagged</Badge>
          </div>
          <CardDescription>Expenses more than 2.5 standard deviations from their category&rsquo;s typical amount</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {outliers.slice(0, 6).map((row) => (
            <button
              key={row._id}
              type="button"
              onClick={() => handleClick(row)}
              className="flex items-center justify-between w-full p-2 text-left transition-colors rounded-lg surface-card hover:bg-muted/40"
            >
              <div>
                <p className="font-medium">{row.license_plate} &middot; {row.category}</p>
                <p className="text-sm text-muted-foreground">
                  Category typical: {formatCurrency(row.categoryMean)} &middot; {formatDate(row.date)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium text-warning">{formatCurrency(row.amount)}</p>
                <p className="text-sm text-muted-foreground">{row.zScore > 0 ? '+' : ''}{row.zScore}\u03C3</p>
              </div>
            </button>
          ))}
          {outliers.length > 6 && (
            <p className="text-sm text-center text-muted-foreground">+{outliers.length - 6} more flagged</p>
          )}
        </CardContent>
      </Card>
      <ExpenseTransactionDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}