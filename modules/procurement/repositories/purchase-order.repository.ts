// modules/procurement/repositories/purchase-order.repository.ts
import { Filter } from 'mongodb';
import { TenantScopedRepository } from '@/server/repositories/tenant-scoped.repository';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import '../types/procurement.tenancy-addendum';
import { PurchaseOrder, PurchaseOrderStatus } from '../types/procurement.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';

/**
 * SCOPED (Phase F). This is a segregation-of-duties fix, not merely a
 * visibility one: BRANCH_MANAGER holds Permission.PROCUREMENT_APPROVE,
 * so while procurement was org-wide, any branch manager could approve
 * any other branch's spend.
 */
export class PurchaseOrderRepository extends TenantScopedRepository<PurchaseOrder> {
  protected collectionName = 'tblpurchaseorders';

  async getFiltered(status: PurchaseOrderStatus | undefined, vendorId: string | undefined, tenantId: string, pagination: PaginationParams): Promise<PaginatedResponse<PurchaseOrder>> {
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (vendorId) filter.vendorId = vendorId;
    return this.findWithPagination(filter as Filter<PurchaseOrder>, pagination, tenantId);
  }

  /** Org-unit-scoped variant of getFiltered. */
  async getFilteredInScope(
    status: PurchaseOrderStatus | undefined,
    vendorId: string | undefined,
    context: TenantContext,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<PurchaseOrder>> {
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (vendorId) filter.vendorId = vendorId;
    return this.findWithPaginationInScope(filter as Filter<PurchaseOrder>, pagination, context);
  }
}

export const purchaseOrderRepository = new PurchaseOrderRepository();
