// modules/maintenance/queries/handlers/get-reminder-by-id.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetReminderByIdQuery } from '../get-reminder-by-id.query';
import { MaintenanceRepository } from '@/modules/maintenance/repositories/maintenance.repository';
import { Reminder } from '@/shared/types/maintenance.types';
import { NotFoundError } from '@/server/errors/app.errors';

export class GetReminderByIdHandler
  implements IQueryHandler<GetReminderByIdQuery, Reminder>
{
  constructor(private readonly maintenanceRepo: MaintenanceRepository) {}

  async execute(query: GetReminderByIdQuery): Promise<Reminder> {
    const reminder = await this.maintenanceRepo.findById(query.reminderId, query.tenantId);
    if (!reminder) {
      throw new NotFoundError('Reminder not found');
    }
    return reminder;
  }
}