// frontend/modules/maintenance/components/MaintenanceRecordDrawer.tsx
//
// Chart drill-down drawer for the maintenance module, mirroring the
// existing ExpenseTransactionDrawer / FuelLogDrawer pattern: charts open
// this drawer with a tenancy-scoped filter, it lazily fetches the
// underlying maintenance records for that filter, and lets the user
// export or jump to the full filtered list.

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
import { maintenanceApi, type MaintenanceListParams } from '../services/maintenance.api';
import { MAINTENANCE_CATEGORY_LABELS, type MaintenanceCategory, type Reminder } from '../types';
import { buildCsvText, downloadCsvText } from '@/shared/utils/csv-parser.utils';
import { downloadXlsxTemplate } from '@/shared/utils/excel-parser.utils';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { formatDate } from '@/shared/utils/date.utils';
import { MAINTENANCE_ROUTES } from '../routes';

export interface MaintenanceDrawerFilter extends Partial<MaintenanceListParams> {
  /** Shown as the drawer title, e.g. "Overdue -- AFK4234" or "Brake Service". */
  label: string;
}

interface MaintenanceRecordDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filter: MaintenanceDrawerFilter | null;
}

const EXPORT_LIMIT = 5000;

export function MaintenanceRecordDrawer({ open, onOpenChange, filter }: MaintenanceRecordDrawerProps) {
  const router = useRouter();
  const printRef = useRef<HTMLDivElement>(null);

  // Lazy: this query only runs while the drawer is open AND a filter is set.
  // Clicking a chart element never fires a request until the drawer opens.
  const { data, isLoading, error } = useQuery({
    queryKey: ['maintenance', 'drawer', filter],
    queryFn: () => maintenanceApi.list({ ...filter, page: 1, limit: EXPORT_LIMIT }),
    enabled: open && Boolean(filter),
    staleTime: 30_000,
  });

  const rows = data?.data ?? [];
  const total = useMemo(
    () => rows.reduce((sum, r) => sum + (r.estimated_cost ?? 0), 0),
    [rows]
  );

  function categoryLabel(record: Reminder): string {
    return record.category
      ? MAINTENANCE_CATEGORY_LABELS[record.category as MaintenanceCategory] ?? record.category
      : 'Uncategorized';
  }

  function handleExportCsv() {
    const csv = buildCsvText(
      ['due_date', 'license_plate', 'title', 'category', 'status', 'priority', 'estimated_cost', 'assigned_to'],
      rows.map((r) => ({
        due_date: formatDate(r.due_date, 'yyyy-MM-dd'),
        license_plate: r.license_plate,
        title: r.title,
        category: categoryLabel(r),
        status: r.status,
        priority: r.priority ?? '',
        estimated_cost: r.estimated_cost ?? 0,
        assigned_to: r.assigned_to ?? '',
      }))
    );
    downloadCsvText(csv, `${(filter?.label ?? 'maintenance').toLowerCase().replace(/\s+/g, '-')}.csv`);
  }

  function handleExportExcel() {
    downloadXlsxTemplate(
      ['Due Date', 'Vehicle', 'Title', 'Category', 'Status', 'Priority', 'Estimated Cost', 'Assigned To'],
      rows.map((r) => ({
        'Due Date': formatDate(r.due_date, 'yyyy-MM-dd'),
        Vehicle: r.license_plate,
        Title: r.title,
        Category: categoryLabel(r),
        Status: r.status,
        Priority: r.priority ?? '',
        'Estimated Cost': r.estimated_cost ?? 0,
        'Assigned To': r.assigned_to ?? '',
      })),
      `${(filter?.label ?? 'maintenance').toLowerCase().replace(/\s+/g, '-')}.xlsx`,
      'Maintenance Records'
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
    if (filter?.status) params.set('status', String(filter.status));
    if (filter?.priority) params.set('priority', String(filter.priority));
    if (filter?.category) params.set('category', String(filter.category));
    if (filter?.assigned_to) params.set('assigned_to', filter.assigned_to);
    if (filter?.startDate) params.set('start', new Date(filter.startDate).toISOString());
    if (filter?.endDate) params.set('end', new Date(filter.endDate).toISOString());
    router.push(`${MAINTENANCE_ROUTES.list}?${params.toString()}`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl print:max-h-none print:overflow-visible">
        <DialogHeader className="print:hidden">
          <DialogTitle>{filter?.label ?? 'Maintenance records'}</DialogTitle>
          <DialogDescription>
            {rows.length > 0
              ? `${rows.length} record${rows.length === 1 ? '' : 's'} \u00B7 ${formatCurrency(total)} estimated total`
              : 'Maintenance record details'}
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
            <p className="text-sm text-destructive">Unable to load maintenance records.</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No maintenance records match this selection.</p>
          ) : (
            <div className="overflow-x-auto border rounded-md border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Est. Cost</TableHead>
                    <TableHead>Assigned To</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r._id}>
                      <TableCell>{formatDate(r.due_date)}</TableCell>
                      <TableCell className="font-medium">{r.license_plate}</TableCell>
                      <TableCell className="max-w-55 truncate" title={r.title}>{r.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{categoryLabel(r)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.status === 'overdue' ? 'destructive' : 'outline'}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.estimated_cost != null ? formatCurrency(r.estimated_cost) : '\u2014'}
                      </TableCell>
                      <TableCell>{r.assigned_to || '\u2014'}</TableCell>
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
