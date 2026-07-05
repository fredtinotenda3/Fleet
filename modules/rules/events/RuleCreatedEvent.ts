// modules/rules/events/RuleCreatedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { RULE_CREATED } from '@/server/events/event-names';
import { Rule } from '../types/rule.types';

export class RuleCreatedEvent extends DomainEvent {
  constructor(rule: Rule, metadata?: Record<string, unknown>) {
    super(
      RULE_CREATED,
      {
        entityId: rule._id,
        entityType: 'rule',
        name: rule.name,
        category: rule.category,
        trigger: rule.trigger,
        status: rule.status,
        tenantId: rule.tenantId,
      },
      metadata
    );
  }
}