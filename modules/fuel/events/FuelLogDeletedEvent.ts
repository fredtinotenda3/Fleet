// modules/fuel/events/FuelLogDeletedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { FUEL_LOG_DELETED } from '@/server/events/event-names';

export class FuelLogDeletedEvent extends DomainEvent {
  constructor(
    fuelLogId: string,
    licensePlate: string,
    fuelVolume: number,
    tenantId: string,
    metadata?: Record<string, unknown>,
  ) {
    super(FUEL_LOG_DELETED, {
      entityId: fuelLogId,
      entityType: 'fuel_log',
      license_plate: licensePlate,
      fuel_volume: fuelVolume,
      tenantId,
    }, metadata);
  }
}