// modules/fuel-cards/events/FuelCardDeletedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';

export const FUEL_CARD_DELETED = 'fuel_card.deleted';

export class FuelCardDeletedEvent extends DomainEvent {
  constructor(cardId: string, provider: string, tenantId: string, metadata?: Record<string, unknown>) {
    super(
      FUEL_CARD_DELETED,
      { entityId: cardId, entityType: 'fuel_card', provider, tenantId },
      metadata
    );
  }
}