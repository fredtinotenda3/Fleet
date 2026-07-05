// modules/maintenance/commands/handlers/create-reminder.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { CreateReminderCommand } from '../create-reminder.command';
import { MaintenanceRepository } from '@/modules/maintenance/repositories/maintenance.repository';
import { reminderCreateSchema } from '@/shared/validations/maintenance.schema';
import { Reminder } from '@/shared/types/maintenance.types';
import { ValidationError, AppError } from '@/server/errors/app.errors';
import { validateWithZod } from '@/shared/utils/validation.utils';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { ReminderCreatedEvent } from '@/modules/maintenance/events/ReminderCreatedEvent';

export class CreateReminderHandler
  implements ICommandHandler<CreateReminderCommand, Reminder>
{
  constructor(private readonly maintenanceRepo: MaintenanceRepository) {}

  async execute(command: CreateReminderCommand): Promise<Reminder> {
    const raw = command.rawData as Record<string, unknown>;

    const clean: Record<string, unknown> = {
      license_plate: raw.license_plate,
      title: raw.title,
      due_date: raw.due_date,
      status: raw.status ?? 'pending',
      notes: raw.notes,
      priority: raw.priority,
      service_type: raw.service_type,
      category: raw.category,
      recurrence_interval: raw.recurrence_interval,
      assigned_to: raw.assigned_to,
      estimated_cost:
        raw.estimated_cost !== undefined && raw.estimated_cost !== ''
          ? Number(raw.estimated_cost)
          : undefined,
    };

    const payload = Object.fromEntries(
      Object.entries(clean).filter(([, v]) => v !== undefined && v !== null && v !== '')
    );

    const result = await validateWithZod(reminderCreateSchema, payload);
    if (!result.success || !result.data) {
      const fieldErrors = result.errors || {};
      const messages = Object.entries(fieldErrors)
        .map(([field, errs]) => `${field}: ${errs.join(', ')}`)
        .join('; ');
      throw new ValidationError(messages || 'Validation failed', fieldErrors);
    }

    const validated = result.data;

    const db = await connectToDatabase();
    const vehicle = await db.collection('tblvehicles').findOne({
      license_plate: String(validated.license_plate).toUpperCase(),
      isDeleted: { $ne: true },
    });

    if (!vehicle) {
      throw new AppError(
        `Vehicle "${validated.license_plate}" not found or deleted`,
        'VEHICLE_NOT_FOUND',
        400
      );
    }

    const reminderData: Omit<
      Reminder,
      '_id' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt'
    > = {
      tenantId: command.tenantId,
      license_plate: String(validated.license_plate).toUpperCase(),
      title: String(validated.title),
      due_date: new Date(validated.due_date as unknown as string),
      status: validated.status ?? 'pending',
      notes: validated.notes ? String(validated.notes) : undefined,
      priority: validated.priority,
      service_type: validated.service_type
        ? String(validated.service_type)
        : undefined,
      category: validated.category ? String(validated.category) : undefined,
      recurrence_interval: validated.recurrence_interval
        ? String(validated.recurrence_interval)
        : undefined,
      assigned_to: validated.assigned_to
        ? String(validated.assigned_to)
        : undefined,
      estimated_cost:
        validated.estimated_cost != null
          ? Number(validated.estimated_cost)
          : undefined,
      ...(validated.status === 'completed' && {
        completion_date: new Date(),
      }),
    };

    const created = await this.maintenanceRepo.create(
      reminderData,
      command.tenantId,
      command.userId
    );

    // Emit event
    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new ReminderCreatedEvent(created, {
      tenantId: command.tenantId,
      userId: command.userId,
      correlationId: command.commandName,
    }));

    return created;
  }
}