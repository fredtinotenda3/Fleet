// modules/workshop/events/workshop.events.ts
import { DomainEvent } from '@/server/events/base/DomainEvent';
import { WORKSHOP_BAY_CREATED, WORKSHOP_BAY_STATUS_CHANGED, MECHANIC_ASSIGNED, MECHANIC_UNASSIGNED } from '@/server/events/event-names';
import { WorkshopBay, MechanicAssignment } from '../types/workshop.types';

export class WorkshopBayCreatedEvent extends DomainEvent {
  constructor(bay: WorkshopBay, metadata?: Record<string, unknown>) {
    super(WORKSHOP_BAY_CREATED, { entityId: bay._id, entityType: 'workshop_bay', bayNumber: bay.bayNumber, tenantId: bay.tenantId }, metadata);
  }
}

export class WorkshopBayStatusChangedEvent extends DomainEvent {
  constructor(bay: WorkshopBay, previousStatus: string, metadata?: Record<string, unknown>) {
    super(WORKSHOP_BAY_STATUS_CHANGED, { entityId: bay._id, entityType: 'workshop_bay', previousStatus, status: bay.status, tenantId: bay.tenantId }, metadata);
  }
}

export class MechanicAssignedEvent extends DomainEvent {
  constructor(assignment: MechanicAssignment, metadata?: Record<string, unknown>) {
    super(MECHANIC_ASSIGNED, { entityId: assignment._id, entityType: 'mechanic_assignment', mechanicId: assignment.mechanicId, bayId: assignment.bayId, workOrderId: assignment.workOrderId, tenantId: assignment.tenantId }, metadata);
  }
}

export class MechanicUnassignedEvent extends DomainEvent {
  constructor(assignment: MechanicAssignment, metadata?: Record<string, unknown>) {
    super(MECHANIC_UNASSIGNED, { entityId: assignment._id, entityType: 'mechanic_assignment', mechanicId: assignment.mechanicId, tenantId: assignment.tenantId }, metadata);
  }
}