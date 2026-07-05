// modules/inventory/events/inventory.events.ts
import { DomainEvent } from '@/server/events/base/DomainEvent';
import {
  SPARE_PART_CREATED,
  SPARE_PART_UPDATED,
  STOCK_RECEIVED,
  STOCK_CONSUMED,
  STOCK_ADJUSTED,
  STOCK_LOW_THRESHOLD_BREACHED,
} from '@/server/events/event-names';
import { SparePart, StockMovement } from '../types/inventory.types';

export class SparePartCreatedEvent extends DomainEvent {
  constructor(part: SparePart, metadata?: Record<string, unknown>) {
    super(SPARE_PART_CREATED, { entityId: part._id, entityType: 'spare_part', sku: part.sku, tenantId: part.tenantId }, metadata);
  }
}

export class SparePartUpdatedEvent extends DomainEvent {
  constructor(part: SparePart, changes: Partial<SparePart>, metadata?: Record<string, unknown>) {
    super(SPARE_PART_UPDATED, { entityId: part._id, entityType: 'spare_part', changes, tenantId: part.tenantId }, metadata);
  }
}

export class StockReceivedEvent extends DomainEvent {
  constructor(part: SparePart, movement: StockMovement, metadata?: Record<string, unknown>) {
    super(STOCK_RECEIVED, { entityId: part._id, entityType: 'spare_part', quantity: movement.quantity, balanceAfter: movement.balanceAfter, tenantId: part.tenantId }, metadata);
  }
}

export class StockConsumedEvent extends DomainEvent {
  constructor(part: SparePart, movement: StockMovement, metadata?: Record<string, unknown>) {
    super(STOCK_CONSUMED, { entityId: part._id, entityType: 'spare_part', quantity: movement.quantity, balanceAfter: movement.balanceAfter, workOrderId: movement.workOrderId, tenantId: part.tenantId }, metadata);
  }
}

export class StockAdjustedEvent extends DomainEvent {
  constructor(part: SparePart, movement: StockMovement, metadata?: Record<string, unknown>) {
    super(STOCK_ADJUSTED, { entityId: part._id, entityType: 'spare_part', quantity: movement.quantity, reason: movement.reason, tenantId: part.tenantId }, metadata);
  }
}

export class StockLowThresholdBreachedEvent extends DomainEvent {
  constructor(part: SparePart, metadata?: Record<string, unknown>) {
    super(STOCK_LOW_THRESHOLD_BREACHED, { entityId: part._id, entityType: 'spare_part', sku: part.sku, quantityOnHand: part.quantityOnHand, reorderThreshold: part.reorderThreshold, tenantId: part.tenantId }, metadata);
  }
}