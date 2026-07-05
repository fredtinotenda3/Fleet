// server/events/handlers/fleetops-event-handlers.ts
import { IEventHandler } from '../base/IEventHandler';
import { DomainEvent } from '../base/DomainEvent';
import { slaService } from '@/modules/sla/services/sla.service';
import { complianceService } from '@/modules/compliance/services/compliance.service';
import { monitoring } from '@/infrastructure/monitoring/logger';

/**
 * Handles WORK_ORDER_CREATED and DISPATCH_JOB_CREATED by starting SLA
 * tracking against the applicable policy for the entity type + priority.
 */
export class SlaTrackingStarterHandler implements IEventHandler<DomainEvent> {
  async handle(event: DomainEvent): Promise<void> {
    const { entityId, entityType, priority, tenantId } = event.payload as any;

    if (!entityId || !entityType || !tenantId) {
      monitoring.logWarn('[SlaTrackingStarter] Missing required payload fields', { eventId: event.eventId });
      return;
    }

    try {
      await slaService.startTracking(entityType, entityId, priority, tenantId, 'system');
    } catch (error) {
      monitoring.logError(`[SlaTrackingStarter] Failed for ${entityType}/${entityId}`, error as Error);
    }
  }
}

/**
 * Handles WORK_ORDER_COMPLETED, DISPATCH_JOB_COMPLETED, BOOKING_CHECKED_IN
 * by resolving (met/breached) the active SLA tracking for that entity.
 */
export class SlaTrackingResolverHandler implements IEventHandler<DomainEvent> {
  async handle(event: DomainEvent): Promise<void> {
    const { entityId, entityType, tenantId } = event.payload as any;

    if (!entityId || !entityType || !tenantId) {
      monitoring.logWarn('[SlaTrackingResolver] Missing required payload fields', { eventId: event.eventId });
      return;
    }

    try {
      await slaService.resolveTracking(entityType, entityId, tenantId, 'system');
    } catch (error) {
      monitoring.logError(`[SlaTrackingResolver] Failed for ${entityType}/${entityId}`, error as Error);
    }
  }
}

/**
 * Handles WORK_ORDER_ASSIGNED and DISPATCH_JOB_ASSIGNED by recording
 * the first-response timestamp on the active SLA tracking.
 */
export class SlaResponseRecorderHandler implements IEventHandler<DomainEvent> {
  async handle(event: DomainEvent): Promise<void> {
    const { entityId, entityType, tenantId } = event.payload as any;

    if (!entityId || !entityType || !tenantId) {
      return;
    }

    try {
      await slaService.recordResponse(entityType, entityId, tenantId, 'system');
    } catch (error) {
      monitoring.logError(`[SlaResponseRecorder] Failed for ${entityType}/${entityId}`, error as Error);
    }
  }
}

/**
 * Handles VEHICLE_CREATED and DRIVER_CREATED by auto-scheduling
 * compliance records for all active rules matching that entity type.
 */
export class ComplianceAutoSchedulerHandler implements IEventHandler<DomainEvent> {
  async handle(event: DomainEvent): Promise<void> {
    const { entityId, entityType, tenantId } = event.payload as any;

    if (!entityId || !entityType || !tenantId) {
      return;
    }

    try {
      const rules = await complianceService.listRules(entityType, tenantId);
      for (const rule of rules) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + (rule.warningDays || 30));
        await complianceService.createRecord(
          { ruleId: rule._id!, entityType, entityId, dueDate },
          tenantId,
          'system'
        );
      }
    } catch (error) {
      monitoring.logError(`[ComplianceAutoScheduler] Failed for ${entityType}/${entityId}`, error as Error);
    }
  }
}

export const slaTrackingStarterHandler = new SlaTrackingStarterHandler();
export const slaTrackingResolverHandler = new SlaTrackingResolverHandler();
export const slaResponseRecorderHandler = new SlaResponseRecorderHandler();
export const complianceAutoSchedulerHandler = new ComplianceAutoSchedulerHandler();