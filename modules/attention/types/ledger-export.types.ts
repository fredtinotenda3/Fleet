// modules/attention/types/ledger-export.types.ts
//
// Types for the value_ledger export -- a JSON/PDF report of resolved
// fuel-fraud/expense-anomaly postings, handed to whoever needs to see
// what the AI's flags were actually worth (finance, an insurer, an
// internal review). Deliberately mirrors modules/esg/types/
// esg-export.types.ts's shape (format union, an *Options input, a
// *Data output with organization/generatedAt/scope on it) since it's
// the same kind of artifact: a scoped snapshot that leaves the request
// as either a JSON body or a rendered PDF.
//
// Unlike the ESG export (always whole-organization aggregates), this
// report has a row-level component -- the individual postings -- so it
// also carries the row-cap/truncation metadata every CSV/XLSX export
// in shared/export already exposes (see ExportDataset in
// shared/export/export.types.ts). The cap exists for the same reason:
// an unbounded query against tblvalueledger from a synchronous HTTP
// request is a denial-of-service risk, independent of tenancy.

import type { BaselineTier, LedgerEligibleSource } from './value-ledger.types';

export type LedgerExportFormat = 'json' | 'pdf';

export interface LedgerExportOptions {
  format: LedgerExportFormat;
  /** Inclusive lower bound on ValueLedgerEntry.resolvedAt. */
  from?: Date;
  /** Inclusive upper bound on ValueLedgerEntry.resolvedAt. */
  to?: Date;
  /** Restrict to one ledger-eligible source. Omit for both. */
  source?: LedgerEligibleSource;
}

/** Filter shape the repository accepts -- a subset of LedgerExportOptions (format isn't a query concern). */
export interface LedgerExportFilters {
  from?: Date;
  to?: Date;
  source?: LedgerEligibleSource;
}

export interface LedgerExportEntry {
  attentionItemKey: string;
  source: LedgerEligibleSource;
  baselineTier: BaselineTier;
  modelledAmount: number;
  realisedAmount: number;
  /** realisedAmount - modelledAmount. Positive: the confirmed impact exceeded the model's estimate. */
  variance: number;
  evidenceRefs: string[];
  notes?: string;
  resolvedBy: string;
  resolvedAt: Date;
  orgUnitId: string | null;
}

export interface LedgerExportSourceBreakdown {
  count: number;
  modelledAmount: number;
  realisedAmount: number;
}

export interface LedgerExportSummary {
  totalPostings: number;
  totalModelledAmount: number;
  totalRealisedAmount: number;
  /** totalRealisedAmount - totalModelledAmount, across every included posting. */
  totalVariance: number;
  bySource: Record<LedgerEligibleSource, LedgerExportSourceBreakdown>;
  byBaselineTier: Record<BaselineTier, number>;
}

export interface LedgerExportData {
  organization: {
    id: string;
    name: string;
  };
  generatedAt: Date;
  scope: {
    /** null when the export covers the whole organization; otherwise the org unit the export was scoped to. */
    orgUnitId: string | null;
  };
  filters: {
    from: Date | null;
    to: Date | null;
    source: LedgerEligibleSource | null;
  };
  summary: LedgerExportSummary;
  entries: LedgerExportEntry[];
  /** true when totalMatched (see the repository's ExportDataset) exceeded exportCap -- entries is not the complete set. */
  truncated: boolean;
  exportCap: number;
}
