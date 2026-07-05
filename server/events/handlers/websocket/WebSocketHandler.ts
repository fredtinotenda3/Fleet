// server/events/handlers/websocket/WebSocketHandler.ts

import { IEventHandler } from '../../base/IEventHandler';
import { DomainEvent } from '../../base/DomainEvent';
import { webSocketManager } from '@/infrastructure/websocket/server';

export class WebSocketHandler implements IEventHandler<DomainEvent> {
  async handle(event: DomainEvent): Promise<void> {
    const tenantId = (event.metadata?.tenantId as string) || 'default';
    const payload = event.payload;

    const wsEvent = this.mapToWebSocketEvent(event.eventName);
    if (!wsEvent) return;

    webSocketManager.emitToTenant(tenantId, wsEvent, {
      eventId: event.eventId,
      occurredOn: event.occurredOn,
      payload,
    });

    const userId = event.metadata?.userId as string;
    if (userId) {
      webSocketManager.emitToUser(userId, wsEvent, {
        eventId: event.eventId,
        occurredOn: event.occurredOn,
        payload,
      });
    }
  }

  private mapToWebSocketEvent(eventName: string): string | null {
    const mapping: Record<string, string> = {
      'VehicleCreated': 'vehicle:created',
      'VehicleUpdated': 'vehicle:updated',
      'VehicleDeleted': 'vehicle:deleted',
      'ExpenseCreated': 'expense:created',
      'ExpenseUpdated': 'expense:updated',
      'ExpenseDeleted': 'expense:deleted',
      'FuelLogged': 'fuel:logged',
      'FuelLogUpdated': 'fuel:updated',
      'FuelLogDeleted': 'fuel:deleted',
      'ReminderCreated': 'maintenance:created',
      'ReminderUpdated': 'maintenance:updated',
      'ReminderCompleted': 'maintenance:completed',
      'ReminderDeleted': 'maintenance:deleted',
      'ReminderOverdue': 'maintenance:overdue',
      'TripCreated': 'trip:created',
      'TripUpdated': 'trip:updated',
      'TripDeleted': 'trip:deleted',
      'InvoicePaid': 'billing:paid',
      'SubscriptionUpgraded': 'billing:upgraded',
      'OrganizationCreated': 'organization:created',
      'MemberJoined': 'organization:member_joined',
      'MemberRemoved': 'organization:member_removed',
      'TelematicsDataIngested': 'telematics:ingested',
      'GeofenceAlert': 'vehicle:geofence_alert',
      'DigitalTwinUpdated': 'digital_twin:updated',
    };
    return mapping[eventName] || null;
  }
}