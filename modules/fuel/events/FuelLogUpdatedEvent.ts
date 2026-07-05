// modules/fuel/events/FuelLogUpdatedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { FUEL_LOG_UPDATED } from '@/server/events/event-names';
import { FuelLog } from '@/shared/types/fuel.types';

export class FuelLogUpdatedEvent extends DomainEvent {
  constructor(
    fuelLog: FuelLog,
    changes: Partial<FuelLog>,
    metadata?: Record<string, unknown>,
  ) {
    super(FUEL_LOG_UPDATED, {
      entityId: fuelLog._id,
      entityType: 'fuel_log',
      license_plate: fuelLog.license_plate,
      fuel_volume: fuelLog.fuel_volume,
      changes,
      tenantId: fuelLog.tenantId,
    }, metadata);
  }
}