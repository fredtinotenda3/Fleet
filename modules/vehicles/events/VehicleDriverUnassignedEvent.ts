// modules/vehicles/events/VehicleDriverUnassignedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { VEHICLE_DRIVER_UNASSIGNED } from '@/server/events/event-names';
import { Vehicle } from '@/shared/types/vehicle.types';

/**
 * Emitted when a vehicle's current driver is cleared -- either an
 * explicit clear (driverId: null in the PATCH body) or the implicit
 * unassignment applied to a driver's PREVIOUS vehicle when they are
 * reassigned elsewhere (see AssignVehicleDriverHandler's "one vehicle
 * per driver" business rule).
 */
export class VehicleDriverUnassignedEvent extends DomainEvent {
  constructor(vehicle: Vehicle, previousDriverId: string | null, metadata?: Record<string, unknown>) {
    super(
      VEHICLE_DRIVER_UNASSIGNED,
      {
        entityId: vehicle._id,
        entityType: 'vehicle',
        license_plate: vehicle.license_plate,
        previousDriverId,
        tenantId: vehicle.tenantId,
      },
      metadata
    );
  }
}
