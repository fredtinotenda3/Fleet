// modules/maintenance/commands/handlers/update-reminder.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { UpdateReminderCommand } from '../update-reminder.command';
import { MaintenanceRepository } from '@/modules/maintenance/repositories/maintenance.repository';
import { reminderUpdateSchema } from '@/shared/validations/maintenance.schema';
import { Reminder, ReminderStatus } from '@/shared/types/maintenance.types';
import { NotFoundError, ValidationError, AppError } from '@/server/errors/app.errors';
import { validateWithZod } from '@/shared/utils/validation.utils';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { ReminderUpdatedEvent } from '@/modules/maintenance/events/ReminderUpdatedEvent';

function addInterval(date: Date, interval: string): Date {
  const next = new Date(date);
  const amount = parseInt(interval, 10);
  const unit = interval.slice(-1);

  if (unit === 'd') next.setDate(next.getDate() + amount);
  else if (unit === 'm') next.setMonth(next.getMonth() + amount);
  else if (unit === 'y') next.setFullYear(next.getFullYear() + amount);

  return next;
}

const ALLOWED_FIELDS = [
  'license_plate',
  'title',
  'due_date',
  'status',
  'notes',
  'priority',
  'service_type',
  'category',
  'recurrence_interval',
  'assigned_to',
  'estimated_cost',
  'completion_date',
] as const;

export class UpdateReminderHandler
  implements ICommandHandler<UpdateReminderCommand, Reminder>
{
  constructor(private readonly maintenanceRepo: MaintenanceRepository) {}

  async execute(command: UpdateReminderCommand): Promise<Reminder> {
    const raw = command.rawData as Record<string, unknown>;

    const clean: Record<string, unknown> = { _id: command.reminderId };
    for (const field of ALLOWED_FIELDS) {
      if (raw[field] !== undefined) {
        clean[field] =
          field === 'estimated_cost' && raw[field] !== ''
            ? Number(raw[field])
            : raw[field];
      }
    }

    const result = await validateWithZod(reminderUpdateSchema, clean);
    if (!result.success || !result.data) {
      const fieldErrors = result.errors || {};
      const messages = Object.entries(fieldErrors)
        .map(([field, errs]) => `${field}: ${errs.join(', ')}`)
        .join('; ');
      throw new ValidationError(messages || 'Validation failed', fieldErrors);
    }

    const { _id, ...updateData } = result.data as Record<string, unknown>;

    const db = await connectToDatabase();

    if (updateData.license_plate) {
      const vehicle = await db.collection('tblvehicles').findOne({
        license_plate: String(updateData.license_plate).toUpperCase(),
        isDeleted: { $ne: true },
      });
      if (!vehicle) {
        throw new AppError(
          `Vehicle "${updateData.license_plate}" not found or deleted`,
          'VEHICLE_NOT_FOUND',
          400
        );
      }
      updateData.license_plate = String(updateData.license_plate).toUpperCase();
      updateData.orgUnitId = (vehicle as { orgUnitId?: string }).orgUnitId ?? null;
    }

    if (updateData.status === 'completed' && !updateData.completion_date) {
      updateData.completion_date = new Date();
    } else if (
      updateData.status &&
      updateData.status !== 'completed'
    ) {
      updateData.completion_date = null;
    }

    const existing = await this.maintenanceRepo.findById(
      command.reminderId,
      command.tenantId
    );
    if (!existing) {
      throw new NotFoundError('Reminder not found');
    }

    const updated = await this.maintenanceRepo.update(
      command.reminderId,
      updateData as Partial<Omit<Reminder, '_id' | 'tenantId' | 'createdAt' | 'createdBy'>>,
      command.tenantId,
      command.userId
    );

    if (!updated) {
      throw new NotFoundError('Reminder not found');
    }

    // Emit event
    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new ReminderUpdatedEvent(updated, updateData, {
      tenantId: command.tenantId,
      userId: command.userId,
      correlationId: command.commandName,
    }));

    const recurrenceInterval =
      (updateData.recurrence_interval as string | undefined) ??
      existing.recurrence_interval;

    if (
      updateData.status === 'completed' &&
      recurrenceInterval &&
      recurrenceInterval !== 'none'
    ) {
      const baseDueDate = updateData.due_date        ? new Date(updateData.due_date as string)
        : new Date(existing.due_date);

      const nextDueDate = addInterval(baseDueDate, recurrenceInterval);

      const nextReminder: Omit<
        Reminder,
        '_id' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt'
      > = {
        tenantId: command.tenantId,
        orgUnitId: updated.orgUnitId,
        license_plate: (updateData.license_plate as string | undefined) ?? existing.license_plate,
        title: (updateData.title as string | undefined) ?? existing.title,
        due_date: nextDueDate,
        status: 'pending' as ReminderStatus,
        notes:
          updateData.notes !== undefined
            ? (updateData.notes as string | undefined)
            : existing.notes,
        priority:
          (updateData.priority as Reminder['priority'] | undefined) ??
          existing.priority,
        category:
          (updateData.category as string | undefined) ?? existing.category,
        service_type:
          (updateData.service_type as string | undefined) ?? existing.service_type,
        recurrence_interval: recurrenceInterval,
        assigned_to:
          (updateData.assigned_to as string | undefined) ?? existing.assigned_to,
        estimated_cost:
          updateData.estimated_cost != null
            ? Number(updateData.estimated_cost)
            : existing.estimated_cost,
      };

      await this.maintenanceRepo.create(
        nextReminder,
        command.tenantId,
        command.userId
      );
    }

    return updated;
  }
}