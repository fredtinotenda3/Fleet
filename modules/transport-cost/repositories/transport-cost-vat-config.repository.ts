// modules/transport-cost/repositories/transport-cost-vat-config.repository.ts
//
// Phase O3. Plain BaseRepository, same organization-level reasoning as
// transport-partner.repository.ts / contracted-vehicle.repository.ts:
// currency/VAT basis are configured per sheet family (and optionally per
// import batch), not per branch -- there is no orgUnitId to scope by.

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { TransportCostImportVatConfig } from '@/shared/types/transport-cost-vat-config.types';
import { TransportCostSheetFamily } from '@/shared/types/transport-cost.types';

export class TransportCostVatConfigRepository extends BaseRepository<TransportCostImportVatConfig> {
  protected collectionName = 'tbltransportcostvatconfigs';

  /** The batch-scoped override for one import, if a human has saved one. */
  async findByImportBatch(
    importBatchId: string,
    tenantId: string
  ): Promise<TransportCostImportVatConfig | null> {
    return this.findOne({ importBatchId } as Filter<TransportCostImportVatConfig>, tenantId);
  }

  /**
   * The sheetFamily-wide config -- rows with no importBatchId. At most
   * one is expected per (tenant, sheetFamily); if more than one exists
   * (e.g. a race between two confirmations), the most recently updated
   * one wins rather than throwing, since this is configuration a human
   * can always re-save, not financial evidence.
   */
  async findForSheetFamily(
    sheetFamily: TransportCostSheetFamily,
    tenantId: string
  ): Promise<TransportCostImportVatConfig | null> {
    const rows = await this.findMany(
      { sheetFamily, importBatchId: { $exists: false } } as Filter<TransportCostImportVatConfig>,
      tenantId,
      { sortBy: 'updatedAt', sortOrder: 'desc', limit: 1 }
    );
    return rows[0] ?? null;
  }
}

export const transportCostVatConfigRepository = new TransportCostVatConfigRepository();
