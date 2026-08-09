// modules/finance/utils/fx-conversion.utils.ts
//
// Pure helpers for turning a transaction amount into the tenant's
// reporting-currency figure. Deliberately does not call out to any live
// FX rate provider -- there isn't one configured in this codebase, and
// silently inventing a rate would be worse than requiring one. Callers
// either supply fxRate explicitly (source: 'manual', or 'transaction'/
// 'period-average' when the integration that captured the transaction
// already resolved a rate) or the amount is treated as already being in
// the reporting currency (fxRate 1, source: 'organization-default').

import type { FxPolicy } from '../types/finance-settings.types';
import type { FxSource } from '../types/allocation.types';

export interface ResolvedFxContext {
  fxRate: number;
  fxRateDate: Date;
  fxSource: FxSource;
  reportingAmount: number;
}

/**
 * Resolves the fx fields for a posting/transaction.
 *
 * - When the currency already matches the reporting currency, the rate
 *   is always exactly 1 regardless of policy -- there is nothing to
 *   convert, and forcing a "resolved" rate through the policy logic
 *   below would risk a same-currency transaction drifting off its own
 *   amount by a rounding error.
 * - Otherwise, an explicit caller-supplied fxRate always wins.
 * - Otherwise, no rate can be resolved (the codebase has no live FX
 *   feed) and the caller must supply one -- this function returns
 *   `null` rather than guessing 1, since silently treating a foreign-
 *   currency amount as already-converted would misstate every figure
 *   that depends on it.
 */
export function resolveFxContext(params: {
  amount: number;
  currency: string;
  reportingCurrency: string;
  fxPolicy: FxPolicy;
  transactionDate: Date;
  periodEnd: Date;
  suppliedFxRate?: number;
  suppliedFxRateDate?: Date;
  suppliedFxSource?: FxSource;
}): ResolvedFxContext | null {
  const {
    amount,
    currency,
    reportingCurrency,
    fxPolicy,
    transactionDate,
    periodEnd,
    suppliedFxRate,
    suppliedFxRateDate,
    suppliedFxSource,
  } = params;

  if (currency.toUpperCase() === reportingCurrency.toUpperCase()) {
    return {
      fxRate: 1,
      fxRateDate: suppliedFxRateDate ?? transactionDate,
      fxSource: 'organization-default',
      reportingAmount: roundCurrency(amount),
    };
  }

  if (typeof suppliedFxRate === 'number' && Number.isFinite(suppliedFxRate) && suppliedFxRate > 0) {
    const defaultDate = fxPolicy === 'period-average' ? periodEnd : transactionDate;
    return {
      fxRate: suppliedFxRate,
      fxRateDate: suppliedFxRateDate ?? defaultDate,
      fxSource: suppliedFxSource ?? (fxPolicy === 'period-average' ? 'period-average' : 'transaction'),
      reportingAmount: roundCurrency(amount * suppliedFxRate),
    };
  }

  return null;
}

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}