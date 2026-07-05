// modules/trips/events/TripCreatedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { TRIP_CREATED } from '@/server/events/event-names';
import { Trip } from '@/shared/types/trip.types';

export class TripCreatedEvent extends DomainEvent {
  constructor(trip: Trip, metadata?: Record<string, unknown>) {
    super(TRIP_CREATED, {
      entityId: trip._id,
      entityType: 'trip',
      license_plate: trip.license_plate,
      distance: trip.distance_calculated,
      mode: trip.mode,
      date: trip.date,
      tenantId: trip.tenantId,
    }, metadata);
  }
}