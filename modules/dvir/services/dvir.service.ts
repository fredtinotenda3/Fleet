// modules/dvir/services/dvir.service.ts
//
// Orchestrates a driver's inspection submission:
//   1. validate the checklist and resolve+scope-check the vehicle
//   2. idempotency check (offline-queue resubmission -- see
//      DVIRRepository.findByClientInspectionId)
//   3. upload any defect photos (infrastructure/storage)
//   4. persist the inspection, inheriting the vehicle's orgUnitId
//   5. auto-create one work order per defect item (requirement: "Submitted
//      defect -> automatic work order in the maintenance module")
//   6. if outOfService, broadcast a critical notification to the
//      vehicle's workshop org unit

import { dvirRepository, DVIRRepository } from '../repositories/dvir.repository';
import {
  DVIRInspection,
  DVIRCreateDTO,
  DVIRFilters,
  DVIRItemResult,
  DVIROverallStatus,
} from '../types/dvir.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { DVIRSubmittedEvent, DVIROutOfServiceEvent } from '../events/dvir.events';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { storageService } from '@/infrastructure/storage/storage.service';
import { workOrderService } from '@/modules/workorders/services/workorder.service';
import { notificationService } from '@/modules/notifications/services/notification.service';
import connectToDatabase from '@/infrastructure/database/mongodb';

const MAX_ITEMS = 50;

export class DVIRService {
  constructor(private readonly repo: DVIRRepository = dvirRepository) {}

  /**
   * Submits a completed inspection. `context` must be the driver's
   * resolved TenantContext (not just tenantId) so the vehicle
   * org-unit-scope check below actually enforces "drivers can only
   * inspect vehicles assigned to their own branch/fleet" rather than
   * only tenant isolation.
   */
  async submit(
    data: DVIRCreateDTO,
    context: TenantContext,
    driverId: string,
    driverName: string | undefined,
    userId: string
  ): Promise<DVIRInspection> {
    if (!data.license_plate?.trim()) throw new ValidationError('license_plate is required');
    if (!data.type || !['pre_trip', 'post_trip'].includes(data.type)) {
      throw new ValidationError('type must be "pre_trip" or "post_trip"');
    }
    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new ValidationError('items is required and must contain at least one checklist result');
    }
    if (data.items.length > MAX_ITEMS) {
      throw new ValidationError(`items cannot exceed ${MAX_ITEMS} entries`);
    }
    for (const item of data.items) {
      if (!item.category || !item.label?.trim()) {
        throw new ValidationError('every item requires a category and label');
      }
      if (!['ok', 'defect'].includes(item.status)) {
        throw new ValidationError(`invalid status for item "${item.label}"`);
      }
      if (item.status === 'defect' && !item.description?.trim()) {
        throw new ValidationError(`a description is required for the defect on "${item.label}"`);
      }
    }

    // Idempotency: an offline-queued submission that gets retried after
    // the original response was lost must return the original result,
    // not create a second inspection + a second set of work orders.
    if (data.clientInspectionId) {
      const existing = await this.repo.findByClientInspectionId(
        context.organizationId,
        driverId,
        data.clientInspectionId
      );
      if (existing) return existing;
    }

    const licensePlate = data.license_plate.toUpperCase();
    const db = await connectToDatabase();
    const vehicle = await db.collection('tblvehicles').findOne({
      license_plate: licensePlate,
      isDeleted: { $ne: true },
      ...(context.organizationId !== 'default' && context.organizationId !== 'system'
        ? { tenantId: context.organizationId }
        : {}),
    });
    if (!vehicle) throw new AppError(`Vehicle "${licensePlate}" not found`, 'VEHICLE_NOT_FOUND', 400);

    const vehicleOrgUnitId: string | undefined = (vehicle as any).orgUnitId;
    if (vehicleOrgUnitId && !tenantScopeService.canAccessOrgUnit(context, vehicleOrgUnitId)) {
      throw new ForbiddenError('You can only inspect vehicles assigned to your own branch or fleet.');
    }
    // A vehicle with no orgUnitId at all is only reachable by org-wide
    // roles (accessibleOrgUnitIds === null); a scoped driver with no
    // matching assignment must not be able to inspect it either.
    if (!vehicleOrgUnitId && context.accessibleOrgUnitIds !== null) {
      throw new ForbiddenError('You can only inspect vehicles assigned to your own branch or fleet.');
    }

    // Upload any defect photos before persisting so the inspection row
    // always stores a durable URL, never raw bytes.
    const items: DVIRItemResult[] = [];
    for (const item of data.items) {
      const result: DVIRItemResult = {
        category: item.category,
        label: item.label,
        status: item.status,
        description: item.description,
      };

      if (item.status === 'defect' && item.photoBase64) {
        try {
          const buffer = Buffer.from(item.photoBase64, 'base64');
          const stored = await storageService.uploadFile({
            tenantId: context.organizationId,
            entityType: 'dvir-defect',
            entityId: licensePlate,
            file: buffer,
            filename: `${item.category}-${Date.now()}.jpg`,
            mimeType: item.photoMimeType || 'image/jpeg',
            resize: { width: 1280, height: 1280 },
          });
          result.photoUrl = stored.url;
          result.photoKey = stored.key;
        } catch (error) {
          // A failed upload must not block the inspection itself --
          // the defect and its description are the safety-critical
          // part; the photo is supplementary. Logged, not swallowed.
          await auditLog.log({
            action: 'DVIR_PHOTO_UPLOAD_FAILED',
            userId,
            tenantId: context.organizationId,
            entityType: 'dvir_inspection',
            entityId: licensePlate,
            metadata: { category: item.category, error: error instanceof Error ? error.message : String(error) },
          });
        }
      }

      items.push(result);
    }

    const defectItems = items.filter((i) => i.status === 'defect');
    const overallStatus: DVIROverallStatus = data.outOfService
      ? 'out_of_service'
      : defectItems.length > 0
        ? 'defects_found'
        : 'pass';

    const created = await this.repo.create(
      {
        tenantId: context.organizationId,
        orgUnitId: vehicleOrgUnitId,
        license_plate: licensePlate,
        driverId,
        driverName,
        type: data.type,
        odometer: data.odometer,
        items,
        outOfService: !!data.outOfService,
        overallStatus,
        submittedAt: new Date(),
        workOrderIds: [],
        clientInspectionId: data.clientInspectionId,
      } as any,
      context.organizationId,
      userId
    );

    const bus = EventBusFactory.getInstance();
    await bus.publish(new DVIRSubmittedEvent(created, { tenantId: context.organizationId, userId }));
    await auditLog.logCreate(userId, context.organizationId, 'dvir_inspection', created._id!, {
      license_plate: created.license_plate,
      overallStatus: created.overallStatus,
    });

    // One work order per defect item -- appears in the Needs Attention
    // / maintenance "needs attention" queue immediately via
    // needsAttentionService reading open work orders (see
    // modules/ai/services/needs-attention.service.ts).
    const workOrderIds: string[] = [];
    for (const defect of defectItems) {
      try {
        const workOrder = await workOrderService.create(
          {
            license_plate: licensePlate,
            title: `DVIR defect: ${defect.label}`,
            description: `${defect.description} (reported during ${data.type === 'pre_trip' ? 'pre-trip' : 'post-trip'} inspection${
              driverName ? ` by ${driverName}` : ''
            })`,
            priority: data.outOfService ? 'critical' : 'high',
            orgUnitId: vehicleOrgUnitId,
            source: 'dvir',
            dvirInspectionId: created._id,
            driverId,
            photoUrl: defect.photoUrl,
          } as any,
          context.organizationId,
          userId
        );
        workOrderIds.push(workOrder._id!);
        await this.repo.appendWorkOrderId(created._id!, workOrder._id!, context.organizationId);
      } catch (error) {
        // A single work-order-creation failure must not lose the other
        // defects or the inspection itself; logged for follow-up.
        await auditLog.log({
          action: 'DVIR_WORK_ORDER_CREATE_FAILED',
          userId,
          tenantId: context.organizationId,
          entityType: 'dvir_inspection',
          entityId: created._id!,
          metadata: { defect: defect.label, error: error instanceof Error ? error.message : String(error) },
        });
      }
    }

    if (data.outOfService && vehicleOrgUnitId) {
      await bus.publish(new DVIROutOfServiceEvent(created, { tenantId: context.organizationId, userId }));
      try {
        await notificationService.sendBroadcastNotification(vehicleOrgUnitId, context.organizationId, {
          type: 'alert',
          title: `Vehicle ${licensePlate} taken out of service`,
          message: `${driverName || 'A driver'} flagged ${licensePlate} as Out of Service during a ${
            data.type === 'pre_trip' ? 'pre-trip' : 'post-trip'
          } inspection. ${defectItems.length} defect(s) reported.`,
          priority: 'critical',
          actionUrl: `/workorders?license_plate=${encodeURIComponent(licensePlate)}`,
          actionLabel: 'View work orders',
        });
      } catch (error) {
        await auditLog.log({
          action: 'DVIR_OOS_NOTIFICATION_FAILED',
          userId,
          tenantId: context.organizationId,
          entityType: 'dvir_inspection',
          entityId: created._id!,
          metadata: { error: error instanceof Error ? error.message : String(error) },
        });
      }
    }

    return { ...created, workOrderIds };
  }

  async list(filters: DVIRFilters, pagination: PaginationParams, context: TenantContext): Promise<PaginatedResponse<DVIRInspection>> {
    return this.repo.getFilteredInScope(filters, context, pagination);
  }

  async get(id: string, tenantId: string): Promise<DVIRInspection> {
    const inspection = await this.repo.findById(id, tenantId);
    if (!inspection) throw new NotFoundError('Inspection not found');
    return inspection;
  }
}

export const dvirService = new DVIRService();
