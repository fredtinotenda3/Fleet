// modules/inventory/services/inventory.service.ts
import { sparePartRepository, SparePartRepository } from '../repositories/spare-part.repository';
import { stockMovementRepository, StockMovementRepository } from '../repositories/stock-movement.repository';
import { SparePart, SparePartCreateDTO, SparePartUpdateDTO, SparePartFilters } from '../types/inventory.types';
import { ConflictError, NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import {
  SparePartCreatedEvent,
  SparePartUpdatedEvent,
  StockReceivedEvent,
  StockConsumedEvent,
  StockAdjustedEvent,
  StockLowThresholdBreachedEvent,
} from '../events/inventory.events';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

export class InventoryService {
  constructor(
    private readonly partRepo: SparePartRepository = sparePartRepository,
    private readonly movementRepo: StockMovementRepository = stockMovementRepository
  ) {}

  async createPart(data: SparePartCreateDTO, tenantId: string, userId: string): Promise<SparePart> {
    if (!data.sku?.trim()) throw new ValidationError('SKU is required');
    const existing = await this.partRepo.findBySku(data.sku, tenantId);
    if (existing) throw new ConflictError(`A spare part with SKU "${data.sku}" already exists`);

    const created = await this.partRepo.create(
      {
        tenantId,
        sku: data.sku.trim(),
        name: data.name,
        category: data.category,
        unitCost: data.unitCost,
        quantityOnHand: data.quantityOnHand ?? 0,
        reorderThreshold: data.reorderThreshold,
        reorderQuantity: data.reorderQuantity,
        warehouseLocation: data.warehouseLocation,
        preferredVendorId: data.preferredVendorId,
      } as any,
      tenantId,
      userId
    );

    const bus = EventBusFactory.getInstance();
    await bus.publish(new SparePartCreatedEvent(created, { tenantId, userId }));
    await auditLog.logCreate(userId, tenantId, 'spare_part', created._id!, { sku: created.sku });

    return created;
  }

  async updatePart(id: string, data: SparePartUpdateDTO, tenantId: string, userId: string): Promise<SparePart> {
    const existing = await this.partRepo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Spare part not found');

    const updated = await this.partRepo.update(id, data as Partial<SparePart>, tenantId, userId);
    if (!updated) throw new NotFoundError('Spare part not found');

    const bus = EventBusFactory.getInstance();
    await bus.publish(new SparePartUpdatedEvent(updated, data as Partial<SparePart>, { tenantId, userId }));

    return updated;
  }

  async receiveStock(sparePartId: string, quantity: number, tenantId: string, userId: string, refs?: { purchaseOrderId?: string }): Promise<SparePart> {
    if (quantity <= 0) throw new ValidationError('Quantity must be positive');
    const part = await this.partRepo.findById(sparePartId, tenantId);
    if (!part) throw new NotFoundError('Spare part not found');

    const updated = await this.partRepo.adjustQuantity(sparePartId, tenantId, quantity);
    if (!updated) throw new NotFoundError('Spare part not found');

    const movement = await this.movementRepo.create(
      { tenantId, sparePartId, type: 'receipt', quantity, balanceAfter: updated.quantityOnHand, purchaseOrderId: refs?.purchaseOrderId } as any,
      tenantId,
      userId
    );

    const bus = EventBusFactory.getInstance();
    await bus.publish(new StockReceivedEvent(updated, movement, { tenantId, userId }));

    return updated;
  }

  async consumeStock(sparePartId: string, quantity: number, tenantId: string, userId: string, refs?: { workOrderId?: string }): Promise<SparePart> {
    if (quantity <= 0) throw new ValidationError('Quantity must be positive');
    const part = await this.partRepo.findById(sparePartId, tenantId);
    if (!part) throw new NotFoundError('Spare part not found');
    if (part.quantityOnHand < quantity) throw new ConflictError(`Insufficient stock for "${part.name}" (have ${part.quantityOnHand}, need ${quantity})`);

    const updated = await this.partRepo.adjustQuantity(sparePartId, tenantId, -quantity);
    if (!updated) throw new NotFoundError('Spare part not found');

    const movement = await this.movementRepo.create(
      { tenantId, sparePartId, type: 'consumption', quantity: -quantity, balanceAfter: updated.quantityOnHand, workOrderId: refs?.workOrderId } as any,
      tenantId,
      userId
    );

    const bus = EventBusFactory.getInstance();
    await bus.publish(new StockConsumedEvent(updated, movement, { tenantId, userId }));

    if (updated.quantityOnHand <= updated.reorderThreshold) {
      await bus.publish(new StockLowThresholdBreachedEvent(updated, { tenantId, userId }));
    }

    return updated;
  }

  async adjustStock(sparePartId: string, delta: number, reason: string, tenantId: string, userId: string): Promise<SparePart> {
    if (delta === 0) throw new ValidationError('Adjustment delta must be non-zero');
    const part = await this.partRepo.findById(sparePartId, tenantId);
    if (!part) throw new NotFoundError('Spare part not found');

    const updated = await this.partRepo.adjustQuantity(sparePartId, tenantId, delta);
    if (!updated) throw new NotFoundError('Spare part not found');

    const movement = await this.movementRepo.create(
      { tenantId, sparePartId, type: 'adjustment', quantity: delta, balanceAfter: updated.quantityOnHand, reason } as any,
      tenantId,
      userId
    );

    const bus = EventBusFactory.getInstance();
    await bus.publish(new StockAdjustedEvent(updated, movement, { tenantId, userId }));
    await auditLog.log({ action: 'STOCK_ADJUSTED', userId, tenantId, entityType: 'spare_part', entityId: sparePartId, metadata: { delta, reason } });

    if (updated.quantityOnHand <= updated.reorderThreshold) {
      await bus.publish(new StockLowThresholdBreachedEvent(updated, { tenantId, userId }));
    }

    return updated;
  }

  async listParts(filters: SparePartFilters, pagination: PaginationParams, tenantId: string): Promise<PaginatedResponse<SparePart>> {
    return this.partRepo.getFiltered(filters, tenantId, pagination);
  }

  async getPart(id: string, tenantId: string): Promise<SparePart> {
    const part = await this.partRepo.findById(id, tenantId);
    if (!part) throw new NotFoundError('Spare part not found');
    return part;
  }

  async listMovements(sparePartId: string, pagination: PaginationParams, tenantId: string) {
    return this.movementRepo.listForPart(sparePartId, tenantId, pagination);
  }
}

export const inventoryService = new InventoryService();