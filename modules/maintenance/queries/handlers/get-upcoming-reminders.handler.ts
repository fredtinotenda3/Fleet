// modules/maintenance/queries/handlers/get-upcoming-reminders.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetUpcomingRemindersQuery } from '../get-upcoming-reminders.query';
import { MaintenanceRepository } from '@/modules/maintenance/repositories/maintenance.repository';
import { Reminder } from '@/shared/types/maintenance.types';

export class GetUpcomingRemindersHandler
  implements IQueryHandler<GetUpcomingRemindersQuery, Reminder[]>
{
  constructor(private readonly maintenanceRepo: MaintenanceRepository) {}

  async execute(query: GetUpcomingRemindersQuery): Promise<Reminder[]> {
    return this.maintenanceRepo.getUpcomingReminders(query.tenantId, query.daysAhead);
  }
}