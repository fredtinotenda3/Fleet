// modules/analytics/hooks/useAnalytics.ts

import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../api/analytics.api';
import { DateRange } from '@/shared/types/common.types';

export const useFleetKPIs = (dateRange?: DateRange) => {
  return useQuery({
    queryKey: ['analytics', 'kpis', dateRange],
    queryFn: () => analyticsApi.getFleetKPIs(dateRange),
  });
};

export const useOperationalMetrics = (dateRange: DateRange) => {
  return useQuery({
    queryKey: ['analytics', 'metrics', dateRange],
    queryFn: () => analyticsApi.getOperationalMetrics(dateRange),
    enabled: !!dateRange.startDate && !!dateRange.endDate,
  });
};

export const useCostBreakdown = (dateRange: DateRange) => {
  return useQuery({
    queryKey: ['analytics', 'cost-breakdown', dateRange],
    queryFn: () => analyticsApi.getCostBreakdown(dateRange),
    enabled: !!dateRange.startDate && !!dateRange.endDate,
  });
};

export const useFuelEfficiencyTrend = (months: number = 6) => {
  return useQuery({
    queryKey: ['analytics', 'fuel-efficiency', months],
    queryFn: () => analyticsApi.getFuelEfficiencyTrend(months),
  });
};

export const useMaintenanceForecast = () => {
  return useQuery({
    queryKey: ['analytics', 'maintenance-forecast'],
    queryFn: () => analyticsApi.getMaintenanceForecast(),
  });
};