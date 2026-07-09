// modules/fuel/services/fuel-query.service.ts

import { queryBus } from '@/server/cqrs/query-bus';
import { GetFuelLogsQuery } from '../queries/get-fuel-logs.query';
import { GetFuelLogByIdQuery } from '../queries/get-fuel-log-by-id.query';
import { GetFuelStatsQuery } from '../queries/get-fuel-stats.query';
import { GetMonthlyFuelConsumptionQuery } from '../queries/get-monthly-fuel-consumption.query';
import { GetTopFuelConsumersQuery } from '../queries/get-top-fuel-consumers.query';
import { GetFuelKpisQuery } from '../queries/get-fuel-kpis.query';
import { GetAbnormalFuelConsumptionQuery } from '../queries/get-abnormal-fuel-consumption.query';
import {
  FuelLog,
  FuelFilters,
  FuelStats,
  FuelKpis,
  AbnormalFuelConsumptionRow,
} from '@/shared/types/fuel.types';
import { PaginatedResponse, PaginationParams } from '@/shared/types/common.types';

export class FuelQueryService {
  async getFilteredLogs(
    filters: FuelFilters,
    pagination: PaginationParams,
    tenantId: string
  ): Promise<PaginatedResponse<FuelLog>> {
    return queryBus.execute<PaginatedResponse<FuelLog>>(
      new GetFuelLogsQuery(filters, pagination, tenantId)
    );
  }

  async getFuelLogById(fuelLogId: string, tenantId: string): Promise<FuelLog> {
    return queryBus.execute<FuelLog>(
      new GetFuelLogByIdQuery(fuelLogId, tenantId)
    );
  }

  async getFuelStats(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelStats> {
    return queryBus.execute<FuelStats>(
      new GetFuelStatsQuery(tenantId, dateRange)
    );
  }

  async getMonthlyFuelConsumption(
    tenantId: string,
    months: number = 12
  ): Promise<Array<{ month: string; fuel: number; cost: number }>> {
    return queryBus.execute<Array<{ month: string; fuel: number; cost: number }>>(
      new GetMonthlyFuelConsumptionQuery(tenantId, months)
    );
  }

  async getTopFuelConsumers(
    tenantId: string,
    limit: number = 5
  ): Promise<Array<{ license_plate: string; totalFuel: number; totalCost: number }>> {
    return queryBus.execute<Array<{ license_plate: string; totalFuel: number; totalCost: number }>>(
      new GetTopFuelConsumersQuery(tenantId, limit)
    );
  }

  async getFuelKpis(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelKpis> {
    return queryBus.execute<FuelKpis>(new GetFuelKpisQuery(tenantId, dateRange));
  }

  async getAbnormalConsumption(
    tenantId: string,
    threshold: number = 2
  ): Promise<AbnormalFuelConsumptionRow[]> {
    return queryBus.execute<AbnormalFuelConsumptionRow[]>(
      new GetAbnormalFuelConsumptionQuery(tenantId, threshold)
    );
  }
}

export const fuelQueryService = new FuelQueryService();