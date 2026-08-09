// modules/finance/services/gl-reconciliation.service.ts
//
// Ties the platform's allocation-ledger totals to the customer's own
// general ledger, per account code, and names the gap.
//
// This report is the reason the cost engine is credible rather than
// merely present. A cost-per-km figure that cannot be reconciled to the
// customer's books is a dashboard number; one that can is a system of
// record. So the report is deliberately unflattering by construction: an
// account the customer has not submitted a figure for is reported as
// unmatched with glTotal null, NOT quietly omitted or defaulted to zero,
// because "we agree" and "we never checked" must not look the same.

import type {
  GLSubmission,
  GLSubmissionInput,
  GLVarianceLine,
  GLReconciliationReport,
} from '../types/gl-reconciliation.types';
import { glSubmissionRepository } from '../repositories/gl-submission.repository';
import { allocationLedgerRepository } from '../repositories/allocation-ledger.repository';
import { financeSettingsService } from './finance-settings.service';
import { roundCurrency } from '../utils/fx-conversion.utils';
import { resolveCreationOrgUnitId } from '@/server/utils/tenant-context.utils';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { ValidationError } from '@/server/errors/app.errors';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

function toDate(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`Invalid date: "${String(value)}".`);
  }
  return parsed;
}

export class GLReconciliationService {
  /**
   * Records a GL figure the customer supplied for one account and
   * period.
   *
   * orgUnitId comes from resolveCreationOrgUnitId(), not from the
   * vehicle (there is no vehicle here) and not from the request body.
   * That gives the established behaviour: an org-wide caller may file
   * against any unit or none, a scoped caller is pinned to their own
   * assignment, and a scoped caller with no assignment is refused
   * rather than writing an invisible row.
   *
   * NOTE (open scope question, tracked as `confirmed: false` for the
   * finance module in module-scope.registry.ts): filing GL submissions
   * per org-unit assumes each branch closes its own books. If the
   * customer's finance function submits ONE consolidated figure per
   * account for the whole organization, these should be organization-
   * level instead, and a branch-scoped reconciliation report would then
   * be comparing a branch's platform total against a consolidated GL
   * total -- guaranteed to look like a variance. This needs a product
   * answer before the report is shown to a customer.
   */
  async submit(
    context: TenantContext,
    userId: string,
    input: GLSubmissionInput
  ): Promise<GLSubmission> {
    const periodStart = toDate(input.periodStart);
    const periodEnd = toDate(input.periodEnd);
    if (periodEnd < periodStart) {
      throw new ValidationError('periodEnd cannot be earlier than periodStart.');
    }

    const settings = await financeSettingsService.resolve(context.organizationId);
    const currency = input.currency.toUpperCase();

    // The platform side of every variance line is denominated in the
    // reporting currency (each posting stores reportingAmount). A GL
    // figure in a different currency cannot be differenced against it,
    // and converting it here would mean inventing a rate for someone
    // else's closed accounts. Refuse instead.
    if (currency !== settings.reportingCurrency) {
      throw new ValidationError(
        `GL figures must be submitted in the organization's reporting currency ` +
          `(${settings.reportingCurrency}); received ${currency}. ` +
          'Convert on your side, or change the reporting currency, so the reconciliation compares like with like.'
      );
    }

    const orgUnitId = resolveCreationOrgUnitId(context, undefined);

    const submission = await glSubmissionRepository.append(
      {
        orgUnitId,
        periodStart,
        periodEnd,
        glAccountCode: input.glAccountCode.trim(),
        glAmount: roundCurrency(input.glAmount),
        currency,
        submittedBy: userId,
        submittedAt: new Date(),
        notes: input.notes,
      },
      context.organizationId,
      userId
    );

    await auditLog.logCreate(
      userId,
      context.organizationId,
      'finance.glSubmission',
      String(submission._id),
      {
        glAccountCode: submission.glAccountCode,
        glAmount: submission.glAmount,
        currency: submission.currency,
        periodStart,
        periodEnd,
      }
    );

    return submission;
  }

  /** Every submission in a period, scoped, newest first -- so the UI can show that a figure was restated. */
  async listSubmissions(
    context: TenantContext,
    periodStart: Date,
    periodEnd: Date
  ): Promise<GLSubmission[]> {
    return glSubmissionRepository.findInPeriodInScope(periodStart, periodEnd, context);
  }

  /**
   * Builds the reconciliation report for a period.
   *
   * The account set is the UNION of accounts with platform postings and
   * accounts with GL submissions, which is the only choice that surfaces
   * both failure directions: a cost the platform recorded that the
   * customer's GL does not have (usually a mapping gap or a posting
   * against the wrong account), and a GL figure with no platform
   * postings behind it (usually a cost the platform never ingested --
   * the more dangerous of the two, because it means cost-per-km is
   * understated and looks fine).
   */
  async buildReport(
    context: TenantContext,
    periodStart: Date,
    periodEnd: Date
  ): Promise<GLReconciliationReport> {
    if (periodEnd < periodStart) {
      throw new ValidationError('periodEnd cannot be earlier than periodStart.');
    }

    const settings = await financeSettingsService.resolve(context.organizationId);
    const tolerance = Math.abs(settings.glToleranceAmount);

    const platformTotals = await allocationLedgerRepository.getNetTotalsByGlAccount(
      periodStart,
      periodEnd,
      context
    );
    const latestSubmissions = await glSubmissionRepository.findLatestPerAccountInScope(
      periodStart,
      periodEnd,
      context
    );

    const platformByAccount = new Map<string, number>();
    for (const row of platformTotals) {
      platformByAccount.set(row.glAccountCode, roundCurrency(row.netReportingAmount));
    }

    const accountCodes = Array.from(
      new Set([...platformByAccount.keys(), ...latestSubmissions.keys()])
    ).sort();

    const lines: GLVarianceLine[] = accountCodes.map((glAccountCode) => {
      const platformTotal = platformByAccount.get(glAccountCode) ?? 0;
      const submission = latestSubmissions.get(glAccountCode);
      const glTotal = submission ? roundCurrency(submission.glAmount) : null;

      if (glTotal === null) {
        return {
          glAccountCode,
          platformTotal,
          glTotal: null,
          variance: null,
          variancePct: null,
          // An unsubmitted account can never be "matched" -- see the type's doc comment.
          matched: false,
        };
      }

      const variance = roundCurrency(platformTotal - glTotal);
      // Percentage is against the GL figure (the customer's own books are
      // the reference), and undefined rather than Infinity when the GL
      // figure is zero -- a divide-by-zero rendered as "Infinity%" in a
      // finance report destroys confidence in everything around it.
      const variancePct =
        glTotal === 0 ? null : roundCurrency((variance / Math.abs(glTotal)) * 100);

      return {
        glAccountCode,
        platformTotal,
        glTotal,
        variance,
        variancePct,
        matched: Math.abs(variance) <= tolerance,
      };
    });

    const totalPlatform = roundCurrency(lines.reduce((sum, l) => sum + l.platformTotal, 0));
    const totalGL = roundCurrency(lines.reduce((sum, l) => sum + (l.glTotal ?? 0), 0));

    return {
      periodStart,
      periodEnd,
      reportingCurrency: settings.reportingCurrency,
      toleranceAmount: tolerance,
      lines,
      totalPlatform,
      totalGL,
      // Deliberately totalPlatform - totalGL rather than the sum of the
      // line variances: those differ whenever an account has no GL
      // submission (its variance is null and contributes nothing), and
      // the difference between the two totals is the honest number --
      // it includes the unreconciled accounts instead of excluding them
      // from the headline figure.
      totalVariance: roundCurrency(totalPlatform - totalGL),
      unmatchedAccountCodes: lines.filter((l) => !l.matched).map((l) => l.glAccountCode),
      generatedAt: new Date(),
    };
  }
}

export const glReconciliationService = new GLReconciliationService();
