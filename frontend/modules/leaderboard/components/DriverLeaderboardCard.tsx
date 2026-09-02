// frontend/modules/leaderboard/components/DriverLeaderboardCard.tsx
//
// Drivers ranked worst-first, from GET /api/ai/dashboard's driverRisk
// panel -- the same AIBatchResult<DriverRiskScore> the Driver Scorecard
// is built on, so a driver's position here and their scorecard can
// never disagree.
//
// EVERY ROW LINKS TO ITS SCORECARD. A leaderboard that names a person
// without showing the evidence behind their position is the wrong
// artefact to put in front of a manager; the deep link is what makes
// the number falsifiable (the scorecard renders the incidents, the
// trend and the cited evidence rows).

'use client';

import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/frontend/shared/ui/feedback/alert';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/frontend/shared/ui/data-display/card';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { ChartExportButton, slugifyChartFilename } from '@/frontend/shared/charts/ChartExportButton';
import { AI_ROUTES } from '@/frontend/modules/ai/routes';
import { riskLevelLabel, riskLevelPresentation } from '@/frontend/modules/ai/utils/driver-risk.utils';
import type { DriverLeaderboardMetric, DriverLeaderboardRow, RankedRow } from '../types';
import { formatLeaderboardValue, formatRankLabel } from '../utils/leaderboard.utils';
import { RankedBarChart } from './RankedBarChart';
import { MetricToggle, type MetricToggleOption } from './MetricToggle';

const METRIC_OPTIONS: ReadonlyArray<MetricToggleOption<DriverLeaderboardMetric>> = [
  { value: 'risk-score', label: 'Risk score', hint: 'AI driver risk score, 0-100, higher is riskier' },
  { value: 'alert-events', label: 'Alert events', hint: 'Speeding plus hard braking plus hard acceleration' },
];

const METRIC_COPY: Record<DriverLeaderboardMetric, { valueLabel: string; description: string }> = {
  'risk-score': {
    valueLabel: 'Risk score',
    description: 'Highest AI risk score first. 0-100, higher is riskier.',
  },
  'alert-events': {
    valueLabel: 'Alert events',
    description: 'Speeding, hard braking and hard acceleration events combined.',
  },
};

interface DriverLeaderboardCardProps {
  rows: ReadonlyArray<RankedRow<DriverLeaderboardRow>>;
  metric: DriverLeaderboardMetric;
  onMetricChange: (metric: DriverLeaderboardMetric) => void;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  /** False when the caller lacks Permission.ANALYTICS_VIEW. */
  hasAccess: boolean;
}

export function DriverLeaderboardCard({
  rows,
  metric,
  onMetricChange,
  isLoading,
  isError,
  error,
  hasAccess,
}: DriverLeaderboardCardProps) {
  const router = useRouter();
  const copy = METRIC_COPY[metric];
  const format = metric === 'risk-score' ? 'score' : 'count';

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div className="min-w-0">
          <CardTitle>Driver leaderboard</CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <MetricToggle
            label="Rank drivers by"
            value={metric}
            options={METRIC_OPTIONS}
            onChange={onMetricChange}
          />
          {rows.length > 0 && (
            <ChartExportButton
              filename={slugifyChartFilename(`driver-leaderboard-${metric}`)}
              sheetName="Driver Leaderboard"
              headers={['Rank', 'Driver', 'Risk Score', 'Risk Level', 'Speeding', 'Hard Brakes', 'Hard Accelerations']}
              rows={() =>
                rows.map((row) => ({
                  Rank: row.rank,
                  Driver: row.source.driverName,
                  'Risk Score': row.source.riskScore,
                  'Risk Level': row.source.riskLevel,
                  Speeding: row.source.speedingEvents,
                  'Hard Brakes': row.source.hardBrakes,
                  'Hard Accelerations': row.source.hardAccelerations,
                }))
              }
            />
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!hasAccess ? (
          <EmptyState
            title="Driver risk isn't available to your role"
            description="Ranking drivers reads the AI analytics feed, which needs the analytics view permission."
          />
        ) : isError ? (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" aria-hidden="true" />
            <AlertTitle>Couldn&apos;t load driver risk</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : 'An unexpected error occurred.'}
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <RankedBarChart
              rows={rows}
              format={format}
              valueLabel={copy.valueLabel}
              isLoading={isLoading}
              renderDetails={(row) => [
                { label: 'Risk level', value: riskLevelLabel(row.source.riskLevel) },
                { label: 'Speeding', value: formatLeaderboardValue(row.source.speedingEvents, 'count') },
                { label: 'Hard brakes', value: formatLeaderboardValue(row.source.hardBrakes, 'count') },
                {
                  label: 'Hard accelerations',
                  value: formatLeaderboardValue(row.source.hardAccelerations, 'count'),
                },
              ]}
              emptyTitle="No drivers to rank"
              emptyDescription="No drivers with trip or telematics history were found in your scope."
            />

            {!isLoading && rows.length > 0 && (
              <ul className="divide-y divide-border border-t border-border">
                {rows.map((row) => {
                  const presentation = riskLevelPresentation(row.source.riskLevel);
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => router.push(AI_ROUTES.driverScorecard(row.source.driverId))}
                        className="flex w-full items-center justify-between gap-3 py-2 text-left transition-colors hover:bg-muted/50"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="w-14 shrink-0 text-xs tabular-nums text-muted-foreground">
                            {formatRankLabel(row)}
                          </span>
                          <span className="truncate text-sm font-medium text-foreground">
                            {row.source.driverName}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-sm tabular-nums text-muted-foreground">
                            {formatLeaderboardValue(row.value, format)}
                          </span>
                          <Badge variant={presentation.badgeVariant} className={presentation.badgeClassName}>
                            {riskLevelLabel(row.source.riskLevel)}
                          </Badge>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
