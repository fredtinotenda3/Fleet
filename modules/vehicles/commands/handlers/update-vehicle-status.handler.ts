// modules/vehicles/commands/handlers/update-vehicle-status.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { UpdateVehicleStatusCommand } from '../update-vehicle-status.command';
import { VehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { Vehicle } from '@/shared/types/vehicle.types';
import { AppError, NotFoundError } from '@/server/errors/app.errors';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { VehicleUpdatedEvent } from '@/modules/vehicles/events/VehicleUpdatedEvent';
import { VEHICLE_STATUS_CHANGED } from '@/server/events/event-names';
import { DomainEvent } from '@/server/events/base/DomainEvent';

const VALID_STATUSES: Array<Vehicle['status']> = [
  'active',
  'inactive',
  'maintenance',
];

export class UpdateVehicleStatusHandler
  implements ICommandHandler<UpdateVehicleStatusCommand, Vehicle>
{
  constructor(private readonly vehicleRepo: VehicleRepository) {}

  async execute(command: UpdateVehicleStatusCommand): Promise<Vehicle> {
    if (!VALID_STATUSES.includes(command.status)) {
      throw new AppError('Invalid status value', 'INVALID_STATUS', 400);
    }

    const updated = await this.vehicleRepo.update(
      command.vehicleId,
      { status: command.status },
      command.tenantId,
      command.userId
    );

    if (!updated) {
      throw new NotFoundError('Vehicle not found');
    }

    // Re-bind to a fresh `const` typed as `Vehicle` (not `Vehicle | null`)
    // so the type stays narrowed inside the nested class constructor
    // below — TS does not carry control-flow narrowing of `updated`
    // across an inline function/class scope.
    const vehicle: Vehicle = updated;

    // Emit event
    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new VehicleUpdatedEvent(vehicle, { status: command.status }, {
      tenantId: command.tenantId,
      userId: command.userId,
      correlationId: command.commandName,
    }));

    // Also emit a specific status changed event for more granular handling
    await eventBus.publish(new (class extends DomainEvent {
      constructor() {
        super(VEHICLE_STATUS_CHANGED, {
          entityId: vehicle._id,
          entityType: 'vehicle',
          license_plate: vehicle.license_plate,
          oldStatus: vehicle.status,
          newStatus: command.status,
          tenantId: vehicle.tenantId,
        }, {
          tenantId: command.tenantId,
          userId: command.userId,
          correlationId: command.commandName,
        });
      }
    })());

    return vehicle;
  }
}