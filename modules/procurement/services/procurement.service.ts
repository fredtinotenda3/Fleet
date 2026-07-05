// modules/procurement/services/procurement.service.ts
import { purchaseRequestRepository, PurchaseRequestRepository } from '../repositories/purchase-request.repository';
import { purchaseOrderRepository, PurchaseOrderRepository } from '../repositories/purchase-order.repository';
import {
  PurchaseRequest,
  PurchaseRequestCreateDTO,
  PurchaseOrder,
  PurchaseOrderCreateDTO,
  PurchaseOrderReceiveDTO,
  PurchaseRequestStatus,
  PurchaseOrderStatus,
} from '../types/procurement.types';
import { ConflictError, NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import {
  PurchaseRequestCreatedEvent,
  PurchaseRequestApprovedEvent,
  PurchaseRequestRejectedEvent,
  PurchaseOrderCreatedEvent,
  PurchaseOrderSentEvent,
  PurchaseOrderReceivedEvent,
  PurchaseOrderCancelledEvent,
} from '../events/procurement.events';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { inventoryService } from '@/modules/inventory/services/inventory.service';

function computeTotal(items: { quantity: number; unitCost: number }[]): number {
  return items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);
}

export class ProcurementService {
  constructor(
    private readonly prRepo: PurchaseRequestRepository = purchaseRequestRepository,
    private readonly poRepo: PurchaseOrderRepository = purchaseOrderRepository
  ) {}

  // ── Purchase Requests ──────────────────────────────────────────────

  async createRequest(data: PurchaseRequestCreateDTO, tenantId: string, userId: string): Promise<PurchaseRequest> {
    if (!data.items?.length) throw new ValidationError('At least one line item is required');

    const created = await this.prRepo.create(
      {
        tenantId,
        requestedBy: userId,
        status: 'submitted',
        reason: data.reason,
        items: data.items,
        estimatedTotal: computeTotal(data.items),
        linkedWorkOrderId: data.linkedWorkOrderId,
      } as any,
      tenantId,
      userId
    );

    const bus = EventBusFactory.getInstance();
    await bus.publish(new PurchaseRequestCreatedEvent(created, { tenantId, userId }));
    await auditLog.logCreate(userId, tenantId, 'purchase_request', created._id!, { estimatedTotal: created.estimatedTotal });

    return created;
  }

  async approveRequest(id: string, tenantId: string, userId: string): Promise<PurchaseRequest> {
    const existing = await this.prRepo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Purchase request not found');
    if (existing.status !== 'submitted') throw new ConflictError(`Cannot approve a request in status "${existing.status}"`);

    const updated = await this.prRepo.update(id, { status: 'approved' as PurchaseRequestStatus, approvedBy: userId, approvedAt: new Date() }, tenantId, userId);
    if (!updated) throw new NotFoundError('Purchase request not found');

    const bus = EventBusFactory.getInstance();
    await bus.publish(new PurchaseRequestApprovedEvent(updated, { tenantId, userId }));
    await auditLog.log({ action: 'PURCHASE_REQUEST_APPROVED', userId, tenantId, entityType: 'purchase_request', entityId: id });

    return updated;
  }

  async rejectRequest(id: string, reason: string, tenantId: string, userId: string): Promise<PurchaseRequest> {
    const existing = await this.prRepo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Purchase request not found');
    if (existing.status !== 'submitted') throw new ConflictError(`Cannot reject a request in status "${existing.status}"`);

    const updated = await this.prRepo.update(id, { status: 'rejected' as PurchaseRequestStatus, rejectionReason: reason }, tenantId, userId);
    if (!updated) throw new NotFoundError('Purchase request not found');

    const bus = EventBusFactory.getInstance();
    await bus.publish(new PurchaseRequestRejectedEvent(updated, { tenantId, userId }));

    return updated;
  }

  async listRequests(status: PurchaseRequestStatus | undefined, pagination: PaginationParams, tenantId: string): Promise<PaginatedResponse<PurchaseRequest>> {
    return this.prRepo.getFiltered(status, tenantId, pagination);
  }

  async getRequest(id: string, tenantId: string): Promise<PurchaseRequest> {
    const pr = await this.prRepo.findById(id, tenantId);
    if (!pr) throw new NotFoundError('Purchase request not found');
    return pr;
  }

  // ── Purchase Orders ─────────────────────────────────────────────────

  async createOrder(data: PurchaseOrderCreateDTO, tenantId: string, userId: string): Promise<PurchaseOrder> {
    if (!data.vendorId) throw new ValidationError('vendorId is required');
    if (!data.items?.length) throw new ValidationError('At least one line item is required');

    if (data.purchaseRequestId) {
      const pr = await this.prRepo.findById(data.purchaseRequestId, tenantId);
      if (!pr) throw new NotFoundError('Linked purchase request not found');
      if (pr.status !== 'approved') throw new ConflictError('Purchase request must be approved before converting to an order');
      await this.prRepo.update(data.purchaseRequestId, { status: 'converted' as PurchaseRequestStatus }, tenantId, userId);
    }

    const created = await this.poRepo.create(
      {
        tenantId,
        purchaseRequestId: data.purchaseRequestId,
        vendorId: data.vendorId,
        status: 'draft',
        items: data.items,
        totalAmount: computeTotal(data.items),
        expectedDeliveryDate: data.expectedDeliveryDate ? new Date(data.expectedDeliveryDate) : undefined,
        notes: data.notes,
      } as any,
      tenantId,
      userId
    );

    const bus = EventBusFactory.getInstance();
    await bus.publish(new PurchaseOrderCreatedEvent(created, { tenantId, userId }));
    await auditLog.logCreate(userId, tenantId, 'purchase_order', created._id!, { vendorId: created.vendorId, totalAmount: created.totalAmount });

    return created;
  }

  async sendOrder(id: string, tenantId: string, userId: string): Promise<PurchaseOrder> {
    const existing = await this.poRepo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Purchase order not found');
    if (existing.status !== 'draft') throw new ConflictError(`Cannot send an order in status "${existing.status}"`);

    const updated = await this.poRepo.update(id, { status: 'sent' as PurchaseOrderStatus, sentAt: new Date() }, tenantId, userId);
    if (!updated) throw new NotFoundError('Purchase order not found');

    const bus = EventBusFactory.getInstance();
    await bus.publish(new PurchaseOrderSentEvent(updated, { tenantId, userId }));

    return updated;
  }

  /**
   * Records receipt of goods against a PO. Fully or partially received
   * items automatically credit SparePart stock via InventoryService, so
   * procurement receiving is the single writer of incoming stock
   * movements — inventory never needs a duplicate "receive" flow.
   */
  async receiveOrder(id: string, data: PurchaseOrderReceiveDTO, tenantId: string, userId: string): Promise<PurchaseOrder> {
    const existing = await this.poRepo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Purchase order not found');
    if (!['sent', 'partially_received'].includes(existing.status)) {
      throw new ConflictError(`Cannot receive against an order in status "${existing.status}"`);
    }

    const items = existing.items.map((item) => {
      const receipt = data.receivedItems.find((r) => r.description === item.description && r.sparePartId === item.sparePartId);
      if (!receipt) return item;
      return { ...item, receivedQuantity: (item.receivedQuantity || 0) + receipt.quantityReceived };
    });

    const fullyReceived = items.every((i) => (i.receivedQuantity || 0) >= i.quantity);
    const nextStatus: PurchaseOrderStatus = fullyReceived ? 'received' : 'partially_received';

    const updated = await this.poRepo.update(
      id,
      { items, status: nextStatus, ...(fullyReceived && { receivedAt: new Date() }) },
      tenantId,
      userId
    );
    if (!updated) throw new NotFoundError('Purchase order not found');

    for (const receipt of data.receivedItems) {
      if (receipt.sparePartId && receipt.quantityReceived > 0) {
        await inventoryService.receiveStock(receipt.sparePartId, receipt.quantityReceived, tenantId, userId, {
          purchaseOrderId: id,
        });
      }
    }

    const bus = EventBusFactory.getInstance();
    await bus.publish(new PurchaseOrderReceivedEvent(updated, { tenantId, userId }));
    await auditLog.log({ action: 'PURCHASE_ORDER_RECEIVED', userId, tenantId, entityType: 'purchase_order', entityId: id, metadata: { status: nextStatus } });

    return updated;
  }

  async cancelOrder(id: string, tenantId: string, userId: string): Promise<PurchaseOrder> {
    const existing = await this.poRepo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Purchase order not found');
    if (['received'].includes(existing.status)) throw new ConflictError('Cannot cancel a fully received order');

    const updated = await this.poRepo.update(id, { status: 'cancelled' as PurchaseOrderStatus }, tenantId, userId);
    if (!updated) throw new NotFoundError('Purchase order not found');

    const bus = EventBusFactory.getInstance();
    await bus.publish(new PurchaseOrderCancelledEvent(updated, { tenantId, userId }));

    return updated;
  }

  async listOrders(status: PurchaseOrderStatus | undefined, vendorId: string | undefined, pagination: PaginationParams, tenantId: string): Promise<PaginatedResponse<PurchaseOrder>> {
    return this.poRepo.getFiltered(status, vendorId, tenantId, pagination);
  }

  async getOrder(id: string, tenantId: string): Promise<PurchaseOrder> {
    const po = await this.poRepo.findById(id, tenantId);
    if (!po) throw new NotFoundError('Purchase order not found');
    return po;
  }
}

export const procurementService = new ProcurementService();