// modules/fuel-cards/events/FuelCardCreatedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { FuelCard } from '@/shared/types/fuel-card.types';

export const FUEL_CARD_CREATED = 'fuel_card.created';

export class FuelCardCreatedEvent extends DomainEvent {
  constructor(card: FuelCard, metadata?: Record<string, unknown>) {
    super(
      FUEL_CARD_CREATED,
      {
        entityId: card._id,
        entityType: 'fuel_card',
        provider: card.provider,
        card_last4: card.card_last4,
        tenantId: card.tenantId,
      },
      metadata
    );
  }
}