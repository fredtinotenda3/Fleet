// frontend/modules/fuel/components/FuelLogDrawer.tsx
//
// Drill-down drawer for fuel charts: clicking a bar/slice/point opens this
// with a filter (e.g. { license_plate, startDate, endDate }) and shows the
// underlying fuel log rows. Mirrors expenses' ExpenseTransactionDrawer so
// the interaction pattern is identical across modules. The list query goes
// through fuelApi.list -> /api/fuellogs, which is already tenant-scoped
// server-side (withAuth + org-unit repository scoping), so nothing here
// needs to re-derive or pass a tenant/org-unit id -- the same scoping that
// limits the chart limits this drawer and its export.

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
import { fuelApi, type FuelListParams } from '../services/fuel.api';
import { buildCsvText, downloadCsvText } from '@/shared/utils/csv-parser.utils';
import { downloadXlsxTemplate } from '@/shared/utils/excel-parser.utils';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { formatDate } from '@/shared/utils/date.utils';
import { FUEL_ROUTES } from '../routes';
import type { FuelLog } from '../types';

export interface FuelDrawerFilter extends Partial<FuelListParams> {
  /** Shown as the drawer title, e.g. "Shell Borrowdale -- Jul 2026" or "AFK4234". */
  label: string;
}

interface FuelLogDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filter: FuelDrawerFilter | null;
}

const EXPORT_LIMIT = 5000;

export function FuelLogDrawer({ open, onOpenChange, filter }: FuelLogDrawerProps) {
  const router = useRouter();
  const printRef = useRef<HTMLDivElement>(null);

  // Lazy: only fires while the drawer is open and a filter is set, so
  // clicking a chart element never issues a request until the drawer opens.
  const { data, isLoading, error } = useQuery({
    queryKey: ['fuel', 'drawer', filter],
    queryFn: () => fuelApi.list({ ...filter, page: 1, limit: EXPORT_LIMIT }),
    enabled: open && Boolean(filter),
    staleTime: 30_000,
  });

  const rows = data?.data ?? [];
  const totals = useMemo(
    () => ({
      cost: rows.reduce((sum, r) => sum + r.cost, 0),
      volume: rows.reduce((sum, r) => sum + r.fuel_volume, 0),
    }),
    [rows]
  );

  function stationLabel(r: FuelLog): string {
    return r.fuel_station?.name || r.station_name || 'Unknown station';
  }

  function driverLabel(r: FuelLog): string {
    return r.driver?.name || '\u2014';
  }

  function handleExportCsv() {
    const csv = buildCsvText(
      ['date', 'license_plate', 'driver', 'station', 'volume', 'cost', 'fuel_type', 'payment_method'],
      rows.map((r) => ({
        date: formatDate(r.date, 'yyyy-MM-dd'),
        license_plate: r.license_plate,
        driver: driverLabel(r),
        station: stationLabel(r),
        volume: r.fuel_volume,
        cost: r.cost,
        fuel_type: r.fuel_type ?? '',
        payment_method: r.payment_method ?? '',
      }))
    );
    downloadCsvText(csv, `${(filter?.label ?? 'fuel-logs').toLowerCase().replace(/\s+/g, '-')}.csv`);
  }

  function handleExportExcel() {
    downloadXlsxTemplate(
      ['Date', 'Vehicle', 'Driver', 'Station', 'Volume (L)', 'Cost', 'Fuel Type', 'Payment Method'],
      rows.map((r) => ({
        Date: formatDate(r.date, 'yyyy-MM-dd'),
        Vehicle: r.license_plate,
        Driver: driverLabel(r),
        Station: stationLabel(r),
        'Volume (L)': r.fuel_volume,
        Cost: r.cost,
        'Fuel Type': r.fuel_type ?? '',
        'Payment Method': r.payment_method ?? '',
      })),
      `${(filter?.label ?? 'fuel-logs').toLowerCase().replace(/\s+/g, '-')}.xlsx`,
      'Fuel Logs'
    );
  }

  function handlePrintPdf() {
    window.print();
  }

  function handleOpenFullList() {
    const params = new URLSearchParams();
    if (filter?.license_plate) params.set('license_plate', filter.license_plate);
    if (filter?.driver_id) params.set('driver_id', filter.driver_id);
    if (filter?.fuel_station_id) params.set('fuel_station_id', filter.fuel_station_id);
    if (filter?.payment_method) params.set('payment_method', filter.payment_method);
    if (filter?.startDate) params.set('start', new Date(filter.startDate).toISOString());
    if (filter?.endDate) params.set('end', new Date(filter.endDate).toISOString());
    router.push(`${FUEL_ROUTES.list}?${params.toString()}`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl print:max-h-none print:overflow-visible">
        <DialogHeader className="print:hidden">
          <DialogTitle>{filter?.label ?? 'Fuel logs'}</DialogTitle>
          <DialogDescription>
            {rows.length > 0
              ? `${rows.length} log${rows.length === 1 ? '' : 's'} \u00B7 ${formatCurrency(totals.cost)} \u00B7 ${totals.volume.toFixed(1)} L`
              : 'Fuel log details'}
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
            <p className="text-sm text-destructive">Unable to load fuel logs.</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No fuel logs match this selection.</p>
          ) : (
            <div className="overflow-x-auto border rounded-md border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Station</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead>Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r._id}>
                      <TableCell>{formatDate(r.date)}</TableCell>
                      <TableCell className="font-medium">{r.license_plate}</TableCell>
                      <TableCell>{driverLabel(r)}</TableCell>
                      <TableCell>{stationLabel(r)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.fuel_volume.toFixed(1)} L</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(r.cost)}</TableCell>
                      <TableCell>
                        {r.fuel_type ? <Badge variant="outline">{r.fuel_type}</Badge> : '\u2014'}
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