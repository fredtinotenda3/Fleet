// modules/sla/services/sla.service.ts
import { slaPolicyRepository, SLAPolicyRepository, slaTrackingRepository, SLATrackingRepository } from '../repositories/sla.repository';
import { SLAPolicy, SLAPolicyCreateDTO, SLATracking, SlaEntityType } from '../types/sla.types';
import { ValidationError } from '@/server/errors/app.errors';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { SlaPolicyCreatedEvent, SlaTrackingStartedEvent, SlaWarningTriggeredEvent, SlaBreachedEvent, SlaMetEvent } from '../events/sla.events';
import { monitoring } from '@/infrastructure/monitoring/logger';

export class SLAService {
  constructor(
    private readonly policyRepo: SLAPolicyRepository = slaPolicyRepository,
    private readonly trackingRepo: SLATrackingRepository = slaTrackingRepository
  ) {}

  async createPolicy(data: SLAPolicyCreateDTO, tenantId: string, userId: string): Promise<SLAPolicy> {
    if (!data.name?.trim()) throw new ValidationError('Policy name is required');
    if (data.resolutionTimeMinutes <= 0) throw new ValidationError('resolutionTimeMinutes must be positive');

    const created = await this.policyRepo.create(
      {
        tenantId,
        name: data.name,
        entityType: data.entityType,
        priority: data.priority,
        responseTimeMinutes: data.responseTimeMinutes,
        resolutionTimeMinutes: data.resolutionTimeMinutes,
        warningThresholdPercent: data.warningThresholdPercent ?? 80,
        status: 'active',
      } as any,
      tenantId,
      userId
    );

    const bus = EventBusFactory.getInstance();
    await bus.publish(new SlaPolicyCreatedEvent(created, { tenantId, userId }));

    return created;
  }

  async listPolicies(tenantId: string): Promise<SLAPolicy[]> {
    return this.policyRepo.findMany({}, tenantId);
  }

  /**
   * Starts SLA tracking for an entity (work order, dispatch job, etc.)
   * against the applicable policy for its type + priority. Called by
   * domain event handlers wired into the platform event bus (e.g. on
   * WorkOrderCreated, DispatchJobCreated) rather than directly by
   * controllers, so SLA tracking stays automatic and consistent.
   */
  async startTracking(entityType: SlaEntityType, entityId: string, priority: string | undefined, tenantId: string, userId?: string): Promise<SLATracking | null> {
    const policy = await this.policyRepo.findApplicable(entityType, priority, tenantId);
    if (!policy) return null; // no applicable policy — SLA not tracked for this entity

    const existing = await this.trackingRepo.findActiveForEntity(entityType, entityId, tenantId);
    if (existing) return existing; // idempotent

    const startedAt = new Date();
    const targetAt = new Date(startedAt.getTime() + policy.resolutionTimeMinutes * 60_000);
    const warningAt = new Date(startedAt.getTime() + policy.resolutionTimeMinutes * (policy.warningThresholdPercent / 100) * 60_000);

    const tracking = await this.trackingRepo.create(
      {
        tenantId,
        policyId: policy._id!,
        entityType,
        entityId,
        startedAt,
        targetAt,
        warningAt,
        status: 'active',
      } as any,
      tenantId,
      userId
    );

    const bus = EventBusFactory.getInstance();
    await bus.publish(new SlaTrackingStartedEvent(tracking, { tenantId, userId }));

    return tracking;
  }

  async recordResponse(entityType: SlaEntityType, entityId: string, tenantId: string, userId?: string): Promise<void> {
    const tracking = await this.trackingRepo.findActiveForEntity(entityType, entityId, tenantId);
    if (!tracking || tracking.respondedAt) return;
    await this.trackingRepo.update(tracking._id!, { respondedAt: new Date() }, tenantId, userId);
  }

  async resolveTracking(entityType: SlaEntityType, entityId: string, tenantId: string, userId?: string): Promise<void> {
    const tracking = await this.trackingRepo.findActiveForEntity(entityType, entityId, tenantId);
    if (!tracking) return;

    const now = new Date();
    const breached = now > tracking.targetAt;
    const updated = await this.trackingRepo.update(
      tracking._id!,
      { status: breached ? 'breached' : 'met', resolvedAt: now, ...(breached && { breachedAt: now }) },
      tenantId,
      userId
    );
    if (!updated) return;

    const bus = EventBusFactory.getInstance();
    await bus.publish(breached ? new SlaBreachedEvent(updated, { tenantId, userId }) : new SlaMetEvent(updated, { tenantId, userId }));
  }

  /**
   * Scans all active SLA trackings for a tenant and fires warning/breach
   * events for those that have crossed the threshold since last checked.
   * Intended to be invoked by a scheduled job (see scheduler/bootstrap-schedules
   * addendum) at short intervals (e.g. every 5 minutes).
   */
  async processDueTrackings(tenantId: string): Promise<{ warned: number; breached: number }> {
    const active = await this.trackingRepo.findDueForWarningOrBreach(tenantId);
    const now = new Date();
    let warned = 0;
    let breached = 0;
    const bus = EventBusFactory.getInstance();

    for (const tracking of active) {
      if (now >= tracking.targetAt) {
        const updated = await this.trackingRepo.update(tracking._id!, { status: 'breached', breachedAt: now }, tenantId, 'system');
        if (updated) {
          await bus.publish(new SlaBreachedEvent(updated, { tenantId, userId: 'system' }));
          breached++;
        }
      } else if (now >= tracking.warningAt) {
        await bus.publish(new SlaWarningTriggeredEvent(tracking, { tenantId, userId: 'system' }));
        warned++;
      }
    }

    monitoring.logInfo(`[SLAService] processDueTrackings: ${warned} warned, ${breached} breached`, { tenantId });
    return { warned, breached };
  }
}

export const slaService = new SLAService();