// modules/fuel-stations/events/FuelStationDeletedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';

export const FUEL_STATION_DELETED = 'fuel_station.deleted';

export class FuelStationDeletedEvent extends DomainEvent {
  constructor(stationId: string, name: string, tenantId: string, metadata?: Record<string, unknown>) {
    super(
      FUEL_STATION_DELETED,
      { entityId: stationId, entityType: 'fuel_station', name, tenantId },
      metadata
    );
  }
}