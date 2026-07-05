// modules/bookings/events/booking.events.ts
import { DomainEvent } from '@/server/events/base/DomainEvent';
import {
  BOOKING_CREATED,
  BOOKING_APPROVED,
  BOOKING_REJECTED,
  BOOKING_CANCELLED,
  BOOKING_CHECKED_OUT,
  BOOKING_CHECKED_IN,
} from '@/server/events/event-names';
import { Booking } from '../types/booking.types';

export class BookingCreatedEvent extends DomainEvent {
  constructor(booking: Booking, metadata?: Record<string, unknown>) {
    super(BOOKING_CREATED, { entityId: booking._id, entityType: 'booking', license_plate: booking.license_plate, requestedBy: booking.requestedBy, tenantId: booking.tenantId }, metadata);
  }
}

export class BookingApprovedEvent extends DomainEvent {
  constructor(booking: Booking, metadata?: Record<string, unknown>) {
    super(BOOKING_APPROVED, { entityId: booking._id, entityType: 'booking', approvedBy: booking.approvedBy, tenantId: booking.tenantId }, metadata);
  }
}

export class BookingRejectedEvent extends DomainEvent {
  constructor(booking: Booking, metadata?: Record<string, unknown>) {
    super(BOOKING_REJECTED, { entityId: booking._id, entityType: 'booking', reason: booking.rejectionReason, tenantId: booking.tenantId }, metadata);
  }
}

export class BookingCancelledEvent extends DomainEvent {
  constructor(booking: Booking, metadata?: Record<string, unknown>) {
    super(BOOKING_CANCELLED, { entityId: booking._id, entityType: 'booking', tenantId: booking.tenantId }, metadata);
  }
}

export class BookingCheckedOutEvent extends DomainEvent {
  constructor(booking: Booking, metadata?: Record<string, unknown>) {
    super(BOOKING_CHECKED_OUT, { entityId: booking._id, entityType: 'booking', checkOutOdometer: booking.checkOutOdometer, tenantId: booking.tenantId }, metadata);
  }
}

export class BookingCheckedInEvent extends DomainEvent {
  constructor(booking: Booking, metadata?: Record<string, unknown>) {
    super(BOOKING_CHECKED_IN, { entityId: booking._id, entityType: 'booking', checkInOdometer: booking.checkInOdometer, tenantId: booking.tenantId }, metadata);
  }
}