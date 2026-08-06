// modules/procurement/repositories/purchase-request.repository.ts
import { Filter } from 'mongodb';
import { TenantScopedRepository } from '@/server/repositories/tenant-scoped.repository';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import '../types/procurement.tenancy-addendum';
import { PurchaseRequest, PurchaseRequestStatus } from '../types/procurement.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';

/**
 * SCOPED (Phase F). This is a segregation-of-duties fix, not merely a
 * visibility one: BRANCH_MANAGER holds Permission.PROCUREMENT_APPROVE,
 * so while procurement was org-wide, any branch manager could approve
 * any other branch's spend.
 */
export class PurchaseRequestRepository extends TenantScopedRepository<PurchaseRequest> {
  protected collectionName = 'tblpurchaserequests';

  async getFiltered(status: PurchaseRequestStatus | undefined, tenantId: string, pagination: PaginationParams): Promise<PaginatedResponse<PurchaseRequest>> {
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    return this.findWithPagination(filter as Filter<PurchaseRequest>, pagination, tenantId);
  }

  /** Org-unit-scoped variant of getFiltered. */
  async getFilteredInScope(
    status: PurchaseRequestStatus | undefined,
    context: TenantContext,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<PurchaseRequest>> {
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    return this.findWithPaginationInScope(filter as Filter<PurchaseRequest>, pagination, context);
  }
}

export const purchaseRequestRepository = new PurchaseRequestRepository();