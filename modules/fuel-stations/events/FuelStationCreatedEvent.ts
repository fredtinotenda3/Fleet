// modules/fuel-stations/events/FuelStationCreatedEvent.ts
//
// NOTE: this module intentionally defines its own event-name string
// rather than importing from server/events/event-names.ts, since that
// central registry file wasn't provided and appending to it blind would
// risk clobbering existing constants. Follows the same DomainEvent shape
// used by modules/fuel/events/*.

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { FuelStation } from '@/shared/types/fuel-station.types';

export const FUEL_STATION_CREATED = 'fuel_station.created';

export class FuelStationCreatedEvent extends DomainEvent {
  constructor(station: FuelStation, metadata?: Record<string, unknown>) {
    super(
      FUEL_STATION_CREATED,
      {
        entityId: station._id,
        entityType: 'fuel_station',
        name: station.name,
        tenantId: station.tenantId,
      },
      metadata
    );
  }
}