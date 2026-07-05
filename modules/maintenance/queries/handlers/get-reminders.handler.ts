// modules/maintenance/queries/handlers/get-reminders.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetRemindersQuery } from '../get-reminders.query';
import { MaintenanceRepository } from '@/modules/maintenance/repositories/maintenance.repository';
import { Reminder } from '@/shared/types/maintenance.types';
import { PaginatedResponse } from '@/shared/types/common.types';

export class GetRemindersHandler
  implements IQueryHandler<GetRemindersQuery, PaginatedResponse<Reminder>>
{
  constructor(private readonly maintenanceRepo: MaintenanceRepository) {}

  async execute(query: GetRemindersQuery): Promise<PaginatedResponse<Reminder>> {
    return this.maintenanceRepo.getFilteredReminders(
      query.filters,
      query.tenantId,
      query.pagination
    );
  }
}