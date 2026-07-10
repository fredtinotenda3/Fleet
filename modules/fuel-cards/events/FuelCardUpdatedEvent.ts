// modules/fuel-cards/events/FuelCardUpdatedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { FuelCard } from '@/shared/types/fuel-card.types';

export const FUEL_CARD_UPDATED = 'fuel_card.updated';

export class FuelCardUpdatedEvent extends DomainEvent {
  constructor(card: FuelCard, changes: Partial<FuelCard>, metadata?: Record<string, unknown>) {
    super(
      FUEL_CARD_UPDATED,
      {
        entityId: card._id,
        entityType: 'fuel_card',
        provider: card.provider,
        changes,
        tenantId: card.tenantId,
      },
      metadata
    );
  }
}