// modules/procurement/repositories/purchase-order.repository.ts
import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { PurchaseOrder, PurchaseOrderStatus } from '../types/procurement.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';

export class PurchaseOrderRepository extends BaseRepository<PurchaseOrder> {
  protected collectionName = 'tblpurchaseorders';

  async getFiltered(status: PurchaseOrderStatus | undefined, vendorId: string | undefined, tenantId: string, pagination: PaginationParams): Promise<PaginatedResponse<PurchaseOrder>> {
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (vendorId) filter.vendorId = vendorId;
    return this.findWithPagination(filter as Filter<PurchaseOrder>, pagination, tenantId);
  }
}

export const purchaseOrderRepository = new PurchaseOrderRepository();