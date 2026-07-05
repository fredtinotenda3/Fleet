// modules/scheduling/events/scheduling.events.ts
import { DomainEvent } from '@/server/events/base/DomainEvent';
import {
  DRIVER_SHIFT_CREATED,
  DRIVER_SHIFT_UPDATED,
  DRIVER_SHIFT_CANCELLED,
  DRIVER_SHIFT_CONFLICT_DETECTED,
} from '@/server/events/event-names';
import { DriverShift } from '../types/scheduling.types';

export class DriverShiftCreatedEvent extends DomainEvent {
  constructor(shift: DriverShift, metadata?: Record<string, unknown>) {
    super(DRIVER_SHIFT_CREATED, { entityId: shift._id, entityType: 'driver_shift', driverId: shift.driverId, tenantId: shift.tenantId }, metadata);
  }
}

export class DriverShiftUpdatedEvent extends DomainEvent {
  constructor(shift: DriverShift, changes: Partial<DriverShift>, metadata?: Record<string, unknown>) {
    super(DRIVER_SHIFT_UPDATED, { entityId: shift._id, entityType: 'driver_shift', changes, tenantId: shift.tenantId }, metadata);
  }
}

export class DriverShiftCancelledEvent extends DomainEvent {
  constructor(shift: DriverShift, metadata?: Record<string, unknown>) {
    super(DRIVER_SHIFT_CANCELLED, { entityId: shift._id, entityType: 'driver_shift', tenantId: shift.tenantId }, metadata);
  }
}

export class DriverShiftConflictDetectedEvent extends DomainEvent {
  constructor(driverId: string, conflictingShiftIds: string[], tenantId: string, metadata?: Record<string, unknown>) {
    super(DRIVER_SHIFT_CONFLICT_DETECTED, { entityId: driverId, entityType: 'driver', conflictingShiftIds, tenantId }, metadata);
  }
}