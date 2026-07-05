// modules/workorders/services/workorder.service.ts
import { workOrderRepository, WorkOrderRepository } from '../repositories/workorder.repository';
import { WorkOrder, WorkOrderCreateDTO, WorkOrderFilters, WorkOrderStatus } from '../types/workorder.types';
import { AppError, ConflictError, NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import {
  WorkOrderCreatedEvent,
  WorkOrderAssignedEvent,
  WorkOrderStatusChangedEvent,
  WorkOrderPartsConsumedEvent,
  WorkOrderCompletedEvent,
  WorkOrderCancelledEvent,
} from '../events/workorder.events';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { inventoryService } from '@/modules/inventory/services/inventory.service';
import { sparePartRepository } from '@/modules/inventory/repositories/spare-part.repository';
import connectToDatabase from '@/infrastructure/database/mongodb';

const VALID_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  open: ['assigned', 'cancelled'],
  assigned: ['in_progress', 'on_hold', 'cancelled'],
  in_progress: ['on_hold', 'completed', 'cancelled'],
  on_hold: ['in_progress', 'cancelled'],
  completed: [],
  cancelled: [],
};

export class WorkOrderService {
  constructor(private readonly repo: WorkOrderRepository = workOrderRepository) {}

  async create(data: WorkOrderCreateDTO, tenantId: string, userId: string): Promise<WorkOrder> {
    if (!data.license_plate?.trim()) throw new ValidationError('license_plate is required');
    if (!data.title?.trim()) throw new ValidationError('title is required');

    const db = await connectToDatabase();
    const vehicle = await db.collection('tblvehicles').findOne({
      license_plate: data.license_plate.toUpperCase(),
      isDeleted: { $ne: true },
      ...(tenantId !== 'default' && tenantId !== 'system' ? { tenantId } : {}),
    });
    if (!vehicle) throw new AppError(`Vehicle "${data.license_plate}" not found`, 'VEHICLE_NOT_FOUND', 400);

    const created = await this.repo.create(
      {
        tenantId,
        license_plate: data.license_plate.toUpperCase(),
        title: data.title,
        description: data.description,
        status: 'open',
        priority: data.priority || 'medium',
        reminderId: data.reminderId,
        partsUsed: [],
        partsCost: 0,
        totalCost: 0,
        openedAt: new Date(),
      } as any,
      tenantId,
      userId
    );

    const bus = EventBusFactory.getInstance();
    await bus.publish(new WorkOrderCreatedEvent(created, { tenantId, userId }));
    await auditLog.logCreate(userId, tenantId, 'work_order', created._id!, { license_plate: created.license_plate });

    return created;
  }

  async assign(id: string, mechanicId: string, bayId: string | undefined, tenantId: string, userId: string): Promise<WorkOrder> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Work order not found');
    this.assertTransition(existing.status, 'assigned');

    const updated = await this.repo.update(id, { status: 'assigned', assignedMechanicId: mechanicId, bayId }, tenantId, userId);
    if (!updated) throw new NotFoundError('Work order not found');

    const bus = EventBusFactory.getInstance();
    await bus.publish(new WorkOrderAssignedEvent(updated, { tenantId, userId }));
    await bus.publish(new WorkOrderStatusChangedEvent(updated, existing.status, { tenantId, userId }));

    return updated;
  }

  async changeStatus(id: string, status: WorkOrderStatus, tenantId: string, userId: string, reason?: string): Promise<WorkOrder> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Work order not found');
    this.assertTransition(existing.status, status);

    const updates: Partial<WorkOrder> = { status };
    if (status === 'in_progress' && !existing.startedAt) updates.startedAt = new Date();
    if (status === 'completed') updates.completedAt = new Date();
    if (status === 'cancelled') updates.cancelledReason = reason;

    const updated = await this.repo.update(id, updates, tenantId, userId);
    if (!updated) throw new NotFoundError('Work order not found');

    const bus = EventBusFactory.getInstance();
    await bus.publish(new WorkOrderStatusChangedEvent(updated, existing.status, { tenantId, userId }));

    if (status === 'completed') {
      await bus.publish(new WorkOrderCompletedEvent(updated, { tenantId, userId }));
      await auditLog.log({ action: 'WORK_ORDER_COMPLETED', userId, tenantId, entityType: 'work_order', entityId: id, metadata: { totalCost: updated.totalCost } });
    }
    if (status === 'cancelled') {
      await bus.publish(new WorkOrderCancelledEvent(updated, { tenantId, userId }));
    }

    return updated;
  }

  /**
   * Consumes spare-part stock against the work order via InventoryService
   * (single writer of stock movements), then recalculates partsCost and
   * totalCost on the work order itself.
   */
  async consumeParts(id: string, sparePartId: string, quantity: number, tenantId: string, userId: string): Promise<WorkOrder> {
    if (quantity <= 0) throw new ValidationError('Quantity must be positive');
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Work order not found');
    if (!['assigned', 'in_progress'].includes(existing.status)) {
      throw new ConflictError('Parts can only be consumed while the work order is assigned or in progress');
    }

    await inventoryService.consumeStock(sparePartId, quantity, tenantId, userId, { workOrderId: id });
    const part = await sparePartRepository.findById(sparePartId, tenantId);
    const lineCost = (part?.unitCost || 0) * quantity;

    const existingLine = existing.partsUsed.find((p) => p.sparePartId === sparePartId);
    const partsUsed = existingLine
      ? existing.partsUsed.map((p) => (p.sparePartId === sparePartId ? { ...p, quantity: p.quantity + quantity } : p))
      : [...existing.partsUsed, { sparePartId, quantity }];

    const partsCost = existing.partsCost + lineCost;
    const totalCost = partsCost + (existing.laborCost || 0);

    const updated = await this.repo.update(id, { partsUsed, partsCost, totalCost }, tenantId, userId);
    if (!updated) throw new NotFoundError('Work order not found');

    const bus = EventBusFactory.getInstance();
    await bus.publish(new WorkOrderPartsConsumedEvent(updated, sparePartId, quantity, { tenantId, userId }));

    return updated;
  }

  async recordLabor(id: string, laborHours: number, hourlyRate: number, tenantId: string, userId: string): Promise<WorkOrder> {
    if (laborHours <= 0) throw new ValidationError('laborHours must be positive');
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Work order not found');

    const laborCost = laborHours * hourlyRate;
    const totalCost = existing.partsCost + laborCost;

    const updated = await this.repo.update(id, { laborHours, laborCost, totalCost }, tenantId, userId);
    if (!updated) throw new NotFoundError('Work order not found');
    return updated;
  }

  async list(filters: WorkOrderFilters, pagination: PaginationParams, tenantId: string): Promise<PaginatedResponse<WorkOrder>> {
    return this.repo.getFiltered(filters, tenantId, pagination);
  }

  async get(id: string, tenantId: string): Promise<WorkOrder> {
    const wo = await this.repo.findById(id, tenantId);
    if (!wo) throw new NotFoundError('Work order not found');
    return wo;
  }

  private assertTransition(from: WorkOrderStatus, to: WorkOrderStatus): void {
    if (!VALID_TRANSITIONS[from].includes(to)) {
      throw new ConflictError(`Cannot transition work order from "${from}" to "${to}"`);
    }
  }
}

export const workOrderService = new WorkOrderService();