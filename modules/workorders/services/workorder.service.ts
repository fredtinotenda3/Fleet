// modules/workorders/services/workorder.service.ts
import { workOrderRepository, WorkOrderRepository, WorkOrderStats } from '../repositories/workorder.repository';
import { WorkOrder, WorkOrderCreateDTO, WorkOrderFilters, WorkOrderStatus } from '../types/workorder.types';
import '../types/workorder.tenancy-addendum';
import '../types/workorder.dvir-addendum';
import { AppError, ConflictError, NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { PaginationParams, PaginatedResponse, DateRange } from '@/shared/types/common.types';
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
import { WriteScope, tenantIdOf } from '@/server/tenancy/write-scope';
import { vehicleWriteResolver } from '@/modules/vehicles/services/vehicle-write-resolver.service';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';

const VALID_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  open: ['assigned', 'cancelled'],
  assigned: ['in_progress', 'on_hold', 'cancelled'],
  in_progress: ['on_hold', 'completed', 'cancelled'],
  on_hold: ['in_progress', 'cancelled'],
  completed: [],
  cancelled: [],
};

/** R.3.6 -- Work Order Reporting. WorkOrderStats plus the "open/completed/cancelled" arithmetic regrouping the KPI page's stat cards ask for directly. */
export interface WorkOrderKpiSummary extends WorkOrderStats {
  openCount: number;
  completedCount: number;
  cancelledCount: number;
}

export class WorkOrderService {
  constructor(private readonly repo: WorkOrderRepository = workOrderRepository) {}

  /**
   * ─────────────────────────────────────────────────────────────────
   * ORG-UNIT SCOPE ON EVERY BY-ID OPERATION
   * ─────────────────────────────────────────────────────────────────
   * `create` was scope-checked (its comment in the controller explains
   * why) and every other operation in this module was not. All of them
   * resolved a work order by `findById(id, tenantId)` and stopped
   * there, so a workshop manager scoped to one workshop could:
   *
   *   GET  /api/workorders                  every branch's job queue,
   *                                         with totalCost and partsCost
   *   GET  /api/workorders/{id}             any branch's work order
   *   PUT  /api/workorders/{id}/status      cancel another branch's job
   *   POST /api/workorders/{id}/parts       consume another branch's
   *                                         spare-part stock
   *
   * The data supported the check the whole time -- `create` writes
   * `orgUnitId` onto every work order, and the repository already had a
   * scoped list (`getFilteredInScope`) that only the attention queue
   * used. The check simply was not performed.
   *
   * NOT-FOUND, deliberately, rather than FORBIDDEN: a 403 confirms the
   * record exists, which is itself a disclosure across a boundary the
   * caller is not supposed to see across. Mirrors `canAccessRecord`'s
   * use at every other by-id site in the platform.
   */
  private assertInScope(workOrder: WorkOrder, context: TenantContext): void {
    if (!tenantScopeService.canAccessRecord(context, (workOrder as { orgUnitId?: string }).orgUnitId)) {
      throw new NotFoundError('Work order not found');
    }
  }

  async create(data: WorkOrderCreateDTO, scope: WriteScope, userId: string): Promise<WorkOrder> {
    const tenantId = tenantIdOf(scope);
    if (!data.license_plate?.trim()) throw new ValidationError('license_plate is required');
    if (!data.title?.trim()) throw new ValidationError('title is required');

    /**
     * SCOPE FIX. This lookup was tenant-scoped only for non-sentinel
     * tenants and had no org-unit check, while the work order below
     * inherits the vehicle's orgUnitId -- so a job could be raised
     * against another branch's truck and land in that branch's workshop
     * queue. See server/tenancy/write-scope.ts.
     */
    const vehicle = await vehicleWriteResolver.resolveForWrite(data.license_plate, scope);

    const created = await this.repo.create(
      {
        tenantId,
        license_plate: data.license_plate.toUpperCase(),
        title: data.title,
        description: data.description,
        status: 'open',
        priority: data.priority || 'medium',
        reminderId: data.reminderId,
        // FIX: the addendum's doc comment has always promised "falls back
        // to the vehicle's own orgUnitId when omitted", but that fallback
        // was never actually wired up here -- every work order was created
        // with orgUnitId undefined regardless of caller input, which is
        // invisible to org-unit-scoped reads (getFilteredInScope) until a
        // human notices a workshop's queue is silently empty. DVIR-raised
        // work orders depend on this for the Needs Attention queue and the
        // Workshop Manager's scoped list to actually surface them.
        orgUnitId: (data as any).orgUnitId ?? (vehicle as any).orgUnitId,
        source: (data as any).source ?? 'manual',
        dvirInspectionId: (data as any).dvirInspectionId,
        driverId: (data as any).driverId,
        photoUrl: (data as any).photoUrl,
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

  async assign(
    id: string,
    mechanicId: string,
    bayId: string | undefined,
    context: TenantContext,
    userId: string
  ): Promise<WorkOrder> {
    const tenantId = context.organizationId;
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Work order not found');
    this.assertInScope(existing, context);
    this.assertTransition(existing.status, 'assigned');

    const updated = await this.repo.update(id, { status: 'assigned', assignedMechanicId: mechanicId, bayId }, tenantId, userId);
    if (!updated) throw new NotFoundError('Work order not found');

    const bus = EventBusFactory.getInstance();
    await bus.publish(new WorkOrderAssignedEvent(updated, { tenantId, userId }));
    await bus.publish(new WorkOrderStatusChangedEvent(updated, existing.status, { tenantId, userId }));

    return updated;
  }

  async changeStatus(
    id: string,
    status: WorkOrderStatus,
    context: TenantContext,
    userId: string,
    reason?: string
  ): Promise<WorkOrder> {
    const tenantId = context.organizationId;
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Work order not found');
    this.assertInScope(existing, context);
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
  async consumeParts(
    id: string,
    sparePartId: string,
    quantity: number,
    context: TenantContext,
    userId: string
  ): Promise<WorkOrder> {
    if (quantity <= 0) throw new ValidationError('Quantity must be positive');
    const tenantId = context.organizationId;
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Work order not found');
    // Before any stock is moved: this consumes real inventory, so the
    // scope check has to precede the side effect, not follow it.
    this.assertInScope(existing, context);
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

  async recordLabor(
    id: string,
    laborHours: number,
    hourlyRate: number,
    context: TenantContext,
    userId: string
  ): Promise<WorkOrder> {
    if (laborHours <= 0) throw new ValidationError('laborHours must be positive');
    const tenantId = context.organizationId;
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Work order not found');
    this.assertInScope(existing, context);

    const laborCost = laborHours * hourlyRate;
    const totalCost = existing.partsCost + laborCost;

    const updated = await this.repo.update(id, { laborHours, laborCost, totalCost }, tenantId, userId);
    if (!updated) throw new NotFoundError('Work order not found');
    return updated;
  }

  /**
   * ORG-WIDE list. Retained for the internal, system-scoped caller that
   * genuinely needs every unit (the attention queue's org-wide branch);
   * it is NOT what a request should reach. Request-driven callers use
   * `listInScope`.
   */
  async list(filters: WorkOrderFilters, pagination: PaginationParams, tenantId: string): Promise<PaginatedResponse<WorkOrder>> {
    return this.repo.getFiltered(filters, tenantId, pagination);
  }

  /**
   * What the API serves. Delegates to the repository's scoped query --
   * which existed already and was used only by the attention queue,
   * while the work-order list endpoint itself ran unscoped.
   */
  async listInScope(
    filters: WorkOrderFilters,
    pagination: PaginationParams,
    context: TenantContext
  ): Promise<PaginatedResponse<WorkOrder>> {
    return this.repo.getFilteredInScope(filters, context, pagination);
  }

  async get(id: string, context: TenantContext): Promise<WorkOrder> {
    const wo = await this.repo.findById(id, context.organizationId);
    if (!wo) throw new NotFoundError('Work order not found');
    this.assertInScope(wo, context);
    return wo;
  }

  /**
   * R.3.6 -- Work Order Reporting. Thin wrapper over the repository's
   * scoped aggregation, matching the listInScope/get pattern: the
   * service layer does not re-derive scope here, it delegates to the
   * already-scoped repository call.
   *
   * openCount/completedCount/cancelledCount are derived from
   * statusCounts (an open/assigned/in_progress/on_hold work order is
   * "open" in the operational sense the report's KPI cards use) rather
   * than adding a second Mongo pass for what is a pure arithmetic
   * regrouping of numbers the repository already computed.
   */
  async getStats(context: TenantContext, dateRange?: DateRange): Promise<WorkOrderKpiSummary> {
    const stats = await this.repo.getStatsInScope(context, dateRange);
    const openCount =
      stats.statusCounts.open + stats.statusCounts.assigned + stats.statusCounts.in_progress + stats.statusCounts.on_hold;
    return {
      ...stats,
      openCount,
      completedCount: stats.statusCounts.completed,
      cancelledCount: stats.statusCounts.cancelled,
    };
  }

  private assertTransition(from: WorkOrderStatus, to: WorkOrderStatus): void {
    if (!VALID_TRANSITIONS[from].includes(to)) {
      throw new ConflictError(`Cannot transition work order from "${from}" to "${to}"`);
    }
  }
}

export const workOrderService = new WorkOrderService();