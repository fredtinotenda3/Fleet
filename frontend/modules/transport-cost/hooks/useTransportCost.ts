// frontend/modules/transport-cost/hooks/useTransportCost.ts

import { useQuery } from '@tanstack/react-query';
import { transportCostApi, type TransportCostSourceRecordListParams } from '../services/transport-cost.api';
import type { CommandCentreGranularity, CommandCentreFilters, NormalizationKind } from '../types';

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
  // OLIVINE LIVE OPERATING MODEL, SLICE 5.
  sourceRecordStatuses: (ids: string[]) =>
    [...transportCostKeys.all, 'source-records', 'statuses', [...ids].sort()] as const,
  operationalRecord: (sourceRecordId: string) =>
    [...transportCostKeys.all, 'source-records', sourceRecordId, 'operational'] as const,
  normalizationReviewQueue: (params: { kind?: NormalizationKind; page?: number; limit?: number }) =>
    [...transportCostKeys.all, 'normalization-review', params] as const,
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

// ── OLIVINE LIVE OPERATING MODEL, SLICE 5. ──────────────────────────

/** Bulk lifecycle status for the operational table's status column --
 *  one request per page of source-record ids, never one per row (see
 *  transportCostApi.getSourceRecordStatuses's own header). Disabled
 *  until there is at least one id, so an empty page never fires a
 *  request. A short staleTime: this drives row-action gating, and a
 *  stale "ready-to-post" row that's actually just been posted by
 *  someone else should self-correct quickly, not linger. */
export function useTransportCostSourceRecordStatuses(ids: string[]) {
  return useQuery({
    queryKey: transportCostKeys.sourceRecordStatuses(ids),
    queryFn: () => transportCostApi.getSourceRecordStatuses(ids),
    enabled: ids.length > 0,
    staleTime: 10_000,
    retry: 1,
  });
}

/** The transport-operation detail view's single data source. Disabled until an id is known. */
export function useOperationalRecord(sourceRecordId: string | null) {
  return useQuery({
    queryKey: transportCostKeys.operationalRecord(sourceRecordId ?? ''),
    queryFn: () => transportCostApi.getOperationalRecord(sourceRecordId!),
    enabled: Boolean(sourceRecordId),
    staleTime: 10_000,
    retry: 1,
  });
}

/** Phase O2 review queue -- reused, unmodified backend; this is the
 *  first frontend consumer (see app/api/transport-cost/normalization-
 *  review/route.ts's own header for why it existed but was never wired
 *  up before Slice 5). */
export function useNormalizationReviewQueue(params: { kind?: NormalizationKind; page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: transportCostKeys.normalizationReviewQueue(params),
    queryFn: () => transportCostApi.listNormalizationReviewQueue(params),
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  });
}
