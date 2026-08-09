// modules/finance/types/gl-reconciliation.types.ts
//
// Ties the platform's own totals (summed from the allocation ledger)
// to the figures in the customer's general ledger, per GL account code,
// and NAMES the gap rather than hiding it -- a reconciliation report
// with no unmatched lines is either genuinely clean or hasn't been
// checked closely enough, and this type makes "checked and clean" and
// "not checked" distinguishable.
//
// GL totals the customer supplies are themselves evidence (a monthly
// close figure), so submissions are append-only like every other
// financial record in this module: a corrected GL figure is a NEW
// submission for the same period/account, and reconciliation always
// compares against the latest one. See gl-submission.repository.ts.

import type { OrgUnitScopedEntity } from '@/server/repositories/tenant-scoped.repository';

export interface GLSubmission extends OrgUnitScopedEntity {
  orgUnitId?: string;

  periodStart: Date;
  periodEnd: Date;
  glAccountCode: string;
  glAmount: number;
  currency: string;

  submittedBy: string;
  submittedAt: Date;
  notes?: string;
}

export interface GLSubmissionInput {
  periodStart: Date | string;
  periodEnd: Date | string;
  glAccountCode: string;
  glAmount: number;
  currency: string;
  notes?: string;
}

export interface GLVarianceLine {
  glAccountCode: string;
  platformTotal: number;
  /** null when no GL submission exists yet for this account/period -- distinct from a submitted zero. */
  glTotal: number | null;
  /** platformTotal - glTotal. null when glTotal is null. */
  variance: number | null;
  variancePct: number | null;
  /** True when |variance| <= the report's toleranceAmount. Always false when glTotal is null (an unsubmitted account can never be "matched"). */
  matched: boolean;
}

export interface GLReconciliationReport {
  periodStart: Date;
  periodEnd: Date;
  reportingCurrency: string;
  toleranceAmount: number;
  lines: GLVarianceLine[];
  totalPlatform: number;
  totalGL: number;
  totalVariance: number;
  /** Lines where matched === false -- named explicitly so a caller doesn't have to re-derive "what needs attention" from the line list. */
  unmatchedAccountCodes: string[];
  generatedAt: Date;
}