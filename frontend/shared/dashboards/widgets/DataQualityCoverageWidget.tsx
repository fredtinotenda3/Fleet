// frontend/shared/dashboards/widgets/DataQualityCoverageWidget.tsx
//
// PART 11 -- "Data Quality / Data Coverage" dashboard widget. Renders
// the six coverage percentages from
// GET /api/analytics?action=data-quality-coverage
// (modules/analytics/services/data-quality-coverage.service.ts) exactly
// as that service returns them: six independent, labelled percentages,
// each with its own plain-English definition.
//
// ---------------------------------------------------------------------
// THIS IS DELIBERATELY NOT A SCORE
// ---------------------------------------------------------------------
// There is no averaging, no weighting, and no single headline number
// here. That is not an oversight -- see the service's own header for
// why a blended "data quality score" is explicitly the wrong shape for
// this feature (the same lesson fleet-health.service.ts's fixed-0.0-km/L
// history already taught this codebase once). Do not add one here
// either; a future reader tempted to collapse these six rows into one
// percentage should read that header first.

'use client';

import { Database } from 'lucide-react';
import { DashboardWidget } from '@/frontend/shared/dashboards/DashboardWidget';
import { useDataQualityCoverage } from '@/frontend/modules/analytics/hooks';
import type { CoverageMetric } from '@/frontend/modules/analytics/types';
import { cn } from '@/lib/utils';

/** Below this, a metric is flagged in the warning colour -- low enough that figures built on it deserve visible caution, not a silent pass. */
const LOW_COVERAGE_THRESHOLD = 50;

function CoverageRow({ metric }: { metric: CoverageMetric }) {
  const low = metric.percent < LOW_COVERAGE_THRESHOLD;
  return (
    <li className="space-y-1" title={metric.definition}>
      <div className="flex items-center justify-between text-body-sm">
        <span className="text-foreground">{metric.label}</span>
        <span className={cn('font-medium tabular-nums', low ? 'text-warning' : 'text-foreground')}>
          {metric.percent}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={metric.label}
        aria-valuenow={metric.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn('h-full rounded-full transition-all', low ? 'bg-warning' : 'bg-primary')}
          style={{ width: `${Math.min(100, Math.max(0, metric.percent))}%` }}
        />
      </div>
      <p className="text-caption text-muted-foreground">
        {metric.definition} ({metric.coveredCount} of {metric.totalCount})
      </p>
    </li>
  );
}

export function DataQualityCoverageWidget() {
  const { data, isLoading, isError, refetch } = useDataQualityCoverage();

  return (
    <DashboardWidget
      title="Data quality & coverage"
      icon={<Database className="w-4 h-4" />}
      isLoading={isLoading}
      isError={isError}
      onRefresh={() => refetch()}
    >
      {!data || data.totalVehicles === 0 ? (
        <p className="py-8 text-center text-body-sm text-muted-foreground">
          No vehicles in scope yet to measure coverage against.
        </p>
      ) : (
        <div className="space-y-3">
          <ul className="space-y-3">
            {data.metrics.map((metric) => (
              <CoverageRow key={metric.label} metric={metric} />
            ))}
          </ul>
          <p className="text-caption text-muted-foreground border-t pt-2">
            Six independent measures across {data.totalVehicles} vehicle
            {data.totalVehicles === 1 ? '' : 's'} in scope — not a blended score. Low coverage on
            any one row means figures that depend on that data deserve less confidence, not that
            the fleet itself is unhealthy.
          </p>
        </div>
      )}
    </DashboardWidget>
  );
}
