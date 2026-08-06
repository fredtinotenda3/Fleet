// modules/inventory/repositories/stock-movement.repository.ts
import { Filter } from 'mongodb';
import { BaseRepository, isPlatformSentinelTenant } from '@/server/repositories/base.repository';
import { StockMovement } from '../types/inventory.types';
import '../types/inventory.tenancy-addendum';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';

export class StockMovementRepository extends BaseRepository<StockMovement> {
  protected collectionName = 'tblstockmovements';

  async listForPart(sparePartId: string, tenantId: string, pagination: PaginationParams): Promise<PaginatedResponse<StockMovement>> {
    return this.findWithPagination({ sparePartId } as Filter<StockMovement>, pagination, tenantId);
  }

  /**
   * Org-unit-scoped variant of listForPart. Movement history for a part
   * held at a workshop outside the caller's accessible org units is
   * hidden, same as the part itself would be via
   * SparePartRepository.getFilteredInScope.
   */
  async listForPartInScope(
    sparePartId: string,
    context: TenantContext,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<StockMovement>> {
    const collection = await this.getCollection();
    const query: Record<string, unknown> = {
      isDeleted: { $ne: true },
      sparePartId,
    };
    if (!isPlatformSentinelTenant(context.organizationId)) {
      query.tenantId = context.organizationId;
    }
    Object.assign(query, tenantScopeService.buildFilter<StockMovement>(context, 'orgUnitId'));

    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      collection.find(query as Filter<StockMovement>).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      collection.countDocuments(query as Filter<StockMovement>),
    ]);

    return {
      data: data as StockMovement[],
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
}

export const stockMovementRepository = new StockMovementRepository();