// modules/sla/events/sla.events.ts
import { DomainEvent } from '@/server/events/base/DomainEvent';
import {
  SLA_POLICY_CREATED,
  SLA_TRACKING_STARTED,
  SLA_WARNING_TRIGGERED,
  SLA_BREACHED,
  SLA_MET,
} from '@/server/events/event-names';
import { SLAPolicy, SLATracking } from '../types/sla.types';

export class SlaPolicyCreatedEvent extends DomainEvent {
  constructor(policy: SLAPolicy, metadata?: Record<string, unknown>) {
    super(SLA_POLICY_CREATED, { entityId: policy._id, entityType: 'sla_policy', name: policy.name, tenantId: policy.tenantId }, metadata);
  }
}

export class SlaTrackingStartedEvent extends DomainEvent {
  constructor(tracking: SLATracking, metadata?: Record<string, unknown>) {
    super(SLA_TRACKING_STARTED, { entityId: tracking._id, entityType: 'sla_tracking', trackedEntityId: tracking.entityId, trackedEntityType: tracking.entityType, targetAt: tracking.targetAt, tenantId: tracking.tenantId }, metadata);
  }
}

export class SlaWarningTriggeredEvent extends DomainEvent {
  constructor(tracking: SLATracking, metadata?: Record<string, unknown>) {
    super(SLA_WARNING_TRIGGERED, { entityId: tracking._id, entityType: 'sla_tracking', trackedEntityId: tracking.entityId, targetAt: tracking.targetAt, tenantId: tracking.tenantId }, metadata);
  }
}

export class SlaBreachedEvent extends DomainEvent {
  constructor(tracking: SLATracking, metadata?: Record<string, unknown>) {
    super(SLA_BREACHED, { entityId: tracking._id, entityType: 'sla_tracking', trackedEntityId: tracking.entityId, trackedEntityType: tracking.entityType, tenantId: tracking.tenantId }, metadata);
  }
}

export class SlaMetEvent extends DomainEvent {
  constructor(tracking: SLATracking, metadata?: Record<string, unknown>) {
    super(SLA_MET, { entityId: tracking._id, entityType: 'sla_tracking', trackedEntityId: tracking.entityId, tenantId: tracking.tenantId }, metadata);
  }
}