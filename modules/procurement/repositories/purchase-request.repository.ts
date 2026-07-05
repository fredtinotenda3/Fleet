// modules/procurement/repositories/purchase-request.repository.ts
import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { PurchaseRequest, PurchaseRequestStatus } from '../types/procurement.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';

export class PurchaseRequestRepository extends BaseRepository<PurchaseRequest> {
  protected collectionName = 'tblpurchaserequests';

  async getFiltered(status: PurchaseRequestStatus | undefined, tenantId: string, pagination: PaginationParams): Promise<PaginatedResponse<PurchaseRequest>> {
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    return this.findWithPagination(filter as Filter<PurchaseRequest>, pagination, tenantId);
  }
}

export const purchaseRequestRepository = new PurchaseRequestRepository();