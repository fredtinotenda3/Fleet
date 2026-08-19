// modules/attention/services/ledger-export.service.ts
//
// Builds the value-ledger export: every resolved fuel-fraud/expense-
// anomaly posting the caller can see, plus a summary rollup, as either
// a JSON body or a PDF. Mirrors modules/esg/services/esg-export.service.ts's
// shape (a *Options input, a build*Export entry point, a Data output
// carrying organization/generatedAt/scope) since it's the same kind of
// artifact -- a scoped snapshot rendered by a sibling *-pdf.generator.ts
// and served by a sibling controller.
//
// Scoping: like esg-export.service.ts, this service adds no new reads
// of its own -- the single read (valueLedgerRepository.
// getFilteredEntriesForExport) takes the caller's TenantContext and
// applies both scope layers itself (see that method's own doc comment).
// See tests/security/ledger-export-scope.spec.ts for the property this
// guarantees.

import { valueLedgerRepository } from '../repositories/value-ledger.repository';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import type { BaselineTier, LedgerEligibleSource } from '../types/value-ledger.types';
import type {
  LedgerExportData,
  LedgerExportEntry,
  LedgerExportOptions,
  LedgerExportSummary,
  LedgerSummaryData,
  LedgerSummaryOptions,
} from '../types/ledger-export.types';

const SOURCE_KEYS: LedgerEligibleSource[] = ['fuel_fraud', 'expense_anomaly'];
const TIER_KEYS: BaselineTier[] = ['T1', 'T2', 'T3'];

export class LedgerExportService {
  async buildExport(context: TenantContext, options: LedgerExportOptions): Promise<LedgerExportData> {
    const dataset = await valueLedgerRepository.getFilteredEntriesForExport(
      { source: options.source, from: options.from, to: options.to },
      context
    );

    const entries: LedgerExportEntry[] = dataset.rows.map((row) => ({
      attentionItemKey: row.attentionItemKey,
      source: row.source,
      baselineTier: row.baselineTier,
      modelledAmount: row.modelledAmount,
      realisedAmount: row.realisedAmount,
      variance: row.realisedAmount - row.modelledAmount,
      evidenceRefs: row.evidenceRefs,
      notes: row.notes,
      resolvedBy: row.resolvedBy,
      resolvedAt: row.resolvedAt,
      orgUnitId: row.orgUnitId ?? null,
    }));

    return {
      organization: { id: context.organizationId, name: context.organizationName },
      generatedAt: new Date(),
      scope: { orgUnitId: context.activeOrgUnitId ?? null },
      filters: {
        from: options.from ?? null,
        to: options.to ?? null,
        source: options.source ?? null,
      },
      summary: this.computeSummary(entries),
      entries,
      truncated: dataset.truncated,
      exportCap: dataset.exportCap,
    };
  }

  /**
   * Summary-only read: same scoped/capped repository call as buildExport,
   * same summary rollup, but never assembles or returns the row-level
   * `entries` (evidenceRefs, notes, resolvedBy). Backs GET
   * /api/attention/ledger/summary (Permission.FINANCE_VIEW) -- for a
   * caller who should see the month-to-date modelled/realised totals but
   * not individual postings, the way ANALYTICS_EXPORT-gated /export does.
   */
  async buildSummary(context: TenantContext, options: LedgerSummaryOptions): Promise<LedgerSummaryData> {
    const dataset = await valueLedgerRepository.getFilteredEntriesForExport(
      { source: options.source, from: options.from, to: options.to },
      context
    );

    const entries: LedgerExportEntry[] = dataset.rows.map((row) => ({
      attentionItemKey: row.attentionItemKey,
      source: row.source,
      baselineTier: row.baselineTier,
      modelledAmount: row.modelledAmount,
      realisedAmount: row.realisedAmount,
      variance: row.realisedAmount - row.modelledAmount,
      evidenceRefs: row.evidenceRefs,
      notes: row.notes,
      resolvedBy: row.resolvedBy,
      resolvedAt: row.resolvedAt,
      orgUnitId: row.orgUnitId ?? null,
    }));

    return {
      organization: { id: context.organizationId, name: context.organizationName },
      generatedAt: new Date(),
      scope: { orgUnitId: context.activeOrgUnitId ?? null },
      filters: {
        from: options.from ?? null,
        to: options.to ?? null,
        source: options.source ?? null,
      },
      summary: this.computeSummary(entries),
      truncated: dataset.truncated,
      exportCap: dataset.exportCap,
    };
  }

  private computeSummary(entries: LedgerExportEntry[]): LedgerExportSummary {
    const bySource = SOURCE_KEYS.reduce((acc, source) => {
      acc[source] = { count: 0, modelledAmount: 0, realisedAmount: 0 };
      return acc;
    }, {} as LedgerExportSummary['bySource']);

    const byBaselineTier = TIER_KEYS.reduce((acc, tier) => {
      acc[tier] = 0;
      return acc;
    }, {} as LedgerExportSummary['byBaselineTier']);

    let totalModelledAmount = 0;
    let totalRealisedAmount = 0;

    for (const entry of entries) {
      totalModelledAmount += entry.modelledAmount;
      totalRealisedAmount += entry.realisedAmount;
      bySource[entry.source].count += 1;
      bySource[entry.source].modelledAmount += entry.modelledAmount;
      bySource[entry.source].realisedAmount += entry.realisedAmount;
      byBaselineTier[entry.baselineTier] += 1;
    }

    return {
      totalPostings: entries.length,
      totalModelledAmount,
      totalRealisedAmount,
      totalVariance: totalRealisedAmount - totalModelledAmount,
      bySource,
      byBaselineTier,
    };
  }
}

export const ledgerExportService = new LedgerExportService();
