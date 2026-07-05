// modules/fuel/events/FuelLoggedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { FUEL_LOGGED } from '@/server/events/event-names';
import { FuelLog } from '@/shared/types/fuel.types';

export class FuelLoggedEvent extends DomainEvent {
  constructor(fuelLog: FuelLog, metadata?: Record<string, unknown>) {
    super(FUEL_LOGGED, {
      entityId: fuelLog._id,
      entityType: 'fuel_log',
      license_plate: fuelLog.license_plate,
      fuel_volume: fuelLog.fuel_volume,
      cost: fuelLog.cost,
      odometer: fuelLog.odometer,
      tenantId: fuelLog.tenantId,
    }, metadata);
  }
}