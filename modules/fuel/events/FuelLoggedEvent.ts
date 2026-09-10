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
      /**
       * ADDED alongside the driver_id fix.
       *
       * AllocationPostingHandler already had a line reading
       * `payload.driverId` and copying it onto the posting -- and no
       * event in this codebase has ever published `driverId`, so the
       * ledger's driver column has always been empty. That is the same
       * "handler keyed on a name nothing publishes" family as the event
       * map itself and the AI trigger before it.
       *
       * Published under the record's own field name, `driver_id`; the
       * handler does the snake -> camel mapping in one documented place
       * rather than every event guessing the ledger's spelling.
       */
      driver_id: fuelLog.driver_id,
      tenantId: fuelLog.tenantId,
    }, metadata);
  }
}