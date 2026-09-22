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
// SCOPE OF THIS SLICE: THIRD-PARTY ROWS ONLY
// ---------------------------------------------------------------------
// A Vansales row's `date` is ALWAYS null (see import-transport-cost
// .handler.ts's validateAndBuildVansales) -- it is a fixed weekly/
// monthly retainer per payer/truck, not a dated per-shipment
// transaction, and the real cost lives in `vansales.total` /
// `monthlyCostBeforeVat`, never in `amount` (which O1 deliberately
// leaves null for every Vansales row -- audit Section B). Posting a
// Vansales row would require INVENTING a periodStart/periodEnd from
// something other than the row itself (e.g. parsing "JAN-26 Vansales"
// out of a sheet name the import command does not even currently
// capture) -- exactly the kind of fabrication the hard constraints
// forbid. Rather than guess a period, this slice posts THIRD-PARTY rows
// only and leaves Vansales posting as an explicitly OPEN ITEM (see the
// delivery README) -- a scope note, not a silently missing feature.
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
import type { AllocationPosting } from '@/modules/finance/types/allocation.types';

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

import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { NotFoundError, ConflictError } from '@/server/errors/app.errors';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { monitoring } from '@/infrastructure/monitoring/logger';

const COST_CATEGORY = 'transport-cost' as const;
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

    if (source.sheetFamily !== 'third-party') {
      return {
        status: 'skipped',
        reason: 'unsupported-sheet-family',
        detail:
          'Vansales rows are not posted in this slice -- they carry no per-row transaction ' +
          'date (see this service\'s header). Deferred, not dropped: still visible via ' +
          'GET /api/transport-cost/source-records.',
      };
    }

    // Never coerce a missing Amount to 0 -- see import-transport-cost
    // .handler.ts's header for why a blank cell means "not invoiced
    // yet", not "zero cost".
    if (source.amount === null) {
      return {
        status: 'skipped',
        reason: 'pending-amount',
        detail: `Row ${source.sourceRowNumber} of ${source.sourceFileName} has no Amount recorded yet.`,
      };
    }

    if (!source.date) {
      // Defensive: third-party rows fail import validation without a
      // parseable date (see the handler), so this should be unreachable
      // in practice. Guarded explicitly rather than asserted with `!`,
      // because a periodStart/periodEnd this service invented would be
      // exactly the fabrication the hard constraints forbid.
      return {
        status: 'skipped',
        reason: 'missing-date',
        detail: `Row ${source.sourceRowNumber} of ${source.sourceFileName} has no parseable date.`,
      };
    }

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
      amount: source.amount,
      currency: vatConfig.currency.toUpperCase(),
      reportingCurrency: settings.reportingCurrency,
      fxPolicy: settings.fxPolicy,
      transactionDate: source.date,
      periodEnd: source.date,
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

    const targetAmount = roundCurrency(source.amount);
    const targetCurrency = vatConfig.currency.toUpperCase();

    // The whole posting history for this source -- see
    // AllocationLedgerRepository.findBySource's doc comment for why this
    // (not a single idempotencyKey lookup) is what "already posted, and
    // is it still current" has to be derived from.
    const history = await this.ledgerRepo.findBySource(
      SOURCE_COLLECTION,
      sourceRecordId,
      COST_CATEGORY,
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
      costCategory: COST_CATEGORY,
    })}:v${version}`;

    let posting: AllocationPosting;
    try {
      posting = await this.ledgerRepo.append(
        {
          orgUnitId: source.orgUnitId,
          vehicleId: source.contractedVehicleId,
          costCategory: COST_CATEGORY,
          allocationRule: 'direct',
          sourceCollection: SOURCE_COLLECTION,
          sourceId: sourceRecordId,
          description: this.describePosting(source, vehicle),
          periodStart: source.date,
          periodEnd: source.date,
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

  private describePosting(
    source: { transporterNormalized: string | null; transporterRaw: string; destinationTown?: string; salesInvoiceNo?: string },
    vehicle: { registration: string }
  ): string {
    const transporter = source.transporterNormalized ?? source.transporterRaw;
    const destination = source.destinationTown ?? 'destination unspecified';
    const invoice = source.salesInvoiceNo ? ` (invoice ${source.salesInvoiceNo})` : '';
    return `${transporter} / ${vehicle.registration} -> ${destination}${invoice}`;
  }
}

export const transportCostPostingService = new TransportCostPostingService();
