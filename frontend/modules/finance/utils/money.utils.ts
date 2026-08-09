// frontend/modules/finance/utils/money.utils.ts
//
// Every finance figure is denominated in whatever reportingCurrency the
// backend returned, and some responses can legitimately carry none (a
// period with no postings has no currency to report). Passing that
// straight to formatCurrency CRASHES:
//
//   formatCurrency(0, { currency: undefined })
//
// ...because shared/utils/currency.utils.ts builds its config as
// `{ ...CURRENCY_CONFIG, ...options }`, and spreading an explicit
// `currency: undefined` OVERRIDES the 'USD' default with undefined.
// Intl.NumberFormat then throws "Currency code is required with currency
// style" — an uncaught render error that blanks the whole widget, not a
// mis-formatted number.
//
// This wrapper omits the key entirely when there is no currency, so
// formatCurrency falls back to its own default instead. Kept local to the
// finance module rather than changing currency.utils.ts, because that
// helper is shared with paths outside this pass's scope and its current
// behaviour may be relied on elsewhere.

import { formatCurrency } from '@/shared/utils/currency.utils';

export function formatMoney(
  amount: number,
  currency?: string | null,
  options: { maximumFractionDigits?: number } = {}
): string {
  const trimmed = typeof currency === 'string' ? currency.trim() : '';
  return formatCurrency(amount, {
    ...(trimmed ? { currency: trimmed } : {}),
    ...(options.maximumFractionDigits != null
      ? { maximumFractionDigits: options.maximumFractionDigits }
      : {}),
  });
}