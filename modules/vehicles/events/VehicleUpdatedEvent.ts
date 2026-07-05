// modules/vehicles/events/VehicleUpdatedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { VEHICLE_UPDATED } from '@/server/events/event-names';
import { Vehicle } from '@/shared/types/vehicle.types';

export class VehicleUpdatedEvent extends DomainEvent {
  constructor(vehicle: Vehicle, changes: Partial<Vehicle>, metadata?: Record<string, unknown>) {
    super(VEHICLE_UPDATED, {
      entityId: vehicle._id,
      entityType: 'vehicle',
      license_plate: vehicle.license_plate,
      changes,
      tenantId: vehicle.tenantId,
    }, metadata);
  }
}