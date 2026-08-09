// shared/validations/finance.schema.ts
//
// Request validation for the cost-per-km engine.
//
// SHAPE ONLY. These schemas validate that a request is well-formed --
// types, ranges, required fields. They deliberately do NOT validate the
// conditional rules (a per-km allocation needs a quantity; a
// units-of-production profile needs unitsLifetimeEstimate; a GL figure
// must be in the reporting currency), because each of those depends on
// state the schema cannot see: the allocationRule's interaction with
// other fields, the profile's method, or the tenant's settings. Those
// live in the services, which is the same division attention.schema.ts
// documents for baselineTier. A schema that half-enforces a conditional
// rule is worse than one that does not touch it, because it invites the
// reader to assume the rule is handled.
//
// NOTE on vehicleId: it is the vehicle's MongoDB _id, not a license
// plate. See the contract block at the top of allocation.service.ts --
// passing a plate here compiles, validates, writes, and then silently
// reports no cost.

import { z } from 'zod';

/** ISO-4217-shaped: three letters. Not a closed enum -- tenants operate in currencies this codebase has no list of. */
const currencyCode = z
  .string()
  .trim()
  .length(3, 'Currency must be a 3-letter code (e.g. USD, ZAR, ZWG).')
  .regex(/^[A-Za-z]{3}$/, 'Currency must be three letters.');

/** Accepts an ISO string or a Date; services normalise via toDate(). */
const dateInput = z.union([z.string().min(1), z.date()]);

const objectIdString = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'Must be a 24-character hex id (the vehicle _id, not a license plate).');

export const allocationCostCategoryEnum = z.enum([
  'fuel',
  'maintenance',
  'expense',
  'depreciation',
  'insurance',
  'other',
]);

export const allocationRuleEnum = z.enum([
  'direct',
  'per-km',
  'per-day',
  'per-engine-hour',
  'driver-allocated',
]);

export const allocationUnitEnum = z.enum(['km', 'day', 'engine-hour', 'driver-share']);

export const fxSourceEnum = z.enum(['transaction', 'period-average', 'manual', 'organization-default']);

export const sourceCollectionEnum = z.enum([
  'tblexpenses',
  'tblfuellogs',
  'tblreminders',
  'finance:depreciation',
  'finance:shared-cost',
]);

/**
 * POST /api/finance/allocations
 *
 * `amount` may be negative: a credit note or a supplier refund is a
 * legitimate posting, not an error. It may not be zero -- a zero posting
 * carries no financial information and only makes the ledger longer.
 * Reversals do not come through here at all (see the reverse endpoint),
 * so nothing about this rule blocks a correction.
 */
export const createAllocationSchema = z.object({
  vehicleId: objectIdString,
  driverId: z.string().trim().min(1).max(64).optional(),
  costCategory: allocationCostCategoryEnum,
  allocationRule: allocationRuleEnum,
  sourceCollection: sourceCollectionEnum,
  sourceId: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).optional(),
  periodStart: dateInput,
  periodEnd: dateInput,
  quantity: z.number().finite().positive().optional(),
  unit: allocationUnitEnum.optional(),
  currency: currencyCode,
  amount: z.number().finite().refine((v) => v !== 0, 'amount cannot be zero.'),
  fxRate: z.number().finite().positive().optional(),
  fxRateDate: dateInput.optional(),
  fxSource: fxSourceEnum.optional(),
  glAccountCode: z.string().trim().min(1).max(50).optional(),
});
export type CreateAllocationInput = z.infer<typeof createAllocationSchema>;

/**
 * POST /api/finance/allocations/:id/reverse
 *
 * `reason` is required and has a floor of 10 characters. A reversal
 * without a stated reason is an unexplained change to a financial
 * figure, which is exactly what the append-only design exists to
 * prevent; "fix" or "err" satisfies a min(1) and tells a future auditor
 * nothing.
 */
export const reverseAllocationSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'Give a reason of at least 10 characters -- it is the audit record for this reversal.')
    .max(1000),
});
export type ReverseAllocationInput = z.infer<typeof reverseAllocationSchema>;

export const depreciationMethodEnum = z.enum(['straight-line', 'declining-balance', 'units-of-production']);

export const upsertDepreciationProfileSchema = z.object({
  vehicleId: objectIdString,
  method: depreciationMethodEnum,
  currency: currencyCode,
  acquisitionCost: z.number().finite().positive(),
  acquisitionDate: dateInput,
  salvageValue: z.number().finite().nonnegative(),
  usefulLifeMonths: z.number().int().positive().max(1200).optional(),
  /** A fraction, not a percentage: 0.2 means 20%/year. >= 1 would write off the whole book value in year one. */
  decliningBalanceRate: z.number().finite().positive().lt(1).optional(),
  unitsLifetimeEstimate: z.number().finite().positive().optional(),
  unitsOfMeasure: z.enum(['km', 'engine-hour']).optional(),
});
export type UpsertDepreciationProfileInput = z.infer<typeof upsertDepreciationProfileSchema>;

export const postDepreciationSchema = z.object({
  vehicleId: objectIdString,
  periodStart: dateInput,
  periodEnd: dateInput,
  unitsConsumedInPeriod: z.number().finite().nonnegative().optional(),
});
export type PostDepreciationRequestInput = z.infer<typeof postDepreciationSchema>;

/** `glAmount` may be negative (a contra account) and may be zero -- "we closed this account at nil" is a real, meaningful submission, unlike a zero cost posting. */
export const createGLSubmissionSchema = z.object({
  periodStart: dateInput,
  periodEnd: dateInput,
  glAccountCode: z.string().trim().min(1).max(50),
  glAmount: z.number().finite(),
  currency: currencyCode,
  notes: z.string().trim().max(2000).optional(),
});
export type CreateGLSubmissionInput = z.infer<typeof createGLSubmissionSchema>;

export const updateFinanceSettingsSchema = z.object({
  reportingCurrency: currencyCode.optional(),
  fxPolicy: z.enum(['transaction-date', 'period-average']),
  glToleranceAmount: z.number().finite().nonnegative().optional(),
  depreciationDefaults: z
    .object({
      method: depreciationMethodEnum,
      usefulLifeMonths: z.number().int().positive().max(1200).optional(),
      salvageValuePercent: z.number().finite().min(0).max(100).optional(),
      decliningBalanceRate: z.number().finite().positive().lt(1).optional(),
    })
    .optional(),
});
export type UpdateFinanceSettingsInput = z.infer<typeof updateFinanceSettingsSchema>;
