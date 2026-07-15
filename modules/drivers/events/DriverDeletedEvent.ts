// modules/drivers/events/DriverDeletedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';

export const DRIVER_DELETED = 'driver.deleted';

export class DriverDeletedEvent extends DomainEvent {
  constructor(
    driverId: string,
    name: string,
    tenantId: string,
    metadata?: Record<string, unknown>
  ) {
    super(
      DRIVER_DELETED,
      { entityId: driverId, entityType: 'driver', name, tenantId },
      metadata
    );
  }
}