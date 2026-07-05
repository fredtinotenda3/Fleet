// modules/analytics/api/analytics.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import { DateRange } from '@/shared/types/common.types';
import type {
  FleetKPIs,
  OperationalMetrics,
  CostBreakdown,
  FuelEfficiencyTrend,
  MaintenanceForecast,
} from '../services/fleet-analytics.service';

export type {
  FleetKPIs,
  OperationalMetrics,
  CostBreakdown,
  FuelEfficiencyTrend,
  MaintenanceForecast,
};

const BASE_URL = '/analytics';

export const analyticsApi = {
  async getFleetKPIs(dateRange?: DateRange): Promise<FleetKPIs> {
    const params: Record<string, string | undefined> = {};
    if (dateRange?.startDate)
      params.startDate = dateRange.startDate.toISOString();
    if (dateRange?.endDate)
      params.endDate = dateRange.endDate.toISOString();

    return apiClient.get<FleetKPIs>(BASE_URL, {
      params: { action: 'kpis', ...params },
    });
  },

  async getOperationalMetrics(
    dateRange: DateRange
  ): Promise<OperationalMetrics> {
    return apiClient.get<OperationalMetrics>(BASE_URL, {
      params: {
        action: 'metrics',
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
      },
    });
  },

  async getCostBreakdown(dateRange: DateRange): Promise<CostBreakdown> {
    return apiClient.get<CostBreakdown>(BASE_URL, {
      params: {
        action: 'cost-breakdown',
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
      },
    });
  },

  async getFuelEfficiencyTrend(
    months: number = 6
  ): Promise<FuelEfficiencyTrend[]> {
    return apiClient.get<FuelEfficiencyTrend[]>(BASE_URL, {
      params: { action: 'fuel-efficiency', months },
    });
  },

  async getMaintenanceForecast(): Promise<MaintenanceForecast[]> {
    return apiClient.get<MaintenanceForecast[]>(BASE_URL, {
      params: { action: 'maintenance-forecast' },
    });
  },
};

export default analyticsApi;