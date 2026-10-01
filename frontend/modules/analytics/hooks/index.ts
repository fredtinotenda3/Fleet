// frontend/modules/analytics/hooks/index.ts

import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../services';

export function useDataQualityCoverage() {
  return useQuery({
    queryKey: ['analytics', 'data-quality-coverage'],
    queryFn: () => analyticsApi.getDataQualityCoverage(),
    staleTime: 5 * 60_000,
  });
}
