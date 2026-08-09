// modules/finance/types/depreciation.types.ts
//
// A VehicleDepreciationProfile is the tenant's own accounting policy
// for one asset -- method, acquisition cost, useful life -- so the
// platform's depreciation charge matches the customer's own books
// rather than assuming one universal method. Unlike an allocation
// posting, a profile is POLICY, not evidence of a transaction: it can
// legitimately be corrected in place (a typo'd acquisition cost fixed
// before the first depreciation run), so it is a normal mutable
// tenant-scoped record, not append-only. The CHARGES it produces are
// append-only -- each period's depreciation is posted to the
// allocation ledger (costCategory: 'depreciation') via
// depreciation.service.ts, so a correction to the profile after
// postings exist requires a reversing posting, same as any other
// allocation-ledger correction.

import type { OrgUnitScopedEntity } from '@/server/repositories/tenant-scoped.repository';

export type DepreciationMethod = 'straight-line' | 'declining-balance' | 'units-of-production';

export interface VehicleDepreciationProfile extends OrgUnitScopedEntity {
  orgUnitId?: string;

  vehicleId: string;
  method: DepreciationMethod;

  currency: string;
  acquisitionCost: number;
  acquisitionDate: Date;
  /** Estimated resale/scrap value at the end of the asset's useful life. Never depreciated below this. */
  salvageValue: number;

  /** Required for 'straight-line'. Also the default life used to derive an implied straight-line rate for 'declining-balance' when decliningBalanceRate is omitted. */
  usefulLifeMonths?: number;

  /** Required for 'declining-balance'. Annual rate applied to the opening book value each year, e.g. 0.2 for a 20%-per-year reducing balance. */
  decliningBalanceRate?: number;

  /** Required for 'units-of-production'. The lifetime capacity the asset is expected to deliver, in unitsOfMeasure. */
  unitsLifetimeEstimate?: number;
  unitsOfMeasure?: 'km' | 'engine-hour';

  createdBy: string;
}

export interface VehicleDepreciationProfileInput {
  vehicleId: string;
  method: DepreciationMethod;
  currency: string;
  acquisitionCost: number;
  acquisitionDate: Date | string;
  salvageValue: number;
  usefulLifeMonths?: number;
  decliningBalanceRate?: number;
  unitsLifetimeEstimate?: number;
  unitsOfMeasure?: 'km' | 'engine-hour';
}

/** One computed period's worth of depreciation. Not a persisted type -- see depreciation-calculations.utils.ts. The POSTED charge lives in the allocation ledger. */
export interface DepreciationScheduleEntry {
  periodStart: Date;
  periodEnd: Date;
  openingBookValue: number;
  depreciationCharge: number;
  closingBookValue: number;
}

export interface PostDepreciationInput {
  vehicleId: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  /** Required, and only meaningful, for 'units-of-production': units (km/engine-hours) consumed during this period. */
  unitsConsumedInPeriod?: number;
}