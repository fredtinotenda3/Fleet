// frontend/modules/finance/components/VehicleCostsPanel.tsx
//
// The vehicle detail page's "Costs" tab. Three things, in the order a
// fleet manager actually asks them: what does this vehicle cost per km
// and is that getting worse, what is driving the number, and which
// postings make it up.
//
// Takes `vehicleId` (the Mongo _id) rather than a license plate --
// see the vehicleId contract in finance.api.ts. VehicleAnalyticsPanel
// alongside it takes a plate, so the two look inconsistent on the
// VehicleDetailPage; that is deliberate and correct, because the finance
// endpoints key on _id.

'use client';

import { TrendingUp, TrendingDown, Minus, HelpCircle, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { formatMoney } from '../utils/money.utils';
import { formatDate } from '@/shared/utils/date.utils';
import { cn } from '@/lib/utils';
import { useVehicleCostPerKmTrend, useVehicleAllocations, startOfMonth } from '../hooks/useFinance';
import { COST_CATEGORY_LABELS } from '../types';
import type { CostPerKmResponse, CostPerKmTrend, AllocationPosting } from '../types';

interface VehicleCostsPanelProps {
  /** The vehicle's MongoDB _id — NOT its license plate. */
  vehicleId: string;
}

/**
 * A lower cost per km is better, so an upward movement renders as a
 * warning and a downward one as a success. `buildTrend` deliberately
 * reports only the direction of the number; the good/bad judgement
 * belongs here, at the point of display.
 */
function TrendIndicator({ trend }: { trend: CostPerKmTrend }) {
  if (trend.direction === 'unknown' || trend.deltaPct == null) {
    return (
      <span className="inline-flex items-center gap-1 text-caption text-muted-foreground">
        <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
        No comparable prior month
      </span>
    );
  }
  if (trend.direction === 'flat') {
    return (
      <span className="inline-flex items-center gap-1 text-caption text-muted-foreground">
        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
        Flat vs last month
      </span>
    );
  }
  const worse = trend.direction === 'up';
  const Icon = worse ? TrendingUp : TrendingDown;
  return (
    <span className={cn('inline-flex items-center gap-1 text-caption', worse ? 'text-warning' : 'text-success')}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {Math.abs(trend.deltaPct)}% {worse ? 'higher' : 'lower'} than last month
    </span>
  );
}

/**
 * Renders the headline figure, or explains why there isn't one.
 *
 * Three distinct "no number" cases, kept distinct on purpose:
 *   - mixed reporting currencies: the backend refuses to total, so
 *     showing 0 would be a lie.
 *   - zero distance: cost-per-km is undefined, not zero. Showing "$0/km"
 *     for a vehicle that incurred cost while parked is the single most
 *     misleading thing this panel could do.
 *   - no postings at all: nothing has been allocated yet.
 */
function CostPerKmHeadline({ data, trend }: { data: CostPerKmResponse | undefined; trend: CostPerKmTrend }) {
  if (!data) return null;

  if (data.mixedReportingCurrencies?.length) {
    return (
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <div>
          <p className="text-body-sm font-medium text-foreground">Cannot be totalled</p>
          <p className="text-caption text-muted-foreground">
            This period contains postings in {data.mixedReportingCurrencies.join(' and ')}. Postings keep the
            reporting currency they were written under, so they are not summed.
          </p>
        </div>
      </div>
    );
  }

  if (data.costPerKm == null) {
    return (
      <div>
        <p className="text-h2 font-semibold text-foreground">—</p>
        <p className="text-caption text-muted-foreground">
          {data.distanceKm <= 0
            ? 'No distance logged this period, so cost per km is undefined.'
            : 'Not enough data to compute cost per km.'}
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-h2 font-semibold text-foreground">
        {formatMoney(data.costPerKm, data.reportingCurrency, { maximumFractionDigits: 2 })}
        <span className="ml-1 text-body-sm font-normal text-muted-foreground">/km</span>
      </p>
      <TrendIndicator trend={trend} />
    </div>
  );
}

function CategoryBreakdown({ data }: { data: CostPerKmResponse }) {
  const rows = data.byCategory ?? [];
  if (rows.length === 0) {
    return <p className="text-body-sm text-muted-foreground">No costs allocated to this vehicle this period.</p>;
  }

  // Percentages are of the absolute total so a credit note (a negative
  // net category) cannot produce a negative-width bar or a share above
  // 100%.
  const absTotal = rows.reduce((sum, r) => sum + Math.abs(r.netReportingAmount), 0);

  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const share = absTotal > 0 ? (Math.abs(row.netReportingAmount) / absTotal) * 100 : 0;
        return (
          <li key={`${row.costCategory}-${row.reportingCurrency}`} className="space-y-1">
            <div className="flex items-baseline justify-between gap-4 text-body-sm">
              <span className="text-foreground">{COST_CATEGORY_LABELS[row.costCategory] ?? row.costCategory}</span>
              <span className="font-medium text-foreground">
                {formatMoney(row.netReportingAmount, row.reportingCurrency)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-chart-1" style={{ width: `${share}%` }} />
            </div>
            <p className="text-caption text-muted-foreground">
              {share.toFixed(1)}% · {row.postingCount} posting{row.postingCount === 1 ? '' : 's'}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function PostingsTable({ postings }: { postings: AllocationPosting[] }) {
  if (postings.length === 0) {
    return (
      <p className="text-body-sm text-muted-foreground">
        No allocation postings for this vehicle this period.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-body-sm">
        <thead>
          <tr className="border-b border-border text-left text-caption text-muted-foreground">
            <th className="pb-2 pr-3 font-medium">Posted</th>
            <th className="pb-2 pr-3 font-medium">Category</th>
            <th className="pb-2 pr-3 font-medium">Rule</th>
            <th className="pb-2 pr-3 font-medium">Source</th>
            <th className="pb-2 pl-3 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {postings.map((posting) => {
            const isReversal = Boolean(posting.reversalOfPostingId);
            return (
              <tr key={String(posting._id)} className={cn(isReversal && 'text-muted-foreground')}>
                <td className="py-2 pr-3 whitespace-nowrap">{formatDate(posting.postedAt)}</td>
                <td className="py-2 pr-3">
                  {COST_CATEGORY_LABELS[posting.costCategory] ?? posting.costCategory}
                  {isReversal && (
                    <Badge variant="outline" className="ml-2">
                      Reversal
                    </Badge>
                  )}
                </td>
                <td className="py-2 pr-3">{posting.allocationRule}</td>
                <td className="py-2 pr-3 font-mono text-caption">{posting.sourceCollection}</td>
                <td className="py-2 pl-3 text-right font-medium whitespace-nowrap">
                  {formatMoney(posting.reportingAmount, posting.reportingCurrency)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-caption text-muted-foreground">
        Reversals are shown, not hidden — a corrected posting nets to zero while both entries stay on record.
      </p>
    </div>
  );
}

export function VehicleCostsPanel({ vehicleId }: VehicleCostsPanelProps) {
  const now = new Date();
  const from = startOfMonth(now);

  const { current, trend, isLoading, isError } = useVehicleCostPerKmTrend(vehicleId);
  const { data: postings, isLoading: postingsLoading } = useVehicleAllocations(vehicleId, from, now);

  if (isLoading) return <LoadingState type="table" count={4} />;

  if (isError) {
    return (
      <EmptyState
        title="Couldn't load costs"
        description="The cost-per-km engine didn't respond. You may not have finance access for this vehicle."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cost per km — month to date</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CostPerKmHeadline data={current} trend={trend} />
            {current && (
              <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-body-sm">
                <div>
                  <dt className="text-muted-foreground">Total net cost</dt>
                  <dd className="font-medium text-foreground">
                    {formatMoney(current.totalNetCost, current.reportingCurrency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Distance</dt>
                  <dd className="font-medium text-foreground">{current.distanceKm.toLocaleString()} km</dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What&apos;s driving it</CardTitle>
          </CardHeader>
          <CardContent>{current ? <CategoryBreakdown data={current} /> : null}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Allocation postings</CardTitle>
        </CardHeader>
        <CardContent>
          {postingsLoading ? (
            <LoadingState type="table" count={4} />
          ) : (
            <PostingsTable postings={postings ?? []} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}