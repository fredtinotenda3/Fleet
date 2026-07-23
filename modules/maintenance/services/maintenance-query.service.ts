
// modules/maintenance/services/maintenance-query.service.ts

import { queryBus } from '@/server/cqrs/query-bus';
import { GetRemindersQuery } from '../queries/get-reminders.query';
import { GetReminderByIdQuery } from '../queries/get-reminder-by-id.query';
import { GetMaintenanceStatsQuery } from '../queries/get-maintenance-stats.query';
import { GetOverdueRemindersQuery } from '../queries/get-overdue-reminders.query';
import { GetUpcomingRemindersQuery } from '../queries/get-upcoming-reminders.query';
import { GetMaintenanceCostTrendQuery } from '../queries/get-maintenance-cost-trend.query';
import { GetRepairFrequencyByVehicleQuery } from '../queries/get-repair-frequency-by-vehicle.query';
import { GetMostExpensiveVehiclesQuery } from '../queries/get-most-expensive-vehicles.query';
import { GetMaintenanceDowntimeEstimateQuery } from '../queries/get-maintenance-downtime-estimate.query';
import {
  Reminder,
  MaintenanceFilters,
  MaintenanceStats,
  MaintenanceCostTrendPoint,
  RepairFrequencyByVehicleRow,
  MostExpensiveVehicleRow,
  DowntimeEstimatePoint,
} from '@/shared/types/maintenance.types';
import { PaginatedResponse, PaginationParams } from '@/shared/types/common.types';

export class MaintenanceQueryService {
  async getFilteredReminders(
    filters: MaintenanceFilters,
    pagination: PaginationParams,
    tenantId: string
  ): Promise<PaginatedResponse<Reminder>> {
    return queryBus.execute<PaginatedResponse<Reminder>>(
      new GetRemindersQuery(filters, pagination, tenantId)
    );
  }

  async getReminderById(reminderId: string, tenantId: string): Promise<Reminder> {
    return queryBus.execute<Reminder>(
      new GetReminderByIdQuery(reminderId, tenantId)
    );
  }

  async getMaintenanceStats(tenantId: string): Promise<MaintenanceStats> {
    return queryBus.execute<MaintenanceStats>(
      new GetMaintenanceStatsQuery(tenantId)
    );
  }

  async getOverdueReminders(tenantId: string): Promise<Reminder[]> {
    return queryBus.execute<Reminder[]>(
      new GetOverdueRemindersQuery(tenantId)
    );
  }

  async getUpcomingReminders(
    tenantId: string,
    daysAhead: number = 7
  ): Promise<Reminder[]> {
    return queryBus.execute<Reminder[]>(
      new GetUpcomingRemindersQuery(tenantId, daysAhead)
    );
  }

  // ---- Enterprise analytics ----

  async getCostTrend(tenantId: string, months: number = 12): Promise<MaintenanceCostTrendPoint[]> {
    return queryBus.execute<MaintenanceCostTrendPoint[]>(
      new GetMaintenanceCostTrendQuery(tenantId, months)
    );
  }

  async getRepairFrequencyByVehicle(
    tenantId: string,
    limit: number = 20
  ): Promise<RepairFrequencyByVehicleRow[]> {
    return queryBus.execute<RepairFrequencyByVehicleRow[]>(
      new GetRepairFrequencyByVehicleQuery(tenantId, limit)
    );
  }

  async getMostExpensiveVehicles(
    tenantId: string,
    limit: number = 20
  ): Promise<MostExpensiveVehicleRow[]> {
    return queryBus.execute<MostExpensiveVehicleRow[]>(
      new GetMostExpensiveVehiclesQuery(tenantId, limit)
    );
  }

  async getDowntimeEstimate(
    tenantId: string,
    limit: number = 20
  ): Promise<DowntimeEstimatePoint[]> {
    return queryBus.execute<DowntimeEstimatePoint[]>(
      new GetMaintenanceDowntimeEstimateQuery(tenantId, limit)
    );
  }
}

export const maintenanceQueryService = new MaintenanceQueryService();