// modules/drivers/events/DriverUpdatedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { Driver } from '@/shared/types/driver.types';

export const DRIVER_UPDATED = 'driver.updated';

export class DriverUpdatedEvent extends DomainEvent {
  constructor(driver: Driver, changes: Partial<Driver>, metadata?: Record<string, unknown>) {
    super(
      DRIVER_UPDATED,
      {
        entityId: driver._id,
        entityType: 'driver',
        name: driver.name,
        changes,
        tenantId: driver.tenantId,
      },
      metadata
    );
  }
}