// modules/compliance/events/compliance.events.ts
import { DomainEvent } from '@/server/events/base/DomainEvent';
import {
  COMPLIANCE_RULE_CREATED,
  COMPLIANCE_RECORD_CREATED,
  COMPLIANCE_RECORD_DUE_SOON,
  COMPLIANCE_RECORD_OVERDUE,
  COMPLIANCE_RECORD_RESOLVED,
} from '@/server/events/event-names';
import { ComplianceRule, ComplianceRecord } from '../types/compliance.types';

export class ComplianceRuleCreatedEvent extends DomainEvent {
  constructor(rule: ComplianceRule, metadata?: Record<string, unknown>) {
    super(COMPLIANCE_RULE_CREATED, { entityId: rule._id, entityType: 'compliance_rule', name: rule.name, appliesTo: rule.appliesTo, tenantId: rule.tenantId }, metadata);
  }
}

export class ComplianceRecordCreatedEvent extends DomainEvent {
  constructor(record: ComplianceRecord, metadata?: Record<string, unknown>) {
    super(COMPLIANCE_RECORD_CREATED, { entityId: record._id, entityType: 'compliance_record', trackedEntityId: record.entityId, trackedEntityType: record.entityType, dueDate: record.dueDate, tenantId: record.tenantId }, metadata);
  }
}

export class ComplianceRecordDueSoonEvent extends DomainEvent {
  constructor(record: ComplianceRecord, metadata?: Record<string, unknown>) {
    super(COMPLIANCE_RECORD_DUE_SOON, { entityId: record._id, entityType: 'compliance_record', trackedEntityId: record.entityId, dueDate: record.dueDate, tenantId: record.tenantId }, metadata);
  }
}

export class ComplianceRecordOverdueEvent extends DomainEvent {
  constructor(record: ComplianceRecord, metadata?: Record<string, unknown>) {
    super(COMPLIANCE_RECORD_OVERDUE, { entityId: record._id, entityType: 'compliance_record', trackedEntityId: record.entityId, dueDate: record.dueDate, tenantId: record.tenantId }, metadata);
  }
}

export class ComplianceRecordResolvedEvent extends DomainEvent {
  constructor(record: ComplianceRecord, metadata?: Record<string, unknown>) {
    super(COMPLIANCE_RECORD_RESOLVED, { entityId: record._id, entityType: 'compliance_record', trackedEntityId: record.entityId, tenantId: record.tenantId }, metadata);
  }
}