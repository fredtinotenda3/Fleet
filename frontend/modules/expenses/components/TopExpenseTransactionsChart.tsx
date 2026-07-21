// frontend/modules/expenses/components/TopExpenseTransactionsChart.tsx

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/shared/ui/data-display/table';
import { useTopExpenseTransactions } from '../hooks/useExpenses';
import { useExpenseDrawer } from '../hooks/useExpenseDrawer';
import { ExpenseTransactionDrawer } from './ExpenseTransactionDrawer';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { formatDate } from '@/shared/utils/date.utils';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';
import type { TopExpenseTransactionRow } from '@/shared/types/expense.types';

interface TopExpenseTransactionsChartProps {
  dateRange: ExpenseAnalyticsDateRange;
}

export function TopExpenseTransactionsChart({ dateRange }: TopExpenseTransactionsChartProps) {
  const { data, isLoading, error } = useTopExpenseTransactions(dateRange, 10);
  const { open, setOpen, filter, openDrawer } = useExpenseDrawer();

  function handleRowClick(row: TopExpenseTransactionRow) {
    const day = new Date(row.date);
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
    openDrawer({ label: `${row.license_plate} \u2014 ${formatDate(row.date)}`, license_plate: row.license_plate, startDate: start, endDate: end });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Top 10 highest expense transactions</CardTitle>
          <CardDescription>The single biggest individual expenses in this range</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="rounded-lg h-60 skeleton" />
          ) : error || !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses in this range.</p>
          ) : (
            <div className="overflow-x-auto border rounded-md border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((row) => (
                    <TableRow key={row._id} className="cursor-pointer hover:bg-muted/40" onClick={() => handleRowClick(row)}>
                      <TableCell>{formatDate(row.date)}</TableCell>
                      <TableCell className="font-medium">{row.license_plate}</TableCell>
                      <TableCell><Badge variant="outline">{row.category}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(row.amount)}</TableCell>
                      <TableCell className="max-w-55 truncate" title={row.description ?? undefined}>
                        {row.description || '\u2014'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <ExpenseTransactionDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}