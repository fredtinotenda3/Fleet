// modules/vendors/repositories/vendor.repository.ts
import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { Vendor, VendorFilters } from '../types/vendor.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';

export class VendorRepository extends BaseRepository<Vendor> {
  protected collectionName = 'tblvendors';

  async getFiltered(filters: VendorFilters, tenantId: string, pagination: PaginationParams): Promise<PaginatedResponse<Vendor>> {
    const filter: Record<string, unknown> = {};
    if (filters.category) filter.category = filters.category;
    if (filters.status) filter.status = filters.status;
    if (filters.search) {
      filter.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { taxId: { $regex: filters.search, $options: 'i' } },
      ];
    }
    return this.findWithPagination(filter as Filter<Vendor>, pagination, tenantId);
  }

  async applyRating(id: string, tenantId: string, newRating: number): Promise<Vendor | null> {
    const existing = await this.findById(id, tenantId);
    if (!existing) return null;
    const count = (existing.ratingCount || 0) + 1;
    const currentAvg = existing.rating || 0;
    const nextAvg = (currentAvg * (count - 1) + newRating) / count;
    return this.update(id, { rating: Number(nextAvg.toFixed(2)), ratingCount: count } as Partial<Vendor>, tenantId);
  }
}

export const vendorRepository = new VendorRepository();