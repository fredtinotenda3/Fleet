// frontend/modules/transport-cost/pages/CommandCentrePage.tsx
//
// OLIVINE LIVE OPERATING MODEL, SLICE 4. The Transport Cost Command
// Centre -- one screen answering how much transport cost was incurred,
// during which period, by company/category/vehicle/transporter/
// destination/customer, how many operations/loads occurred, and where
// data is incomplete or unresolved. See
// TransportCostReportService.getCommandCentreSummary's own header for
// the full financial-source-of-truth / filter-semantics / multi-line-
// correctness design this page renders.
//
// ONE query (useCommandCentreSummary) backs every card, chart, table,
// and the trust panel below -- never one request per widget.

'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/frontend/shared/ui/data-display/table';
import { SearchSelect } from '@/frontend/shared/ui/forms/SearchSelect';
import { SearchCreateSelect } from '@/frontend/shared/ui/forms/SearchCreateSelect';
import { formatDate } from '@/shared/utils/date.utils';
import { formatMoney } from '@/frontend/modules/finance/utils/money.utils';
import { useCommandCentreSummary } from '../hooks/useTransportCost';
import { transportCostApi } from '../services/transport-cost.api';
import { DimensionDrillDownDialog } from '../components/DimensionDrillDownDialog';
import { DataQualityEvidenceDialog } from '../components/DataQualityEvidenceDialog';
import { COST_FACING_COMPANIES, TRANSPORT_COST_CATEGORY_OPTIONS } from '../types';
import type {
  CommandCentreFilters,
  CommandCentreGranularity,
  CommandCentreDimensionTotal,
  CommandCentreDrillDownDimension,
  DataQualityIssueKind,
} from '../types';

// ---------------------------------------------------------------------
// DATE RANGE PRESETS
// ---------------------------------------------------------------------
type DateRangePreset = 'today' | 'yesterday' | 'this-week' | 'this-month' | 'previous-month' | 'custom';

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? 6 : day - 1;
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() - diffToMonday));
}

function rangeForPreset(preset: DateRangePreset, custom: { start: Date; end: Date }): { periodStart: Date; periodEnd: Date } {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { periodStart: startOfDay(now), periodEnd: endOfDay(now) };
    case 'yesterday': {
      const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      return { periodStart: startOfDay(y), periodEnd: endOfDay(y) };
    }
    case 'this-week':
      return { periodStart: startOfWeek(now), periodEnd: endOfDay(now) };
    case 'this-month':
      return { periodStart: new Date(now.getFullYear(), now.getMonth(), 1), periodEnd: endOfDay(now) };
    case 'previous-month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { periodStart: start, periodEnd: end };
    }
    case 'custom':
      return { periodStart: custom.start, periodEnd: custom.end };
  }
}

/** Adaptive granularity by range length -- daily for short ranges, weekly for medium, monthly for long -- per the milestone's own instruction. */
function granularityForRange(periodStart: Date, periodEnd: Date): CommandCentreGranularity {
  const days = (periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000);
  if (days <= 21) return 'day';
  if (days <= 120) return 'week';
  return 'month';
}

const PRESET_OPTIONS: Array<{ value: DateRangePreset; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this-week', label: 'This week' },
  { value: 'this-month', label: 'This month' },
  { value: 'previous-month', label: 'Previous month' },
  { value: 'custom', label: 'Custom range' },
];

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------
// SMALL PRESENTATIONAL HELPERS
// ---------------------------------------------------------------------

/** Renders per-currency amounts, never summed across currencies -- same discipline as TransportCostReportPage. */
function MoneyByCurrency({ rows }: { rows: CommandCentreDimensionTotal[] }) {
  if (rows.length === 0) return <span className="text-muted-foreground">No data</span>;
  return (
    <>
      {rows.map((r) => (
        <div key={r.reportingCurrency}>{formatMoney(r.netReportingAmount, r.reportingCurrency)}</div>
      ))}
    </>
  );
}

function DimensionTable({
  title,
  rows,
  emptyHint,
  onRowClick,
}: {
  title: string;
  rows: CommandCentreDimensionTotal[];
  emptyHint: string;
  onRowClick?: (row: CommandCentreDimensionTotal) => void;
}) {
  const sorted = useMemo(() => [...rows].sort((a, b) => b.netReportingAmount - a.netReportingAmount).slice(0, 15), [rows]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="py-4 text-sm text-center text-muted-foreground">{emptyHint}</p>
        ) : (
          <div className="overflow-x-auto border rounded-md border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{title}</TableHead>
                  <TableHead className="text-right">Postings</TableHead>
                  <TableHead className="text-right">Net amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r) => (
                  <TableRow
                    key={`${r.key}-${r.reportingCurrency}`}
                    className={onRowClick ? 'cursor-pointer hover:bg-muted/50' : undefined}
                    onClick={onRowClick ? () => onRowClick(r) : undefined}
                  >
                    <TableCell className="font-medium">
                      {r.key === 'unavailable' || r.key === 'not-applicable' || r.key === 'unattributed' ? (
                        <Badge variant="outline">{r.label}</Badge>
                      ) : (
                        r.label
                      )}
                    </TableCell>
                    <TableCell className="text-right">{r.postingCount}</TableCell>
                    <TableCell className="text-right font-medium">{formatMoney(r.netReportingAmount, r.reportingCurrency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------
// PAGE
// ---------------------------------------------------------------------

export function CommandCentrePage() {
  const [preset, setPreset] = useState<DateRangePreset>('this-month');
  const now = new Date();
  const [customStart, setCustomStart] = useState<Date>(new Date(now.getFullYear(), now.getMonth(), 1));
  const [customEnd, setCustomEnd] = useState<Date>(endOfDay(now));
  const [filters, setFilters] = useState<CommandCentreFilters>({});
  const [vehicleLabel, setVehicleLabel] = useState<string | undefined>();
  const [transporterLabel, setTransporterLabel] = useState<string | undefined>();
  // PRODUCTION FIX (Slice 1-5 verification pass): drillDownVehicleId/
  // VehicleDrillDownDialog removed from THIS page -- "By vehicle" now
  // goes through the same filter-aware setDimensionDrillDown path as
  // every other dimension below (see that onRowClick's own comment).
  // VehicleDrillDownDialog itself is NOT removed from the codebase --
  // TransportCostReportPage.tsx still legitimately uses it for its own,
  // separate (non-Command-Centre, non-filtered) vehicle drill-down view.
  // GAP-CLOSURE PASS, Objective 4.
  const [dimensionDrillDown, setDimensionDrillDown] = useState<{
    title: string;
    periodStart: Date;
    periodEnd: Date;
    constraint?: { dimension: CommandCentreDrillDownDimension; key: string };
  } | null>(null);
  const [dataQualityIssue, setDataQualityIssue] = useState<DataQualityIssueKind | null>(null);

  const { periodStart, periodEnd } = useMemo(
    () => rangeForPreset(preset, { start: customStart, end: customEnd }),
    [preset, customStart, customEnd]
  );
  const granularity = useMemo(() => granularityForRange(periodStart, periodEnd), [periodStart, periodEnd]);

  const { data: summary, isLoading, isError, isPlaceholderData } = useCommandCentreSummary(periodStart, periodEnd, granularity, filters);

  const dq = summary?.dataQuality;
  const hasUnresolvedIdentity = !!dq && (dq.unresolvedVehicle > 0 || dq.unresolvedTransporter > 0);

  const trendChartData = useMemo(
    () =>
      (summary?.timeSeries ?? []).map((b) => ({
        label:
          granularity === 'month'
            ? formatDate(b.bucketStart, 'MMM yyyy')
            : formatDate(b.bucketStart, 'dd MMM'),
        amount: b.netReportingAmount,
        currency: b.reportingCurrency,
        bucketStart: b.bucketStart,
        bucketEnd: b.bucketEnd,
      })),
    [summary?.timeSeries, granularity]
  );

  const companyChartData = useMemo(
    () => (summary?.byCompany ?? []).map((c) => ({ label: c.label, amount: c.netReportingAmount, key: c.key })),
    [summary?.byCompany]
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Transport cost command centre"
        description="How much transport cost was incurred, by whom, where, and what remains unresolved -- sourced from the Allocation Ledger and transport-cost source records."
        breadcrumbs={[{ label: 'Transport cost' }, { label: 'Command centre' }]}
      />

      {/* FILTERS */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block mb-1 text-sm font-medium">Date range</label>
            <select
              className="input-base"
              value={preset}
              onChange={(e) => setPreset(e.target.value as DateRangePreset)}
            >
              {PRESET_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {preset === 'custom' && (
            <>
              <div>
                <label className="block mb-1 text-sm font-medium">From</label>
                <input
                  type="date"
                  className="input-base"
                  value={toDateInputValue(customStart)}
                  onChange={(e) => e.target.value && setCustomStart(startOfDay(new Date(e.target.value)))}
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">To</label>
                <input
                  type="date"
                  className="input-base"
                  value={toDateInputValue(customEnd)}
                  onChange={(e) => e.target.value && setCustomEnd(endOfDay(new Date(e.target.value)))}
                />
              </div>
            </>
          )}

          <div>
            <label className="block mb-1 text-sm font-medium">Cost-facing company</label>
            <select
              className="input-base"
              value={filters.costFacingCompany ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, costFacingCompany: (e.target.value || undefined) as CommandCentreFilters['costFacingCompany'] }))}
            >
              <option value="">All</option>
              {COST_FACING_COMPANIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block mb-1 text-sm font-medium">Cost category</label>
            <select
              className="input-base"
              value={filters.costCategory ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, costCategory: (e.target.value || undefined) as CommandCentreFilters['costCategory'] }))}
            >
              <option value="">All</option>
              {TRANSPORT_COST_CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <SearchSelect
            label="Vehicle"
            placeholder="Search registration…"
            value={filters.vehicleId}
            valueLabel={vehicleLabel}
            onChange={(id) => {
              setFilters((f) => ({ ...f, vehicleId: id }));
              if (!id) setVehicleLabel(undefined);
            }}
            search={async (q) => {
              const results = await transportCostApi.searchVehicles(q, filters.transporterPartnerId);
              return results;
            }}
          />

          <SearchSelect
            label="Transporter"
            placeholder="Search transporter…"
            value={filters.transporterPartnerId}
            valueLabel={transporterLabel}
            onChange={(id) => {
              setFilters((f) => ({ ...f, transporterPartnerId: id }));
              if (!id) setTransporterLabel(undefined);
            }}
            search={(q) => transportCostApi.searchTransporters(q)}
          />

          <SearchCreateSelect
            label="Destination"
            placeholder="Filter by destination…"
            value={filters.destinationTown ?? ''}
            onChange={(v) => setFilters((f) => ({ ...f, destinationTown: v || undefined }))}
            search={(q) => transportCostApi.searchDestinations(q)}
          />

          <SearchCreateSelect
            label="Customer"
            placeholder="Filter by customer…"
            value={filters.customerName ?? ''}
            onChange={(v) => setFilters((f) => ({ ...f, customerName: v || undefined }))}
            search={(q) => transportCostApi.searchCustomers(q)}
          />
        </CardContent>
      </Card>

      {isLoading && !summary && <p className="py-8 text-sm text-center text-muted-foreground">Loading&hellip;</p>}

      {isError && (
        <p className="py-8 text-sm text-center text-destructive">
          Couldn&apos;t load the command centre. You may not have transport-cost view access, or the request failed --
          try again.
        </p>
      )}

      {summary && (
        <>
          {isPlaceholderData && (
            <p className="text-caption text-muted-foreground">Updating for the new filters&hellip;</p>
          )}

          {summary.pending.hasPendingAmounts && (
            <div className="flex items-start gap-2 p-4 border rounded-lg border-warning/40 bg-warning/5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <div>
                <p className="font-medium text-body-sm text-foreground">
                  {summary.pending.pendingSourceRecordCount} row{summary.pending.pendingSourceRecordCount === 1 ? '' : 's'} in this period{' '}
                  {summary.pending.pendingSourceRecordCount === 1 ? 'has' : 'have'} no Amount yet
                </p>
                <p className="text-caption text-muted-foreground">
                  These rows imported successfully but were never posted, so they are excluded from every total below.
                  The totals are real, but not yet final for this period.
                </p>
              </div>
            </div>
          )}

          {summary.mixedReportingCurrencies && (
            <div className="flex items-start gap-2 p-4 border rounded-lg border-warning/40 bg-warning/5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <p className="text-body-sm text-foreground">
                This period mixes {summary.mixedReportingCurrencies.join(' and ')} -- every figure below is a per-currency
                subtotal, never summed across currencies.
              </p>
            </div>
          )}

          {/* KPI CARDS */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>
                  {formatDate(periodStart)} &ndash; {formatDate(periodEnd)}
                </CardDescription>
                <CardTitle className="text-h3">
                  <MoneyByCurrency rows={summary.totals} />
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-caption text-muted-foreground">Period total transport cost (ledger)</CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-h3">{summary.operational.totalOperations}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-caption text-muted-foreground">
                Transport operations &middot; operational count, not a cost figure
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-h3">{summary.operational.totalLines}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-caption text-muted-foreground">
                Loads / consignments &middot; {summary.operational.multiLineOperationCount} multi-load operation
                {summary.operational.multiLineOperationCount === 1 ? '' : 's'}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-h3">
                  <MoneyByCurrency rows={summary.byCompany.filter((c) => c.key === 'unattributed')} />
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-caption text-muted-foreground">
                Unattributed cost &middot; posted, but no cost-facing company recorded
              </CardContent>
            </Card>
          </section>

          {/* TREND CHART */}
          <Card>
            <CardHeader>
              <CardTitle>Transport cost trend</CardTitle>
              <CardDescription>
                {granularity === 'day' ? 'Daily' : granularity === 'week' ? 'Weekly' : 'Monthly'} buckets, adaptive to the
                selected range &middot; ledger postings only
              </CardDescription>
            </CardHeader>
            <CardContent>
              {trendChartData.length === 0 ? (
                <p className="py-8 text-sm text-center text-muted-foreground">No data for this period and filter set.</p>
              ) : (
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <LineChart
                      data={trendChartData}
                      margin={{ left: -20, right: 8 }}
                      onClick={(state) => {
                        // GAP-CLOSURE PASS, Objective 4 (drill-down from a
                        // "daily trend point"). Narrows the drill-down's
                        // OWN period to this bucket's [bucketStart,
                        // bucketEnd] while keeping every other active
                        // filter -- no dimension constraint, since a trend
                        // point is a time bucket, not one company/vehicle/
                        // transporter/destination/customer value.
                        const point = state?.activePayload?.[0]?.payload as
                          | { label?: string; bucketStart?: Date | string; bucketEnd?: Date | string }
                          | undefined;
                        if (!point?.bucketStart || !point?.bucketEnd) return;
                        setDimensionDrillDown({
                          title: `Transport cost trend — ${point.label ?? ''}`,
                          periodStart: new Date(point.bucketStart),
                          periodEnd: new Date(point.bucketEnd),
                        });
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
                      <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                      <Tooltip
                        formatter={(value: number, _name: string, entry: { payload?: { currency?: string } }) => [
                          formatMoney(value, entry?.payload?.currency ?? ''),
                          'Cost',
                        ]}
                      />
                      <Line type="monotone" dataKey="amount" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3, cursor: 'pointer' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              {trendChartData.length > 0 && (
                <p className="pt-2 text-caption text-muted-foreground">Click a point to see the operations behind that day/week/month.</p>
              )}
            </CardContent>
          </Card>

          {/* BY COMPANY CHART */}
          <Card>
            <CardHeader>
              <CardTitle>Cost by cost-facing company</CardTitle>
              <CardDescription>Hypery / Olivine / Surface -- captured at entry, never inferred from vehicle or transporter.</CardDescription>
            </CardHeader>
            <CardContent>
              {companyChartData.length === 0 ? (
                <p className="py-8 text-sm text-center text-muted-foreground">No data for this period and filter set.</p>
              ) : (
                <div style={{ width: '100%', height: 220 }}>
                  <ResponsiveContainer>
                    <BarChart
                      data={companyChartData}
                      margin={{ left: -20, right: 8 }}
                      onClick={(state) => {
                        // GAP-CLOSURE PASS, Objective 4 (drill-down from "company total").
                        const bar = state?.activePayload?.[0]?.payload as { label?: string; key?: string } | undefined;
                        if (!bar?.key) return;
                        setDimensionDrillDown({
                          title: `Cost by company — ${bar.label ?? bar.key}`,
                          periodStart,
                          periodEnd,
                          constraint: { dimension: 'company', key: bar.key },
                        });
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
                      <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                      <Tooltip formatter={(value: number) => formatMoney(value, summary.totals[0]?.reportingCurrency ?? '')} />
                      <Bar dataKey="amount" fill="var(--chart-2)" radius={[4, 4, 0, 0]} cursor="pointer" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* DIMENSION BREAKDOWNS */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DimensionTable
              title="By category"
              rows={summary.byCategory}
              emptyHint="No postings in this period."
              onRowClick={(r) =>
                setDimensionDrillDown({
                  title: `By category — ${r.label}`,
                  periodStart,
                  periodEnd,
                  constraint: { dimension: 'category', key: r.key },
                })
              }
            />
            <DimensionTable
              title="By vehicle"
              rows={summary.byVehicle}
              emptyHint="No postings in this period."
              // PRODUCTION FIX (Slice 1-5 verification pass): this used
              // to open VehicleDrillDownDialog via
              // useTransportCostVehiclePostings, a Phase O4 hook that
              // takes NO filters at all -- clicking a vehicle row while
              // a company/category/transporter/destination/customer
              // filter was active silently showed that vehicle's ENTIRE
              // period postings, ignoring every active filter, unlike
              // every other dimension's drill-down. 'vehicle' is
              // already a supported CommandCentreDrillDownDimension
              // (transport-cost-report.service.ts) with its own
              // filter-aware route/service/repository path -- reusing
              // the exact same setDimensionDrillDown mechanism every
              // other dimension above already uses is the correct,
              // minimal fix (no new backend code, no parallel drill-
              // down engine).
              onRowClick={(r) =>
                r.key !== 'unavailable'
                  ? setDimensionDrillDown({
                      title: `By vehicle — ${r.label}`,
                      periodStart,
                      periodEnd,
                      constraint: { dimension: 'vehicle', key: r.key },
                    })
                  : undefined
              }
            />
            <DimensionTable
              title="By transporter"
              rows={summary.byTransporter}
              emptyHint="No postings in this period."
              onRowClick={(r) =>
                setDimensionDrillDown({
                  title: `By transporter — ${r.label}`,
                  periodStart,
                  periodEnd,
                  constraint: { dimension: 'transporter', key: r.key },
                })
              }
            />
            <DimensionTable
              title="By destination"
              rows={summary.byDestination}
              emptyHint="No postings in this period."
              onRowClick={(r) =>
                setDimensionDrillDown({
                  title: `By destination — ${r.label}`,
                  periodStart,
                  periodEnd,
                  constraint: { dimension: 'destination', key: r.key },
                })
              }
            />
            <DimensionTable
              title="By customer"
              rows={summary.byCustomer}
              emptyHint="No postings in this period."
              onRowClick={(r) =>
                setDimensionDrillDown({
                  title: `By customer — ${r.label}`,
                  periodStart,
                  periodEnd,
                  constraint: { dimension: 'customer', key: r.key },
                })
              }
            />
          </section>
          <p className="flex items-start gap-2 text-caption text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            By-destination and by-customer figures attribute each operation&apos;s full cost to its PRIMARY (first) load
            only -- an operation with several differently-destined loads is not split across bars, so these always sum
            back to the period total above.
          </p>

          {/* DATA QUALITY / TRUST PANEL */}
          <Card>
            <CardHeader>
              <CardTitle>Data quality</CardTitle>
              <CardDescription>
                Every count below is independent -- a row can appear in more than one. None of these are financial
                figures.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dq && (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <DataQualityStat label="Pending amount" value={dq.pendingAmountCount} hint="Imported, no Amount yet" />
                  <DataQualityStat label="Rejected" value={dq.rejectedCount} hint="Failed validation at import" />
                  <DataQualityStat label="Duplicate" value={dq.duplicateCount} hint="Flagged as a likely duplicate" />
                  <DataQualityStat label="Period outliers" value={dq.periodOutlierCount} hint="Posted outside the requested window" />
                  <DataQualityStat
                    label="Missing company"
                    value={dq.missingCostFacingCompany}
                    hint="No cost-facing company recorded"
                    onClick={dq.missingCostFacingCompany > 0 ? () => setDataQualityIssue('missingCostFacingCompany') : undefined}
                  />
                  <DataQualityStat
                    label="Unresolved transporter"
                    value={dq.unresolvedTransporter}
                    hint="Not yet confirmed via O2 review"
                    onClick={dq.unresolvedTransporter > 0 ? () => setDataQualityIssue('unresolvedTransporter') : undefined}
                  />
                  <DataQualityStat
                    label="Unresolved vehicle"
                    value={dq.unresolvedVehicle}
                    hint="Registration present, not yet confirmed"
                    onClick={dq.unresolvedVehicle > 0 ? () => setDataQualityIssue('unresolvedVehicle') : undefined}
                  />
                  <DataQualityStat
                    label="Vehicle: not applicable"
                    value={dq.vehicleNotApplicable}
                    hint="Source has no registration column (e.g. Swift)"
                    onClick={dq.vehicleNotApplicable > 0 ? () => setDataQualityIssue('vehicleNotApplicable') : undefined}
                  />
                  <DataQualityStat
                    label="Missing customer"
                    value={dq.missingCustomer}
                    hint="No customer on any load"
                    onClick={dq.missingCustomer > 0 ? () => setDataQualityIssue('missingCustomer') : undefined}
                  />
                  <DataQualityStat
                    label="Missing destination"
                    value={dq.missingDestination}
                    hint="No destination on any load"
                    onClick={dq.missingDestination > 0 ? () => setDataQualityIssue('missingDestination') : undefined}
                  />
                  <DataQualityStat
                    label="Destination: not applicable"
                    value={dq.destinationNotApplicable}
                    hint="Retainer rows (e.g. Vansales) have no destination"
                    onClick={dq.destinationNotApplicable > 0 ? () => setDataQualityIssue('destinationNotApplicable') : undefined}
                  />
                  <DataQualityStat
                    label="Missing tonnage"
                    value={dq.missingTonnage}
                    hint="No tonnage recorded"
                    onClick={dq.missingTonnage > 0 ? () => setDataQualityIssue('missingTonnage') : undefined}
                  />
                  <DataQualityStat
                    label="Missing registration"
                    value={dq.missingRegistration}
                    hint="Registration cell blank at import"
                    onClick={dq.missingRegistration > 0 ? () => setDataQualityIssue('missingRegistration') : undefined}
                  />
                </div>
              )}
              {hasUnresolvedIdentity && (
                <p className="flex items-start gap-2 pt-4 mt-4 text-caption text-muted-foreground border-t border-border">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Unresolved transporter/vehicle rows never reach the ledger -- they are excluded from every cost figure
                  above until O2 review confirms an identity for them.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}


      {/* GAP-CLOSURE PASS, Objective 4. */}
      <DimensionDrillDownDialog
        open={Boolean(dimensionDrillDown)}
        onOpenChange={(open) => {
          if (!open) setDimensionDrillDown(null);
        }}
        title={dimensionDrillDown?.title ?? ''}
        periodStart={dimensionDrillDown?.periodStart ?? periodStart}
        periodEnd={dimensionDrillDown?.periodEnd ?? periodEnd}
        filters={filters}
        constraint={dimensionDrillDown?.constraint}
      />
      <DataQualityEvidenceDialog
        issue={dataQualityIssue}
        periodStart={periodStart}
        periodEnd={periodEnd}
        onOpenChange={(open) => {
          if (!open) setDataQualityIssue(null);
        }}
      />
    </div>
  );
}

function DataQualityStat({
  label,
  value,
  hint,
  onClick,
}: {
  label: string;
  value: number;
  hint: string;
  /** GAP-CLOSURE PASS, Objective 4. Omitted -> not (yet) drill-down-able (the four exception-shaped counts above still route through the existing CSV export); supplied -> opens DataQualityEvidenceDialog for this exact issue. */
  onClick?: () => void;
}) {
  const content = (
    <>
      <p className={value > 0 ? 'text-h3 font-semibold text-foreground' : 'text-h3 font-semibold text-muted-foreground'}>{value}</p>
      <p className="text-caption font-medium text-foreground">{label}</p>
      <p className="text-caption text-muted-foreground">{hint}</p>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="text-left rounded-md -m-1 p-1 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {content}
      </button>
    );
  }
  return <div>{content}</div>;
}
