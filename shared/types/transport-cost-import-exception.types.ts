// shared/types/transport-cost-import-exception.types.ts
//
// A row that DID NOT become a TransportCostSourceRecord -- rejected at
// import validation, or flagged as a likely duplicate. Before this
// type existed, both cases were returned ONLY in the synchronous
// ImportTransportCostResult of the import call itself (see
// import-transport-cost.handler.ts) and were never persisted anywhere:
// the moment that HTTP response was gone, so was the evidence. That
// made a "what got rejected and why" question unanswerable days later
// without re-running the import against the same file, and made a
// findable data-quality report impossible. This type is that evidence,
// persisted at import time, in its own collection rather than folded
// into TransportCostSourceRecord (whose whole contract is "this row
// passed validation" -- a rejected row does not belong in the same
// table pretending to be one that succeeded).
//
// Also covers the OTHER kind of data-quality exception this module can
// produce after a row DOES post successfully: a posting whose own
// transaction date falls outside the import batch's own majority
// month (e.g. a year-entry typo, "31.01.25" on a sheet named "JAN-26").
// See TransportCostReportService.getDataQualityExceptions for how that
// second kind is detected -- it is computed from tblallocationledger
// at query time, not persisted here, since it is a property of an
// existing posting rather than a row that failed to become one.

import { OrgUnitScopedEntity } from '@/server/repositories/tenant-scoped.repository';
import { TransportCostSheetFamily } from './transport-cost.types';

export type TransportCostImportExceptionKind = 'rejected' | 'duplicate';

export interface TransportCostImportException extends OrgUnitScopedEntity {
  /** Redeclared for tests/security/module-scope-conformance.spec.ts's literal-source-text check -- see TransportCostSourceRecord's identical note. */
  orgUnitId?: string;

  importBatchId: string;
  sheetFamily: TransportCostSheetFamily;
  sourceFileName: string;
  /** 1-indexed, matching the row number a person would see in the source file -- same convention as TransportCostSourceRecord.sourceRowNumber. */
  sourceRowNumber: number;

  kind: TransportCostImportExceptionKind;
  /** The column the validation rule rejected on -- unset for a duplicate (the whole row is the duplicate, not one field). */
  column?: string;
  /** The specific rule/reason -- ImportRowResult.error's text, verbatim, so this is never a re-derived or re-worded summary of what actually happened. */
  reason: string;
  /** The offending cell's raw value, when the rejection was value-specific (unset for a duplicate). */
  invalidValue?: string;

  /** The raw, as-uploaded cell values for this row, keyed by column header exactly as it appeared in the source file -- same convention and same purpose as TransportCostSourceRecord.rawRow: this IS the audit trail, not a summary of it. */
  rawRow: Record<string, unknown>;

  importedAt: Date;
}
