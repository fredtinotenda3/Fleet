// server/events/handlers/analytics/AnalyticsHandler.ts

import { IEventHandler } from '../../base/IEventHandler';
import { DomainEvent } from '../../base/DomainEvent';
import { queryCache } from '@/infrastructure/cache/query-cache.service';

export class AnalyticsHandler implements IEventHandler<DomainEvent> {
  async handle(event: DomainEvent): Promise<void> {
    const tenantId = (event.metadata?.tenantId as string) || 'default';
    const payload = event.payload;

    switch (event.eventName) {
      case 'VehicleCreated':
      case 'VehicleUpdated':
      case 'VehicleDeleted':
        await queryCache.invalidateVehicle(tenantId, payload.entityId as string);
        await queryCache.invalidatePattern(`vehicles:${tenantId}:*`);
        await queryCache.invalidatePattern(`fleet:${tenantId}:*`);
        break;
      case 'ExpenseCreated':
      case 'ExpenseUpdated':
      case 'ExpenseDeleted':
        await queryCache.invalidatePattern(`expenses:${tenantId}:*`);
        await queryCache.invalidatePattern(`analytics:${tenantId}:expenses:*`);
        await queryCache.invalidatePattern(`fleet:${tenantId}:*`);
        break;
      case 'FuelLogged':
      case 'FuelLogUpdated':
      case 'FuelLogDeleted':
        await queryCache.invalidatePattern(`fuel:${tenantId}:*`);
        await queryCache.invalidatePattern(`analytics:${tenantId}:fuel:*`);
        await queryCache.invalidatePattern(`fleet:${tenantId}:*`);
        break;
      case 'ReminderCreated':
      case 'ReminderUpdated':
      case 'ReminderCompleted':
      case 'ReminderDeleted':
        await queryCache.invalidatePattern(`maintenance:${tenantId}:*`);
        await queryCache.invalidatePattern(`analytics:${tenantId}:maintenance:*`);
        await queryCache.invalidatePattern(`fleet:${tenantId}:*`);
        break;
      case 'TripCreated':
      case 'TripUpdated':
      case 'TripDeleted':
        await queryCache.invalidatePattern(`trips:${tenantId}:*`);
        await queryCache.invalidatePattern(`analytics:${tenantId}:trips:*`);
        await queryCache.invalidatePattern(`fleet:${tenantId}:*`);
        break;
      default:
        await queryCache.invalidatePattern(`*:${tenantId}:*`);
        break;
    }
  }
}