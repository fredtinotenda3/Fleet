import { prefixMatch, containsMatch } from '@/shared/utils/regex.utils';
// modules/inventory/repositories/spare-part.repository.ts
import { Filter } from 'mongodb';
import { BaseRepository, isPlatformSentinelTenant } from '@/server/repositories/base.repository';
import { SparePart, SparePartFilters } from '../types/inventory.types';
import '../types/inventory.tenancy-addendum';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';

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
        { name: containsMatch(filters.search) },
        { sku: containsMatch(filters.search) },
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

  /**
   * Org-unit-scoped variant of getFiltered. A Workshop Manager only sees
   * the spare-parts stock held at their assigned workshop(s). Mirrors
   * FuelRepository/VehicleRepository's buildScopedQuery + InScope
   * pattern.
   */
  async getFilteredInScope(
    filters: SparePartFilters,
    context: TenantContext,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<SparePart>> {
    const collection = await this.getCollection();
    const query: Record<string, unknown> = { isDeleted: { $ne: true } };

    if (!isPlatformSentinelTenant(context.organizationId)) {
      query.tenantId = context.organizationId;
    }
    if (filters.category) query.category = filters.category;
    if (filters.search) {
      query.$or = [
        { name: containsMatch(filters.search) },
        { sku: containsMatch(filters.search) },
      ];
    }
    if (filters.belowReorderThreshold) {
      query.$expr = { $lte: ['$quantityOnHand', '$reorderThreshold'] };
    }

    Object.assign(query, tenantScopeService.buildFilter<SparePart>(context, 'orgUnitId'));

    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      collection.find(query as Filter<SparePart>).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      collection.countDocuments(query as Filter<SparePart>),
    ]);

    return {
      data: data as SparePart[],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  /** Org-unit-scoped low-stock alert list, for the Workshop Manager dashboard widget. */
  async findBelowReorderThresholdInScope(context: TenantContext): Promise<SparePart[]> {
    const collection = await this.getCollection();
    const query: Record<string, unknown> = {
      isDeleted: { $ne: true },
      $expr: { $lte: ['$quantityOnHand', '$reorderThreshold'] },
    };
    if (!isPlatformSentinelTenant(context.organizationId)) {
      query.tenantId = context.organizationId;
    }
    Object.assign(query, tenantScopeService.buildFilter<SparePart>(context, 'orgUnitId'));
    return collection.find(query as Filter<SparePart>).toArray() as Promise<SparePart[]>;
  }
}

export const sparePartRepository = new SparePartRepository();