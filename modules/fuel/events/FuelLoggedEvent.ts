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
      /**
       * ADDED for the allocation ledger.
       *
       * AllocationPostingHandler dates a posting from `payload.date` and
       * fell back to `new Date()` when it was absent -- which it always
       * was. So a fuel log entered today for last month's refuel posted
       * into THIS month, silently moving cost between accounting
       * periods. The period is the whole point of the ledger.
       */
      date: fuelLog.date,
      /** Currency travels with the amount, so a posting is never converted at an assumed 1:1. */
      currency: fuelLog.currency,
      tenantId: fuelLog.tenantId,
    }, metadata);
  }
}