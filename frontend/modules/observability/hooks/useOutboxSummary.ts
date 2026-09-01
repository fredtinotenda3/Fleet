// frontend/modules/observability/hooks/useOutboxSummary.ts

import { useQuery } from '@tanstack/react-query';
import { observabilityApi } from '../services/observability.api';
import { observabilityKeys } from './useProviderHealth';

/**
 * GET /api/observability/outbox, polled every 30s -- same cadence and
 * reasoning as useProviderHealth: this is a platform admin view, and
 * the dead-letter/pending counts it reports move on the order of the
 * outbox processor's own poll interval, not sub-second.
 */
export function useOutboxSummary(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: observabilityKeys.outboxSummary(),
    queryFn: () => observabilityApi.getOutboxSummary(),
    enabled: options?.enabled ?? true,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
