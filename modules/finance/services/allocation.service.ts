// modules/finance/services/allocation.service.ts
//
// Business logic for the allocation ledger: posting a cost, reversing
// one, and deriving cost-per-km from the net result. Controllers stay
// request-parsing-only, per this codebase's convention (see
// attention-resolution.service.ts and anomaly.controller.ts).
//
// ---------------------------------------------------------------------
// THE vehicleId CONTRACT -- read this before adding a caller
// ---------------------------------------------------------------------
// `AllocationPosting.vehicleId` is the vehicle's MongoDB _id as a
// string. It is NOT a license plate.
//
// This needs stating explicitly because the rest of this codebase does
// the opposite: Expense, FuelLog and Trip all reference a vehicle by
// `license_plate` (uppercased), and there is no `vehicle_id` field
// anywhere in those types. So the finance module is the first place
// that joins on the vehicle's identity rather than its plate, and a
// caller who passes a plate into vehicleId gets code that compiles, a
// posting that writes successfully, and a cost-per-km report that
// silently returns nothing. String-versus-string mistakes of exactly
// this shape are what the slug-versus-ObjectId tenancy bug was, and
// tsc cannot see either of them.
//
// _id is the right key for a financial ledger specifically because
// plates are mutable: a vehicle re-registered under a new plate would
// otherwise orphan or silently re-attribute every historical cost
// posted against it. resolveVehicleInScope() below converts once, at
// the boundary, and getCostPerKm() converts back to a plate only where
// it has to join against plate-keyed trip data.

import type {
  AllocationPosting,
  AllocationPostingInput,
  CostPerKmResult,
  AllocationCategoryTotal,
} from '../types/allocation.types';
import { allocationLedgerRepository } from '../repositories/allocation-ledger.repository';
import { financeSettingsService } from './finance-settings.service';
import { resolveFxContext, roundCurrency } from '../utils/fx-conversion.utils';
import { vehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { tripRepository } from '@/modules/trips/repositories/trip.repository';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { NotFoundError, ValidationError, ConflictError } from '@/server/errors/app.errors';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import type { Vehicle } from '@/shared/types/vehicle.types';

function toDate(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`Invalid date: "${String(value)}".`);
  }
  return parsed;
}

export class AllocationService {
  /**
   * Loads a vehicle by _id and confirms it is inside the caller's
   * org-unit scope, returning 404 (never 403) when it is not.
   *
   * This is the security core of the whole module, and it is why
   * orgUnitId is NEVER taken from the request body. Without it, a
   * branch manager could post a cost against another branch's vehicle
   * and stamp their own orgUnitId on the posting -- the posting would
   * then pass every scoped read they perform, so the fabricated cost
   * would land in THEIR branch's cost-per-km while referencing a
   * vehicle they cannot see. That is a write-side scope escalation of
   * the same shape as the procurement approve/reject bug fixed in Phase
   * G, and it corrupts financial reporting rather than merely leaking a
   * read.
   *
   * 404 rather than 403 for the same reason documented in
   * attention-resolution.service.ts: a 403 confirms the record exists.
   */
  private async resolveVehicleInScope(vehicleId: string, context: TenantContext): Promise<Vehicle> {
    const vehicle = await vehicleRepository.findById(vehicleId, context.organizationId);
    if (!vehicle) {
      throw new NotFoundError(`Vehicle "${vehicleId}" not found.`);
    }

    if (
      context.accessibleOrgUnitIds !== null &&
      (!vehicle.orgUnitId || !context.accessibleOrgUnitIds.includes(vehicle.orgUnitId))
    ) {
      throw new NotFoundError(`Vehicle "${vehicleId}" not found.`);
    }

    return vehicle;
  }

  /**
   * Posts one allocation entry.
   *
   * orgUnitId is inherited from the vehicle (matching the 'vehicle'
   * orgUnitSource declared for this module in module-scope.registry.ts,
   * and the same rule fuel/expenses/trips/maintenance already follow),
   * not accepted from the caller.
   */
  async postAllocation(
    context: TenantContext,
    userId: string,
    input: AllocationPostingInput
  ): Promise<AllocationPosting> {
    const vehicle = await this.resolveVehicleInScope(input.vehicleId, context);
    const settings = await financeSettingsService.resolve(context.organizationId);

    const periodStart = toDate(input.periodStart);
    const periodEnd = toDate(input.periodEnd);
    if (periodEnd < periodStart) {
      throw new ValidationError('periodEnd cannot be earlier than periodStart.');
    }

    // A non-'direct' rule without a denominator is not an allocation, it
    // is an unexplained number -- the whole point of storing the rule is
    // that a figure can explain itself on drill-down.
    if (input.allocationRule !== 'direct') {
      if (typeof input.quantity !== 'number' || !Number.isFinite(input.quantity) || input.quantity <= 0) {
        throw new ValidationError(
          `allocationRule "${input.allocationRule}" requires a positive quantity (the denominator the cost was spread over).`
        );
      }
      if (!input.unit) {
        throw new ValidationError(`allocationRule "${input.allocationRule}" requires a unit.`);
      }
    }

    if (input.allocationRule === 'driver-allocated' && !input.driverId) {
      throw new ValidationError('allocationRule "driver-allocated" requires a driverId.');
    }

    const fx = resolveFxContext({
      amount: input.amount,
      currency: input.currency.toUpperCase(),
      reportingCurrency: settings.reportingCurrency,
      fxPolicy: settings.fxPolicy,
      transactionDate: periodStart,
      periodEnd,
      suppliedFxRate: input.fxRate,
      suppliedFxRateDate: input.fxRateDate ? toDate(input.fxRateDate) : undefined,
      suppliedFxSource: input.fxSource,
    });

    if (!fx) {
      // resolveFxContext returns null rather than guessing 1. Surfacing
      // that as a validation error with the exact currencies involved is
      // the difference between a fixable request and a mystery.
      throw new ValidationError(
        `No FX rate available to convert ${input.currency.toUpperCase()} to ${settings.reportingCurrency}. ` +
          'Supply fxRate explicitly on the posting (this deployment has no live FX feed).'
      );
    }

    const posting = await allocationLedgerRepository.append(
      {
        orgUnitId: vehicle.orgUnitId,
        vehicleId: input.vehicleId,
        driverId: input.driverId,
        costCategory: input.costCategory,
        allocationRule: input.allocationRule,
        sourceCollection: input.sourceCollection,
        sourceId: input.sourceId,
        description: input.description,
        periodStart,
        periodEnd,
        quantity: input.quantity,
        unit: input.unit,
        currency: input.currency.toUpperCase(),
        amount: roundCurrency(input.amount),
        fxRate: fx.fxRate,
        fxRateDate: fx.fxRateDate,
        fxSource: fx.fxSource,
        reportingCurrency: settings.reportingCurrency,
        reportingAmount: fx.reportingAmount,
        glAccountCode: input.glAccountCode,
        postedBy: userId,
        postedAt: new Date(),
      },
      context.organizationId,
      userId
    );

    await auditLog.logCreate(
      userId,
      context.organizationId,
      'finance.allocationPosting',
      String(posting._id),
      {
        vehicleId: posting.vehicleId,
        costCategory: posting.costCategory,
        allocationRule: posting.allocationRule,
        amount: posting.amount,
        currency: posting.currency,
        reportingAmount: posting.reportingAmount,
        reportingCurrency: posting.reportingCurrency,
      }
    );

    return posting;
  }

  /**
   * Reverses a posting by appending an equal-and-opposite one. The
   * original is never touched -- that is what makes the ledger evidence
   * rather than a mutable running total.
   *
   * The reversal deliberately copies the ORIGINAL's fxRate and
   * fxRateDate rather than re-resolving today's rate. Re-resolving would
   * leave a residual balance behind after a full reversal whenever the
   * rate had moved, which is a reconciliation defect that only shows up
   * for multi-currency tenants and only after a rate change -- i.e. late,
   * and hard to attribute.
   */
  async reversePosting(
    context: TenantContext,
    userId: string,
    postingId: string,
    reason: string
  ): Promise<{ original: AllocationPosting; reversal: AllocationPosting }> {
    // findById(), NOT findManyInScope({_id: postingId}).
    //
    // BaseRepository.findMany passes the caller's filter straight to
    // Mongo, so an `_id` given as a string is compared against a stored
    // ObjectId and matches nothing -- silently, with no error, returning
    // "not found" for a posting that exists. findById() is the only read
    // path that converts via `new ObjectId(id)`. This is the same
    // types-lie trap recorded against BaseRepository.findMany (declared
    // `_id: string`, actually ObjectId); it compiles cleanly either way,
    // which is precisely why it has to be called out here rather than
    // left to be rediscovered.
    const original = await allocationLedgerRepository.findById(postingId, context.organizationId);
    if (!original) {
      throw new NotFoundError(`Allocation posting "${postingId}" not found.`);
    }

    // findById is tenant-scoped but not org-unit scoped, so apply the
    // same ownership check used for vehicles above. Without it, a
    // branch-scoped accountant could reverse another branch's posting
    // by id -- a write against money outside their scope.
    if (
      context.accessibleOrgUnitIds !== null &&
      (!original.orgUnitId || !context.accessibleOrgUnitIds.includes(original.orgUnitId))
    ) {
      throw new NotFoundError(`Allocation posting "${postingId}" not found.`);
    }

    if (original.reversalOfPostingId) {
      throw new ConflictError(
        'That posting is itself a reversal. Reversing a reversal would net to the original ' +
          'amount without any record of intent -- post a fresh correcting entry instead.'
      );
    }

    const existingReversal = await allocationLedgerRepository.findReversalOf(postingId, context);
    if (existingReversal) {
      throw new ConflictError('That posting has already been reversed.', {
        reversalPostingId: String(existingReversal._id),
        reversedAt: existingReversal.postedAt,
      });
    }

    const reversal = await allocationLedgerRepository.append(
      {
        orgUnitId: original.orgUnitId,
        vehicleId: original.vehicleId,
        driverId: original.driverId,
        costCategory: original.costCategory,
        allocationRule: original.allocationRule,
        sourceCollection: original.sourceCollection,
        sourceId: original.sourceId,
        description: `Reversal of posting ${postingId}`,
        periodStart: original.periodStart,
        periodEnd: original.periodEnd,
        quantity: original.quantity,
        unit: original.unit,
        currency: original.currency,
        amount: roundCurrency(-original.amount),
        fxRate: original.fxRate,
        fxRateDate: original.fxRateDate,
        fxSource: original.fxSource,
        reportingCurrency: original.reportingCurrency,
        reportingAmount: roundCurrency(-original.reportingAmount),
        glAccountCode: original.glAccountCode,
        postedBy: userId,
        postedAt: new Date(),
        reversalOfPostingId: postingId,
        reversalReason: reason,
      },
      context.organizationId,
      userId
    );

    await auditLog.logAction('FINANCE_ALLOCATION_REVERSED', userId, context.organizationId, {
      originalPostingId: postingId,
      reversalPostingId: String(reversal._id),
      reason,
      reportingAmount: reversal.reportingAmount,
    });

    return { original, reversal };
  }

  /** Postings for one vehicle, scoped. Vehicle scope is re-checked so an unknown/out-of-scope id 404s rather than returning an empty list. */
  async listPostingsForVehicle(
    context: TenantContext,
    vehicleId: string,
    filters: { periodStart?: Date; periodEnd?: Date } = {}
  ): Promise<AllocationPosting[]> {
    await this.resolveVehicleInScope(vehicleId, context);
    return allocationLedgerRepository.findByVehicleInScope(vehicleId, context, filters);
  }

  /**
   * Cost per km for one vehicle over a period.
   *
   * Distance comes from TripRepository.getDistanceByVehicle(), which is
   * already org-unit scoped when handed a TenantContext and already
   * tested. Reusing it rather than writing a new aggregation in this
   * module is a deliberate choice: every hand-rolled `collection.
   * aggregate` in this codebase that re-established scoping by hand has
   * eventually been found missing it (the anomaly severity counts, then
   * ReportQueryEngine.run). It returns distances for every vehicle in
   * scope keyed by license_plate and we use one entry, which is a
   * group-by over a bounded collection -- cheap relative to the cost of
   * getting scoping wrong again.
   *
   * costPerKm is null, not 0, when distance is zero. A vehicle that
   * incurred cost while stationary has an undefined cost-per-km, and
   * reporting 0 would understate the fleet average of any roll-up that
   * naively averaged it.
   */
  async getCostPerKm(
    context: TenantContext,
    vehicleId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<CostPerKmResult & { mixedReportingCurrencies?: string[] }> {
    if (periodEnd < periodStart) {
      throw new ValidationError('periodEnd cannot be earlier than periodStart.');
    }

    const vehicle = await this.resolveVehicleInScope(vehicleId, context);
    const settings = await financeSettingsService.resolve(context.organizationId);

    const totals = await allocationLedgerRepository.getNetTotalsByCategory(
      vehicleId,
      periodStart,
      periodEnd,
      context
    );

    // getNetTotalsByCategory groups by (costCategory, reportingCurrency),
    // so a period spanning a reportingCurrency change yields rows in two
    // currencies. Summing those would produce a number with no meaning.
    // Report the conflict instead of hiding it -- see
    // FinanceSettingsService.update's warning on the same subject.
    const currencies = Array.from(new Set(totals.map((t) => t.reportingCurrency)));
    const mixed = currencies.length > 1;

    const byCategory: AllocationCategoryTotal[] = totals.map((t) => ({
      costCategory: t.costCategory,
      reportingCurrency: t.reportingCurrency,
      netReportingAmount: roundCurrency(t.netReportingAmount),
      postingCount: t.postingCount,
    }));

    const totalNetCost = mixed
      ? 0
      : roundCurrency(totals.reduce((sum, t) => sum + t.netReportingAmount, 0));

    const distancesByPlate = await tripRepository.getDistanceByVehicle(
      context.organizationId,
      periodStart,
      periodEnd,
      context
    );
    const distanceKm = distancesByPlate[vehicle.license_plate] ?? 0;

    return {
      vehicleId,
      periodStart,
      periodEnd,
      distanceKm,
      reportingCurrency: currencies[0] ?? settings.reportingCurrency,
      totalNetCost,
      costPerKm: mixed || distanceKm <= 0 ? null : roundCurrency(totalNetCost / distanceKm),
      byCategory,
      ...(mixed ? { mixedReportingCurrencies: currencies } : {}),
    };
  }
}

export const allocationService = new AllocationService();
