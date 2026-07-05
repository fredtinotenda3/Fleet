// modules/inventory/repositories/stock-movement.repository.ts
import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { StockMovement } from '../types/inventory.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';

export class StockMovementRepository extends BaseRepository<StockMovement> {
  protected collectionName = 'tblstockmovements';

  async listForPart(sparePartId: string, tenantId: string, pagination: PaginationParams): Promise<PaginatedResponse<StockMovement>> {
    return this.findWithPagination({ sparePartId } as Filter<StockMovement>, pagination, tenantId);
  }
}

export const stockMovementRepository = new StockMovementRepository();