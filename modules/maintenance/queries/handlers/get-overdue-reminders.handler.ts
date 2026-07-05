// modules/maintenance/queries/handlers/get-overdue-reminders.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetOverdueRemindersQuery } from '../get-overdue-reminders.query';
import { MaintenanceRepository } from '@/modules/maintenance/repositories/maintenance.repository';
import { Reminder } from '@/shared/types/maintenance.types';

export class GetOverdueRemindersHandler
  implements IQueryHandler<GetOverdueRemindersQuery, Reminder[]>
{
  constructor(private readonly maintenanceRepo: MaintenanceRepository) {}

  async execute(query: GetOverdueRemindersQuery): Promise<Reminder[]> {
    return this.maintenanceRepo.getOverdueReminders(query.tenantId);
  }
}