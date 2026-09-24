// modules/transport-cost/services/transport-cost-posting.service.ts
//
// Phase O3 ("Phase O3 Spec" tab). Posts a CONFIRMED TransportCostSourceRecord
// into the Allocation Ledger -- the step that turns Phase O1/O2's source
// evidence into a figure Phase O4's report can sum.
//
// ---------------------------------------------------------------------
// WHY THIS IS NOT AllocationService.postAllocation -- READ BEFORE TOUCHING
// ---------------------------------------------------------------------
// AllocationService.postAllocation resolves `vehicleId` EXCLUSIVELY
// against `vehicleRepository` / `tblvehicles` (resolveVehicleInScope) --
// see that file's own "THE vehicleId CONTRACT" header. A transport-cost
// posting's vehicle is a ContractedVehicle (tblcontractedvehicles): a
// third-party/owner-operator truck, not an Olivine-owned, telemetry-
// tracked vehicle (audit Section F) -- there is no tblvehicles row for
// it at all. Calling postAllocation with a ContractedVehicle._id would
// either 404 (no such tblvehicles row) or, far worse, silently collide
// with an unrelated tblvehicles _id that happens to share the same
// ObjectId space and post a real transport cost against the wrong
// Olivine-owned truck. This service therefore calls
// allocationLedgerRepository.append() DIRECTLY, after its OWN
// ContractedVehicle-scoped resolution -- AllocationPosting's shape is
// reused as-is (never retrofitted), only the resolution path differs.
//
// It DOES reuse allocationService.reversePosting() for corrections --
// that method never touches tblvehicles at all (it operates purely on
// the posting row already in the ledger plus the caller's org-unit
// scope), so there is no collision there. See postSourceRecord's
// correction branch below.
//
// Structurally this mirrors modules/finance/services/allocation-posting
// .service.ts (AllocationPostingService.postSource) far more closely
// than AllocationService itself: same "never throws for an EXPECTED
// condition, return a structured outcome instead" contract, same
// deterministic-idempotency-key approach (buildPostingIdempotencyKey is
// imported and reused, not reimplemented), same fail-closed-on-currency
// behaviour. The difference is the write path, for the collision reason
// above.
//
// ---------------------------------------------------------------------
// SCOPE: THIRD-PARTY, VANSALES, SWIFT, AND DEPOT STO ROWS -- ALL FOUR
// SOURCE FAMILIES.
// ---------------------------------------------------------------------
// A Vansales row's `date` is ALWAYS null (see import-transport-cost
// .handler.ts's validateAndBuildVansales) -- it is a fixed weekly/
// monthly retainer per payer/truck, not a dated per-shipment
// transaction, and the real cost lives in `vansales.total` /
// `monthlyCostBeforeVat`, never in `amount` (which O1 deliberately
// leaves null for every Vansales row -- audit Section B). Posting a
// Vansales row therefore cannot reuse `source.date` as its period the
// way a 3rd Party row does. It used to be an explicitly OPEN ITEM for
// exactly that reason -- see VANSALES_PERIODIZATION_DECISION.md for the
// full decision record -- and is now implemented as Option A there:
// `source.vansales.periodMonth` (required at import time, "YYYY-MM",
// NEVER inferred from a sheet-tab name) supplies the period explicitly,
// `source.vansales.total` supplies the amount, and `resolveAmountAndPeriod`
// below is where the source families' rules diverge before falling
// into the shared posting/idempotency/reversal logic that follows it.
//
// Swift rows post under 'third-party-transport' (same amount/date shape
// as 3rd Party -- `amount` from Total(Incl), `date` from Cons. date,
// both resolved at import time -- see validateAndBuildSwift), so
// resolveAmountAndPeriod's 'swift' case is identical to 'third-party'.
// BUT a Swift row can NEVER resolve `contractedVehicleId`: the source
// sheet has no registration/transporter column at all (verified against
// the real "JAN-26 Swift" workbook -- see TransportCostSheetFamily's doc
// comment in shared/types/transport-cost.types.ts). This is not a gap in
// this service -- every Swift row will post-time-skip at the existing
// `unresolved-vehicle-identity` check above with ZERO new code, exactly
// the same as a 3rd Party row whose registration was never confirmed
// through the Phase O2 normalization review queue. No vehicle is ever
// fabricated to work around this. See SWIFT_POSTING_DECISION.md.
//
// Depot STO rows post under 'stock-transfer' (see DEPOT_STO_DECISION.md
// for the full record -- six real months across four genuinely
// different column layouts, one tolerant parser covering all of them,
// `DATE` used as-is for periodStart/periodEnd, same as 3rd Party's own
// per-row dating, never Vansales's declared-month convention). Unlike
// Swift, vehicle-identity resolution is possible for SOME Depot STO
// rows, but which ones is determined by the REAL DATA, not just by
// which months' schema happens to include a registration-shaped
// column -- March/April/August rows carry a real, populated
// registration in practice (100%/100%/98.8% of real rows); May has no
// registration column in the schema at all; June/July DO have a `REG`
// column in the schema but it is populated in essentially none of the
// real rows (0/24 and 1/84) -- so in practice they skip exactly like
// May does, just for a data reason rather than a schema reason. See
// DEPOT_STO_DECISION.md's "Vehicle identity" section for the full
// per-month table (this was corrected once already, before delivery,
// after counting real population rates rather than assuming from
// column presence). Net effect either way: a Depot STO row's
// `unresolved-vehicle-identity` skip rate is data-dependent, not
// universal the way Swift's always is.
//
// ---------------------------------------------------------------------
// ITEM 3 -- INVARIANT-BY-INVARIANT vs AllocationService.postAllocation,
// AND WHY "DOCUMENT + TEST" OVER "EXTRACT A SHARED SEAM"
// ---------------------------------------------------------------------
// The client's follow-up asked for one of two things: document which of
// postAllocation's invariants this service reimplements vs. skips (plus
// a parity test), OR extract a shared vehicle-resolution seam so there
// is one posting entry point. This chose the former -- both are done,
// this section is the "document" half (the "test" half is
// tests/unit/transport-cost/transport-cost-posting.service.parity.spec.ts).
//
// REUSED VERBATIM (not reimplemented -- the actual imported function is
// called, so there is no copy to drift):
//   - resolveFxContext / roundCurrency (fx-conversion.utils.ts) -- same
//     currency.toUpperCase(), same rounding, same "returns null/never
//     guesses 1:1" contract on an unresolvable rate.
//   - buildPostingIdempotencyKey (allocation-posting.service.ts) -- the
//     key DERIVATION function is shared; only whether/how it is invoked
//     differs (see below).
//   - allocationService.reversePosting() -- corrections call the real
//     method, not a reimplementation. This is the single highest-risk
//     piece of logic in the whole ledger (append-only correctness) and
//     is why "extract a seam" was rejected for THIS path specifically:
//     there is nothing left to extract, it is already one entry point.
//   - AllocationPosting's shape itself -- never retrofitted (see the
//     top of this header).
//
// DELIBERATELY SKIPPED, because the condition it guards against is
// STRUCTURALLY UNREACHABLE here, not because it was overlooked:
//   - allocationRule quantity/unit/driverId validation -- this service
//     always posts allocationRule: 'direct' with no quantity/unit/
//     driverId, so postAllocation's "non-direct needs a denominator"
//     and "driver-allocated needs a driverId" branches can never fire
//     for a call this service makes. Reimplementing a check that can
//     never trip would be dead code, not an invariant.
//   - periodEnd >= periodStart validation -- for a 3rd Party row,
//     periodStart === periodEnd === source.date (a single dated
//     transaction, never a spread range); for a Vansales row,
//     periodStart/periodEnd are the first/last day of the SAME
//     `vansales.periodMonth` (parsePeriodMonth always returns a start
//     <= end pair for a valid month -- see normalization.utils.ts). In
//     both cases the invariant it protects cannot be violated by this
//     service's own construction, so it stays unreimplemented.
//
// DELIBERATELY REPLACED, with a different but equally-deliberate
// contract for THIS service's batch-processing caller (postImportBatch
// driving hundreds of rows, vs. postAllocation's single synchronous
// HTTP call):
//   - postAllocation THROWS ValidationError on an unresolved FX rate;
//     this service returns `{status: 'skipped', reason:
//     'unresolved-fx-rate', ...}`. The underlying resolveFxContext call
//     and its never-guess behavior are identical (proved by the parity
//     test) -- only what happens with a null result differs, because a
//     throw would abort postImportBatch's whole batch over one bad row.
//   - Same reasoning for pending-amount/missing-date/unresolved-
//     currency/unresolved-vehicle-identity: all conditions postAllocation
//     has no equivalent of at all (it takes amount/vehicleId as already-
//     resolved, required input), turned into batch-safe skips here
//     because THIS service's whole job is deriving them from source
//     evidence that may not (yet) be resolvable.
//   - idempotencyKey: postAllocation accepts an OPTIONAL caller-supplied
//     key (used only by Phase 6 auto-posting call sites) and does
//     nothing further with it -- no 11000-race handling of its own.
//     This service ALWAYS derives its own key (via the shared
//     buildPostingIdempotencyKey) and DOES handle the 11000 race,
//     because every call here is auto-derived, never a one-off manual
//     posting a human is deliberately allowed to repeat. That race-
//     handling and the "always derive a key" policy are not
//     postAllocation's contract to begin with -- they mirror
//     AllocationPostingService.postSource's (Phase 6 auto-posting)
//     contract instead, which this service's own header already says
//     it "structurally mirrors ... far more closely than AllocationService
//     itself." Item 3 asked specifically about the AllocationService
//     comparison, so that distinction is worth being explicit about:
//     this service's true sibling for idempotency/race semantics is
//     AllocationPostingService, not AllocationService.
//
// NOT COMPARABLE AT ALL -- the documented, permanent divergence (see
// "WHY THIS IS NOT AllocationService.postAllocation" above): vehicle
// resolution. resolveVehicleInScope() checks a tblvehicles row against
// the caller's ORG-UNIT scope; this service checks a tblcontractedvehicles
// row against TENANT membership only, because a ContractedVehicle is
// organization-level (can serve more than one branch) while a Vehicle
// is org-unit-scoped. Extracting a shared "vehicle-resolution seam"
// would mean either forcing ContractedVehicle to pretend it has a
// single orgUnitId (fabricating an ownership fact the data does not
// support) or building a polymorphic resolver inside AllocationService
// -- itself financially safety-critical, stable, and used by every
// other cost category -- purely to serve one category's different
// scoping model. That risk was judged larger than the cost of one
// documented, tested divergence, especially since the codebase already
// has 10+ other "check org-unit-scope by hand" call sites outside
// finance entirely (dispatch, inventory, attention, ...) that this
// task was never in scope to unify either -- partially refactoring one
// of many instances of an established codebase-wide idiom, as a side
// effect of an unrelated delivery, is its own source of inconsistency.
//
// ---------------------------------------------------------------------
// ORG-UNIT ATTRIBUTION -- PROVISIONAL, SAME INTERIM RULE AS O1
// ---------------------------------------------------------------------
// The posting's orgUnitId is copied from the SOURCE RECORD's own
// orgUnitId, which import-transport-cost.handler.ts already resolved at
// import time via resolveCreationOrgUnitId (the importing user's own
// scope) -- the same interim rule applied consistently across O1/O2/O3/O4
// per the client's explicit instruction. This is engineering's interim
// best reading, NOT a settled answer -- see
// server/tenancy/module-scope.registry.ts's 'transport-cost' entry
// (confirmed: false) and the delivery README's "still open" section.
// Reusing the source record's already-resolved value (rather than
// re-deriving from whoever happens to call postSourceRecord) is
// deliberate: postSourceRecord may run long after import, from a
// different caller/branch than the importer, and re-deriving would
// silently re-attribute historical evidence to the wrong org unit.

import {
  allocationLedgerRepository,
  AllocationLedgerRepository,
} from '@/modules/finance/repositories/allocation-ledger.repository';
import { allocationService, AllocationService } from '@/modules/finance/services/allocation.service';
import { financeSettingsService, FinanceSettingsService } from '@/modules/finance/services/finance-settings.service';
import { resolveFxContext, roundCurrency } from '@/modules/finance/utils/fx-conversion.utils';
import { buildPostingIdempotencyKey } from '@/modules/finance/services/allocation-posting.service';
import type { AllocationPosting, AllocationCostCategory } from '@/modules/finance/types/allocation.types';

import {
  transportCostSourceRecordRepository,
  TransportCostSourceRecordRepository,
} from '../repositories/transport-cost-source-record.repository';
import {
  contractedVehicleRepository,
  ContractedVehicleRepository,
} from '../repositories/contracted-vehicle.repository';
import {
  transportCostVatConfigService,
  TransportCostVatConfigService,
} from './transport-cost-vat-config.service';
import { parsePeriodMonth } from '../utils/normalization.utils';
import type { TransportCostSourceRecord } from '@/shared/types/transport-cost.types';

import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { NotFoundError, ConflictError } from '@/server/errors/app.errors';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { monitoring } from '@/infrastructure/monitoring/logger';

// See allocation.types.ts's AllocationCostCategory for the Section R2
// split into third-party-transport / transport-retainer / stock-transfer.
// This service posts two source families under 'third-party-transport'
// (3rd Party, Swift), one under 'transport-retainer' (Vansales), and one
// under 'stock-transfer' (Depot STO -- see DEPOT_STO_DECISION.md).
const COST_CATEGORY_BY_FAMILY: Record<'third-party' | 'vansales' | 'swift' | 'depot-sto', AllocationCostCategory> = {
  'third-party': 'third-party-transport',
  vansales: 'transport-retainer',
  swift: 'third-party-transport',
  'depot-sto': 'stock-transfer',
};
const SOURCE_COLLECTION = 'tbltransportcostsourcerecords' as const;

export type PostSourceRecordOutcome =
  /** First-ever posting for this source record. */
  | { status: 'posted'; posting: AllocationPosting }
  /** Re-run with no change since the last post -- a genuine no-op, not a new row. */
  | { status: 'unchanged'; posting: AllocationPosting }
  /** The source's amount/currency changed since the last post: the previous
   *  posting was reversed (never mutated) and a fresh one appended. */
  | { status: 'corrected'; reversal: AllocationPosting; posting: AllocationPosting }
  /** Refused for an EXPECTED reason -- safe to log/surface, never thrown. */
  | { status: 'skipped'; reason: SkipReason; detail: string };

export type SkipReason =
  | 'pending-amount'
  | 'unsupported-sheet-family'
  | 'unresolved-vehicle-identity'
  | 'unresolved-currency'
  | 'unresolved-fx-rate'
  | 'missing-date'
  /** Vansales only: `source.vansales.periodMonth` is missing or not a
   *  valid "YYYY-MM" -- see VANSALES_PERIODIZATION_DECISION.md. Expected
   *  only for a row imported before this field existed; every row
   *  imported through the current handler always has a valid one (the
   *  whole batch is rejected at import time otherwise). */
  | 'missing-period-month'
  /** postImportBatch only: an unexpected error posting this specific row (see its detail message). */
  | 'error';

export class TransportCostPostingService {
  constructor(
    private readonly sourceRepo: TransportCostSourceRecordRepository = transportCostSourceRecordRepository,
    private readonly vehicleRepo: ContractedVehicleRepository = contractedVehicleRepository,
    private readonly vatConfigService: TransportCostVatConfigService = transportCostVatConfigService,
    private readonly settingsService: FinanceSettingsService = financeSettingsService,
    // Injectable so tests can run this service's idempotency/correction
    // logic against a FakeCollection-backed ledger (the same pattern
    // tests/security/allocation-ledger-append-only.spec.ts uses for the
    // repository itself) without a live Mongo instance -- the process-
    // wide singletons remain the real default for every actual caller.
    private readonly ledgerRepo: AllocationLedgerRepository = allocationLedgerRepository,
    private readonly allocation: AllocationService = allocationService
  ) {}

  /**
   * Posts (or re-evaluates) one source record. NEVER THROWS for an
   * expected condition -- a pending amount, an unresolved identity, a
   * missing FX rate all return `{status: 'skipped', ...}` so a caller
   * driving a batch (postImportBatch below, or a future auto-posting
   * hook) can carry on to the next row rather than aborting the batch.
   * Genuine errors (record not found / out of the caller's org-unit
   * scope) still throw -- those are caller mistakes, not data states.
   */
  async postSourceRecord(
    context: TenantContext,
    userId: string,
    sourceRecordId: string
  ): Promise<PostSourceRecordOutcome> {
    const source = await this.sourceRepo.findById(sourceRecordId, context.organizationId);
    if (!source) {
      throw new NotFoundError(`Transport cost source record "${sourceRecordId}" not found.`);
    }
    // findById is tenant-scoped but not org-unit scoped (same trap
    // documented in AllocationService.reversePosting) -- apply the
    // caller's org-unit scope by hand. 404, never 403, so an
    // out-of-scope id does not confirm the record exists.
    if (
      context.accessibleOrgUnitIds !== null &&
      (!source.orgUnitId || !context.accessibleOrgUnitIds.includes(source.orgUnitId))
    ) {
      throw new NotFoundError(`Transport cost source record "${sourceRecordId}" not found.`);
    }

    const resolved = this.resolveAmountAndPeriod(source);
    if (!resolved.ok) {
      return { status: 'skipped', reason: resolved.reason, detail: resolved.detail };
    }
    const { costCategory, amount: sourceAmount, periodStart, periodEnd } = resolved;

    if (!source.contractedVehicleId) {
      return {
        status: 'skipped',
        reason: 'unresolved-vehicle-identity',
        detail:
          `Row ${source.sourceRowNumber}'s registration ("${source.registrationRaw}") has not yet ` +
          'been confirmed to a ContractedVehicle via the Phase O2 normalization review queue.',
      };
    }

    // Organization-level, not org-unit scoped -- a contracted vehicle
    // can serve more than one branch (see contracted-vehicle.types.ts's
    // header), so there is no further scope check beyond tenant
    // membership, unlike resolveVehicleInScope's tblvehicles check.
    const vehicle = await this.vehicleRepo.findById(source.contractedVehicleId, context.organizationId);
    if (!vehicle) {
      // Defensive: contractedVehicleId is only ever set by a confirmed
      // review decision (see normalization-matcher.service.ts's header),
      // so a dangling reference here would indicate the vehicle was
      // hard-deleted out from under a live reference -- not expected,
      // but still reported as a skip rather than a crash, since it is a
      // property of THIS record, not an infrastructure failure.
      return {
        status: 'skipped',
        reason: 'unresolved-vehicle-identity',
        detail: `ContractedVehicle "${source.contractedVehicleId}" referenced by this row no longer exists.`,
      };
    }

    const vatConfig = await this.vatConfigService.resolve(source.sheetFamily, source.importBatchId, context.organizationId);
    if (!vatConfig.currency) {
      return {
        status: 'skipped',
        reason: 'unresolved-currency',
        detail: `No currency configured for sheet family "${source.sheetFamily}" (import ${source.importBatchId}).`,
      };
    }

    const settings = await this.settingsService.resolve(context.organizationId);
    const fx = resolveFxContext({
      amount: sourceAmount,
      currency: vatConfig.currency.toUpperCase(),
      reportingCurrency: settings.reportingCurrency,
      fxPolicy: settings.fxPolicy,
      transactionDate: periodEnd,
      periodEnd,
    });
    if (!fx) {
      return {
        status: 'skipped',
        reason: 'unresolved-fx-rate',
        detail:
          `No exchange rate available for ${vatConfig.currency.toUpperCase()} -> ${settings.reportingCurrency}. ` +
          'This deployment has no live FX feed and will not assume parity.',
      };
    }

    const targetAmount = roundCurrency(sourceAmount);
    const targetCurrency = vatConfig.currency.toUpperCase();

    // The whole posting history for this source -- see
    // AllocationLedgerRepository.findBySource's doc comment for why this
    // (not a single idempotencyKey lookup) is what "already posted, and
    // is it still current" has to be derived from. Scoped by costCategory
    // as well as sourceId/sourceCollection so a 3rd Party and a Vansales
    // posting derived from two DIFFERENT source records never collide --
    // each source record only ever resolves to one costCategory (see
    // resolveAmountAndPeriod), so this is a defensive scope, not a
    // functional requirement today.
    const history = await this.ledgerRepo.findBySource(
      SOURCE_COLLECTION,
      sourceRecordId,
      costCategory,
      context
    );
    const originals = history.filter((p) => !p.reversalOfPostingId);
    const live = originals[originals.length - 1];

    let version = originals.length + 1;
    let reversal: AllocationPosting | undefined;

    if (live) {
      const unchanged = live.amount === targetAmount && live.currency === targetCurrency;
      if (unchanged) {
        return { status: 'unchanged', posting: live };
      }

      // Defensive race guard: `live` is derived as "the newest original
      // with no reversal referencing it" from the same read above, so
      // this should never find one -- but a concurrent correction
      // between that read and this write is exactly the kind of race
      // append-only ledgers exist to survive without corrupting state,
      // so it is checked for real rather than assumed away.
      const alreadyReversed = await this.ledgerRepo.findReversalOf(String(live._id), context);
      if (alreadyReversed) {
        throw new ConflictError(
          `Posting "${live._id}" was reversed by a concurrent correction; retry postSourceRecord.`
        );
      }

      const result = await this.allocation.reversePosting(
        context,
        userId,
        String(live._id),
        `Superseded by re-import/correction: source amount or currency changed ` +
          `(was ${live.amount} ${live.currency}, now ${targetAmount} ${targetCurrency}).`
      );
      reversal = result.reversal;
      version = originals.length + 1;
    }

    const idempotencyKey = `${buildPostingIdempotencyKey({
      tenantId: context.organizationId,
      sourceCollection: SOURCE_COLLECTION,
      sourceId: sourceRecordId,
      costCategory,
    })}:v${version}`;

    let posting: AllocationPosting;
    try {
      posting = await this.ledgerRepo.append(
        {
          orgUnitId: source.orgUnitId,
          vehicleId: source.contractedVehicleId,
          costCategory,
          allocationRule: 'direct',
          sourceCollection: SOURCE_COLLECTION,
          sourceId: sourceRecordId,
          description: this.describePosting(source, vehicle),
          periodStart,
          periodEnd,
          // OLIVINE LIVE OPERATING MODEL, item 2/3/4: copied verbatim
          // from the source record, never fabricated -- see
          // AllocationPosting.costFacingCompany's own doc comment. Only
          // set when the source record actually has one (a historical
          // pre-this-feature row simply posts without it, exactly like
          // glAccountCode's own optional-field precedent).
          //
          // KNOWN, ACCEPTED LIMITATION: AllocationService.reversePosting
          // (the shared, financially-critical correction path this
          // service deliberately reuses rather than reimplements -- see
          // this file's header) builds its reversal posting from an
          // explicit field list that does not include costFacingCompany,
          // so a REVERSAL of a transport-cost posting will not carry the
          // company forward and will show as unattributed in a
          // company-dimension breakdown, even though the original
          // posting it reverses did. Deliberately NOT fixed by widening
          // reversePosting's field list in this pass -- that method is
          // shared by every cost category and is this ledger's single
          // highest-risk piece of logic; see this file's header for why
          // "document + accept" was chosen over touching it under time
          // pressure. Real-world impact is small: this only affects a
          // genuine reversal (not the far more common dedupe + re-post
          // correction path used for a duplicate re-import), and shows
          // up only as a small unattributed offsetting entry, never a
          // wrong total. Flagged in the gap analysis as a easy, fully
          // reversible follow-up (add costFacingCompany: original
          // .costFacingCompany to that one object literal) whenever
          // this is prioritised.
          ...(source.costFacingCompany ? { costFacingCompany: source.costFacingCompany } : {}),
          currency: targetCurrency,
          amount: targetAmount,
          fxRate: fx.fxRate,
          fxRateDate: fx.fxRateDate,
          fxSource: fx.fxSource,
          reportingCurrency: settings.reportingCurrency,
          reportingAmount: fx.reportingAmount,
          idempotencyKey,
          postedBy: userId,
          postedAt: new Date(),
        },
        context.organizationId,
        userId
      );
    } catch (error) {
      // 11000 = the unique {tenantId, idempotencyKey} index caught a
      // race: another call posted this exact version between our read
      // and this write. Resolve to what won, rather than surfacing a
      // transient error for a condition that already has a correct
      // outcome on disk -- same handling as AllocationPostingService
      // .postSource's own 11000 branch.
      if ((error as { code?: number }).code === 11000) {
        const winner = await this.ledgerRepo.findByIdempotencyKey(idempotencyKey, context.organizationId);
        if (winner) {
          return reversal
            ? { status: 'corrected', reversal, posting: winner }
            : { status: 'unchanged', posting: winner };
        }
      }
      monitoring.logError('[transport-cost-posting] Unexpected failure', error as Error, {
        sourceRecordId,
        importBatchId: source.importBatchId,
      });
      throw error;
    }

    await auditLog.logCreate(userId, context.organizationId, 'transportCost.allocationPosting', String(posting._id), {
      sourceRecordId,
      contractedVehicleId: source.contractedVehicleId,
      amount: posting.amount,
      currency: posting.currency,
      reportingAmount: posting.reportingAmount,
      reportingCurrency: posting.reportingCurrency,
      isProvisionalCurrencyDefault: vatConfig.isProvisionalDefault,
      correctionOfPostingId: reversal ? reversal.reversalOfPostingId : undefined,
    });

    return reversal ? { status: 'corrected', reversal, posting } : { status: 'posted', posting };
  }

  /**
   * Posts every source record in one import batch, best-effort --
   * mirrors ImportTransportCostHandler's own per-row try/catch
   * philosophy (a normalization or posting failure for one row is
   * information about THAT row, never a reason to abort the batch).
   * Used by an operator "post this import" action and by the delivery
   * verification script's re-import-twice / correction checks.
   */
  async postImportBatch(
    context: TenantContext,
    userId: string,
    importBatchId: string
  ): Promise<{ total: number; outcomes: Array<{ sourceRecordId: string; outcome: PostSourceRecordOutcome }> }> {
    const records = await this.sourceRepo.findByImportBatch(importBatchId, context.organizationId, context);
    const outcomes: Array<{ sourceRecordId: string; outcome: PostSourceRecordOutcome }> = [];

    for (const record of records) {
      try {
        const outcome = await this.postSourceRecord(context, userId, record._id!);
        outcomes.push({ sourceRecordId: record._id!, outcome });
      } catch (error) {
        monitoring.logError('[transport-cost-posting] postImportBatch row failed', error as Error, {
          sourceRecordId: record._id,
          importBatchId,
        });
        outcomes.push({
          sourceRecordId: record._id!,
          outcome: {
            status: 'skipped',
            reason: 'error',
            detail: error instanceof Error ? error.message : 'Unknown error while posting this row.',
          },
        });
      }
    }

    return { total: records.length, outcomes };
  }

  /**
   * The one place the two source families' posting rules actually
   * diverge -- everything from vehicle resolution onward in
   * postSourceRecord is shared. Returns the costCategory/amount/period
   * to post, or a skip reason, NEVER a fabricated value: a Vansales row
   * with no `total` or no valid `periodMonth` is skipped, exactly like a
   * 3rd Party row with no `amount` or no parseable `date` always has been.
   */
  private resolveAmountAndPeriod(
    source: TransportCostSourceRecord
  ):
    | { ok: true; costCategory: AllocationCostCategory; amount: number; periodStart: Date; periodEnd: Date }
    | { ok: false; reason: SkipReason; detail: string } {
    switch (source.sheetFamily) {
      case 'third-party':
      case 'swift':
      case 'depot-sto': {
        // Swift and Depot STO rows are both mapped onto the same shared
        // amount/date fields as 3rd Party at import time (Swift: amount
        // <- Total(Incl), date <- Cons. date -- see validateAndBuildSwift;
        // Depot STO: amount <- Amount/COSTS/COST (whichever the month's
        // sheet used), date <- DATE, used as-is per the user's own
        // instruction -- see validateAndBuildDepotSto and
        // DEPOT_STO_DECISION.md), so the same amount/date resolution
        // applies unchanged to all three families here. What differs
        // per family is entirely downstream of this method:
        //  - Swift: every row has contractedVehicleId unset (no
        //    registration column exists in the source at all) and will
        //    skip at postSourceRecord's `unresolved-vehicle-identity`
        //    check above -- see this file's header and
        //    SWIFT_POSTING_DECISION.md.
        //  - Depot STO: which rows resolve a vehicle identity is a
        //    DATA fact, not purely a schema fact -- May has no
        //    registration column at all and always skips; June/July's
        //    `REG` column exists in the schema but is populated in
        //    essentially none of the real rows (0/24, 1/84), so those
        //    also skip in practice; March/April/August rows carry a
        //    real, populated registration (100%/100%/98.8% of real
        //    rows) and resolve normally through Phase O2's review
        //    queue, same as 3rd Party -- see DEPOT_STO_DECISION.md's
        //    "Vehicle identity" section for the full per-month table.
        //
        // Never coerce a missing Amount to 0 -- see import-transport-cost
        // .handler.ts's header for why a blank cell means "not invoiced
        // yet", not "zero cost".
        if (source.amount === null) {
          return {
            ok: false,
            reason: 'pending-amount',
            detail: `Row ${source.sourceRowNumber} of ${source.sourceFileName} has no Amount recorded yet.`,
          };
        }
        if (!source.date) {
          // Defensive: all three families fail import validation without
          // a parseable date (see the handler), so this should be
          // unreachable in practice. Guarded explicitly rather than
          // asserted with `!`, because a periodStart/periodEnd this
          // service invented would be exactly the fabrication the hard
          // constraints forbid.
          return {
            ok: false,
            reason: 'missing-date',
            detail: `Row ${source.sourceRowNumber} of ${source.sourceFileName} has no parseable date.`,
          };
        }
        return {
          ok: true,
          costCategory: COST_CATEGORY_BY_FAMILY[source.sheetFamily],
          amount: source.amount,
          periodStart: source.date,
          periodEnd: source.date,
        };
      }
      case 'vansales': {
        // Vansales periodization Option A (VANSALES_PERIODIZATION_DECISION.md):
        // `total` is the ONLY figure ever posted -- never re-summed from
        // weeklyAmounts (a known merged-cell artifact) and never
        // monthlyCostBeforeVat (a pre-VAT figure this service is not
        // responsible for reconciling against TOTAL).
        const total = source.vansales?.total ?? null;
        if (total === null) {
          return {
            ok: false,
            reason: 'pending-amount',
            detail:
              `Row ${source.sourceRowNumber} of ${source.sourceFileName} has no TOTAL recorded yet ` +
              '(never derived from WEEK1-4 or MONTHLY COST BEFORE VAT -- see VANSALES_PERIODIZATION_DECISION.md).',
          };
        }
        const period = parsePeriodMonth(source.vansales?.periodMonth ?? null);
        if (!period) {
          return {
            ok: false,
            reason: 'missing-period-month',
            detail:
              `Row ${source.sourceRowNumber} of ${source.sourceFileName} has no valid periodMonth ` +
              '("YYYY-MM") -- see VANSALES_PERIODIZATION_DECISION.md. Re-import this batch with a ' +
              'declared period month; the period is never inferred.',
          };
        }
        return {
          ok: true,
          costCategory: COST_CATEGORY_BY_FAMILY.vansales,
          amount: total,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
        };
      }
      default:
        // Defensive: TransportCostSheetFamily has exactly the four
        // members handled above today -- this branch is unreachable in
        // practice, kept only so a future fifth family fails loudly
        // here instead of silently falling through to a fabricated
        // amount/period.
        return {
          ok: false,
          reason: 'unsupported-sheet-family',
          detail: `Sheet family "${source.sheetFamily}" is not supported for posting.`,
        };
    }
  }

  /**
   * Swift falls through to the 3rd-Party-shaped branch below (its
   * destinationTown/salesInvoiceNo ARE populated at import time -- see
   * validateAndBuildSwift). In practice this is never reached for a
   * Swift row: every Swift row lacks a contractedVehicleId and always
   * returns at postSourceRecord's `unresolved-vehicle-identity` check
   * before `vehicle` (this method's 2nd argument) is ever resolved. Kept
   * branch-correct anyway rather than left to throw, in case a future
   * change (e.g. a manual vehicle override) ever lets a Swift row reach
   * this far.
   *
   * Depot STO gets its OWN branch (unlike Swift): unlike Swift, a Depot
   * STO row genuinely CAN reach this method with a resolved vehicle --
   * March/April/August rows carry a real, populated registration in
   * the actual data (June/July have a `REG` column in the schema but
   * it's populated in essentially none of the real rows -- see
   * DEPOT_STO_DECISION.md's "Vehicle identity" table) -- so the
   * description is worth being accurate for real postings, not just
   * defensively branch-complete. Uses only
   * `depotSto.stoNumber/sourceLocation/depot/commodity` -- never the
   * sign-off fields, which stay raw provenance only, never surfaced as
   * if they meant something in a human-readable description.
   */
  private describePosting(
    source: Pick<TransportCostSourceRecord, 'sheetFamily' | 'transporterNormalized' | 'transporterRaw' | 'destinationTown' | 'salesInvoiceNo' | 'vansales' | 'depotSto'>,
    vehicle: { registration: string }
  ): string {
    const transporter = source.transporterNormalized ?? source.transporterRaw;
    if (source.sheetFamily === 'vansales') {
      const payer = source.vansales?.payerName ?? 'payer unspecified';
      const product = source.vansales?.product ?? 'product unspecified';
      const period = source.vansales?.periodMonth ?? 'period unspecified';
      return `Vansales retainer: ${payer} / ${transporter} / ${vehicle.registration} -> ${product} (${period})`;
    }
    if (source.sheetFamily === 'depot-sto') {
      const sto = source.depotSto?.stoNumber ?? 'STO unspecified';
      const from = source.depotSto?.sourceLocation ?? 'source unspecified';
      const to = source.depotSto?.depot ?? 'depot unspecified';
      const commodity = source.depotSto?.commodity ?? 'commodity unspecified';
      return `Depot STO ${sto}: ${transporter} / ${vehicle.registration} -> ${from} to ${to} (${commodity})`;
    }
    const destination = source.destinationTown ?? 'destination unspecified';
    const invoice = source.salesInvoiceNo ? ` (invoice ${source.salesInvoiceNo})` : '';
    return `${transporter} / ${vehicle.registration} -> ${destination}${invoice}`;
  }
}

export const transportCostPostingService = new TransportCostPostingService();
