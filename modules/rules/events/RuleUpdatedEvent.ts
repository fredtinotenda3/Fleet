// modules/rules/events/RuleUpdatedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { RULE_UPDATED } from '@/server/events/event-names';
import { Rule } from '../types/rule.types';

export class RuleUpdatedEvent extends DomainEvent {
  constructor(rule: Rule, changes: Partial<Rule>, metadata?: Record<string, unknown>) {
    super(
      RULE_UPDATED,
      {
        entityId: rule._id,
        entityType: 'rule',
        name: rule.name,
        trigger: rule.trigger,
        status: rule.status,
        version: rule.version,
        changes,
        tenantId: rule.tenantId,
      },
      metadata
    );
  }
}