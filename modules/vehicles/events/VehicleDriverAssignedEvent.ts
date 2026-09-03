// modules/vehicles/events/VehicleDriverAssignedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { VEHICLE_DRIVER_ASSIGNED } from '@/server/events/event-names';
import { Vehicle } from '@/shared/types/vehicle.types';

/**
 * Emitted whenever a vehicle's current driver is set to a non-null value
 * -- both the first assignment and any subsequent change of driver.
 * Fired alongside (not instead of) VehicleUpdatedEvent, the same pattern
 * UpdateVehicleStatusHandler uses for VEHICLE_STATUS_CHANGED: the generic
 * event keeps existing subscribers (audit log, digital twin projection)
 * working unchanged, this one lets handlers that only care about
 * assignment subscribe narrowly.
 */
export class VehicleDriverAssignedEvent extends DomainEvent {
  constructor(
    vehicle: Vehicle,
    driverId: string,
    previousDriverId: string | null,
    metadata?: Record<string, unknown>
  ) {
    super(
      VEHICLE_DRIVER_ASSIGNED,
      {
        entityId: vehicle._id,
        entityType: 'vehicle',
        license_plate: vehicle.license_plate,
        driverId,
        previousDriverId,
        tenantId: vehicle.tenantId,
      },
      metadata
    );
  }
}
