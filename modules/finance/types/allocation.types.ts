// modules/finance/types/allocation.types.ts
//
// The allocation ledger is the cost-per-km engine's evidence trail: one
// immutable posting per cost item (a fuel log, an expense, a maintenance
// job, a depreciation charge) explaining HOW that cost was attributed to
// a vehicle -- directly, spread per-km, per-day, per-engine-hour, or
// split across the drivers who used the vehicle in the period.
//
// APPEND-ONLY, LIKE tblvalueledger
// This collection follows the exact same discipline as
// modules/attention/types/value-ledger.types.ts: no update, no delete.
// A correction is never an edit to a posting already written -- it is a
// NEW posting that references the one it corrects
// (reversalOfPostingId) and carries the equal-and-opposite amount. Net
// cost for a vehicle/period is the SUM of every posting in scope; a
// reversed posting nets to zero automatically rather than disappearing,
// so the original mistake and its correction both stay visible. See
// allocation-ledger.repository.ts for the enforcement.

import type { OrgUnitScopedEntity } from '@/server/repositories/tenant-scoped.repository';

/**
 * How a cost item's amount was attributed to a vehicle:
 *   direct            -- the entire amount belongs to one vehicle (a
 *                         fuel fill, a workshop invoice for that unit).
 *   per-km             -- a shared cost (e.g. a fleet-wide insurance
 *                         premium) spread across vehicles in proportion
 *                         to distance driven in the period.
 *   per-day            -- spread in proportion to calendar days the
 *                         vehicle was in service in the period.
 *   per-engine-hour    -- spread in proportion to metered engine hours
 *                         (plant/heavy equipment, not just road km).
 *   driver-allocated   -- spread across the driver(s) who used the
 *                         vehicle in the period, in proportion to their
 *                         share of usage (trips, hours, or km driven).
 */
export type AllocationRule = 'direct' | 'per-km' | 'per-day' | 'per-engine-hour' | 'driver-allocated';

/** The denominator an allocationRule other than 'direct' was spread over. */
export type AllocationUnit = 'km' | 'day' | 'engine-hour' | 'driver-share';

/** What kind of cost this posting represents. Drives which report line it rolls up into. */
export type AllocationCostCategory =
  | 'fuel'
  | 'maintenance'
  | 'expense'
  | 'depreciation'
  | 'insurance'
  | 'other';

/** Where the fx_rate for this posting came from -- see finance-currency addendum for the same enum applied to source transactions. */
export type FxSource = 'transaction' | 'period-average' | 'manual' | 'organization-default';

export interface AllocationPosting extends OrgUnitScopedEntity {
  /** Declared explicitly, matching the value-ledger module-scope-conformance convention. */
  orgUnitId?: string;

  vehicleId: string;
  driverId?: string;

  costCategory: AllocationCostCategory;
  allocationRule: AllocationRule;

  /** The originating record this posting explains -- a tblexpenses/tblfuellogs/tblreminders _id, or a synthetic id for a computed depreciation charge. */
  sourceCollection: 'tblexpenses' | 'tblfuellogs' | 'tblreminders' | 'finance:depreciation' | 'finance:shared-cost';
  sourceId: string;

  description?: string;

  /** The period this posting's cost applies to. For a 'direct' posting of a single dated transaction, periodStart === periodEnd. */
  periodStart: Date;
  periodEnd: Date;

  /** The quantity the amount was divided by/over, for rules other than 'direct' (e.g. total fleet km in the period). Undefined for 'direct'. */
  quantity?: number;
  unit?: AllocationUnit;

  /** Original transaction currency and amount. Negative on a reversing posting. */
  currency: string;
  amount: number;

  fxRate: number;
  fxRateDate: Date;
  fxSource: FxSource;

  /** The tenant's configured reporting currency at post time, and the amount converted into it (amount * fxRate). Negative on a reversing posting. */
  reportingCurrency: string;
  reportingAmount: number;

  /** Optional mapping to the customer's chart of accounts, used by the GL reconciliation report. */
  glAccountCode?: string;

  /**
   * PHASE 6 -- deterministic de-duplication key for auto-posted rows.
   *
   * Postings are triggered from domain events, and Phase 3 made
   * delivery AT-LEAST-ONCE. A redelivered ExpenseCreated would post the
   * same amount twice -- and because this ledger is APPEND-ONLY there is
   * no update to correct it. The only remedy is a reversing posting,
   * which needs a human to notice a number that looks plausible.
   *
   * Derived from {tenantId, sourceCollection, sourceId, costCategory}
   * and backed by a partial unique index. Absent on manually-created
   * postings, which are a deliberate human act and may legitimately
   * repeat.
   */
  idempotencyKey?: string;

  postedBy: string;
  postedAt: Date;

  /**
   * Present ONLY on a reversing posting: the _id of the posting it
   * reverses. A posting that has never been reversed has this unset.
   * Whether an ORIGINAL posting has since been reversed is not stored
   * on the original (that would be a mutation) -- it is discovered by
   * querying for any posting whose reversalOfPostingId equals it. See
   * AllocationLedgerRepository.findReversalOf.
   */
  reversalOfPostingId?: string;
  /** Required on a reversing posting: why the original was wrong. */
  reversalReason?: string;
}

/** Caller-supplied input to create a new (non-reversing) posting. Server derives orgUnitId, fx fields (when not overridden), postedBy/postedAt. */
export interface AllocationPostingInput {
  vehicleId: string;
  driverId?: string;
  costCategory: AllocationCostCategory;
  allocationRule: AllocationRule;
  sourceCollection: AllocationPosting['sourceCollection'];
  sourceId: string;
  description?: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  quantity?: number;
  unit?: AllocationUnit;
  currency: string;
  amount: number;
  /** Omit to let the tenant's FX policy resolve a default; see fx-conversion.utils.ts. */
  fxRate?: number;
  fxRateDate?: Date | string;
  fxSource?: FxSource;
  glAccountCode?: string;
  /** PHASE 6: supplied by the auto-posting service; omitted for manual postings. */
  idempotencyKey?: string;
}

/** One row of a cost-per-km breakdown: net (post-reversal) totals for one category over the requested period. */
export interface AllocationCategoryTotal {
  costCategory: AllocationCostCategory;
  reportingCurrency: string;
  netReportingAmount: number;
  postingCount: number;
}

export interface CostPerKmResult {
  vehicleId: string;
  periodStart: Date;
  periodEnd: Date;
  distanceKm: number;
  reportingCurrency: string;
  totalNetCost: number;
  costPerKm: number | null;
  byCategory: AllocationCategoryTotal[];
}