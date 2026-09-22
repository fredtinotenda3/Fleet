// modules/transport-cost/services/transport-cost-vat-config.service.ts
//
// Phase O3. The ONLY place currency/VAT basis is decided for a transport
// cost posting -- every caller (TransportCostPostingService, and any
// future reporting/backfill code) goes through resolve() rather than
// reading TransportCostImportVatConfig or the DEFAULT constants
// directly, mirroring FinanceSettingsService.resolve's own reasoning: a
// default applied inconsistently across two call sites does not produce
// an error, it produces two figures that quietly disagree.

import {
  TransportCostVatConfigRepository,
  transportCostVatConfigRepository,
} from '../repositories/transport-cost-vat-config.repository';
import { TRANSPORT_COST_VAT_CONFIG_DEFAULTS } from '../utils/vat-config-defaults';
import { TransportCostSheetFamily } from '@/shared/types/transport-cost.types';
import { ResolvedTransportCostVatConfig } from '@/shared/types/transport-cost-vat-config.types';

export class TransportCostVatConfigService {
  constructor(private readonly repo: TransportCostVatConfigRepository) {}

  /**
   * Resolution order (most-specific wins):
   *   1. A confirmed row scoped to THIS import batch.
   *   2. A confirmed row scoped to the whole sheet family.
   *   3. TRANSPORT_COST_VAT_CONFIG_DEFAULTS -- provisional, flagged.
   *
   * A row with no `confirmedBy` (a draft, never actually a real write
   * path today -- see the type's header) is treated as if it did not
   * exist at all: an unconfirmed row is not a weaker version of a
   * confirmation, it is not one.
   *
   * A CONFIRMED row missing `currency` specifically (VAT basis
   * confirmed, currency not, say) still falls through to the default
   * currency rather than posting with an undefined one -- never
   * partially-fabricate, never partially silently-fail either; currency
   * and VAT basis resolve independently, and `isProvisionalDefault`
   * reports CURRENCY's provenance specifically (the field the delivery
   * README's provisional-USD note is actually about).
   */
  async resolve(
    sheetFamily: TransportCostSheetFamily,
    importBatchId: string | undefined,
    tenantId: string
  ): Promise<ResolvedTransportCostVatConfig> {
    const batchConfig = importBatchId
      ? await this.repo.findByImportBatch(importBatchId, tenantId)
      : null;
    const familyConfig = batchConfig ? null : await this.repo.findForSheetFamily(sheetFamily, tenantId);
    const saved = batchConfig ?? familyConfig;

    const fallback = TRANSPORT_COST_VAT_CONFIG_DEFAULTS[sheetFamily];
    const confirmed = Boolean(saved?.confirmedBy);
    const confirmedCurrency = confirmed ? saved!.currency : undefined;

    return {
      sheetFamily,
      currency: confirmedCurrency ?? fallback.currency,
      vatBasis: (confirmed ? saved!.vatBasis : undefined) ?? fallback.vatBasis,
      vatRatePercent: confirmed ? saved!.vatRatePercent : undefined,
      isProvisionalDefault: !confirmedCurrency,
    };
  }
}

export const transportCostVatConfigService = new TransportCostVatConfigService(
  transportCostVatConfigRepository
);
