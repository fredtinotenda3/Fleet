// modules/organizations/events/MemberJoinedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { MEMBER_JOINED } from '@/server/events/event-names';

export class MemberJoinedEvent extends DomainEvent {
  constructor(
    organizationId: string,
    memberEmail: string,
    memberName: string,
    role: string,
    ownerId: string,
    tenantId: string,
    metadata?: Record<string, unknown>,
  ) {
    super(MEMBER_JOINED, {
      entityId: organizationId,
      entityType: 'organization',
      memberEmail,
      memberName,
      role,
      ownerId,
      tenantId,
    }, metadata);
  }
}