// frontend/modules/trips/components/TripTransactionDrawer.tsx
//
// PHASE 2: drill-down drawer for every Trip Analytics chart, mirroring
// ExpenseTransactionDrawer.tsx's interaction model (dialog + table +
// export menu + "open full list") one-for-one, adapted to Trip fields.

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
import { tripsApi, type TripListParams } from '../services/trips.api';
import { buildCsvText, downloadCsvText } from '@/shared/utils/csv-parser.utils';
import { downloadXlsxTemplate } from '@/shared/utils/excel-parser.utils';
import { formatDistance } from '@/shared/utils/distance.utils';
import { formatDate } from '@/shared/utils/date.utils';
import { TRIP_ROUTES } from '../routes';
import type { Trip } from '../types';

export interface TripDrawerFilter extends Partial<TripListParams> {
  /** Shown as the drawer title, e.g. "AFK4234" or "Mon 9:00am -- Jul 2026". */
  label: string;
}

interface TripTransactionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filter: TripDrawerFilter | null;
}

const EXPORT_LIMIT = 5000;

export function TripTransactionDrawer({ open, onOpenChange, filter }: TripTransactionDrawerProps) {
  const router = useRouter();
  const printRef = useRef<HTMLDivElement>(null);

  // Lazy: this query only runs while the drawer is open AND a filter is
  // set, so clicking a chart element never fires a request until the
  // drawer actually opens.
  const { data, isLoading, error } = useQuery({
    queryKey: ['trips', 'drawer', filter],
    queryFn: () => tripsApi.list({ ...filter, page: 1, limit: EXPORT_LIMIT }),
    enabled: open && Boolean(filter),
    staleTime: 30_000,
  });

  const rows = data?.data ?? [];
  const totalDistance = useMemo(
    () => rows.reduce((sum, r) => sum + (r.distance_calculated || 0), 0),
    [rows]
  );

  function driverLabel(trip: Trip): string {
    return trip.driver_id ? trip.driver_id : 'Unassigned';
  }

  function fileBaseName(): string {
    return (filter?.label ?? 'trips').toLowerCase().replace(/\s+/g, '-');
  }

  function handleExportCsv() {
    const csv = buildCsvText(
      ['date', 'license_plate', 'status', 'driver', 'distance', 'duration_minutes', 'notes'],
      rows.map((r) => ({
        date: formatDate(r.date, 'yyyy-MM-dd'),
        license_plate: r.license_plate,
        status: r.status ?? '',
        driver: driverLabel(r),
        distance: r.distance_calculated,
        duration_minutes: r.duration_minutes ?? '',
        notes: r.notes ?? '',
      }))
    );
    downloadCsvText(csv, `${fileBaseName()}.csv`);
  }

  function handleExportExcel() {
    downloadXlsxTemplate(
      ['Date', 'Vehicle', 'Status', 'Driver', 'Distance', 'Duration (min)', 'Notes'],
      rows.map((r) => ({
        Date: formatDate(r.date, 'yyyy-MM-dd'),
        Vehicle: r.license_plate,
        Status: r.status ?? '',
        Driver: driverLabel(r),
        Distance: r.distance_calculated,
        'Duration (min)': r.duration_minutes ?? '',
        Notes: r.notes ?? '',
      })),
      `${fileBaseName()}.xlsx`,
      'Trips'
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
    if (filter?.driver_id) params.set('driver_id', filter.driver_id);
    if (filter?.status) params.set('status', filter.status);
    if (filter?.trip_type) params.set('trip_type', filter.trip_type);
    if (filter?.routeId) params.set('routeId', filter.routeId);
    if (filter?.startDate) params.set('start', new Date(filter.startDate).toISOString());
    if (filter?.endDate) params.set('end', new Date(filter.endDate).toISOString());
    router.push(`${TRIP_ROUTES.list}?${params.toString()}`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl print:max-h-none print:overflow-visible">
        <DialogHeader className="print:hidden">
          <DialogTitle>{filter?.label ?? 'Trips'}</DialogTitle>
          <DialogDescription>
            {rows.length > 0
              ? `${rows.length} trip${rows.length === 1 ? '' : 's'} \u00B7 ${formatDistance(totalDistance)} total`
              : 'Trip details'}
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
            <p className="text-sm text-destructive">Unable to load trips.</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No trips match this selection.</p>
          ) : (
            <div className="overflow-x-auto border rounded-md border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead className="text-right">Distance</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r._id}>
                      <TableCell>{formatDate(r.date)}</TableCell>
                      <TableCell className="font-medium">{r.license_plate}</TableCell>
                      <TableCell>
                        {r.status ? <Badge variant="outline">{r.status}</Badge> : '\u2014'}
                      </TableCell>
                      <TableCell>{driverLabel(r)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDistance(r.distance_calculated)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.duration_minutes ? `${r.duration_minutes.toFixed(0)} min` : '\u2014'}
                      </TableCell>
                      <TableCell className="max-w-55 truncate" title={r.notes}>
                        {r.notes || '\u2014'}
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