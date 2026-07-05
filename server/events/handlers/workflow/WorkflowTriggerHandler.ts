// server/events/handlers/workflow/WorkflowTriggerHandler.ts

import { IEventHandler } from '../../base/IEventHandler';
import { DomainEvent } from '../../base/DomainEvent';
import { workflowTriggerService } from '@/modules/workflows/services/workflow-trigger.service';

export class WorkflowTriggerHandler implements IEventHandler<DomainEvent> {
  async handle(event: DomainEvent): Promise<void> {
    const payload = event.payload;
    const entityId = payload.entityId as string;
    const entityType = payload.entityType as string;
    const tenantId = (event.metadata?.tenantId as string) || 'default';
    const userId = (event.metadata?.userId as string) || 'system';

    const triggerEvent = this.mapEventToTrigger(event.eventName);
    if (!triggerEvent) return;

    await workflowTriggerService.fireEvent(
      triggerEvent,
      entityId,
      entityType,
      { ...payload, eventName: event.eventName },
      userId,
      tenantId,
    );
  }

  private mapEventToTrigger(eventName: string): string | null {
    const mapping: Record<string, string> = {
      'VehicleCreated': 'vehicle.created',
      'VehicleUpdated': 'vehicle.updated',
      'VehicleDeleted': 'vehicle.deleted',
      'ExpenseCreated': 'expense.created',
      'ExpenseUpdated': 'expense.updated',
      'ExpenseDeleted': 'expense.deleted',
      'FuelLogged': 'fuel.logged',
      'ReminderCreated': 'maintenance.created',
      'ReminderCompleted': 'maintenance.completed',
      'ReminderOverdue': 'maintenance.overdue',
      'TripCreated': 'trip.created',
      'TripCompleted': 'trip.completed',
      'InvoicePaid': 'billing.paid',
      'OrganizationCreated': 'organization.created',
      'MemberJoined': 'organization.member_joined',
      'TelematicsDataIngested': 'telematics.ingested',
    };
    return mapping[eventName] || null;
  }
}