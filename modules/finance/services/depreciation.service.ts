// modules/finance/services/depreciation.service.ts
//
// Owns the depreciation POLICY (per-vehicle profiles) and turns it into
// depreciation CHARGES posted to the allocation ledger. The split
// matters: the profile is mutable configuration, the charge is immutable
// evidence. See depreciation-profile.repository.ts's header for why the
// build brief's "append-only profile" instruction was not followed.

import type {
  VehicleDepreciationProfile,
  VehicleDepreciationProfileInput,
  PostDepreciationInput,
} from '../types/depreciation.types';
import type { AllocationPosting } from '../types/allocation.types';
import { depreciationProfileRepository } from '../repositories/depreciation-profile.repository';
import { allocationLedgerRepository } from '../repositories/allocation-ledger.repository';
import {
  computeDepreciationCharge,
  type DepreciationChargeResult,
} from '../utils/depreciation-calculations.utils';
import { financeSettingsService } from './finance-settings.service';
import { resolveFxContext, roundCurrency } from '../utils/fx-conversion.utils';
import { vehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { NotFoundError, ValidationError, ConflictError } from '@/server/errors/app.errors';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import type { Vehicle } from '@/shared/types/vehicle.types';

/** Changing any of these after charges exist would restate history. Locked by upsertProfile. */
const MATERIAL_PROFILE_FIELDS = [
  'method',
  'currency',
  'acquisitionCost',
  'acquisitionDate',
  'salvageValue',
] as const;

/** A far-past lower bound for "every depreciation posting before this period". Cheaper and clearer than an unbounded query. */
const LEDGER_EPOCH = new Date('1970-01-01T00:00:00.000Z');

function toDate(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`Invalid date: "${String(value)}".`);
  }
  return parsed;
}

export class DepreciationService {
  /** Same scope rule and same 404-not-403 reasoning as AllocationService.resolveVehicleInScope. */
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
   * Validates that a profile has the fields its own method needs.
   * Done here rather than in zod because the requirement is conditional
   * on `method`, and expressing that as a discriminated union in the
   * schema would fork the input type in a way the persisted type does
   * not -- the same reasoning attention.schema.ts documents for
   * baselineTier.
   */
  private assertMethodComplete(input: VehicleDepreciationProfileInput): void {
    if (input.salvageValue > input.acquisitionCost) {
      throw new ValidationError('salvageValue cannot exceed acquisitionCost.');
    }

    switch (input.method) {
      case 'straight-line':
        if (!input.usefulLifeMonths || input.usefulLifeMonths <= 0) {
          throw new ValidationError('method "straight-line" requires a positive usefulLifeMonths.');
        }
        break;
      case 'declining-balance':
        // computeDepreciationCharge falls back to the straight-line-implied
        // rate (12 / usefulLifeMonths) when decliningBalanceRate is absent,
        // so EITHER field is sufficient -- but not neither, which would
        // silently charge zero forever.
        if (
          (!input.decliningBalanceRate || input.decliningBalanceRate <= 0) &&
          (!input.usefulLifeMonths || input.usefulLifeMonths <= 0)
        ) {
          throw new ValidationError(
            'method "declining-balance" requires decliningBalanceRate or usefulLifeMonths.'
          );
        }
        break;
      case 'units-of-production':
        if (!input.unitsLifetimeEstimate || input.unitsLifetimeEstimate <= 0) {
          throw new ValidationError(
            'method "units-of-production" requires a positive unitsLifetimeEstimate.'
          );
        }
        if (!input.unitsOfMeasure) {
          throw new ValidationError('method "units-of-production" requires unitsOfMeasure.');
        }
        break;
      default:
        throw new ValidationError(`Unknown depreciation method "${String(input.method)}".`);
    }
  }

  /** Net depreciation already charged for a vehicle strictly before `before`. Reversals net out automatically. */
  private async accumulatedDepreciationBefore(
    vehicleId: string,
    before: Date,
    context: TenantContext
  ): Promise<number> {
    const totals = await allocationLedgerRepository.getNetTotalsByCategory(
      vehicleId,
      LEDGER_EPOCH,
      before,
      context
    );
    return totals
      .filter((t) => t.costCategory === 'depreciation')
      .reduce((sum, t) => sum + t.netReportingAmount, 0);
  }

  async getProfile(
    context: TenantContext,
    vehicleId: string
  ): Promise<VehicleDepreciationProfile | null> {
    await this.resolveVehicleInScope(vehicleId, context);
    return depreciationProfileRepository.findByVehicleInScope(vehicleId, context);
  }

  async listProfiles(context: TenantContext): Promise<VehicleDepreciationProfile[]> {
    return depreciationProfileRepository.findAllInScope(context);
  }

  /**
   * Creates or updates the depreciation profile for a vehicle.
   *
   * Once ANY depreciation charge has been posted for the vehicle, the
   * financially material fields are frozen. Editing acquisitionCost
   * after charges exist would change every future charge's arithmetic
   * while leaving the already-posted ones computed on the old basis --
   * the book value would then never reconcile against the sum of
   * postings, and nothing would flag it. The correction path is to
   * reverse the affected postings first, which is visible and audited.
   */
  async upsertProfile(
    context: TenantContext,
    userId: string,
    input: VehicleDepreciationProfileInput
  ): Promise<VehicleDepreciationProfile> {
    const vehicle = await this.resolveVehicleInScope(input.vehicleId, context);
    this.assertMethodComplete(input);

    const acquisitionDate = toDate(input.acquisitionDate);
    const existing = await depreciationProfileRepository.findByVehicleInScope(input.vehicleId, context);

    const normalized = {
      vehicleId: input.vehicleId,
      method: input.method,
      currency: input.currency.toUpperCase(),
      acquisitionCost: roundCurrency(input.acquisitionCost),
      acquisitionDate,
      salvageValue: roundCurrency(input.salvageValue),
      usefulLifeMonths: input.usefulLifeMonths,
      decliningBalanceRate: input.decliningBalanceRate,
      unitsLifetimeEstimate: input.unitsLifetimeEstimate,
      unitsOfMeasure: input.unitsOfMeasure,
    };

    if (!existing) {
      const created = await depreciationProfileRepository.create(
        { ...normalized, orgUnitId: vehicle.orgUnitId, createdBy: userId },
        context.organizationId,
        userId
      );
      await auditLog.logCreate(
        userId,
        context.organizationId,
        'finance.depreciationProfile',
        String(created._id),
        normalized
      );
      return created;
    }

    const charged = await this.accumulatedDepreciationBefore(
      input.vehicleId,
      new Date(8640000000000000),
      context
    );

    if (charged !== 0) {
      const changedMaterial = MATERIAL_PROFILE_FIELDS.filter((field) => {
        const before = existing[field];
        const after = normalized[field];
        if (before instanceof Date || after instanceof Date) {
          return new Date(before as Date).getTime() !== new Date(after as Date).getTime();
        }
        return before !== after;
      });

      if (changedMaterial.length > 0) {
        throw new ConflictError(
          `Cannot change ${changedMaterial.join(', ')} on this profile: ` +
            `${roundCurrency(charged)} of depreciation has already been posted for this vehicle. ` +
            'Reverse the affected depreciation postings first, then update the profile.',
          { changedFields: changedMaterial, postedDepreciation: roundCurrency(charged) }
        );
      }
    }

    const updated = await depreciationProfileRepository.update(
      String(existing._id),
      normalized as never,
      context.organizationId,
      userId
    );
    if (!updated) {
      throw new NotFoundError('Depreciation profile not found.');
    }

    await auditLog.logUpdate(
      userId,
      context.organizationId,
      'finance.depreciationProfile',
      String(existing._id),
      existing,
      updated
    );
    return updated;
  }

  /** Computes a period's charge without writing anything. Lets a caller see the number before committing it. */
  async previewCharge(
    context: TenantContext,
    input: PostDepreciationInput
  ): Promise<DepreciationChargeResult & { profile: VehicleDepreciationProfile }> {
    const { profile, periodStart, periodEnd, accumulated } = await this.loadChargeInputs(context, input);
    const result = computeDepreciationCharge({
      profile,
      periodStart,
      periodEnd,
      accumulatedDepreciationBeforePeriod: accumulated,
      unitsConsumedInPeriod: input.unitsConsumedInPeriod,
    });
    return { ...result, profile };
  }

  private async loadChargeInputs(context: TenantContext, input: PostDepreciationInput) {
    await this.resolveVehicleInScope(input.vehicleId, context);

    const profile = await depreciationProfileRepository.findByVehicleInScope(input.vehicleId, context);
    if (!profile) {
      throw new NotFoundError(
        `No depreciation profile exists for vehicle "${input.vehicleId}". Create one before posting depreciation.`
      );
    }

    const periodStart = toDate(input.periodStart);
    const periodEnd = toDate(input.periodEnd);
    if (periodEnd < periodStart) {
      throw new ValidationError('periodEnd cannot be earlier than periodStart.');
    }

    if (profile.method === 'units-of-production') {
      if (
        typeof input.unitsConsumedInPeriod !== 'number' ||
        !Number.isFinite(input.unitsConsumedInPeriod) ||
        input.unitsConsumedInPeriod < 0
      ) {
        throw new ValidationError(
          'unitsConsumedInPeriod is required (and must be >= 0) for a units-of-production profile.'
        );
      }
    }

    const accumulated = await this.accumulatedDepreciationBefore(input.vehicleId, periodStart, context);
    return { profile, periodStart, periodEnd, accumulated };
  }

  /**
   * Posts one period's depreciation charge to the allocation ledger.
   *
   * IDEMPOTENCY. A depreciation run is the kind of thing that gets
   * triggered by a nightly job, retried after a timeout, and then also
   * clicked by an accountant. Double-charging is silent -- the book
   * value simply drops twice as fast and nobody notices for months. So
   * the sourceId is a deterministic key
   * (`depreciation:<vehicleId>:<periodStart>:<periodEnd>`) and this
   * method refuses to post if a non-reversed posting already carries it.
   *
   * A charge of zero is NOT posted. Writing a stream of zero-value rows
   * for a fully depreciated asset adds no evidence and makes the ledger
   * harder to read; the returned `posted: false` says so explicitly
   * rather than pretending work happened.
   */
  async postDepreciation(
    context: TenantContext,
    userId: string,
    input: PostDepreciationInput
  ): Promise<{
    posted: boolean;
    reason?: string;
    charge: DepreciationChargeResult;
    posting: AllocationPosting | null;
  }> {
    const { profile, periodStart, periodEnd, accumulated } = await this.loadChargeInputs(context, input);

    const charge = computeDepreciationCharge({
      profile,
      periodStart,
      periodEnd,
      accumulatedDepreciationBeforePeriod: accumulated,
      unitsConsumedInPeriod: input.unitsConsumedInPeriod,
    });

    const sourceId = `depreciation:${input.vehicleId}:${periodStart.toISOString()}:${periodEnd.toISOString()}`;

    const existingForPeriod = await allocationLedgerRepository.findByVehicleInScope(
      input.vehicleId,
      context,
      { costCategory: 'depreciation' }
    );
    const alreadyPosted = existingForPeriod.filter(
      (p) => p.sourceId === sourceId && !p.reversalOfPostingId
    );
    if (alreadyPosted.length > 0) {
      const reversedIds = new Set<string>();
      for (const candidate of existingForPeriod) {
        if (candidate.reversalOfPostingId) reversedIds.add(candidate.reversalOfPostingId);
      }
      const stillLive = alreadyPosted.filter((p) => !reversedIds.has(String(p._id)));
      if (stillLive.length > 0) {
        throw new ConflictError(
          'Depreciation has already been posted for this vehicle and period. ' +
            'Reverse the existing posting first if it needs to be restated.',
          { existingPostingId: String(stillLive[0]._id), sourceId }
        );
      }
    }

    if (charge.depreciationCharge <= 0) {
      return {
        posted: false,
        reason:
          charge.openingBookValue <= profile.salvageValue
            ? 'Asset is already fully depreciated to its salvage value.'
            : 'Computed charge for this period is zero.',
        charge,
        posting: null,
      };
    }

    const settings = await financeSettingsService.resolve(context.organizationId);
    const fx = resolveFxContext({
      amount: charge.depreciationCharge,
      currency: profile.currency.toUpperCase(),
      reportingCurrency: settings.reportingCurrency,
      fxPolicy: settings.fxPolicy,
      transactionDate: periodEnd,
      periodEnd,
    });
    if (!fx) {
      throw new ValidationError(
        `No FX rate available to convert ${profile.currency.toUpperCase()} to ${settings.reportingCurrency}. ` +
          'Depreciation is computed from the profile currency; either set the profile currency to the ' +
          'reporting currency or post this charge manually with an explicit fxRate.'
      );
    }

    const posting = await allocationLedgerRepository.append(
      {
        orgUnitId: profile.orgUnitId,
        vehicleId: input.vehicleId,
        costCategory: 'depreciation',
        allocationRule: 'direct',
        sourceCollection: 'finance:depreciation',
        sourceId,
        description: `${profile.method} depreciation`,
        periodStart,
        periodEnd,
        currency: profile.currency.toUpperCase(),
        amount: charge.depreciationCharge,
        fxRate: fx.fxRate,
        fxRateDate: fx.fxRateDate,
        fxSource: fx.fxSource,
        reportingCurrency: settings.reportingCurrency,
        reportingAmount: fx.reportingAmount,
        postedBy: userId,
        postedAt: new Date(),
      },
      context.organizationId,
      userId
    );

    await auditLog.logCreate(
      userId,
      context.organizationId,
      'finance.depreciationCharge',
      String(posting._id),
      {
        vehicleId: input.vehicleId,
        method: profile.method,
        periodStart,
        periodEnd,
        openingBookValue: charge.openingBookValue,
        depreciationCharge: charge.depreciationCharge,
        closingBookValue: charge.closingBookValue,
      }
    );

    return { posted: true, charge, posting };
  }
}

export const depreciationService = new DepreciationService();
