// frontend/modules/transport-cost/hooks/useTransportCost.ts

import { useQuery } from '@tanstack/react-query';
import { transportCostApi, type TransportCostSourceRecordListParams } from '../services/transport-cost.api';
import type { CommandCentreGranularity, CommandCentreFilters } from '../types';

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
  commandCentreSummary: (periodStart: Date, periodEnd: Date, granularity: CommandCentreGranularity, filters: CommandCentreFilters) =>
    [...transportCostKeys.all, 'command-centre', 'summary', iso(periodStart), iso(periodEnd), granularity, filters] as const,
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

/**
 * Command Centre Slice A/B/C. ONE query backing the whole dashboard --
 * every KPI card, every chart, and the trust panel share this single
 * result, never one useQuery per widget (see the API method's own
 * header). `staleTime`/`retry` match the existing report query above;
 * `placeholderData` keeps the previous period's numbers on screen while
 * a filter change refetches, rather than flashing to a loading state on
 * every click -- the same UX convention useTransportCostSourceRecords
 * already uses.
 */
export function useCommandCentreSummary(
  periodStart: Date,
  periodEnd: Date,
  granularity: CommandCentreGranularity,
  filters: CommandCentreFilters = {}
) {
  return useQuery({
    queryKey: transportCostKeys.commandCentreSummary(periodStart, periodEnd, granularity, filters),
    queryFn: () => transportCostApi.getCommandCentreSummary(periodStart, periodEnd, granularity, filters),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
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
