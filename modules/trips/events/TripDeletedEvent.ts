// modules/trips/events/TripDeletedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { TRIP_DELETED } from '@/server/events/event-names';

export class TripDeletedEvent extends DomainEvent {
  constructor(
    tripId: string,
    licensePlate: string,
    distance: number,
    tenantId: string,
    metadata?: Record<string, unknown>,
  ) {
    super(TRIP_DELETED, {
      entityId: tripId,
      entityType: 'trip',
      license_plate: licensePlate,
      distance,
      tenantId,
    }, metadata);
  }
}