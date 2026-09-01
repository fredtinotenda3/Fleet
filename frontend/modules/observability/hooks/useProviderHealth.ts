// frontend/modules/observability/hooks/useProviderHealth.ts

import { useQuery } from '@tanstack/react-query';
import { observabilityApi } from '../services/observability.api';

export const observabilityKeys = {
  all: ['observability'] as const,
  telematicsProviders: () => [...observabilityKeys.all, 'telematics-providers'] as const,
  outboxSummary: () => [...observabilityKeys.all, 'outbox-summary'] as const,
  summary: () => [...observabilityKeys.all, 'summary'] as const,
};

/**
 * GET /api/observability/telematics/providers, polled every 30s.
 *
 * 30s rather than the 10s used for the live map (useLiveMap.ts):
 * provider health changes on the order of minutes (a sync cadence, a
 * vendor outage), not seconds, and this is a cross-tenant admin view
 * an operator may leave open in a background tab -- no reason to hit
 * the endpoint any harder than the data actually changes.
 */
export function useProviderHealth(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: observabilityKeys.telematicsProviders(),
    queryFn: () => observabilityApi.getTelematicsProviderHealth(),
    enabled: options?.enabled ?? true,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
