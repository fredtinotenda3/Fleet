// frontend/modules/fuel/hooks/useFuelIntelligenceReport.ts

import { useQuery } from '@tanstack/react-query';
import { fuelIntelligenceApi } from '../services/fuelIntelligence.api';

export const fuelIntelligenceKeys = {
  all: ['fuel', 'intelligence-report'] as const,
  report: (month: string) => [...fuelIntelligenceKeys.all, month] as const,
};

/**
 * Fetches the Monthly Fuel & Fleet Intelligence Report (JSON) for one
 * `month` ("YYYY-MM"). `enabled` gates the request on a month actually
 * being selected -- the page passes `Boolean(month)` so no request
 * fires with an empty string while the picker is still being touched.
 */
export function useFuelIntelligenceReport(month: string, enabled: boolean = true) {
  return useQuery({
    queryKey: fuelIntelligenceKeys.report(month),
    queryFn: () => fuelIntelligenceApi.getReport(month),
    enabled: enabled && Boolean(month),
    staleTime: 60_000,
    retry: (failureCount, error) => {
      // Don't retry a 4xx (bad month format, permission denial) -- only
      // transient failures are worth a retry.
      const status = (error as { statusCode?: number })?.statusCode;
      if (status && status >= 400 && status < 500) return false;
      return failureCount < 2;
    },
  });
}
