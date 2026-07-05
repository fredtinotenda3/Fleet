// modules/procurement/events/procurement.events.ts
import { DomainEvent } from '@/server/events/base/DomainEvent';
import {
  PURCHASE_REQUEST_CREATED,
  PURCHASE_REQUEST_APPROVED,
  PURCHASE_REQUEST_REJECTED,
  PURCHASE_ORDER_CREATED,
  PURCHASE_ORDER_SENT,
  PURCHASE_ORDER_RECEIVED,
  PURCHASE_ORDER_CANCELLED,
} from '@/server/events/event-names';
import { PurchaseRequest, PurchaseOrder } from '../types/procurement.types';

export class PurchaseRequestCreatedEvent extends DomainEvent {
  constructor(pr: PurchaseRequest, metadata?: Record<string, unknown>) {
    super(PURCHASE_REQUEST_CREATED, { entityId: pr._id, entityType: 'purchase_request', estimatedTotal: pr.estimatedTotal, tenantId: pr.tenantId }, metadata);
  }
}

export class PurchaseRequestApprovedEvent extends DomainEvent {
  constructor(pr: PurchaseRequest, metadata?: Record<string, unknown>) {
    super(PURCHASE_REQUEST_APPROVED, { entityId: pr._id, entityType: 'purchase_request', approvedBy: pr.approvedBy, tenantId: pr.tenantId }, metadata);
  }
}

export class PurchaseRequestRejectedEvent extends DomainEvent {
  constructor(pr: PurchaseRequest, metadata?: Record<string, unknown>) {
    super(PURCHASE_REQUEST_REJECTED, { entityId: pr._id, entityType: 'purchase_request', reason: pr.rejectionReason, tenantId: pr.tenantId }, metadata);
  }
}

export class PurchaseOrderCreatedEvent extends DomainEvent {
  constructor(po: PurchaseOrder, metadata?: Record<string, unknown>) {
    super(PURCHASE_ORDER_CREATED, { entityId: po._id, entityType: 'purchase_order', vendorId: po.vendorId, totalAmount: po.totalAmount, tenantId: po.tenantId }, metadata);
  }
}

export class PurchaseOrderSentEvent extends DomainEvent {
  constructor(po: PurchaseOrder, metadata?: Record<string, unknown>) {
    super(PURCHASE_ORDER_SENT, { entityId: po._id, entityType: 'purchase_order', vendorId: po.vendorId, tenantId: po.tenantId }, metadata);
  }
}

export class PurchaseOrderReceivedEvent extends DomainEvent {
  constructor(po: PurchaseOrder, metadata?: Record<string, unknown>) {
    super(PURCHASE_ORDER_RECEIVED, { entityId: po._id, entityType: 'purchase_order', status: po.status, tenantId: po.tenantId }, metadata);
  }
}

export class PurchaseOrderCancelledEvent extends DomainEvent {
  constructor(po: PurchaseOrder, metadata?: Record<string, unknown>) {
    super(PURCHASE_ORDER_CANCELLED, { entityId: po._id, entityType: 'purchase_order', tenantId: po.tenantId }, metadata);
  }
}