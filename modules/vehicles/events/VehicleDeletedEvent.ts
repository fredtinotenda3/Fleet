// modules/vehicles/events/VehicleDeletedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { VEHICLE_DELETED } from '@/server/events/event-names';

export class VehicleDeletedEvent extends DomainEvent {
  constructor(vehicleId: string, licensePlate: string, tenantId: string, metadata?: Record<string, unknown>) {
    super(VEHICLE_DELETED, {
      entityId: vehicleId,
      entityType: 'vehicle',
      license_plate: licensePlate,
      tenantId,
    }, metadata);
  }
}