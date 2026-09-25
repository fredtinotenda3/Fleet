// frontend/modules/transport-cost/hooks/useTransportCost.ts

import { useQuery } from '@tanstack/react-query';
import { transportCostApi, type TransportCostSourceRecordListParams } from '../services/transport-cost.api';
import type {
  CommandCentreGranularity,
  CommandCentreFilters,
  CommandCentreDrillDownDimension,
  DataQualityIssueKind,
  NormalizationKind,
} from '../types';

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
  // GAP-CLOSURE PASS, Objectives 1/3/5.
  auditHistory: (sourceRecordId: string, page: number) =>
    [...transportCostKeys.all, 'source-records', sourceRecordId, 'audit', page] as const,
  pendingMasterData: () => [...transportCostKeys.all, 'master-data', 'pending'] as const,
  // GAP-CLOSURE PASS, Objective 4.
  commandCentreDrillDown: (
    periodStart: Date,
    periodEnd: Date,
    filters: CommandCentreFilters,
    constraint?: { dimension: CommandCentreDrillDownDimension; key: string }
  ) => [...transportCostKeys.all, 'command-centre', 'drilldown', iso(periodStart), iso(periodEnd), filters, constraint ?? null] as const,
  dataQualityIssueEvidence: (issue: DataQualityIssueKind, periodStart: Date, periodEnd: Date) =>
    [...transportCostKeys.all, 'command-centre', 'data-quality', issue, iso(periodStart), iso(periodEnd)] as const,
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

/**
 * GAP-CLOSURE PASS, Objective 4. Command Centre metric -> underlying
 * evidence. `open` gates the request so clicking a bar/card/trend-point
 * is what triggers the fetch, not every render of the page that could
 * open this dialog -- same pattern as useTransportCostVehiclePostings's
 * own `enabled: Boolean(contractedVehicleId)` above.
 */
export function useCommandCentreDrillDown(
  open: boolean,
  periodStart: Date,
  periodEnd: Date,
  filters: CommandCentreFilters = {},
  constraint?: { dimension: CommandCentreDrillDownDimension; key: string }
) {
  return useQuery({
    queryKey: transportCostKeys.commandCentreDrillDown(periodStart, periodEnd, filters, constraint),
    queryFn: () => transportCostApi.getCommandCentreDrillDown(periodStart, periodEnd, filters, constraint),
    enabled: open,
    staleTime: 30_000,
    retry: 1,
  });
}

/** GAP-CLOSURE PASS, Objective 4. The evidence rows behind one data-quality trust-panel count. Disabled until an issue is selected (a click on a `DataQualityStat`). */
export function useDataQualityIssueEvidence(
  issue: DataQualityIssueKind | null,
  periodStart: Date,
  periodEnd: Date
) {
  return useQuery({
    queryKey: transportCostKeys.dataQualityIssueEvidence(issue ?? ('missingCostFacingCompany' as DataQualityIssueKind), periodStart, periodEnd),
    queryFn: () => transportCostApi.getDataQualityIssueEvidence(issue!, periodStart, periodEnd),
    enabled: Boolean(issue),
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

/** GAP-CLOSURE PASS, Objective 1: the operation detail page's audit-history section. Disabled until an id is known -- same convention as useOperationalRecord. */
export function useSourceRecordAuditHistory(sourceRecordId: string | null, page: number = 1, limit: number = 20) {
  return useQuery({
    queryKey: transportCostKeys.auditHistory(sourceRecordId ?? '', page),
    queryFn: () => transportCostApi.getSourceRecordAuditHistory(sourceRecordId!, { page, limit }),
    enabled: Boolean(sourceRecordId),
    placeholderData: (prev) => prev,
    staleTime: 15_000,
    retry: 1,
  });
}

/** GAP-CLOSURE PASS, Objectives 1/3/5: transporters/vehicles awaiting confirm/reject -- the "Pending master data" tab on the review queue page. */
export function usePendingMasterData() {
  return useQuery({
    queryKey: transportCostKeys.pendingMasterData(),
    queryFn: () => transportCostApi.listPendingMasterData(),
    staleTime: 15_000,
  });
}
