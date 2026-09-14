// frontend/modules/vehicles/components/analytics/VehicleFuelReconciliationPanel.tsx
//
// WAVE 1 PART 2, item 4: fuel/trip reconciliation.
//
// Renders `computeFuelReconciliation` (frontend/modules/vehicles/utils/
// fuel-reconciliation.ts -- see that file for the full lineage,
// provenance vocabulary, and the data-truth rules this panel exists to
// surface rather than hide).
//
// ---------------------------------------------------------------------
// NO NEW DATA SOURCES, NO SECOND DATE-RANGE CONTROL
// ---------------------------------------------------------------------
// This panel lives inside `VehicleFuelAnalyticsPanel`, which already
// renders a `FuelAnalyticsFilterBar` driving every other fuel chart on
// the tab. Rather than add a SECOND, independent range selector here
// (which was considered and rejected -- two live date controls on one
// screen is exactly the confusing pattern this Wave's item 5 audit
// flagged elsewhere), this panel reads the SAME `dateRange` state. Every
// other query it needs (`useFuelStats`, `useFuelKpis`) already exists and
// is already used elsewhere on this page; only the BASELINE window
// (immediately preceding, non-overlapping -- see `baselineWindowFor`) is
// new, and it derives from the same selected period.
//
// `isElectric` is threaded down as a prop (from `vehicleProfileFor`,
// resolved once at `VehicleDetailPage`) rather than re-fetched here.

'use client';

import { AlertTriangle, Fuel, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { Alert, AlertDescription, AlertTitle } from '@/frontend/shared/ui/feedback/alert';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';
import { cn } from '@/lib/utils';
import { useFuelStats, useFuelKpis } from '@/frontend/modules/fuel/hooks/useFuel';
import { formatCurrency } from '@/shared/utils/currency.utils';
import {
  computeFuelReconciliation,
  baselineWindowFor,
  fuelProvenanceLabel,
  fuelProvenanceExplanation,
  hasFuelValue,
  type FuelValue,
} from '../../utils/fuel-reconciliation';

interface VehicleFuelReconciliationPanelProps {
  licensePlate: string;
  isElectric: boolean;
  dateRange: { startDate?: Date; endDate?: Date };
}

/** Same rolling-90-day default `getFuelKpis`/`getFuelStats` themselves apply to an unset range, so the baseline always has a concrete period to precede. */
const DEFAULT_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

function resolvedPeriod(dateRange: { startDate?: Date; endDate?: Date }): { start: Date; end: Date } {
  const end = dateRange.endDate ?? new Date();
  const start = dateRange.startDate ?? new Date(end.getTime() - DEFAULT_LOOKBACK_MS);
  return { start, end };
}

function ProvenanceBadge({ fv }: { fv: FuelValue }) {
  const tone =
    fv.provenance === 'actual'
      ? 'bg-success-bg text-success'
      : fv.provenance === 'calculated' || fv.provenance === 'derived'
        ? 'bg-info-bg text-info'
        : fv.provenance === 'estimated'
          ? 'bg-warning-bg text-warning'
          : 'bg-muted text-muted-foreground';

  return (
    <span
      className={cn('rounded px-1.5 py-0.5 text-caption font-medium tracking-wide', tone)}
      title={fuelProvenanceExplanation(fv)}
    >
      {fuelProvenanceLabel(fv.provenance)}
    </span>
  );
}

function ReconciliationRow({
  label,
  actual,
  expected,
  variance,
  format,
}: {
  label: string;
  actual: FuelValue;
  expected: FuelValue;
  variance: FuelValue;
  format: (n: number) => string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 border-t border-border py-3 first:border-t-0 first:pt-0 sm:grid-cols-4 sm:items-center">
      <div className="text-body-sm font-medium text-foreground">{label}</div>

      <div className="flex flex-col gap-1">
        <span className="text-caption text-muted-foreground">Actual</span>
        <div className="flex items-center gap-2">
          <span className="text-body-sm font-medium tabular-nums">
            {hasFuelValue(actual) ? format(actual.value) : 'Unavailable'}
          </span>
          <ProvenanceBadge fv={actual} />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-caption text-muted-foreground">Expected</span>
        <div className="flex items-center gap-2">
          <span className="text-body-sm font-medium tabular-nums">
            {hasFuelValue(expected) ? format(expected.value) : 'Unavailable'}
          </span>
          <ProvenanceBadge fv={expected} />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-caption text-muted-foreground">Variance</span>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'text-body-sm font-medium tabular-nums',
              hasFuelValue(variance) && variance.value > 0 && 'text-warning',
              hasFuelValue(variance) && variance.value < 0 && 'text-info'
            )}
          >
            {hasFuelValue(variance)
              ? `${variance.value > 0 ? '+' : ''}${format(variance.value)}`
              : 'Unavailable'}
          </span>
          <ProvenanceBadge fv={variance} />
        </div>
      </div>
    </div>
  );
}

export function VehicleFuelReconciliationPanel({
  licensePlate,
  isElectric,
  dateRange,
}: VehicleFuelReconciliationPanelProps) {
  const { start: periodStart } = resolvedPeriod(dateRange);
  const baselineRange = baselineWindowFor(periodStart);

  const periodStats = useFuelStats(dateRange, licensePlate);
  const periodKpis = useFuelKpis(dateRange, licensePlate);
  const baselineStats = useFuelStats(baselineRange, licensePlate);
  const baselineKpis = useFuelKpis(baselineRange, licensePlate);

  const queries = [periodStats, periodKpis, baselineStats, baselineKpis];
  const isLoading = queries.some((q) => q.isLoading);
  const failed = queries.filter((q) => q.isError);

  const retryAll = () => {
    for (const q of failed) q.refetch();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Fuel className="size-4" aria-hidden="true" />
          Fuel reconciliation
        </CardTitle>
        <CardDescription>
          Actual fuel purchased against expected consumption for this vehicle&rsquo;s own trusted
          consumption rate, built from its fuel history in the{' '}
          {Math.round((baselineRange.endDate.getTime() - baselineRange.startDate.getTime()) / (24 * 60 * 60 * 1000))}{' '}
          days before this period.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isElectric ? (
          <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-body-sm text-muted-foreground">
            <span className="rounded px-1.5 py-0.5 text-caption font-medium tracking-wide bg-muted text-muted-foreground">
              NOT APPLICABLE
            </span>
            {licensePlate} is an electric vehicle &mdash; fuel-consumption reconciliation does not apply.
          </div>
        ) : isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : failed.length > 0 ? (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" aria-hidden="true" />
            <AlertTitle>Couldn&rsquo;t load fuel reconciliation data</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>One or more of the fuel figures needed for this comparison failed to load.</p>
              <Button type="button" variant="outline" size="sm" onClick={retryAll}>
                <RefreshCw className="size-3.5" aria-hidden="true" />
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          (() => {
            const result = computeFuelReconciliation({
              licensePlate,
              isElectric,
              period: {
                totalFuel: periodStats.data?.totalFuel ?? 0,
                totalCost: periodStats.data?.totalCost ?? 0,
                logCount: periodStats.data?.logCount ?? 0,
                totalDistance: periodKpis.data?.totalDistance ?? 0,
                fallbackPlates: periodKpis.data?.fallbackPlates ?? [],
              },
              baseline: {
                averageFuelEfficiency: baselineKpis.data?.averageFuelEfficiency ?? 0,
                logCount: baselineStats.data?.logCount ?? 0,
              },
            });

            return (
              <div>
                {!result.isDefensible && (
                  <Alert className="mb-3">
                    <AlertTriangle className="size-4" aria-hidden="true" />
                    <AlertTitle>No trusted consumption baseline yet</AlertTitle>
                    <AlertDescription>{fuelProvenanceExplanation(result.baselineEfficiency)}</AlertDescription>
                  </Alert>
                )}

                <div className="mb-3 flex items-center gap-2 text-caption text-muted-foreground">
                  <span>Consumption rate:</span>
                  <span className="font-medium text-foreground tabular-nums">
                    {hasFuelValue(result.baselineEfficiency)
                      ? `${result.baselineEfficiency.value.toFixed(2)} km/L`
                      : 'Unavailable'}
                  </span>
                  <ProvenanceBadge fv={result.baselineEfficiency} />
                </div>

                <div className="mb-3 flex items-center gap-2 text-caption text-muted-foreground">
                  <span>Distance this period:</span>
                  <span className="font-medium text-foreground tabular-nums">
                    {hasFuelValue(result.distance) ? `${result.distance.value.toFixed(1)} km` : 'Unavailable'}
                  </span>
                  <ProvenanceBadge fv={result.distance} />
                </div>

                <ReconciliationRow
                  label="Fuel volume"
                  actual={result.actualFuel}
                  expected={result.expectedFuel}
                  variance={result.fuelVariance}
                  format={(n) => `${n.toFixed(1)} L`}
                />
                <ReconciliationRow
                  label="Fuel cost"
                  actual={result.actualCost}
                  expected={result.expectedCost}
                  variance={result.costVariance}
                  format={(n) => formatCurrency(n)}
                />

                {hasFuelValue(result.fuelVariancePercent) && (
                  <p className="mt-3 text-caption text-muted-foreground">
                    Fuel variance is {result.fuelVariancePercent.value > 0 ? '+' : ''}
                    {result.fuelVariancePercent.value.toFixed(1)}% of expected consumption.
                  </p>
                )}
              </div>
            );
          })()
        )}
      </CardContent>
    </Card>
  );
}
