// modules/vendors/services/vendor.service.ts
import { vendorRepository, VendorRepository } from '../repositories/vendor.repository';
import { Vendor, VendorCreateDTO, VendorUpdateDTO, VendorFilters } from '../types/vendor.types';
import { NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { VendorCreatedEvent, VendorUpdatedEvent, VendorStatusChangedEvent, VendorRatedEvent } from '../events/vendor.events';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

export class VendorService {
  constructor(private readonly repo: VendorRepository = vendorRepository) {}

  async create(data: VendorCreateDTO, tenantId: string, userId?: string): Promise<Vendor> {
    if (!data.name?.trim()) throw new ValidationError('Vendor name is required');
    const created = await this.repo.create(
      {
        tenantId,
        name: data.name.trim(),
        category: data.category,
        status: 'pending_review',
        taxId: data.taxId,
        address: data.address,
        contacts: data.contacts || [],
        paymentTerms: data.paymentTerms,
        ratingCount: 0,
        notes: data.notes,
        tags: data.tags || [],
      } as Omit<Vendor, '_id' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt'>,
      tenantId,
      userId
    );

    const bus = EventBusFactory.getInstance();
    await bus.publish(new VendorCreatedEvent(created, { tenantId, userId }));
    await auditLog.logCreate(userId || 'system', tenantId, 'vendor', created._id!, { name: created.name });

    return created;
  }

  async update(id: string, data: VendorUpdateDTO, tenantId: string, userId?: string): Promise<Vendor> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Vendor not found');

    const statusChanged = data.status && data.status !== existing.status;
    const updated = await this.repo.update(id, data as Partial<Vendor>, tenantId, userId);
    if (!updated) throw new NotFoundError('Vendor not found');

    const bus = EventBusFactory.getInstance();
    await bus.publish(new VendorUpdatedEvent(updated, data as Partial<Vendor>, { tenantId, userId }));
    if (statusChanged) {
      await bus.publish(new VendorStatusChangedEvent(updated, existing.status, { tenantId, userId }));
    }
    await auditLog.logUpdate(userId || 'system', tenantId, 'vendor', id, existing, updated);

    return updated;
  }

  async rate(id: string, rating: number, tenantId: string, userId?: string): Promise<Vendor> {
    if (rating < 0 || rating > 5) throw new ValidationError('Rating must be between 0 and 5');
    const updated = await this.repo.applyRating(id, tenantId, rating);
    if (!updated) throw new NotFoundError('Vendor not found');

    const bus = EventBusFactory.getInstance();
    await bus.publish(new VendorRatedEvent(updated, rating, { tenantId, userId }));

    return updated;
  }

  async getById(id: string, tenantId: string): Promise<Vendor> {
    const vendor = await this.repo.findById(id, tenantId);
    if (!vendor) throw new NotFoundError('Vendor not found');
    return vendor;
  }

  async list(filters: VendorFilters, pagination: PaginationParams, tenantId: string): Promise<PaginatedResponse<Vendor>> {
    return this.repo.getFiltered(filters, tenantId, pagination);
  }

  async delete(id: string, tenantId: string, userId?: string): Promise<void> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Vendor not found');
    await this.repo.softDelete(id, tenantId, userId);
    await auditLog.logDelete(userId || 'system', tenantId, 'vendor', id, { name: existing.name });
  }
}

export const vendorService = new VendorService();