// modules/maintenance/services/maintenance-query.service.ts

import { queryBus } from '@/server/cqrs/query-bus';
import { GetRemindersQuery } from '../queries/get-reminders.query';
import { GetReminderByIdQuery } from '../queries/get-reminder-by-id.query';
import { GetOverdueRemindersQuery } from '../queries/get-overdue-reminders.query';
import { GetUpcomingRemindersQuery } from '../queries/get-upcoming-reminders.query';
import {
  Reminder,
  MaintenanceFilters,
  MaintenanceStats,
  MaintenanceCostTrendPoint,
  RepairFrequencyByVehicleRow,
  MostExpensiveVehicleRow,
  DowntimeEstimatePoint,
  VehicleMaintenanceInsights,
} from '@/shared/types/maintenance.types';
import { PaginatedResponse, PaginationParams } from '@/shared/types/common.types';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { maintenanceRepository } from '../repositories/maintenance.repository';

// FIX (Phase B -- repository/analytics scoping completeness): same
// change as the other three domains -- the 6 analytics methods below
// used to route through queryBus -> Query class -> Handler, none of
// which carried `context`. These now call the (already org-unit-scoped)
// repository directly. CRUD/list methods (getFilteredReminders,
// getReminderById) and the cross-tenant cron methods (getOverdueReminders,
// getUpcomingReminders -- intentionally NOT org-unit scoped, see
// MaintenanceRepository) are unchanged and still routed through the CQRS
// bus.
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

  /** Vehicle-Level Analytics: pass licensePlate to narrow to a single vehicle. */
  async getMaintenanceStats(
    tenantId: string,
    licensePlate?: string,
    context?: TenantContext
  ): Promise<MaintenanceStats> {
    return maintenanceRepository.getMaintenanceStats(tenantId, licensePlate, context);
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

  /** Vehicle-Level Analytics: pass licensePlate to narrow the trend to a single vehicle. */
  async getCostTrend(
    tenantId: string,
    months: number = 12,
    licensePlate?: string,
    context?: TenantContext
  ): Promise<MaintenanceCostTrendPoint[]> {
    return maintenanceRepository.getCostTrend(tenantId, months, licensePlate, context);
  }

  async getRepairFrequencyByVehicle(
    tenantId: string,
    limit: number = 20,
    context?: TenantContext
  ): Promise<RepairFrequencyByVehicleRow[]> {
    return maintenanceRepository.getRepairFrequencyByVehicle(tenantId, limit, context);
  }

  async getMostExpensiveVehicles(
    tenantId: string,
    limit: number = 20,
    context?: TenantContext
  ): Promise<MostExpensiveVehicleRow[]> {
    return maintenanceRepository.getMostExpensiveVehicles(tenantId, limit, context);
  }

  async getDowntimeEstimate(
    tenantId: string,
    limit: number = 20,
    context?: TenantContext
  ): Promise<DowntimeEstimatePoint[]> {
    return maintenanceRepository.getDowntimeEstimate(tenantId, limit, context);
  }

  // ---- Vehicle-Level Analytics ----

  async getVehicleMaintenanceInsights(
    tenantId: string,
    licensePlate: string,
    context?: TenantContext
  ): Promise<VehicleMaintenanceInsights> {
    return maintenanceRepository.getVehicleMaintenanceInsights(tenantId, licensePlate, context);
  }
}

export const maintenanceQueryService = new MaintenanceQueryService();