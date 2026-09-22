// modules/transport-cost/utils/vat-config-defaults.ts
//
// PROVISIONAL DEFAULTS -- NOT A CLIENT CONFIRMATION.
//
// Mirrors modules/finance/services/finance-settings.service.ts's own
// FINANCE_SETTINGS_DEFAULTS: every default made explicit, in one place,
// so a reader can see exactly what an unconfigured sheet family gets --
// rather than a guess buried inside the posting service.
//
// currency: 'USD' for every sheet family is an ENGINEERING DEFAULT,
// authorized specifically so Phase O3 can post real postings and Phase
// O4 can show real reconciled numbers for the client demo now, not a
// value Olivine has confirmed. No currency column exists anywhere in
// either source sheet (verified against the real workbook) and neither
// the audit nor any client instruction has ever stated a currency --
// only that currency/VAT basis must be dynamic/configurable (audit
// Section R item 8). Zimbabwean B2B fleet/logistics invoicing being
// overwhelmingly USD-denominated in practice is the reasoning FOR
// choosing USD specifically as the interim default rather than some
// other placeholder -- it is still a placeholder, not a finding.
//
// Correcting this once Olivine confirms is ONE CONFIG CHANGE: save a
// confirmed TransportCostImportVatConfig row (sheetFamily-wide or
// per-batch) and TransportCostVatConfigService.resolve stops falling
// back here. No code change, no re-import. Existing postings are NOT
// restated -- each keeps the currency/fx it was actually posted under,
// exactly like FinanceSettingsService.update's reportingCurrency change
// behaviour; a period spanning the correction contains postings in two
// currencies, and the cost engine must not silently sum across them
// (see AllocationService.getCostPerKm's own mixed-currency handling,
// which TransportCostPostingService's reporting helper reuses).
//
// vatBasis differs by family because THAT part genuinely is evidenced,
// not guessed: the Vansales sheet has its own "MONTHLY COST BEFORE VAT"
// column (audit Section B), so 'exclusive' is a finding, not a default.
// 3rd Party has no equivalent column anywhere -- 'unknown' stays
// 'unknown' until Olivine confirms it, never guessed either way. Swift
// is a finding too, the other direction: the real sheet has its own
// "Total(Incl)" AND "Total(Excl)" columns side by side, and the posted
// `amount` is Total(Incl) (see SwiftImportRow's doc comment), so
// 'inclusive' is evidenced directly by which column was chosen, not a
// guess about Swift's real-world billing practice. Depot STO is back to
// 'unknown', like 3rd Party -- none of its four drifted real shapes
// (see DEPOT_STO_DECISION.md) name an inclusive/exclusive column either
// way, so there is no evidence here to read a default from.

import { TransportCostSheetFamily } from '@/shared/types/transport-cost.types';
import { ResolvedTransportCostVatConfig } from '@/shared/types/transport-cost-vat-config.types';

export const TRANSPORT_COST_VAT_CONFIG_DEFAULTS: Record<
  TransportCostSheetFamily,
  Omit<ResolvedTransportCostVatConfig, 'sheetFamily' | 'isProvisionalDefault'>
> = {
  'third-party': {
    currency: 'USD',
    vatBasis: 'unknown',
  },
  vansales: {
    currency: 'USD',
    vatBasis: 'exclusive',
  },
  swift: {
    currency: 'USD',
    vatBasis: 'inclusive',
  },
  'depot-sto': {
    currency: 'USD',
    // Unlike Vansales/Swift, no real Depot STO column name (Amount/
    // COSTS/COST, across its four drifted shapes) hints at inclusive vs
    // exclusive VAT either way -- 'unknown' stays 'unknown' until
    // Olivine confirms it, the same as 3rd Party's own default, never
    // guessed from a column name that isn't there.
    vatBasis: 'unknown',
  },
};
