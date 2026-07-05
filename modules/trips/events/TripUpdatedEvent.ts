// modules/trips/events/TripUpdatedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { TRIP_UPDATED } from '@/server/events/event-names';
import { Trip } from '@/shared/types/trip.types';

export class TripUpdatedEvent extends DomainEvent {
  constructor(
    trip: Trip,
    changes: Partial<Trip>,
    metadata?: Record<string, unknown>,
  ) {
    super(TRIP_UPDATED, {
      entityId: trip._id,
      entityType: 'trip',
      license_plate: trip.license_plate,
      distance: trip.distance_calculated,
      changes,
      tenantId: trip.tenantId,
    }, metadata);
  }
}