// frontend/modules/transport-cost/hooks/useTransportCost.ts

import { useQuery } from '@tanstack/react-query';
import { transportCostApi, type TransportCostSourceRecordListParams } from '../services/transport-cost.api';

export const transportCostKeys = {
  all: ['transport-cost'] as const,
  sourceRecords: (params: TransportCostSourceRecordListParams) =>
    [...transportCostKeys.all, 'source-records', params] as const,
};

export function useTransportCostSourceRecords(params: TransportCostSourceRecordListParams) {
  return useQuery({
    queryKey: transportCostKeys.sourceRecords(params),
    queryFn: () => transportCostApi.listSourceRecords(params),
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  });
}
