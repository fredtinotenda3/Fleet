// modules/inventory/repositories/spare-part.repository.ts
import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { SparePart, SparePartFilters } from '../types/inventory.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';

export class SparePartRepository extends BaseRepository<SparePart> {
  protected collectionName = 'tblspareparts';

  async findBySku(sku: string, tenantId: string): Promise<SparePart | null> {
    return this.findOne({ sku } as Filter<SparePart>, tenantId);
  }

  async getFiltered(filters: SparePartFilters, tenantId: string, pagination: PaginationParams): Promise<PaginatedResponse<SparePart>> {
    const filter: Record<string, unknown> = {};
    if (filters.category) filter.category = filters.category;
    if (filters.search) {
      filter.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { sku: { $regex: filters.search, $options: 'i' } },
      ];
    }
    if (filters.belowReorderThreshold) {
      filter.$expr = { $lte: ['$quantityOnHand', '$reorderThreshold'] };
    }
    return this.findWithPagination(filter as Filter<SparePart>, pagination, tenantId);
  }

  async adjustQuantity(id: string, tenantId: string, delta: number): Promise<SparePart | null> {
    const existing = await this.findById(id, tenantId);
    if (!existing) return null;
    const nextQty = existing.quantityOnHand + delta;
    if (nextQty < 0) throw new Error('Stock quantity cannot go negative');
    return this.update(id, { quantityOnHand: nextQty } as Partial<SparePart>, tenantId);
  }
}

export const sparePartRepository = new SparePartRepository();