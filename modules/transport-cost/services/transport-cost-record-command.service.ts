// modules/transport-cost/services/transport-cost-record-command.service.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 5. See
// OLIVINE_LIVE_OPERATING_MODEL_GAP_ANALYSIS.md Section 8.2 for the full
// design record this implements.
//
// A plain, constructor-injectable service (like TransportCostPostingService,
// NOT a CQRS command -- see that file's own header for why: these
// operations need the caller's full org-unit-scoped TenantContext, which
// this module's existing CQRS commands (ConfirmReviewMatchCommand etc.)
// deliberately do not carry, because NormalizationReviewItem is
// organization-level, not org-unit scoped. TransportCostSourceRecord IS
// org-unit scoped, so this service follows TransportCostPostingService's
// pattern instead, not the O2 review commands' pattern).
//
// EVERY mutation here reuses existing, already-tested machinery rather
// than reimplementing it:
//   - Correct reuses transportCostPostingService.postSourceRecord(),
//     which already performs the full reverse-then-repost sequence.
//   - Cancel-a-posted-record reuses allocationService.reversePosting()
//     directly (no repost).
//   - Every write goes through the audit log via the same
//     auditLog.logCreate/logUpdate convention transport-cost-posting
//     .service.ts and master-data.service.ts already use.
//   - Concurrency uses the same atomic-conditional-update idiom this
//     codebase already relies on elsewhere (see
//     TransportCostSourceRecordRepository.conditionalUpdate's own header).

import {
  transportCostSourceRecordRepository,
  TransportCostSourceRecordRepository,
} from '../repositories/transport-cost-source-record.repository';
import {
  normalizationReviewRepository,
  NormalizationReviewRepository,
} from '../repositories/normalization-review.repository';
import {
  allocationLedgerRepository,
  AllocationLedgerRepository,
} from '@/modules/finance/repositories/allocation-ledger.repository';
import { allocationService, AllocationService } from '@/modules/finance/services/allocation.service';
import {
  transportCostPostingService,
  TransportCostPostingService,
  COST_CATEGORY_BY_FAMILY,
} from './transport-cost-posting.service';
import {
  deriveOperationalStatus,
  patchTouchesFinancialField,
  patchOnlyTouchesNonFinancialFields,
  FINANCIAL_SOURCE_RECORD_FIELDS,
  NON_FINANCIAL_EDITABLE_FIELDS,
  OperationalStatusResult,
} from './transport-cost-lifecycle.service';
import type { TransportCostSourceRecord } from '@/shared/types/transport-cost.types';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import type { Filter } from 'mongodb';
import { NotFoundError, ConflictError, ValidationError } from '@/server/errors/app.errors';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
// GAP-CLOSURE PASS, Objective 1 (operation detail audit history).
import { auditLogRepository, AuditLogRepository } from '@/modules/security/repositories/audit-log.repository';
import type { AuditLogEntry } from '@/modules/security/types/audit-log.types';
import type { PaginatedResponse, PaginationParams } from '@/shared/types/common.types';

const ENTITY_TYPE = 'transport_cost_operation';

/** Every field EditSourceRecordCommand may ever touch, financial or not --
 *  used to fail closed on any OTHER key (e.g. `importBatchId`,
 *  `sourceRowNumber`, `rawRow`) that must never be human-edited at all. */
const ALL_EDITABLE_FIELDS: readonly string[] = [
  ...FINANCIAL_SOURCE_RECORD_FIELDS,
  ...NON_FINANCIAL_EDITABLE_FIELDS,
];

export type SourceRecordPatch = Partial<
  Pick<
    TransportCostSourceRecord,
    | 'amount'
    | 'date'
    | 'costFacingCompany'
    | 'contractedVehicleId'
    | 'transporterPartnerId'
    | 'vansales'
    | 'customerName'
    | 'destinationTown'
    | 'salesInvoiceNo'
    | 'tonnageRaw'
    | 'lines'
  >
>;

export interface OperationalRecordView extends OperationalStatusResult {
  source: TransportCostSourceRecord;
}

export class TransportCostRecordCommandService {
  constructor(
    private readonly sourceRepo: TransportCostSourceRecordRepository = transportCostSourceRecordRepository,
    private readonly reviewRepo: NormalizationReviewRepository = normalizationReviewRepository,
    private readonly ledgerRepo: AllocationLedgerRepository = allocationLedgerRepository,
    private readonly allocation: AllocationService = allocationService,
    private readonly posting: TransportCostPostingService = transportCostPostingService,
    // GAP-CLOSURE PASS, Objective 1. Constructor-injected like every
    // other dependency above (defaulting to the singleton for every
    // existing call site) rather than the direct module-level import
    // getAuditHistory used to reach for -- makes this method testable
    // against a fake collection the same way every other method in this
    // class already is, and keeps this class's own "everything is
    // injected" convention consistent.
    private readonly auditLogRepo: AuditLogRepository = auditLogRepository
  ) {}

  /**
   * Fetches the record and derives its lifecycle status in one call --
   * the single read path every mutation below (and the future detail-
   * view query) builds on, so "what state is this record in" is
   * computed identically everywhere.
   */
  async getOperationalStatus(context: TenantContext, sourceRecordId: string): Promise<OperationalRecordView> {
    const source = await this.findInScope(context, sourceRecordId);
    const [pending, history] = await Promise.all([
      this.reviewRepo.findPendingContainingSourceRecord(sourceRecordId, context.organizationId),
      this.findPostingHistory(context, source),
    ]);
    const derived = deriveOperationalStatus(source, !!pending, history);
    return { ...derived, source };
  }

  /**
   * ADDED, SLICE 5. Bulk sibling of getOperationalStatus, for the
   * operational table's status column: computes every given record's
   * lifecycle status in a small, FIXED number of queries regardless of
   * page size (one bulk review-queue lookup + up to one ledger lookup
   * per distinct cost category present on the page -- see
   * findByIdsInScope/findPendingForSourceRecordIds/
   * findBySourceIdsForCategory's own headers), never one query per row.
   * Records must already be tenant/org-unit scoped by the caller (this
   * method does not re-check scope) -- getOperationalStatusesForIds
   * below is the scope-checked entry point client code should use.
   */
  async getOperationalStatusesForRecords(
    context: TenantContext,
    records: TransportCostSourceRecord[]
  ): Promise<Map<string, OperationalStatusResult>> {
    const result = new Map<string, OperationalStatusResult>();
    if (records.length === 0) return result;

    const ids = records.map((r) => String(r._id));
    const categoriesPresent = Array.from(
      new Set(records.map((r) => COST_CATEGORY_BY_FAMILY[r.sheetFamily]).filter(Boolean))
    );

    const [pendingItems, postings] = await Promise.all([
      this.reviewRepo.findPendingForSourceRecordIds(ids, context.organizationId),
      categoriesPresent.length > 0
        ? this.ledgerRepo.findBySourceIdsForCategory(ids, categoriesPresent, context)
        : Promise.resolve([]),
    ]);

    const pendingSourceIds = new Set<string>();
    for (const item of pendingItems) {
      for (const sid of item.sourceRecordIds) pendingSourceIds.add(sid);
    }

    const postingsBySourceId = new Map<string, typeof postings>();
    for (const posting of postings) {
      const list = postingsBySourceId.get(posting.sourceId) ?? [];
      list.push(posting);
      postingsBySourceId.set(posting.sourceId, list);
    }

    for (const record of records) {
      const id = String(record._id);
      const history = postingsBySourceId.get(id) ?? [];
      result.set(id, deriveOperationalStatus(record, pendingSourceIds.has(id), history));
    }
    return result;
  }

  /**
   * ADDED, SLICE 5. The scope-checked entry point the statuses endpoint
   * uses: resolves the given ids through findByIdsInScope (tenant AND
   * org-unit scoped, same as every other read in this service) BEFORE
   * computing anything, so an id from another org unit or tenant is
   * silently absent from the result rather than leaking its lifecycle
   * state to an unauthorized caller -- the same 404-not-403 discipline
   * findInScope uses for a single record, applied to a batch.
   */
  async getOperationalStatusesForIds(
    context: TenantContext,
    sourceRecordIds: string[]
  ): Promise<Record<string, OperationalStatusResult['status']>> {
    const records = await this.sourceRepo.findByIdsInScope(sourceRecordIds, context);
    const statusMap = await this.getOperationalStatusesForRecords(context, records);
    const result: Record<string, OperationalStatusResult['status']> = {};
    for (const [id, s] of statusMap) result[id] = s.status;
    return result;
  }

  /**
   * Edit: non-financial fields on any non-cancelled record, or ANY field
   * on a record that has never been posted (needs-review / ready-to-post
   * / reversed -- see the state table). Financial-field edits on a
   * POSTED record are refused here and must go through
   * correctPostedSourceRecord instead -- this method never silently
   * reverses/reposts on a caller's behalf.
   */
  async editSourceRecord(
    context: TenantContext,
    userId: string,
    sourceRecordId: string,
    patch: SourceRecordPatch
  ): Promise<TransportCostSourceRecord> {
    const patchKeys = Object.keys(patch);
    const unknownKeys = patchKeys.filter((k) => !ALL_EDITABLE_FIELDS.includes(k));
    if (unknownKeys.length > 0) {
      throw new ValidationError(`Field(s) not editable: ${unknownKeys.join(', ')}`);
    }
    if (patchKeys.length === 0) {
      throw new ValidationError('No fields supplied to edit.');
    }

    const view = await this.getOperationalStatus(context, sourceRecordId);
    if (view.status === 'cancelled') {
      throw new ConflictError('This record was cancelled and cannot be edited. Duplicate it to create a new record.');
    }
    if (view.status === 'posted' && patchTouchesFinancialField(patch)) {
      throw new ConflictError(
        'This record has already been posted. Financial-field changes on a posted record must go through ' +
          'the Correct action (reverse + repost), not a direct edit.'
      );
    }
    if (view.status === 'posted' && !patchOnlyTouchesNonFinancialFields(patch)) {
      // Defensive: patchTouchesFinancialField and
      // patchOnlyTouchesNonFinancialFields are independently derived
      // from disjoint field lists (see transport-cost-lifecycle.service
      // .ts) -- this branch guards against a field that is in NEITHER
      // list somehow reaching here, which the ALL_EDITABLE_FIELDS check
      // above should already have caught. Kept as a fail-closed backstop.
      throw new ValidationError('One or more fields cannot be edited on a posted record.');
    }

    // BUG FOUND BY tests/unit/transport-cost/transport-cost-record-command
    // .service.spec.ts's "Edit on a REVERSED record" case, fixed here:
    // this guard's job is ONLY to catch a genuine race (someone cancels
    // this record between our read above and this write), never to
    // re-enforce the 'cancelled' business rule a second time -- that
    // rule is already fully handled by the `view.status === 'cancelled'`
    // check above, which deliberately treats 'reversed' as editable. A
    // flat `{cancelledAt: {$exists: false}}` guard doesn't know that
    // distinction: `cancelledAt` is POPULATED on a reversed record too
    // (see deriveOperationalStatus's own header on why REVERSED still
    // implies "this record was cancelled" at the raw-field level even
    // though it derives a different status), so that guard would refuse
    // every edit to every reversed record, not just a race. The correct
    // guard instead re-asserts "cancelledAt is still exactly what we
    // just read" -- unset stays unset (still catches a real concurrent
    // Cancel racing a needs-review/ready-to-post/posted edit), and an
    // already-known cancelledAt on a reversed record matches itself
    // (a reversed record's cancelledAt can never change again --
    // cancelSourceRecord refuses to cancel an already-cancelled record
    // -- so this can never spuriously fail, but it's expressed as an
    // explicit equality check rather than assumed).
    const cancellationGuard: Filter<TransportCostSourceRecord> = view.source.cancelledAt
      ? ({ cancelledAt: view.source.cancelledAt } as Filter<TransportCostSourceRecord>)
      : ({ cancelledAt: { $exists: false } } as Filter<TransportCostSourceRecord>);

    const result = await this.sourceRepo.conditionalUpdate(sourceRecordId, cancellationGuard, patch, context, userId);
    if (result.outcome === 'not-found') {
      throw new NotFoundError(`Transport cost source record "${sourceRecordId}" not found.`);
    }
    if (result.outcome === 'guard-failed') {
      throw new ConflictError('This record was cancelled by another request. Refresh and try again.');
    }

    await auditLog.logUpdate(userId, context.organizationId, ENTITY_TYPE, sourceRecordId, view.source, result.record);
    return result.record;
  }

  /**
   * Correct: the ONLY way to change a financial field on a posted
   * record. Applies the patch to the source record first, then calls
   * postSourceRecord() -- which already detects the amount/currency/
   * identity change and performs the existing reverse-then-repost
   * sequence itself (see transport-cost-posting.service.ts). This method
   * adds no new reversal logic; it is the missing human-triggered caller
   * gap-assessment item 2 identified.
   */
  async correctPostedSourceRecord(
    context: TenantContext,
    userId: string,
    sourceRecordId: string,
    patch: SourceRecordPatch
  ) {
    if (Object.keys(patch).length === 0) {
      throw new ValidationError('No fields supplied to correct.');
    }
    const unknownKeys = Object.keys(patch).filter((k) => !ALL_EDITABLE_FIELDS.includes(k));
    if (unknownKeys.length > 0) {
      throw new ValidationError(`Field(s) not editable: ${unknownKeys.join(', ')}`);
    }

    const view = await this.getOperationalStatus(context, sourceRecordId);
    if (view.status !== 'posted') {
      throw new ConflictError(
        `This record is "${view.status}", not posted -- use Edit instead. Correct is only for changing a ` +
          'financial field on an already-posted record.'
      );
    }

    // Guarded write: the guard re-asserts that the SAME live posting id
    // we just read is still the live one, so a concurrent correction/
    // reversal of this exact record between our read and this write
    // loses the race cleanly (ConflictError) rather than silently
    // layering two corrections. postSourceRecord() has its own further
    // defensive recheck (findReversalOf immediately before it reverses)
    // for the remaining, narrower race window between this write and
    // its own -- see that method's own comment.
    const applied = await this.sourceRepo.conditionalUpdate(
      sourceRecordId,
      { cancelledAt: { $exists: false } } as Filter<TransportCostSourceRecord>,
      patch,
      context,
      userId
    );
    if (applied.outcome === 'not-found') {
      throw new NotFoundError(`Transport cost source record "${sourceRecordId}" not found.`);
    }
    if (applied.outcome === 'guard-failed') {
      throw new ConflictError('This record was cancelled by another request. Refresh and try again.');
    }

    const outcome = await this.posting.postSourceRecord(context, userId, sourceRecordId);

    await auditLog.logUpdate(userId, context.organizationId, ENTITY_TYPE, sourceRecordId, view.source, {
      patch,
      postingOutcome: outcome,
    });

    return { source: applied.record, outcome };
  }

  /**
   * Cancel: two branches, per the gap-analysis doc's Section 8.2.
   * Pre-posting -- sets cancelledAt/cancelledBy/cancelReason only, no
   * ledger interaction. Posted -- reverses the live posting first (no
   * repost), via the existing reversal engine, then sets the same three
   * fields; the record then derives as 'reversed', not 'cancelled' (see
   * deriveOperationalStatus's own header for why that distinction
   * matters).
   */
  async cancelSourceRecord(context: TenantContext, userId: string, sourceRecordId: string, reason: string) {
    if (!reason.trim()) {
      throw new ValidationError('A reason is required to cancel a record.');
    }

    const view = await this.getOperationalStatus(context, sourceRecordId);
    if (view.source.cancelledAt) {
      throw new ConflictError('This record has already been cancelled.');
    }

    if (view.status === 'posted' && view.livePosting) {
      // Reuses the existing reversal engine directly -- no repost. The
      // engine's own findReversalOf/reversalOfPostingId checks are the
      // double-reversal guard; nothing new is added here for that.
      await this.allocation.reversePosting(
        context,
        userId,
        String(view.livePosting._id),
        `Cancelled: ${reason.trim()}`
      );
    }

    const result = await this.sourceRepo.conditionalUpdate(
      sourceRecordId,
      { cancelledAt: { $exists: false } } as Filter<TransportCostSourceRecord>,
      { cancelledAt: new Date(), cancelledBy: userId, cancelReason: reason.trim() },
      context,
      userId
    );
    if (result.outcome === 'not-found') {
      throw new NotFoundError(`Transport cost source record "${sourceRecordId}" not found.`);
    }
    if (result.outcome === 'guard-failed') {
      // A concurrent cancel won the race after our reversal (if any)
      // already ran. The reversal itself is safe either way (its own
      // double-reversal guard would have refused a second one), but the
      // cancellation stamp lost -- surfaced as a conflict rather than
      // silently discarded, so the caller knows to re-check state.
      throw new ConflictError('This record was cancelled by a concurrent request.');
    }

    await auditLog.logUpdate(userId, context.organizationId, ENTITY_TYPE, sourceRecordId, view.source, result.record);
    return result.record;
  }

  /**
   * Duplicate: models RuleRepository.duplicateRule()'s existing
   * precedent (gap-assessment item 7). Copies every editable field,
   * strips identity/provenance/posting-adjacent fields, and -- unlike a
   * naive clone -- never copies a confirmed vehicle/transporter identity
   * forward as though it were re-confirmed; only the RAW strings carry
   * over, so normalization runs fresh for the copy (see the gap-analysis
   * doc's Section 8.2 for why). Always starts unposted.
   */
  async duplicateSourceRecord(
    context: TenantContext,
    userId: string,
    sourceRecordId: string
  ): Promise<TransportCostSourceRecord> {
    const original = await this.findInScope(context, sourceRecordId);

    // Explicit allow-list, not a destructure-and-exclude: this is the
    // same fail-closed discipline editSourceRecord's ALL_EDITABLE_FIELDS
    // check uses, applied to "what does a duplicate copy forward" --
    // safer than an exclusion list, which silently starts copying any
    // NEW field added to the type later unless this file is also
    // updated. contractedVehicleId/transporterPartnerId are
    // deliberately NOT copied -- see this method's own header: a
    // duplicate never inherits an already-confirmed identity, only the
    // raw strings, so O2 normalization runs fresh for the copy.
    const duplicate = await this.sourceRepo.create(
      {
        orgUnitId: original.orgUnitId,
        sheetFamily: original.sheetFamily,
        sourceFileName: original.sourceFileName,
        sourceSheetName: original.sourceSheetName,
        sourceRowNumber: 0,
        importBatchId: `duplicate-of:${sourceRecordId}`,
        importedAt: new Date(),
        rawRow: original.rawRow,
        date: original.date,
        rawDate: original.rawDate,
        registration: original.registration,
        registrationRaw: original.registrationRaw,
        transporterNormalized: original.transporterNormalized,
        transporterRaw: original.transporterRaw,
        destinationTown: original.destinationTown,
        customerName: original.customerName,
        salesInvoiceNo: original.salesInvoiceNo,
        costFacingCompany: original.costFacingCompany,
        amount: original.amount,
        tonnageRaw: original.tonnageRaw,
        vansales: original.vansales,
        depotSto: original.depotSto,
        lines: original.lines,
        currency: original.currency,
        vatBasis: original.vatBasis,
        netAmount: original.netAmount,
        grossAmount: original.grossAmount,
        duplicatedFromId: sourceRecordId,
      },
      context.organizationId,
      userId
    );

    await auditLog.logCreate(userId, context.organizationId, ENTITY_TYPE, String(duplicate._id), {
      duplicatedFromId: sourceRecordId,
    });

    return duplicate;
  }

  /**
   * GAP-CLOSURE PASS, Objective 1. Audit history for the operation
   * detail page. Reuses findInScope (the exact same tenant/org-unit
   * scope check every other method on this class already applies to
   * `sourceRecordId`) as the sole access-control gate, then queries the
   * existing, already-tenant-aware AuditLogRepository.findWithFilters
   * directly -- mirroring exactly how
   * organization-advanced.service.ts's own getAuditLog already reads
   * this same repository for a different entity type, rather than
   * routing through the generic `/api/security/audit-log` endpoint
   * (which requires Permission.AUDIT_LOG_VIEW, a role most transport-
   * cost users -- who only need TRANSPORT_COST_VIEW to be looking at
   * this page at all -- would not otherwise hold).
   *
   * SCOPE DECISION, documented rather than silently narrowed: this
   * returns only entries filed under entityType: 'transport_cost_operation'
   * / entityId: sourceRecordId -- i.e. Edit/Correct/Cancel/Duplicate,
   * the four actions this service itself audits (see ENTITY_TYPE's
   * every auditLog.log* call above). It deliberately does NOT also pull
   * in the original posting event (filed under a different entityType/
   * entityId -- see transport-cost-posting.service.ts's own audit call)
   * or reversal events (AllocationService.reversePosting's
   * auditLog.logAction call has NO entityId at all today -- adding one
   * would mean touching modules/finance/services/allocation.service.ts,
   * shared by every allocation-ledger consumer in the platform, not
   * just transport-cost, which is out of this pass's reuse-not-rewrite
   * mandate) or O2 normalization-review confirm/reject decisions (a
   * different entity entirely -- reviewItemId, not sourceRecordId; see
   * ENTITY_TYPE constants added to the O2 handlers in this same pass).
   * The operation detail page already shows postings/reversals in its
   * own dedicated ledger-history table (built in Slice 5's first pass),
   * so this section's job is specifically "what did a human do TO this
   * record", not a merged feed of every system event that ever touched
   * it -- kept separate on purpose, the same "financial vs operational,
   * kept strictly separate" principle Slice 4 already established for
   * Command Centre.
   */
  async getAuditHistory(
    context: TenantContext,
    sourceRecordId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<AuditLogEntry>> {
    await this.findInScope(context, sourceRecordId);
    return this.auditLogRepo.findWithFilters(
      { tenantId: context.organizationId, entityType: ENTITY_TYPE, entityId: sourceRecordId },
      pagination
    );
  }

  private async findInScope(context: TenantContext, sourceRecordId: string): Promise<TransportCostSourceRecord> {
    const source = await this.sourceRepo.findById(sourceRecordId, context.organizationId);
    if (!source) {
      throw new NotFoundError(`Transport cost source record "${sourceRecordId}" not found.`);
    }
    if (
      context.accessibleOrgUnitIds !== null &&
      (!source.orgUnitId || !context.accessibleOrgUnitIds.includes(source.orgUnitId))
    ) {
      throw new NotFoundError(`Transport cost source record "${sourceRecordId}" not found.`);
    }
    return source;
  }

  private async findPostingHistory(context: TenantContext, source: TransportCostSourceRecord) {
    if (source.sheetFamily === 'depot-sto' || source.sheetFamily === 'third-party' || source.sheetFamily === 'swift' || source.sheetFamily === 'vansales') {
      const costCategory = COST_CATEGORY_BY_FAMILY[source.sheetFamily];
      return this.ledgerRepo.findBySource('tbltransportcostsourcerecords', String(source._id), costCategory, context);
    }
    return [];
  }
}

export const transportCostRecordCommandService = new TransportCostRecordCommandService();
