// modules/finance/services/allocation-source-builder.ts
//
// "Given a fuel log / expense / reminder / work order, what should be
// posted to the allocation ledger?"
//
// ---------------------------------------------------------------------
// WHY THIS IS A SHARED MODULE AND NOT A METHOD ON THE HANDLER
// ---------------------------------------------------------------------
// It was a private method on AllocationPostingHandler, which was correct
// while events were the only way a posting could happen. The historical
// backfill (`npm run finance:backfill-ledger`) posts the SAME records
// from the database rather than from an event, and it must produce
// byte-identical postings -- same amounts, same dates, same parts/labour
// split, same refusals -- or the backfill and the live path disagree and
// the ledger ends up holding two answers for the same month.
//
// Copying the rules into the script would have been quicker and would
// have created exactly the drift this codebase keeps being bitten by:
// two implementations of one rule, one of which gets fixed.
//
// ---------------------------------------------------------------------
// THE RULES, ALL OF WHICH ARE LOAD-BEARING
// ---------------------------------------------------------------------
//  * THE PERIOD IS THE RECORD'S OWN DATE. A source with no date is
//    REFUSED, never dated to now. The ledger is append-only, so a cost
//    in the wrong period cannot be edited out -- and a refusal is
//    visible today, whereas a misdated posting surfaces months later
//    during reconciliation.
//  * A WORK ORDER IS TWO COSTS. Parts and labour are different lines to
//    a finance team, and `totalCost` alone makes the split
//    unrecoverable. The total is used ONLY when neither component
//    exists; posting both would double-count, which on an append-only
//    ledger needs a human reversal to undo.
//  * MAINTENANCE COSTS ARE ESTIMATES. Reminder carries no actuals field,
//    so the posting says so -- otherwise a finance user reconciles an
//    estimate against an invoice and concludes the ledger is wrong.
//  * CURRENCY TRAVELS WITH THE AMOUNT. Absent means the tenant's
//    reporting currency; a foreign currency with no rate is refused
//    downstream rather than converted at an assumed 1:1.

import type { AutoPostSource } from './allocation-posting.service';
import type {
  AllocationCostCategory,
  AllocationPosting,
} from '../types/allocation.types';

/** What a given source collection contributes to the ledger. */
export interface PostingSpec {
  sourceCollection: AllocationPosting['sourceCollection'];
  costCategory: AllocationCostCategory;
}

export interface BuildSourcesInput {
  spec: PostingSpec;
  /** The source record's own `_id`. */
  sourceId: string;
  /** The vehicle's `_id`, already resolved and scope-checked. */
  vehicleId: string;
  /**
   * The record itself, or an event payload carrying the same field
   * names. Deliberately loose: the event payload and the stored document
   * are the same shape by construction, and asserting a narrower type
   * here would force a cast at one of the two call sites.
   */
  record: Record<string, unknown>;
}

export interface BuildSourcesResult {
  sources: AutoPostSource[];
  /**
   * Why nothing was produced, when nothing was.
   *
   * Returned rather than logged so both callers can decide what to do
   * with it -- the handler warns, the backfill counts it into a report
   * the operator reads. An empty array with no explanation is the
   * silence this codebase has repeatedly been bitten by.
   */
  refusal?: string;
}

/** The date a posting belongs to, or null. NEVER falls back to now. */
export function resolveOccurredAt(record: Record<string, unknown>): Date | null {
  const raw = record.date ?? record.completion_date ?? record.completedAt;
  if (raw === null || raw === undefined || raw === '') return null;
  const parsed = new Date(raw as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function buildAllocationSources(input: BuildSourcesInput): BuildSourcesResult {
  const { spec, sourceId, vehicleId, record } = input;

  if (!sourceId) return { sources: [], refusal: 'Record has no id.' };
  if (!vehicleId) return { sources: [], refusal: 'Vehicle could not be resolved.' };

  const occurredAt = resolveOccurredAt(record);
  if (!occurredAt) {
    return {
      sources: [],
      refusal:
        'Record carries no usable date. Refusing to post rather than dating it to now — ' +
        'the ledger is append-only, so a cost in the wrong period cannot be edited out.',
    };
  }

  const common = {
    sourceId,
    vehicleId,
    occurredAt,
    ...(typeof record.currency === 'string' ? { currency: record.currency } : {}),
    ...(typeof record.fxRate === 'number' ? { fxRate: record.fxRate } : {}),
    // snake -> camel, in ONE place. The ledger spells it `driverId`; every
    // operational record in this codebase spells it `driver_id`, and the
    // handler's original line read only the camel form -- which no event
    // has ever published, so the ledger's driver column was always empty.
    ...(typeof record.driver_id === 'string' && record.driver_id
      ? { driverId: record.driver_id }
      : typeof record.driverId === 'string' && record.driverId
      ? { driverId: record.driverId }
      : {}),
  };

  // ── work orders: parts and labour are separate costs ────────────────
  if (spec.sourceCollection === 'tblworkorders') {
    const parts = Number(record.partsCost);
    const labour = Number(record.laborCost);
    const sources: AutoPostSource[] = [];

    if (Number.isFinite(parts) && parts > 0) {
      sources.push({
        ...common,
        sourceCollection: spec.sourceCollection,
        costCategory: 'maintenance' as AllocationCostCategory,
        amount: parts,
        description: 'Work order parts',
      });
    }
    if (Number.isFinite(labour) && labour > 0) {
      sources.push({
        ...common,
        sourceCollection: spec.sourceCollection,
        costCategory: 'other' as AllocationCostCategory,
        amount: labour,
        description: 'Work order labour',
      });
    }

    if (sources.length === 0) {
      const total = Number(record.totalCost);
      if (Number.isFinite(total) && total > 0) {
        sources.push({
          ...common,
          sourceCollection: spec.sourceCollection,
          costCategory: spec.costCategory,
          amount: total,
          description: 'Work order total (parts/labour split unavailable)',
        });
      } else {
        return { sources: [], refusal: 'Work order records no parts, labour or total cost.' };
      }
    }
    return { sources };
  }

  const amount = Number(record.amount ?? record.cost ?? record.totalCost);
  if (!Number.isFinite(amount)) {
    return { sources: [], refusal: 'Record carries no numeric amount.' };
  }

  return {
    sources: [
      {
        ...common,
        sourceCollection: spec.sourceCollection,
        costCategory: spec.costCategory,
        amount,
        ...(record.cost_is_estimate === true || spec.sourceCollection === 'tblreminders'
          ? { description: 'Maintenance (estimated cost — no actuals recorded)' }
          : {}),
      },
    ],
  };
}
