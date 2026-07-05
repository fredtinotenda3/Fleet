// modules/security/events/api-key.events.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { API_KEY_CREATED, API_KEY_REVOKED } from '@/server/events/event-names';

export class ApiKeyCreatedEvent extends DomainEvent {
  constructor(apiKeyId: string, name: string, organizationId: string, metadata?: Record<string, unknown>) {
    super(
      API_KEY_CREATED,
      { entityId: apiKeyId, entityType: 'api_key', name, tenantId: organizationId },
      metadata
    );
  }
}

export class ApiKeyRevokedEvent extends DomainEvent {
  constructor(apiKeyId: string, name: string, organizationId: string, metadata?: Record<string, unknown>) {
    super(
      API_KEY_REVOKED,
      { entityId: apiKeyId, entityType: 'api_key', name, tenantId: organizationId },
      metadata
    );
  }
}