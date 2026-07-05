// modules/oauth/events/OAuthTokenIssuedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { OAUTH_TOKEN_ISSUED } from './event-names';

export class OAuthTokenIssuedEvent extends DomainEvent {
  constructor(
    clientId: string,
    tokenType: string,
    scopes: string[],
    organizationId: string,
    metadata?: Record<string, unknown>
  ) {
    super(OAUTH_TOKEN_ISSUED, {
      entityType: 'oauth_token',
      clientId,
      tokenType,
      scopes,
      organizationId,
    }, metadata);
  }
}