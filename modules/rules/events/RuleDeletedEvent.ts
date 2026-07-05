// modules/rules/events/RuleDeletedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { RULE_DELETED } from '@/server/events/event-names';

export class RuleDeletedEvent extends DomainEvent {
  constructor(ruleId: string, name: string, tenantId: string, metadata?: Record<string, unknown>) {
    super(
      RULE_DELETED,
      {
        entityId: ruleId,
        entityType: 'rule',
        name,
        tenantId,
      },
      metadata
    );
  }
}