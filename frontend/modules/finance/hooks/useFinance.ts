// frontend/modules/finance/hooks/useFinance.ts

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  financeApi,
  startOfMonth,
  endOfMonth,
  previousMonthRange,
} from '../services/finance.api';
import type { CostPerKmTrend, OrganizationFinanceSettings } from '../types';

const financeKeys = {
  costPerKm: (vehicleId: string, from: string, to: string) =>
    ['finance', 'cost-per-km', vehicleId, from, to] as const,
  allocations: (vehicleId: string, from: string, to: string) =>
    ['finance', 'allocations', vehicleId, from, to] as const,
  reconciliation: (from: string, to: string) => ['finance', 'gl-reconciliation', from, to] as const,
  submissions: (from: string, to: string) => ['finance', 'gl-submissions', from, to] as const,
  settings: ['finance', 'settings'] as const,
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Month-to-date cost-per-km for one vehicle. `vehicleId` is the vehicle _id, not a plate. */
export function useVehicleCostPerKm(vehicleId: string, from: Date, to: Date, enabled = true) {
  return useQuery({
    queryKey: financeKeys.costPerKm(vehicleId, iso(from), iso(to)),
    queryFn: () => financeApi.getCostPerKm(vehicleId, from, to),
    enabled: enabled && Boolean(vehicleId),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

/**
 * Current month vs previous month cost-per-km for one vehicle.
 *
 * Two separate requests rather than one, because there is no backend
 * trend endpoint and inventing one would be a backend change. The delta
 * is derived here, and `direction` is 'unknown' whenever either side is
 * null: the backend returns null (not zero) for a period with no
 * distance, so treating null as 0 would render "100% improvement" for a
 * vehicle that simply did not move.
 */
export function useVehicleCostPerKmTrend(vehicleId: string, enabled = true) {
  const now = new Date();
  const current = { from: startOfMonth(now), to: now };
  const previous = previousMonthRange(now);

  const currentQuery = useVehicleCostPerKm(vehicleId, current.from, current.to, enabled);
  const previousQuery = useVehicleCostPerKm(vehicleId, previous.from, previous.to, enabled);

  const trend: CostPerKmTrend = buildTrend(
    currentQuery.data?.costPerKm ?? null,
    previousQuery.data?.costPerKm ?? null
  );

  return {
    current: currentQuery.data,
    previous: previousQuery.data,
    trend,
    isLoading: currentQuery.isLoading || previousQuery.isLoading,
    isError: currentQuery.isError,
    refetch: () => {
      void currentQuery.refetch();
      void previousQuery.refetch();
    },
  };
}

/**
 * Derives a trend from two cost-per-km figures.
 *
 * A LOWER cost per km is an improvement, so `direction` describes the
 * cost movement ('up' = got more expensive) and the consuming component
 * decides the colour. Encoding "good/bad" here would bake a judgement
 * into a data helper and make it wrong the moment it is reused for a
 * metric where up is good.
 */
export function buildTrend(current: number | null, previous: number | null): CostPerKmTrend {
  if (current == null || previous == null) {
    return { current, previous, deltaPct: null, direction: 'unknown' };
  }
  if (previous === 0) {
    // Avoid Infinity%: a jump from zero has no meaningful percentage.
    return { current, previous, deltaPct: null, direction: current > 0 ? 'up' : 'flat' };
  }
  const deltaPct = ((current - previous) / Math.abs(previous)) * 100;
  const direction = Math.abs(deltaPct) < 0.5 ? 'flat' : deltaPct > 0 ? 'up' : 'down';
  return { current, previous, deltaPct: Math.round(deltaPct * 10) / 10, direction };
}

/** Allocation postings behind a vehicle's cost figure — the drill-down list. */
export function useVehicleAllocations(vehicleId: string, from: Date, to: Date, enabled = true) {
  return useQuery({
    queryKey: financeKeys.allocations(vehicleId, iso(from), iso(to)),
    queryFn: () => financeApi.getAllocations(vehicleId, from, to),
    enabled: enabled && Boolean(vehicleId),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

/** GL reconciliation report for a period. */
export function useGLReconciliation(from: Date, to: Date) {
  return useQuery({
    queryKey: financeKeys.reconciliation(iso(from), iso(to)),
    queryFn: () => financeApi.getReconciliationReport(from, to),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

/** Every GL submission in a period, so a restated figure is visible rather than just its latest value. */
export function useGLSubmissions(from: Date, to: Date) {
  return useQuery({
    queryKey: financeKeys.submissions(iso(from), iso(to)),
    queryFn: () => financeApi.getSubmissions(from, to),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

/** Organization finance settings: reporting currency, FX policy, depreciation defaults. */
export function useFinanceSettings() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: financeKeys.settings,
    queryFn: () => financeApi.getSettings(),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const mutation = useMutation({
    mutationFn: (data: OrganizationFinanceSettings) => financeApi.updateSettings(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financeKeys.settings });
      // A reporting-currency or FX-policy change alters every derived cost
      // figure, so drop the whole finance cache rather than only settings.
      void queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
  });

  return { ...query, mutation };
}

export { startOfMonth, endOfMonth, previousMonthRange };