// frontend/modules/transport-cost/hooks/useTransportCost.ts

import { useQuery } from '@tanstack/react-query';
import { transportCostApi, type TransportCostSourceRecordListParams } from '../services/transport-cost.api';

function iso(date: Date): string {
  return date.toISOString();
}

export const transportCostKeys = {
  all: ['transport-cost'] as const,
  sourceRecords: (params: TransportCostSourceRecordListParams) =>
    [...transportCostKeys.all, 'source-records', params] as const,
  report: (periodStart: Date, periodEnd: Date) =>
    [...transportCostKeys.all, 'report', iso(periodStart), iso(periodEnd)] as const,
  availableMonths: () => [...transportCostKeys.all, 'report', 'months'] as const,
  vehiclePostings: (contractedVehicleId: string, periodStart: Date, periodEnd: Date) =>
    [...transportCostKeys.all, 'report', 'vehicles', contractedVehicleId, iso(periodStart), iso(periodEnd)] as const,
};

export function useTransportCostSourceRecords(params: TransportCostSourceRecordListParams) {
  return useQuery({
    queryKey: transportCostKeys.sourceRecords(params),
    queryFn: () => transportCostApi.listSourceRecords(params),
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  });
}

/** Phase O4: Business Stream -> Vehicle allocation report for a period. */
export function useTransportCostReport(periodStart: Date, periodEnd: Date) {
  return useQuery({
    queryKey: transportCostKeys.report(periodStart, periodEnd),
    queryFn: () => transportCostApi.getAllocationReport(periodStart, periodEnd),
    staleTime: 30_000,
    retry: 1,
  });
}

/** Phase O4: the month picker's own data source -- every month with at least one posting. */
export function useTransportCostAvailableMonths() {
  return useQuery({
    queryKey: transportCostKeys.availableMonths(),
    queryFn: () => transportCostApi.getAvailableMonths(),
    staleTime: 60_000,
    retry: 1,
  });
}

/** Phase O4: drill-down to one vehicle's individual postings for a period. Disabled until a vehicle is selected. */
export function useTransportCostVehiclePostings(
  contractedVehicleId: string | null,
  periodStart: Date,
  periodEnd: Date
) {
  return useQuery({
    queryKey: transportCostKeys.vehiclePostings(contractedVehicleId ?? '', periodStart, periodEnd),
    queryFn: () => transportCostApi.getPostingsForVehicle(contractedVehicleId!, periodStart, periodEnd),
    enabled: Boolean(contractedVehicleId),
    staleTime: 30_000,
    retry: 1,
  });
}
