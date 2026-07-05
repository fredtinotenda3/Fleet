// modules/digital-twin/events/DigitalTwinUpdatedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { DIGITAL_TWIN_UPDATED } from '@/server/events/event-names';
import { VehicleDigitalTwin } from '../types/digital-twin.types';

export class DigitalTwinUpdatedEvent extends DomainEvent {
  constructor(twin: VehicleDigitalTwin, sourceEvent: string, metadata?: Record<string, unknown>) {
    super(DIGITAL_TWIN_UPDATED, {
      entityId: twin.vehicleId,
      entityType: 'digital_twin',
      license_plate: twin.license_plate,
      sourceEvent,
      healthScore: twin.currentState.healthScore,
      alertCount: twin.alerts.filter((a) => !a.acknowledged).length,
      tenantId: twin.tenantId,
    }, metadata);
  }
}