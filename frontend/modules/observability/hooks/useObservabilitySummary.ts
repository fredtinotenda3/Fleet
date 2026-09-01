// frontend/modules/observability/hooks/useObservabilitySummary.ts

import { useQuery } from '@tanstack/react-query';
import { observabilityApi } from '../services/observability.api';
import { observabilityKeys } from './useProviderHealth';

/**
 * GET /api/observability/summary, polled every 30s.
 *
 * NOTE: this endpoint is gated on Permission.JOB_VIEW server-side, not
 * PLATFORM_VIEW like the other two observability endpoints (see the
 * route's own comment and the note on ObservabilitySummaryResponse in
 * ../types). A PLATFORM_VIEW-only caller without JOB_VIEW gets a 403
 * from this specific query -- today that can't happen because only
 * Role.SUPER_ADMIN holds either permission, but the possibility is why
 * OperationalDashboardPage treats this query's failure as a
 * section-level error rather than blocking the whole page.
 */
export function useObservabilitySummary(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: observabilityKeys.summary(),
    queryFn: () => observabilityApi.getSummary(),
    enabled: options?.enabled ?? true,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
