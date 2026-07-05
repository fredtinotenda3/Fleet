// modules/maintenance/cqrs.register.ts

import { CommandBus } from '@/server/cqrs/command-bus';
import { QueryBus } from '@/server/cqrs/query-bus';
import { maintenanceRepository } from './repositories/maintenance.repository';

import { CreateReminderCommand } from './commands/create-reminder.command';
import { UpdateReminderCommand } from './commands/update-reminder.command';
import { DeleteReminderCommand } from './commands/delete-reminder.command';
import { CompleteReminderCommand } from './commands/complete-reminder.command';
import { BulkUpdateOverdueCommand } from './commands/bulk-update-overdue.command';

import { CreateReminderHandler } from './commands/handlers/create-reminder.handler';
import { UpdateReminderHandler } from './commands/handlers/update-reminder.handler';
import { DeleteReminderHandler } from './commands/handlers/delete-reminder.handler';
import { CompleteReminderHandler } from './commands/handlers/complete-reminder.handler';
import { BulkUpdateOverdueHandler } from './commands/handlers/bulk-update-overdue.handler';

import { GetRemindersQuery } from './queries/get-reminders.query';
import { GetReminderByIdQuery } from './queries/get-reminder-by-id.query';
import { GetMaintenanceStatsQuery } from './queries/get-maintenance-stats.query';
import { GetOverdueRemindersQuery } from './queries/get-overdue-reminders.query';
import { GetUpcomingRemindersQuery } from './queries/get-upcoming-reminders.query';

import { GetRemindersHandler } from './queries/handlers/get-reminders.handler';
import { GetReminderByIdHandler } from './queries/handlers/get-reminder-by-id.handler';
import { GetMaintenanceStatsHandler } from './queries/handlers/get-maintenance-stats.handler';
import { GetOverdueRemindersHandler } from './queries/handlers/get-overdue-reminders.handler';
import { GetUpcomingRemindersHandler } from './queries/handlers/get-upcoming-reminders.handler';

export function registerMaintenanceCqrsHandlers(
  commandBus: CommandBus,
  queryBus: QueryBus
): void {
  // Commands
  commandBus.register(CreateReminderCommand, new CreateReminderHandler(maintenanceRepository));
  commandBus.register(UpdateReminderCommand, new UpdateReminderHandler(maintenanceRepository));
  commandBus.register(DeleteReminderCommand, new DeleteReminderHandler(maintenanceRepository));
  commandBus.register(CompleteReminderCommand, new CompleteReminderHandler(maintenanceRepository));
  commandBus.register(BulkUpdateOverdueCommand, new BulkUpdateOverdueHandler(maintenanceRepository));

  // Queries
  queryBus.register(GetRemindersQuery, new GetRemindersHandler(maintenanceRepository));
  queryBus.register(GetReminderByIdQuery, new GetReminderByIdHandler(maintenanceRepository));
  queryBus.register(GetMaintenanceStatsQuery, new GetMaintenanceStatsHandler(maintenanceRepository));
  queryBus.register(GetOverdueRemindersQuery, new GetOverdueRemindersHandler(maintenanceRepository));
  queryBus.register(GetUpcomingRemindersQuery, new GetUpcomingRemindersHandler(maintenanceRepository));
}