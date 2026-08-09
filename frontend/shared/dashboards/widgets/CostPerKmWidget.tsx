// frontend/shared/dashboards/widgets/CostPerKmWidget.tsx
//
// Dashboard KPI card: average cost per km across the vehicles the caller
// can see, with a month-over-month trend arrow.
//
// ---------------------------------------------------------------------
// WHY THIS IS A SAMPLE AND NOT A TRUE FLEET AVERAGE
// ---------------------------------------------------------------------
// There is no fleet-wide cost endpoint. The finance module exposes
// GET /api/finance/cost-per-km for ONE vehicle at a time, so a genuine
// fleet average would need either a new backend aggregate endpoint (out
// of scope for a frontend-only pass) or one request per vehicle.
//
// One request per vehicle is not merely slow, it breaks: withAuth applies
// a 100-requests-per-window rate limit (infrastructure/security/
// rate-limit.ts), so a 76-vehicle demo fleet firing in parallel on
// dashboard mount would start returning 429s -- and the widget would
// render a wrong average from whichever calls survived.
//
// So this widget samples a hard-capped SAMPLE_SIZE of vehicles, fetches
// them in small batches, and says so in the footer. It reports what it
// actually measured rather than implying fleet-wide coverage it does not
// have. Replacing this with one aggregate call is a small backend
// addition and is the right fix -- see the changelog.

'use client';

import { useQuery } from '@tanstack/react-query';
import { Gauge, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { DashboardWidget } from '@/frontend/shared/dashboards/DashboardWidget';
import { vehiclesApi } from '@/frontend/modules/vehicles/services/vehicles.api';
import { financeApi, startOfMonth, previousMonthRange } from '@/frontend/modules/finance/services/finance.api';
import { buildTrend } from '@/frontend/modules/finance/hooks/useFinance';
import { formatMoney } from '@/frontend/modules/finance/utils/money.utils';
import { cn } from '@/lib/utils';

/** Hard cap on how many vehicles this widget will price. Keeps the widget well inside the 100-request rate limit. */
const SAMPLE_SIZE = 20;
/** Concurrency per batch. Small enough that the dashboard's other widgets still get their requests through. */
const BATCH_SIZE = 5;

interface FleetCostSample {
  /** Vehicles that returned a usable cost-per-km figure. */
  pricedCount: number;
  /** Vehicles sampled, including those with no usable figure (no distance, mixed currencies). */
  sampledCount: number;
  /** Total vehicles the caller can see, from the list endpoint's pagination total. */
  totalVehicles: number;
  averageCostPerKm: number | null;
  previousAverageCostPerKm: number | null;
  reportingCurrency: string | null;
}

async function runInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<Array<R | null>> {
  const out: Array<R | null> = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(fn));
    // A single vehicle failing (404 out of scope, transient error) must
    // not blank the whole widget -- it is excluded from the average
    // instead, and pricedCount reflects that.
    out.push(...settled.map((r) => (r.status === 'fulfilled' ? r.value : null)));
  }
  return out;
}

async function fetchFleetCostSample(): Promise<FleetCostSample> {
  const page = await vehiclesApi.list({ page: 1, limit: SAMPLE_SIZE });
  const vehicles = page.data ?? [];
  const totalVehicles = page.pagination?.total ?? vehicles.length;

  const now = new Date();
  const currentFrom = startOfMonth(now);
  const previous = previousMonthRange(now);

  const ids = vehicles.map((v) => String(v._id)).filter(Boolean);

  const [currentResults, previousResults] = await Promise.all([
    runInBatches(ids, BATCH_SIZE, (id) => financeApi.getCostPerKm(id, currentFrom, now)),
    runInBatches(ids, BATCH_SIZE, (id) => financeApi.getCostPerKm(id, previous.from, previous.to)),
  ]);

  // Only vehicles with a non-null costPerKm contribute. A null means
  // "undefined for this period" (no distance) or "not summable" (mixed
  // reporting currencies) -- treating either as zero would drag the
  // average toward zero and make an idle fleet look cheap.
  const currentValues = currentResults
    .filter((r): r is NonNullable<typeof r> => r != null && r.costPerKm != null)
    .map((r) => r.costPerKm as number);

  const previousValues = previousResults
    .filter((r): r is NonNullable<typeof r> => r != null && r.costPerKm != null)
    .map((r) => r.costPerKm as number);

  const mean = (values: number[]) =>
    values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

  const reportingCurrency =
    currentResults.find((r) => r != null && r.reportingCurrency)?.reportingCurrency ?? null;

  return {
    pricedCount: currentValues.length,
    sampledCount: ids.length,
    totalVehicles,
    averageCostPerKm: mean(currentValues),
    previousAverageCostPerKm: mean(previousValues),
    reportingCurrency,
  };
}

function TrendArrow({ current, previous }: { current: number | null; previous: number | null }) {
  const trend = buildTrend(current, previous);

  if (trend.direction === 'unknown' || trend.deltaPct == null) {
    return <span className="text-caption text-muted-foreground">No prior month to compare</span>;
  }
  if (trend.direction === 'flat') {
    return (
      <span className="inline-flex items-center gap-1 text-caption text-muted-foreground">
        <Minus className="h-3.5 w-3.5" aria-hidden="true" /> Flat vs last month
      </span>
    );
  }
  // Lower cost per km is better, so "up" is the warning colour.
  const worse = trend.direction === 'up';
  const Icon = worse ? TrendingUp : TrendingDown;
  return (
    <span className={cn('inline-flex items-center gap-1 text-caption', worse ? 'text-warning' : 'text-success')}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {Math.abs(trend.deltaPct)}% {worse ? 'higher' : 'lower'} than last month
    </span>
  );
}

export function CostPerKmWidget() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['finance', 'fleet-cost-per-km', SAMPLE_SIZE],
    queryFn: fetchFleetCostSample,
    staleTime: 10 * 60_000,
    retry: 1,
  });

  return (
    <DashboardWidget
      title="Cost per km"
      icon={<Gauge className="w-4 h-4" />}
      isLoading={isLoading}
      isError={isError}
      onRefresh={() => refetch()}
    >
      {!data || data.pricedCount === 0 ? (
        <p className="py-8 text-center text-body-sm text-muted-foreground">
          No vehicle has both allocated costs and logged distance this month yet.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-h2 font-semibold text-foreground">
            {formatMoney(data.averageCostPerKm as number, data.reportingCurrency, { maximumFractionDigits: 2 })}
            <span className="ml-1 text-body-sm font-normal text-muted-foreground">/km</span>
          </p>
          <TrendArrow current={data.averageCostPerKm} previous={data.previousAverageCostPerKm} />
          <p className="text-caption text-muted-foreground">
            Mean across {data.pricedCount} priced vehicle{data.pricedCount === 1 ? '' : 's'}
            {data.sampledCount < data.totalVehicles
              ? ` — sampled ${data.sampledCount} of ${data.totalVehicles}`
              : ''}
          </p>
        </div>
      )}
    </DashboardWidget>
  );
}