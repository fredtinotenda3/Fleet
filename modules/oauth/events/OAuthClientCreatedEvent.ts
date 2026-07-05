// modules/oauth/events/OAuthClientCreatedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { OAUTH_CLIENT_CREATED } from './event-names';
import { OAuthClient } from '../types/oauth-client.types';

export class OAuthClientCreatedEvent extends DomainEvent {
  constructor(client: OAuthClient, metadata?: Record<string, unknown>) {
    super(OAUTH_CLIENT_CREATED, {
      entityId: client._id,
      entityType: 'oauth_client',
      clientId: client.clientId,
      name: client.name,
      organizationId: client.organizationId,
    }, metadata);
  }
}