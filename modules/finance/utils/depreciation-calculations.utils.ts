// modules/finance/utils/depreciation-calculations.utils.ts
//
// Pure depreciation math, method-agnostic at the call site (see
// depreciation.service.ts): given a profile, the depreciation already
// recognised before this period, and the period boundaries, returns
// the charge for exactly this period. Every method is capped so the
// asset never depreciates below its salvage value, regardless of how
// many periods have been posted or how the period lengths were sliced.

import type { VehicleDepreciationProfile } from '../types/depreciation.types';
import { roundCurrency } from './fx-conversion.utils';

const AVG_DAYS_PER_MONTH = 30.4375;
const DAYS_PER_YEAR = 365.25;

function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, ms / (1000 * 60 * 60 * 24));
}

export interface DepreciationChargeResult {
  openingBookValue: number;
  depreciationCharge: number;
  closingBookValue: number;
}

/**
 * @param accumulatedDepreciationBeforePeriod Sum of every depreciation
 *   posting already made for this vehicle before periodStart (net of
 *   any reversals -- the caller sums the allocation ledger, not this
 *   function's job). Zero for the asset's first period.
 */
export function computeDepreciationCharge(params: {
  profile: VehicleDepreciationProfile;
  periodStart: Date;
  periodEnd: Date;
  accumulatedDepreciationBeforePeriod: number;
  unitsConsumedInPeriod?: number;
}): DepreciationChargeResult {
  const { profile, periodStart, periodEnd, accumulatedDepreciationBeforePeriod, unitsConsumedInPeriod } = params;

  const depreciableBase = Math.max(0, profile.acquisitionCost - profile.salvageValue);
  const openingBookValue = roundCurrency(
    Math.max(profile.salvageValue, profile.acquisitionCost - accumulatedDepreciationBeforePeriod)
  );
  const remainingDepreciable = Math.max(0, openingBookValue - profile.salvageValue);

  // Nothing to charge before the asset was acquired, or once it's fully depreciated.
  if (periodEnd <= profile.acquisitionDate || remainingDepreciable <= 0) {
    return { openingBookValue, depreciationCharge: 0, closingBookValue: openingBookValue };
  }

  const effectivePeriodStart = periodStart < profile.acquisitionDate ? profile.acquisitionDate : periodStart;
  const periodDays = daysBetween(effectivePeriodStart, periodEnd);

  let rawCharge: number;

  switch (profile.method) {
    case 'straight-line': {
      const usefulLifeMonths = profile.usefulLifeMonths ?? 0;
      if (usefulLifeMonths <= 0) {
        rawCharge = 0;
        break;
      }
      const monthlyCharge = depreciableBase / usefulLifeMonths;
      const periodMonths = periodDays / AVG_DAYS_PER_MONTH;
      rawCharge = monthlyCharge * periodMonths;
      break;
    }
    case 'declining-balance': {
      // Falls back to the straight-line-implied rate (1 / useful life)
      // when no explicit rate is configured, so a profile only needs
      // ONE of decliningBalanceRate/usefulLifeMonths set to compute.
      const annualRate =
        profile.decliningBalanceRate ??
        (profile.usefulLifeMonths ? 12 / profile.usefulLifeMonths : 0);
      const periodYears = periodDays / DAYS_PER_YEAR;
      rawCharge = openingBookValue * annualRate * periodYears;
      break;
    }
    case 'units-of-production': {
      const lifetimeUnits = profile.unitsLifetimeEstimate ?? 0;
      const units = unitsConsumedInPeriod ?? 0;
      if (lifetimeUnits <= 0 || units <= 0) {
        rawCharge = 0;
        break;
      }
      const ratePerUnit = depreciableBase / lifetimeUnits;
      rawCharge = ratePerUnit * units;
      break;
    }
    default:
      rawCharge = 0;
  }

  const depreciationCharge = roundCurrency(Math.min(Math.max(0, rawCharge), remainingDepreciable));
  const closingBookValue = roundCurrency(openingBookValue - depreciationCharge);

  return { openingBookValue, depreciationCharge, closingBookValue };
}