// modules/vehicles/events/VehicleCreatedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { VEHICLE_CREATED } from '@/server/events/event-names';
import { Vehicle } from '@/shared/types/vehicle.types';

export class VehicleCreatedEvent extends DomainEvent {
  constructor(vehicle: Vehicle, metadata?: Record<string, unknown>) {
    super(VEHICLE_CREATED, {
      entityId: vehicle._id,
      entityType: 'vehicle',
      license_plate: vehicle.license_plate,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      status: vehicle.status,
      tenantId: vehicle.tenantId,
    }, metadata);
  }
}