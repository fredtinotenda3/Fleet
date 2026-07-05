// modules/vendors/events/vendor.events.ts
import { DomainEvent } from '@/server/events/base/DomainEvent';
import { VENDOR_CREATED, VENDOR_UPDATED, VENDOR_STATUS_CHANGED, VENDOR_RATED } from '@/server/events/event-names';
import { Vendor } from '../types/vendor.types';

export class VendorCreatedEvent extends DomainEvent {
  constructor(vendor: Vendor, metadata?: Record<string, unknown>) {
    super(VENDOR_CREATED, { entityId: vendor._id, entityType: 'vendor', name: vendor.name, category: vendor.category, tenantId: vendor.tenantId }, metadata);
  }
}

export class VendorUpdatedEvent extends DomainEvent {
  constructor(vendor: Vendor, changes: Partial<Vendor>, metadata?: Record<string, unknown>) {
    super(VENDOR_UPDATED, { entityId: vendor._id, entityType: 'vendor', changes, tenantId: vendor.tenantId }, metadata);
  }
}

export class VendorStatusChangedEvent extends DomainEvent {
  constructor(vendor: Vendor, previousStatus: string, metadata?: Record<string, unknown>) {
    super(VENDOR_STATUS_CHANGED, { entityId: vendor._id, entityType: 'vendor', previousStatus, status: vendor.status, tenantId: vendor.tenantId }, metadata);
  }
}

export class VendorRatedEvent extends DomainEvent {
  constructor(vendor: Vendor, rating: number, metadata?: Record<string, unknown>) {
    super(VENDOR_RATED, { entityId: vendor._id, entityType: 'vendor', rating, newAverage: vendor.rating, tenantId: vendor.tenantId }, metadata);
  }
}