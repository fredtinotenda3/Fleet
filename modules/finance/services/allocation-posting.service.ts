// modules/finance/services/allocation-posting.service.ts
//
// PHASE 6 -- the missing fuel line to the cost-per-km engine.
//
// ---------------------------------------------------------------------
// THE GAP
// ---------------------------------------------------------------------
// The allocation ledger is complete, correct, indexed, append-only and
// tested. It reads an empty collection. A repo-wide grep for callers of
// `allocationLedger`, `postAllocation` or `allocationService` from
// fuel, expenses, maintenance or work orders returned nothing.
//
// So `getCostPerKm` divides a real distance by a total of zero and
// returns a number that looks like an answer. Every figure downstream --
// the value ledger's savings estimates, the finance dashboards, the GL
// reconciliation -- is derived from an empty set.
//
// This service is the connection. It takes an operational record that
// already exists (a fuel log, an expense, a maintenance charge, a work
// order) and posts it into the ledger, once.
//
// ---------------------------------------------------------------------
// IDEMPOTENCY: A DETERMINISTIC KEY, NOT A UUID
// ---------------------------------------------------------------------
// Postings are triggered from domain events, and Phase 3 made delivery
// AT-LEAST-ONCE. A redelivered `ExpenseCreated` would post the same
// $400 twice, and because the ledger is APPEND-ONLY there is no
// `update` to correct it -- the only remedy is a reversing posting,
// which requires a human to notice a number that looks plausible.
//
// The key is a function of the SOURCE RECORD, so the same record
// computes the same key on every attempt, in every process, after any
// restart:
//
//     sha256(tenantId ␀ sourceCollection ␀ sourceId ␀ costCategory)
//
// `costCategory` is included because one source record can legitimately
// produce several postings -- a work order carrying both parts and
// labour is two costs, not one, and they must not collapse into each
// other.
//
// Enforced by a UNIQUE INDEX, not by the read below. The read is the
// cheap common path; the index is what makes it correct when two
// handlers race past it simultaneously.
//
// ---------------------------------------------------------------------
// CURRENCY: FAIL CLOSED
// ---------------------------------------------------------------------
// `resolveFxContext` already returns `null` rather than guessing when a
// foreign-currency amount has no rate, and this service propagates that
// as a REFUSAL. A posting that silently treats ZWL as USD at 1:1 does
// not produce a slightly wrong cost-per-km -- it produces one wrong by
// three orders of magnitude, in a number an operator will act on.
//
// A source record with no `currency` is treated as being in the
// tenant's reporting currency. That is the only safe default: it is what
// every existing record implicitly is today, so assuming anything else
// would retroactively misstate the entire history.

import { createHash } from 'crypto';

import { allocationService } from './allocation.service';
import { allocationLedgerRepository } from '../repositories/allocation-ledger.repository';
import { financeSettingsService } from './finance-settings.service';
import type {
  AllocationPosting,
  AllocationCostCategory,
} from '../types/allocation.types';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { ValidationError } from '@/server/errors/app.errors';
import { monitoring } from '@/infrastructure/monitoring/logger';

/** A source record the platform can post into the ledger. */
export interface AutoPostSource {
  /** Which collection the record lives in. */
  sourceCollection: AllocationPosting['sourceCollection'];
  /** The record's own _id. */
  sourceId: string;
  vehicleId: string;
  driverId?: string;
  costCategory: AllocationCostCategory;
  /** The transaction's own date; becomes periodStart and periodEnd. */
  occurredAt: Date;
  amount: number;
  /**
   * The record's own currency.
   *
   * Absent means "the tenant's reporting currency" -- see the header for
   * why that is the only safe default rather than a guess.
   */
  currency?: string;
  /** Supplied when the source captured a rate; omitted otherwise. */
  fxRate?: number;
  description?: string;
  glAccountCode?: string;
}

export type AutoPostOutcome =
  /** A new posting was created. */
  | { status: 'posted'; posting: AllocationPosting }
  /** This source was already posted; nothing was written. */
  | { status: 'duplicate'; existingPostingId?: string }
  /** Refused. `reason` is safe to log and to surface to an operator. */
  | { status: 'refused'; reason: string };

/**
 * The deterministic idempotency key for a posting.
 *
 * Exported for testing and so a caller can compute the key without
 * posting -- e.g. to check whether a record has already been posted.
 *
 * Components are NUL-separated because naive concatenation makes
 * ('ab','c') and ('a','bc') identical, which would silently merge two
 * different source records into one posting.
 */
export function buildPostingIdempotencyKey(params: {
  tenantId: string;
  sourceCollection: string;
  sourceId: string;
  costCategory: string;
}): string {
  return createHash('sha256')
    .update(
      [
        params.tenantId,
        params.sourceCollection,
        params.sourceId,
        params.costCategory,
      ].join('\u0000')
    )
    .digest('hex');
}

export class AllocationPostingService {
  /**
   * Posts one source record into the ledger, exactly once.
   *
   * NEVER THROWS for an expected condition. A duplicate, a missing FX
   * rate or an out-of-scope vehicle all return a structured outcome,
   * because the caller is usually an event handler: throwing would send
   * a poisoned event round the retry loop to the dead-letter queue when
   * the correct response is "this one cannot be posted, carry on".
   *
   * Genuine infrastructure failures (Mongo unreachable) still throw, so
   * the outbox retries them.
   */
  async postSource(
    context: TenantContext,
    userId: string,
    source: AutoPostSource
  ): Promise<AutoPostOutcome> {
    if (!Number.isFinite(source.amount)) {
      return { status: 'refused', reason: 'Amount is not a finite number.' };
    }

    // A zero-amount posting is not wrong, it is NOISE: it moves no money
    // and it dilutes every posting count an operator reads. Refused
    // rather than written.
    if (source.amount === 0) {
      return { status: 'refused', reason: 'Amount is zero; nothing to post.' };
    }

    const idempotencyKey = buildPostingIdempotencyKey({
      tenantId: context.organizationId,
      sourceCollection: source.sourceCollection,
      sourceId: source.sourceId,
      costCategory: source.costCategory,
    });

    // Fast path. The unique index below is what makes this correct under
    // concurrency; this read is what makes it cheap.
    const existing = await allocationLedgerRepository.findByIdempotencyKey(
      idempotencyKey,
      context.organizationId
    );
    if (existing) {
      return { status: 'duplicate', existingPostingId: existing._id };
    }

    const settings = await financeSettingsService.resolve(context.organizationId);
    const currency = source.currency ?? settings.reportingCurrency;

    /**
     * FAIL CLOSED ON A MISSING RATE.
     *
     * A foreign-currency amount with no resolvable rate is refused, not
     * converted at 1:1. This codebase has no live FX feed
     * (fx-conversion.utils.ts says so explicitly), so a 1:1 fallback
     * would not be an approximation -- it would silently assert that
     * 400 ZWL and 400 USD are the same cost.
     */
    if (currency !== settings.reportingCurrency && source.fxRate === undefined) {
      return {
        status: 'refused',
        reason:
          `No exchange rate available for ${currency} -> ${settings.reportingCurrency}. ` +
          'Supply an fxRate on the source record or set one manually; the platform has ' +
          'no live FX feed and will not assume parity.',
      };
    }

    try {
      const posting = await allocationService.postAllocation(context, userId, {
        vehicleId: source.vehicleId,
        ...(source.driverId ? { driverId: source.driverId } : {}),
        costCategory: source.costCategory,
        // 'direct' because a single dated transaction is not spread over
        // anything -- it belongs entirely to the vehicle that incurred
        // it. Any other rule would require a denominator this source
        // does not have, and postAllocation rightly refuses that.
        allocationRule: 'direct',
        sourceCollection: source.sourceCollection,
        sourceId: source.sourceId,
        ...(source.description ? { description: source.description } : {}),
        // periodStart === periodEnd for a direct posting, per the
        // AllocationPosting contract.
        periodStart: source.occurredAt,
        periodEnd: source.occurredAt,
        currency,
        amount: source.amount,
        ...(source.fxRate !== undefined ? { fxRate: source.fxRate } : {}),
        ...(source.glAccountCode ? { glAccountCode: source.glAccountCode } : {}),
        idempotencyKey,
      });

      return { status: 'posted', posting };
    } catch (error) {
      // 11000 = the unique index caught a race: another handler posted
      // this same source between our read and this write. That is the
      // index doing its job, not a failure.
      if ((error as { code?: number }).code === 11000) {
        const winner = await allocationLedgerRepository.findByIdempotencyKey(
          idempotencyKey,
          context.organizationId
        );
        return { status: 'duplicate', existingPostingId: winner?._id };
      }

      // A validation failure is a property of this record (an
      // out-of-scope vehicle, a bad period) and will fail identically on
      // every retry. Returned as a refusal so the event is not retried
      // to the dead-letter queue for a reason retrying cannot fix.
      if (error instanceof ValidationError) {
        return { status: 'refused', reason: error.message };
      }

      // Anything else is infrastructure. Rethrown so the outbox retries.
      monitoring.logError('[allocation-posting] Unexpected failure', error as Error, {
        sourceCollection: source.sourceCollection,
        sourceId: source.sourceId,
      });
      throw error;
    }
  }
}

export const allocationPostingService = new AllocationPostingService();
