// frontend/modules/workflows/components/WorkflowMetricsSummary.tsx

'use client';

import { StatisticCard, StatisticCards } from '@/frontend/shared/ui/data-display/StatisticCards';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';
import type { WorkflowMetrics } from '../types';

interface WorkflowMetricsSummaryProps {
  metrics: WorkflowMetrics | undefined;
  isLoading: boolean;
}

/** Renders workflowRepository.getWorkflowMetrics()'s aggregate as a row of statistic cards -- total instances (in the metrics window), a per-status breakdown, and average completion time for approved instances. */
export function WorkflowMetricsSummary({ metrics, isLoading }: WorkflowMetricsSummaryProps) {
  if (isLoading && !metrics) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="w-full h-24" />
        ))}
      </div>
    );
  }

  if (!metrics) {
    return null;
  }

  const approved = metrics.byStatus.approved ?? 0;
  const rejected = metrics.byStatus.rejected ?? 0;
  const pending = (metrics.byStatus.pending ?? 0) + (metrics.byStatus.in_progress ?? 0);

  const avgCompletion =
    metrics.avgCompletionTimeMs === null
      ? 'N/A'
      : formatDurationMs(metrics.avgCompletionTimeMs);

  return (
    <StatisticCards>
      <StatisticCard title="Total instances" value={metrics.total} description="In the reporting window" />
      <StatisticCard title="Pending / in progress" value={pending} />
      <StatisticCard title="Approved" value={approved} description={rejected > 0 ? `${rejected} rejected` : 'None rejected'} />
      <StatisticCard title="Avg. completion time" value={avgCompletion} />
    </StatisticCards>
  );
}

function formatDurationMs(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
