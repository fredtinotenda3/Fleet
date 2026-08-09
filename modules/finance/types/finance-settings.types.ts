// modules/finance/types/finance-settings.types.ts
//
// Per-tenant finance configuration: reporting currency, FX policy, and
// default depreciation assumptions. Organization-level, not org-unit --
// a branch cannot report its TCO in a different currency or under a
// different depreciation policy than the rest of the organization, or
// the roll-up to a consolidated GL reconciliation stops meaning
// anything.
//
// Augments Organization (module augmentation, additive -- see
// modules/telematics/types/telematics.tenancy-addendum.ts for the same
// technique applied to org-unit scoping) rather than editing
// organization.types.ts directly, so every existing importer of
// Organization keeps compiling unchanged.

import '@/shared/types/organization.types';
import type { DepreciationMethod } from './depreciation.types';

/**
 * transaction-date    -- each posting converts at the FX rate on its
 *                         own transaction date (most accurate, most
 *                         volatile period-to-period).
 * period-average       -- each posting in a reporting period converts
 *                         at that period's average rate (smoother,
 *                         matches how many customers' own GL close
 *                         process works).
 */
export type FxPolicy = 'transaction-date' | 'period-average';

export interface OrganizationDepreciationDefaults {
  method: DepreciationMethod;
  usefulLifeMonths?: number;
  /** Salvage value as a percentage (0-100) of acquisition cost, used when a vehicle's own profile doesn't override it. */
  salvageValuePercent?: number;
  decliningBalanceRate?: number;
}

export interface OrganizationFinanceSettings {
  /** Defaults to OrganizationSettings.currency when unset. Kept separate because "the currency drivers log fuel in" and "the currency TCO is reported in" are different questions for a multi-country tenant. */
  reportingCurrency?: string;
  fxPolicy: FxPolicy;
  /** Absolute reporting-currency amount within which a GL reconciliation line is considered matched. Defaults to 0 (exact match required) when unset. */
  glToleranceAmount?: number;
  depreciationDefaults?: OrganizationDepreciationDefaults;
}

declare module '@/shared/types/organization.types' {
  interface Organization {
    financeSettings?: OrganizationFinanceSettings;
  }
}