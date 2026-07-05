// modules/workorders/events/workorder.events.ts
import { DomainEvent } from '@/server/events/base/DomainEvent';
import {
  WORK_ORDER_CREATED,
  WORK_ORDER_ASSIGNED,
  WORK_ORDER_STATUS_CHANGED,
  WORK_ORDER_PARTS_CONSUMED,
  WORK_ORDER_COMPLETED,
  WORK_ORDER_CANCELLED,
} from '@/server/events/event-names';
import { WorkOrder } from '../types/workorder.types';

export class WorkOrderCreatedEvent extends DomainEvent {
  constructor(wo: WorkOrder, metadata?: Record<string, unknown>) {
    super(WORK_ORDER_CREATED, { entityId: wo._id, entityType: 'work_order', license_plate: wo.license_plate, priority: wo.priority, tenantId: wo.tenantId }, metadata);
  }
}

export class WorkOrderAssignedEvent extends DomainEvent {
  constructor(wo: WorkOrder, metadata?: Record<string, unknown>) {
    super(WORK_ORDER_ASSIGNED, { entityId: wo._id, entityType: 'work_order', assignedMechanicId: wo.assignedMechanicId, bayId: wo.bayId, tenantId: wo.tenantId }, metadata);
  }
}

export class WorkOrderStatusChangedEvent extends DomainEvent {
  constructor(wo: WorkOrder, previousStatus: string, metadata?: Record<string, unknown>) {
    super(WORK_ORDER_STATUS_CHANGED, { entityId: wo._id, entityType: 'work_order', previousStatus, status: wo.status, license_plate: wo.license_plate, tenantId: wo.tenantId }, metadata);
  }
}

export class WorkOrderPartsConsumedEvent extends DomainEvent {
  constructor(wo: WorkOrder, sparePartId: string, quantity: number, metadata?: Record<string, unknown>) {
    super(WORK_ORDER_PARTS_CONSUMED, { entityId: wo._id, entityType: 'work_order', sparePartId, quantity, tenantId: wo.tenantId }, metadata);
  }
}

export class WorkOrderCompletedEvent extends DomainEvent {
  constructor(wo: WorkOrder, metadata?: Record<string, unknown>) {
    super(WORK_ORDER_COMPLETED, { entityId: wo._id, entityType: 'work_order', license_plate: wo.license_plate, totalCost: wo.totalCost, tenantId: wo.tenantId }, metadata);
  }
}

export class WorkOrderCancelledEvent extends DomainEvent {
  constructor(wo: WorkOrder, metadata?: Record<string, unknown>) {
    super(WORK_ORDER_CANCELLED, { entityId: wo._id, entityType: 'work_order', reason: wo.cancelledReason, tenantId: wo.tenantId }, metadata);
  }
}