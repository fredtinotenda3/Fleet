// frontend/modules/expenses/components/ExpenseTransactionDrawer.tsx

'use client';

import { useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Printer, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/shared/ui/feedback/dialog';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/shared/ui/data-display/table';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/frontend/shared/ui/navigation/NestedMenu';
import { expensesApi, type ExpenseListParams } from '../services/expenses.api';
import { buildCsvText, downloadCsvText } from '@/shared/utils/csv-parser.utils';
import { downloadXlsxTemplate } from '@/shared/utils/excel-parser.utils';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { formatDate } from '@/shared/utils/date.utils';
import { EXPENSE_ROUTES } from '../routes';
import type { Expense } from '../types';

export interface ExpenseDrawerFilter extends Partial<ExpenseListParams> {
  /** Shown as the drawer title, e.g. "Maintenance -- Jul 2026" or "AFK4234". */
  label: string;
}

interface ExpenseTransactionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filter: ExpenseDrawerFilter | null;
}

const EXPORT_LIMIT = 5000;

export function ExpenseTransactionDrawer({ open, onOpenChange, filter }: ExpenseTransactionDrawerProps) {
  const router = useRouter();
  const printRef = useRef<HTMLDivElement>(null);

  // Lazy: this query only runs while the drawer is open AND a filter is set.
  // Clicking a chart element never fires a request until the drawer opens.
  const { data, isLoading, error } = useQuery({
    queryKey: ['expenses', 'drawer', filter],
    queryFn: () => expensesApi.list({ ...filter, page: 1, limit: EXPORT_LIMIT }),
    enabled: open && Boolean(filter),
    staleTime: 30_000,
  });

  const rows = data?.data ?? [];
  const total = useMemo(() => rows.reduce((sum, r) => sum + r.amount, 0), [rows]);

  function categoryLabel(expense: Expense): string {
    return expense.expense_type?.name || 'Uncategorized';
  }

  function handleExportCsv() {
    const csv = buildCsvText(
      ['date', 'license_plate', 'category', 'amount', 'jobTrip', 'description'],
      rows.map((r) => ({
        date: formatDate(r.date, 'yyyy-MM-dd'),
        license_plate: r.license_plate,
        category: categoryLabel(r),
        amount: r.amount,
        jobTrip: r.jobTrip ?? '',
        description: r.description ?? '',
      }))
    );
    downloadCsvText(csv, `${(filter?.label ?? 'expenses').toLowerCase().replace(/\s+/g, '-')}.csv`);
  }

  function handleExportExcel() {
    downloadXlsxTemplate(
      ['Date', 'Vehicle', 'Category', 'Amount', 'Job / Trip', 'Description'],
      rows.map((r) => ({
        Date: formatDate(r.date, 'yyyy-MM-dd'),
        Vehicle: r.license_plate,
        Category: categoryLabel(r),
        Amount: r.amount,
        'Job / Trip': r.jobTrip ?? '',
        Description: r.description ?? '',
      })),
      `${(filter?.label ?? 'expenses').toLowerCase().replace(/\s+/g, '-')}.xlsx`,
      'Transactions'
    );
  }

  function handlePrintPdf() {
    // Browser print-to-PDF: no additional dependency, works in every
    // modern browser via the native "Save as PDF" print destination.
    window.print();
  }

  function handleOpenFullList() {
    const params = new URLSearchParams();
    if (filter?.license_plate) params.set('license_plate', filter.license_plate);
    if (filter?.type) params.set('type', filter.type);
    if ((filter as any)?.jobTrip) params.set('jobTrip', (filter as any).jobTrip);
    if (filter?.startDate) params.set('start', new Date(filter.startDate).toISOString());
    if (filter?.endDate) params.set('end', new Date(filter.endDate).toISOString());
    router.push(`${EXPENSE_ROUTES.list}?${params.toString()}`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl print:max-h-none print:overflow-visible">
        <DialogHeader className="print:hidden">
          <DialogTitle>{filter?.label ?? 'Transactions'}</DialogTitle>
          <DialogDescription>
            {rows.length > 0
              ? `${rows.length} transaction${rows.length === 1 ? '' : 's'} \u00B7 ${formatCurrency(total)} total`
              : 'Transaction details'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-end gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={handleOpenFullList}>
            <ExternalLink className="h-3.5 w-3.5" /> Open full list
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={rows.length === 0}>
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={handleExportCsv}>Export as CSV</DropdownMenuItem>
              <DropdownMenuItem onSelect={handleExportExcel}>
                <FileSpreadsheet className="mr-2 h-3.5 w-3.5" /> Export as Excel
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handlePrintPdf}>
                <Printer className="mr-2 h-3.5 w-3.5" /> Print / Save as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div ref={printRef}>
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-10 rounded skeleton" />)}
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">Unable to load transactions.</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions match this selection.</p>
          ) : (
            <div className="overflow-x-auto border rounded-md border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Job / Trip</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r._id}>
                      <TableCell>{formatDate(r.date)}</TableCell>
                      <TableCell className="font-medium">{r.license_plate}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{categoryLabel(r)}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(r.amount)}</TableCell>
                      <TableCell>{r.jobTrip || '\u2014'}</TableCell>
                      <TableCell className="max-w-55 truncate" title={r.description}>
                        {r.description || '\u2014'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}