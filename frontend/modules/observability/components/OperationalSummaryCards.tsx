// frontend/modules/observability/components/OperationalSummaryCards.tsx
'use client';

import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { StatisticCard, StatisticCards } from '@/frontend/shared/ui/data-display/StatisticCards';
import type { ProviderHealthAggregate, OutboxCounts } from '../types';
import { statusPresentation, statusLabel, formatCount } from '../utils/provider-health.utils';

interface OperationalSummaryCardsProps {
  providerAggregate: ProviderHealthAggregate;
  outboxCounts: OutboxCounts;
  /**
   * Optional: only present when the JOB_VIEW-gated summary endpoint
   * succeeded. See the permission note on ObservabilitySummaryResponse
   * in ../types -- this section degrades gracefully rather than
   * blocking the rest of the dashboard when that one fetch fails.
   */
  unhandledErrors: number | null;
}

export function OperationalSummaryCards({
  providerAggregate,
  outboxCounts,
  unhandledErrors,
}: OperationalSummaryCardsProps) {
  const aggregatePresentation = statusPresentation(providerAggregate.status);

  return (
    <StatisticCards>
      <StatisticCard
        title="Provider status"
        value={
          <Badge
            variant={aggregatePresentation.badgeVariant}
            className={`gap-1 text-base ${aggregatePresentation.badgeClassName}`}
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${aggregatePresentation.dotClassName}`}
              aria-hidden="true"
            />
            {statusLabel(providerAggregate.status)}
          </Badge>
        }
      />
      <StatisticCard title="Providers tracked" value={formatCount(providerAggregate.providers)} />
      <StatisticCard
        title="Unhealthy providers"
        value={formatCount(providerAggregate.unhealthy)}
        description={providerAggregate.unhealthy > 0 ? 'Degraded or unavailable' : 'All providers healthy'}
      />
      <StatisticCard
        title="Outbox pending"
        value={formatCount(outboxCounts.pending)}
      />
      <StatisticCard
        title="Outbox dead letters"
        value={formatCount(outboxCounts.dead_letter)}
        description={outboxCounts.dead_letter > 0 ? 'Events being permanently lost' : 'None'}
        className={outboxCounts.dead_letter > 0 ? 'ring-destructive/40' : undefined}
      />
      <StatisticCard
        title="Unhandled errors"
        value={unhandledErrors === null ? '\u2014' : formatCount(unhandledErrors)}
        description={unhandledErrors === null ? 'Unavailable (requires Job View)' : undefined}
      />
    </StatisticCards>
  );
}
