// frontend/modules/leaderboard/components/VehicleLeaderboardCard.tsx
//
// Vehicles ranked worst-first, on one of three metrics. Each metric is
// backed by a DIFFERENT endpoint with a different permission, so the
// card takes an already-resolved view model rather than fetching:
//
//   maintenance-cost  GET /api/reminders?action=most-expensive-vehicles  MAINTENANCE_VIEW
//   repair-count      GET /api/reminders?action=repair-frequency         MAINTENANCE_VIEW
//   open-alerts       GET /api/ai/dashboard (derived)                    ANALYTICS_VIEW
//
// TWO HONESTY CONSTRAINTS THE COPY HAS TO CARRY:
//
//   * Both maintenance metrics aggregate COMPLETED records only and
//     price them from `estimated_cost` -- Reminder has no actual-cost
//     field (see MostExpensiveVehicleRow). The description says
//     "estimated" and "completed" rather than letting a reader assume
//     invoiced spend.
//   * 'open-alerts' counts predictive-maintenance and fuel-fraud
//     findings only. Expense anomalies are excluded because the alert
//     carries the EXPENSE's id and no license plate, so it cannot be
//     attributed to a vehicle at all -- see ExpenseAnomalyAlert's doc
//     comment and docs/leaderboard/BACKEND_AGGREGATION_GAPS.md.

'use client';

import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/frontend/shared/ui/feedback/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/frontend/shared/ui/data-display/card';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { ChartExportButton, slugifyChartFilename } from '@/frontend/shared/charts/ChartExportButton';
import type {
  LeaderboardValueFormat,
  MostExpensiveVehicleRow,
  RankedRow,
  RepairFrequencyByVehicleRow,
  VehicleAlertLeaderboardRow,
  VehicleLeaderboardMetric,
} from '../types';
import { formatLeaderboardValue } from '../utils/leaderboard.utils';
import { RankedBarChart } from './RankedBarChart';
import { MetricToggle, type MetricToggleOption } from './MetricToggle';

/**
 * The three shapes the card can be handed, discriminated by `metric`.
 *
 * A discriminated union rather than one row type with optional fields:
 * the three sources genuinely have different columns, and a shared
 * optional-everything row would let the cost view render an undefined
 * alert count as an em dash instead of failing to compile.
 */
export type VehicleLeaderboardData =
  | { metric: 'maintenance-cost'; rows: ReadonlyArray<RankedRow<MostExpensiveVehicleRow>> }
  | { metric: 'repair-count'; rows: ReadonlyArray<RankedRow<RepairFrequencyByVehicleRow>> }
  | { metric: 'open-alerts'; rows: ReadonlyArray<RankedRow<VehicleAlertLeaderboardRow>> };

const METRIC_COPY: Record<
  VehicleLeaderboardMetric,
  { valueLabel: string; description: string; format: LeaderboardValueFormat }
> = {
  'maintenance-cost': {
    valueLabel: 'Estimated cost',
    description: 'Highest cumulative estimated cost across completed maintenance records.',
    format: 'currency',
  },
  'repair-count': {
    valueLabel: 'Completed repairs',
    description: 'Most completed maintenance records.',
    format: 'count',
  },
  'open-alerts': {
    valueLabel: 'Open alerts',
    description: 'Open predictive-maintenance and fuel-fraud findings. Expense anomalies are not vehicle-attributable.',
    format: 'count',
  },
};

interface VehicleLeaderboardCardProps {
  data: VehicleLeaderboardData;
  onMetricChange: (metric: VehicleLeaderboardMetric) => void;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  /** Per-metric access, since the three metrics need two different permissions. */
  access: Record<VehicleLeaderboardMetric, boolean>;
}

export function VehicleLeaderboardCard({
  data,
  onMetricChange,
  isLoading,
  isError,
  error,
  access,
}: VehicleLeaderboardCardProps) {
  const copy = METRIC_COPY[data.metric];
  const hasAccess = access[data.metric];

  const options: ReadonlyArray<MetricToggleOption<VehicleLeaderboardMetric>> = [
    {
      value: 'maintenance-cost',
      label: 'Cost',
      hint: 'Cumulative estimated maintenance cost',
      disabled: !access['maintenance-cost'],
    },
    {
      value: 'repair-count',
      label: 'Repairs',
      hint: 'Completed maintenance record count',
      disabled: !access['repair-count'],
    },
    {
      value: 'open-alerts',
      label: 'Open alerts',
      hint: 'Open predictive-maintenance and fuel-fraud findings',
      disabled: !access['open-alerts'],
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div className="min-w-0">
          <CardTitle>Vehicle leaderboard</CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <MetricToggle
            label="Rank vehicles by"
            value={data.metric}
            options={options}
            onChange={onMetricChange}
          />
          {data.rows.length > 0 && <VehicleExportButton data={data} />}
        </div>
      </CardHeader>

      <CardContent>
        {!hasAccess ? (
          <EmptyState
            title="This ranking isn't available to your role"
            description={
              data.metric === 'open-alerts'
                ? 'Open AI findings need the analytics view permission.'
                : 'Maintenance cost and repair counts need the maintenance view permission.'
            }
          />
        ) : isError ? (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" aria-hidden="true" />
            <AlertTitle>Couldn&apos;t load the vehicle ranking</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : 'An unexpected error occurred.'}
            </AlertDescription>
          </Alert>
        ) : (
          <VehicleLeaderboardChart data={data} isLoading={isLoading} valueLabel={copy.valueLabel} format={copy.format} />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Narrows the union before rendering.
 *
 * Split out rather than inlined because each branch needs its own
 * `renderDetails` typed against that branch's source row -- there is no
 * single callback that can read `totalCost` and `totalAlerts` without
 * one of them being `any`.
 */
function VehicleLeaderboardChart({
  data,
  isLoading,
  valueLabel,
  format,
}: {
  data: VehicleLeaderboardData;
  isLoading: boolean;
  valueLabel: string;
  format: LeaderboardValueFormat;
}) {
  const emptyTitle = 'No vehicles to rank';

  if (data.metric === 'maintenance-cost') {
    return (
      <RankedBarChart
        rows={data.rows}
        format={format}
        valueLabel={valueLabel}
        isLoading={isLoading}
        renderDetails={(row) => [
          { label: 'Completed records', value: formatLeaderboardValue(row.source.recordCount, 'count') },
        ]}
        emptyTitle={emptyTitle}
        emptyDescription="No completed maintenance records in your scope carry a cost yet."
      />
    );
  }

  if (data.metric === 'repair-count') {
    return (
      <RankedBarChart
        rows={data.rows}
        format={format}
        valueLabel={valueLabel}
        isLoading={isLoading}
        renderDetails={(row) => [
          { label: 'Estimated cost', value: formatLeaderboardValue(row.source.totalCost, 'currency') },
        ]}
        emptyTitle={emptyTitle}
        emptyDescription="No completed maintenance records in your scope yet."
      />
    );
  }

  return (
    <RankedBarChart
      rows={data.rows}
      format={format}
      valueLabel={valueLabel}
      isLoading={isLoading}
      renderDetails={(row) => [
        {
          label: 'Predictive maintenance',
          value: formatLeaderboardValue(row.source.predictiveMaintenanceCount, 'count'),
        },
        { label: 'Fuel fraud', value: formatLeaderboardValue(row.source.fuelFraudCount, 'count') },
        { label: 'Worst severity', value: row.source.worstSeverity },
        { label: 'Estimated cost', value: formatLeaderboardValue(row.source.estimatedCost, 'currency') },
      ]}
      emptyTitle={emptyTitle}
      emptyDescription="No vehicle in your scope has an open predictive-maintenance or fuel-fraud finding."
    />
  );
}

function VehicleExportButton({ data }: { data: VehicleLeaderboardData }) {
  if (data.metric === 'maintenance-cost') {
    return (
      <ChartExportButton
        filename={slugifyChartFilename('vehicle-leaderboard-maintenance-cost')}
        sheetName="Vehicle Leaderboard"
        headers={['Rank', 'License Plate', 'Estimated Cost', 'Completed Records']}
        rows={() =>
          data.rows.map((row) => ({
            Rank: row.rank,
            'License Plate': row.source.license_plate,
            'Estimated Cost': row.source.totalCost,
            'Completed Records': row.source.recordCount,
          }))
        }
      />
    );
  }

  if (data.metric === 'repair-count') {
    return (
      <ChartExportButton
        filename={slugifyChartFilename('vehicle-leaderboard-repair-count')}
        sheetName="Vehicle Leaderboard"
        headers={['Rank', 'License Plate', 'Completed Repairs', 'Estimated Cost']}
        rows={() =>
          data.rows.map((row) => ({
            Rank: row.rank,
            'License Plate': row.source.license_plate,
            'Completed Repairs': row.source.count,
            'Estimated Cost': row.source.totalCost,
          }))
        }
      />
    );
  }

  return (
    <ChartExportButton
      filename={slugifyChartFilename('vehicle-leaderboard-open-alerts')}
      sheetName="Vehicle Leaderboard"
      headers={[
        'Rank',
        'License Plate',
        'Open Alerts',
        'Predictive Maintenance',
        'Fuel Fraud',
        'Worst Severity',
        'Estimated Cost',
      ]}
      rows={() =>
        data.rows.map((row) => ({
          Rank: row.rank,
          'License Plate': row.source.licensePlate,
          'Open Alerts': row.source.totalAlerts,
          'Predictive Maintenance': row.source.predictiveMaintenanceCount,
          'Fuel Fraud': row.source.fuelFraudCount,
          'Worst Severity': row.source.worstSeverity,
          'Estimated Cost': row.source.estimatedCost,
        }))
      }
    />
  );
}
