// modules/maintenance/services/maintenance-query.service.ts

import { queryBus } from '@/server/cqrs/query-bus';
import { GetRemindersQuery } from '../queries/get-reminders.query';
import { GetReminderByIdQuery } from '../queries/get-reminder-by-id.query';
import { GetMaintenanceStatsQuery } from '../queries/get-maintenance-stats.query';
import { GetOverdueRemindersQuery } from '../queries/get-overdue-reminders.query';
import { GetUpcomingRemindersQuery } from '../queries/get-upcoming-reminders.query';
import {
  Reminder,
  MaintenanceFilters,
  MaintenanceStats,
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
}

export const maintenanceQueryService = new MaintenanceQueryService();