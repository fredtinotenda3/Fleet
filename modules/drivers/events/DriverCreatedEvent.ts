// modules/drivers/events/DriverCreatedEvent.ts
//
// Follows the fuel-stations/fuel-cards convention of a module-local
// event-name string rather than editing the central
// server/events/event-names.ts registry blind.

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { Driver } from '@/shared/types/driver.types';

export const DRIVER_CREATED = 'driver.created';

export class DriverCreatedEvent extends DomainEvent {
  constructor(driver: Driver, metadata?: Record<string, unknown>) {
    super(
      DRIVER_CREATED,
      {
        entityId: driver._id,
        entityType: 'driver',
        name: driver.name,
        tenantId: driver.tenantId,
      },
      metadata
    );
  }
}

