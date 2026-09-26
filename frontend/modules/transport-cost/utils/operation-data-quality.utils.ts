// frontend/modules/transport-cost/utils/operation-data-quality.utils.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 1-5 PRODUCTION VERIFICATION PASS.
// The operation detail page (TransportOperationDetailPage.tsx) had no
// "data quality" section at all, even though the client's spec requires
// the detail page to expose data-quality info. Every issue below is
// derived purely from fields the API response already carries on
// `source` (see shared/types/transport-cost.types.ts's own field-by-
// field doc comments for why each condition means what it says) --
// NOTHING here is computed, estimated, or fabricated; an issue is
// listed only when the underlying field is genuinely absent/unresolved
// on this exact record, and the page renders nothing at all (not a
// fabricated "all clear" banner) when the returned array is empty.
//
// Deliberately a plain .ts file, not inlined into the .tsx page
// component: this project's Jest config (jest.config.js) has no JSX
// transform wired up for its node test environment, so a pure function
// living inside a component file with real JSX in the same module is
// untestable here -- pulling it out keeps the actual decision logic
// unit-testable (see tests/unit/transport-cost/
// operation-detail-data-quality.spec.ts) without needing a component-
// rendering harness this project does not have.

import type { TransportCostSourceRecord } from '@/shared/types/transport-cost.types';

export interface DataQualityIssue {
  label: string;
  detail: string;
}

export function collectDataQualityIssues(source: TransportCostSourceRecord): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  if (source.amount === null) {
    issues.push({ label: 'Cost not recorded', detail: "The source cell for this row's amount was blank -- never treated as zero." });
  }
  if (!source.costFacingCompany) {
    issues.push({ label: 'Cost-facing company unattributed', detail: 'No Hypery/Olivine/Surface value was captured for this row.' });
  }
  if (source.date === null) {
    issues.push({ label: 'Date could not be parsed', detail: `Raw source value: "${source.rawDate || '—'}".` });
  }
  if (source.registration && !source.contractedVehicleId) {
    issues.push({ label: 'Vehicle identity not yet confirmed', detail: 'This registration has not been resolved to a confirmed vehicle -- see the Review Queue.' });
  }
  if (source.transporterNormalized && !source.transporterPartnerId) {
    issues.push({ label: 'Transporter identity not yet confirmed', detail: 'This transporter name has not been resolved to a confirmed transporter -- see the Review Queue.' });
  }
  if (!source.currency) {
    issues.push({ label: 'Currency not yet determined', detail: "Awaiting VAT/currency backfill for this row's sheet/period." });
  }
  if (!source.vatBasis || source.vatBasis === 'unknown') {
    issues.push({ label: 'VAT basis not yet determined', detail: 'Unknown whether the recorded amount is VAT-inclusive or -exclusive.' });
  }
  return issues;
}
