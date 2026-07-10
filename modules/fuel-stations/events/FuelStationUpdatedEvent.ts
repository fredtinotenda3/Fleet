// modules/fuel-stations/events/FuelStationUpdatedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { FuelStation } from '@/shared/types/fuel-station.types';

export const FUEL_STATION_UPDATED = 'fuel_station.updated';

export class FuelStationUpdatedEvent extends DomainEvent {
  constructor(station: FuelStation, changes: Partial<FuelStation>, metadata?: Record<string, unknown>) {
    super(
      FUEL_STATION_UPDATED,
      {
        entityId: station._id,
        entityType: 'fuel_station',
        name: station.name,
        changes,
        tenantId: station.tenantId,
      },
      metadata
    );
  }
}