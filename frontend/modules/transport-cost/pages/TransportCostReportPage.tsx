// frontend/modules/transport-cost/pages/TransportCostReportPage.tsx
//
// Phase O4 (minimal slice). The one screen the client asked to be able
// to walk Olivine through directly: Business Stream -> Vehicle/
// Transporter, for a switchable month, sourced ONLY from the
// Allocation Ledger postings Phase O3 creates -- never from raw
// tbltransportcostsourcerecords rows (see the backend report service's
// header for why that distinction is load-bearing here).
//
// Defaults to January 2026 per the client's own instruction (the month
// with the lowest pending-Amount rate in the source data). If no
// postings exist yet for January, the month picker still lists every
// OTHER month that has postings, and the empty state below says so
// plainly rather than silently showing a different month's numbers
// under the January label.
//
// Two things this screen must never do, because the backend it reads
// from refuses to do them: sum two different reportingCurrency
// figures into one total (mixedReportingCurrencies below), and present
// a period total as final while some of that period's rows are still
// pending an Amount (the banner below).

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Download } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Button } from '@/frontend/shared/ui/primitives/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/shared/ui/data-display/table';
import { formatDate } from '@/shared/utils/date.utils';
import { formatMoney } from '@/frontend/modules/finance/utils/money.utils';
import { useTransportCostAvailableMonths, useTransportCostReport } from '../hooks/useTransportCost';
import { transportCostApi } from '../services/transport-cost.api';
import { VehicleDrillDownDialog } from '../components/VehicleDrillDownDialog';

/** First day of `month`, 00:00, and the last instant of that same month -- the ledger's own fully-contained period semantics (see AllocationLedgerRepository's header). */
function monthBounds(monthStart: Date): { periodStart: Date; periodEnd: Date } {
  const y = monthStart.getUTCFullYear();
  const m = monthStart.getUTCMonth();
  return {
    periodStart: new Date(Date.UTC(y, m, 1, 0, 0, 0, 0)),
    periodEnd: new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999)),
  };
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// January 2026: the month with the lowest pending-Amount rate in the
// source data at the time of this delivery -- see the delivery README.
const DEFAULT_MONTH = new Date(Date.UTC(2026, 0, 1));

export function TransportCostReportPage() {
  const [selectedMonth, setSelectedMonth] = useState<Date>(DEFAULT_MONTH);
  const [drillDownVehicleId, setDrillDownVehicleId] = useState<string | null>(null);
  const [isExportingExceptions, setIsExportingExceptions] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const { periodStart, periodEnd } = useMemo(() => monthBounds(selectedMonth), [selectedMonth]);

  // Item 6: "so the four year-typo rows and the rejected rows are
  // findable without reading the README." A plain download rather than
  // an in-page table -- this report is meant to be handed to Olivine's
  // finance team directly, not just looked at once here.
  const handleExportExceptions = async () => {
    setExportError(null);
    setIsExportingExceptions(true);
    try {
      await transportCostApi.downloadDataQualityExceptionsCsv(periodStart, periodEnd);
    } catch {
      setExportError("Couldn't export the data-quality exceptions for this period.");
    } finally {
      setIsExportingExceptions(false);
    }
  };

  const { data: availableMonths } = useTransportCostAvailableMonths();
  const { data: report, isLoading, isError } = useTransportCostReport(periodStart, periodEnd);

  // The default month is always offered even if nothing has posted to
  // it yet, so the picker never silently drops the client's own
  // requested default off the list.
  const monthOptions = useMemo(() => {
    const seen = new Map<string, Date>();
    seen.set(monthKey(DEFAULT_MONTH), DEFAULT_MONTH);
    for (const m of availableMonths ?? []) {
      const parsed = new Date(m);
      seen.set(monthKey(parsed), parsed);
    }
    return Array.from(seen.values()).sort((a, b) => b.getTime() - a.getTime());
  }, [availableMonths]);

  const sortedByVehicle = useMemo(
    () => (report ? [...report.byVehicle].sort((a, b) => b.netReportingAmount - a.netReportingAmount) : []),
    [report]
  );

  // Item 5: a single "Unattributed" bucket is not a business-stream
  // breakdown -- it is every vehicle in the period, restated as a
  // one-tile summary that duplicates the vehicle table below without
  // adding anything. Shown only once more than one stream is present,
  // or the one stream present is a real one a reviewer actually set.
  const showStreamCards =
    !!report && !(report.byBusinessStream.length === 1 && report.byBusinessStream[0].businessStream === 'unattributed');

  // OLIVINE LIVE OPERATING MODEL, item 2/3/4/10/11: same "don't show a
  // single Unattributed tile as if it were a real breakdown" rule as
  // showStreamCards above, applied to the cost-facing company dimension.
  const showCompanyCards =
    !!report && !(report.byCompany.length === 1 && report.byCompany[0].costFacingCompany === 'unattributed');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Transport cost report"
        description="Business Stream → Vehicle/Transporter, sourced from posted Allocation Ledger entries only. Click a vehicle to see its individual postings."
        breadcrumbs={[{ label: 'Transport cost' }, { label: 'Report' }]}
        actions={
          <div className="flex items-end gap-4">
            <div>
              <label htmlFor="tc-report-month" className="block mb-1 text-sm font-medium">
                Month
              </label>
              <select
                id="tc-report-month"
                className="input-base"
                value={monthKey(selectedMonth)}
                onChange={(event) => {
                  const match = monthOptions.find((m) => monthKey(m) === event.target.value);
                  if (match) setSelectedMonth(match);
                }}
              >
                {monthOptions.map((m) => (
                  <option key={monthKey(m)} value={monthKey(m)}>
                    {formatDate(m, 'MMMM yyyy')}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mb-0.5"
              disabled={isExportingExceptions}
              onClick={handleExportExceptions}
            >
              <Download className="h-3.5 w-3.5" />
              {isExportingExceptions ? 'Exporting…' : 'Export exceptions'}
            </Button>

            <Link href="/transport-cost/import" className="pb-2 text-body-sm text-primary hover:underline">
              Import data &rarr;
            </Link>
          </div>
        }
      />

      {exportError && <p className="text-sm text-destructive">{exportError}</p>}

      {isLoading && <p className="py-8 text-sm text-center text-muted-foreground">Loading&hellip;</p>}

      {isError && (
        <p className="py-8 text-sm text-center text-destructive">
          Couldn&apos;t load the transport cost report. You may not have transport-cost view access.
        </p>
      )}

      {report && !isLoading && !isError && (
        <>
          {report.pending.hasPendingAmounts && (
            <div className="flex items-start gap-2 p-4 border rounded-lg border-warning/40 bg-warning/5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <div>
                <p className="font-medium text-body-sm text-foreground">
                  {report.pending.pendingSourceRecordCount} row
                  {report.pending.pendingSourceRecordCount === 1 ? '' : 's'} in {formatDate(periodStart, 'MMMM yyyy')}{' '}
                  {report.pending.pendingSourceRecordCount === 1 ? 'has' : 'have'} no Amount yet
                </p>
                <p className="text-caption text-muted-foreground">
                  These rows imported successfully but their Amount cell was blank in the source file, so nothing
                  was posted for them. The totals below are real, but not the final total for this month once those
                  rows are filled in.
                </p>
              </div>
            </div>
          )}

          {report.mixedReportingCurrencies && (
            <div className="flex items-start gap-2 p-4 border rounded-lg border-warning/40 bg-warning/5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <div>
                <p className="font-medium text-body-sm text-foreground">Cannot be totalled across currencies</p>
                <p className="text-caption text-muted-foreground">
                  This period contains postings in {report.mixedReportingCurrencies.join(' and ')}. Each figure below
                  is a per-currency subtotal, never summed across currencies.
                </p>
              </div>
            </div>
          )}

          {report.byVehicle.length === 0 ? (
            <div className="p-8 text-center border rounded-lg surface-card">
              <p className="font-medium text-body-sm text-foreground">
                No postings for {formatDate(periodStart, 'MMMM yyyy')} yet
              </p>
              <p className="mt-1 text-caption text-muted-foreground">
                Import and post this month&apos;s transport cost data, or pick a different month above.
              </p>
            </div>
          ) : (
            <>
              {showCompanyCards && (
                <section>
                  <h2 className="mb-2 text-sm font-medium text-muted-foreground">By cost-facing company</h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {report.byCompany.map((company) => (
                      <div
                        key={`${company.costFacingCompany}-${company.reportingCurrency}`}
                        className="p-4 border rounded-lg surface-card"
                      >
                        <p className="text-caption text-muted-foreground">{company.label}</p>
                        <p className="text-h3 font-semibold text-foreground">
                          {formatMoney(company.netReportingAmount, company.reportingCurrency)}
                        </p>
                        <p className="mt-1 text-caption text-muted-foreground">
                          {company.postingCount} posting{company.postingCount === 1 ? '' : 's'}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {showStreamCards && (
                <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {report.byBusinessStream.map((stream) => (
                    <div key={`${stream.businessStream}-${stream.reportingCurrency}`} className="p-4 border rounded-lg surface-card">
                      <p className="text-caption text-muted-foreground">
                        {stream.businessStream === 'unattributed' ? 'Unattributed' : stream.businessStream}
                      </p>
                      <p className="text-h3 font-semibold text-foreground">
                        {formatMoney(stream.netReportingAmount, stream.reportingCurrency)}
                      </p>
                      <p className="mt-1 text-caption text-muted-foreground">
                        {stream.vehicleCount} vehicle{stream.vehicleCount === 1 ? '' : 's'} &middot; {stream.postingCount}{' '}
                        posting{stream.postingCount === 1 ? '' : 's'}
                      </p>
                    </div>
                  ))}
                </section>
              )}

              <section className="p-4 border rounded-lg sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <h2 className="text-sm font-medium">
                    {formatDate(periodStart)} &ndash; {formatDate(periodEnd)}
                  </h2>
                  <Badge variant="outline">
                    {report.byVehicle.length} vehicle{report.byVehicle.length === 1 ? '' : 's'}
                  </Badge>
                </div>

                <div className="overflow-x-auto border rounded-md border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Registration</TableHead>
                        <TableHead>Transporter</TableHead>
                        <TableHead>Business stream</TableHead>
                        <TableHead className="text-right">Postings</TableHead>
                        <TableHead className="text-right">Net amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedByVehicle.map((v) => (
                        <TableRow
                          key={v.contractedVehicleId}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setDrillDownVehicleId(v.contractedVehicleId)}
                        >
                          <TableCell className="font-medium">{v.registration}</TableCell>
                          <TableCell>{v.transporterName}</TableCell>
                          <TableCell>
                            <Badge variant={v.businessStream === 'unattributed' ? 'outline' : 'default'}>
                              {v.businessStream}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{v.postingCount}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatMoney(v.netReportingAmount, v.reportingCurrency)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
            </>
          )}
        </>
      )}

      <VehicleDrillDownDialog
        contractedVehicleId={drillDownVehicleId}
        periodStart={periodStart}
        periodEnd={periodEnd}
        onOpenChange={(open) => {
          if (!open) setDrillDownVehicleId(null);
        }}
      />
    </div>
  );
}
