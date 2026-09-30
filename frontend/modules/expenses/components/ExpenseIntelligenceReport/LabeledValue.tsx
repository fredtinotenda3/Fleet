// frontend/modules/expenses/components/ExpenseIntelligenceReport/LabeledValue.tsx
//
// The one place a Labeled<T> value (FACT / CALCULATED / ESTIMATED /
// UNAVAILABLE / DATA_QUALITY_ISSUE -- see ../../types/expenseIntelligence.types.ts)
// gets turned into DOM. Every other component in this report imports
// this instead of reading `.value` directly, so the report can never
// silently render a fabricated number where the backend explicitly
// said one wasn't available.
//
// Byte-for-byte mirror of
// frontend/modules/fuel/components/FuelIntelligenceReport/LabeledValue.tsx,
// duplicated rather than shared across modules for the same reason the
// backend types file documents: this keeps this delivery's blast
// radius at zero on the fuel report's already-shipped code.
//
// Two renderers: LabeledText for inline/table use, LabeledMetric for
// the top-of-page stat cards (thin wrapper over the shared MetricCard,
// which already has an `error`/`errorMessage` state built for exactly
// this "don't show a 0 for a failed measurement" case).

import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { MetricCard, type MetricCardProps } from '@/frontend/shared/ui/patterns';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { Labeled } from '../../types';

export function formatLabeledNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat('en-US', options).format(value);
}

const ISO_4217_RE = /^[A-Z]{3}$/;

/**
 * True only for a real 3-letter ISO 4217 code. ExpensePositionSection.currency
 * (monthly-expense-intelligence.service.ts's buildExpensePosition) is,
 * by design, NOT always a real code: when a fleet has no single
 * reporting currency across its expense transactions, the backend
 * deliberately returns an explanatory sentence rather than guessing/
 * fabricating one. This lets the UI detect that case instead of
 * feeding the sentence straight to Intl.NumberFormat.
 */
export function isValidCurrencyCode(raw: string): boolean {
  return ISO_4217_RE.test(raw.trim().toUpperCase());
}

/**
 * Money formatting that never throws on the backend's non-code
 * currency placeholder. A valid ISO 4217 code formats normally with
 * its symbol; anything else (the explanatory sentence above) falls
 * back to a plain grouped number with no currency symbol -- showing a
 * currency symbol we can't actually confirm would be exactly the kind
 * of fabrication the Labeled<T> pattern elsewhere in this report is
 * built to avoid. Pair with the "Mixed currency" note this report's
 * header shows via isValidCurrencyCode so the missing symbol is
 * explained rather than silently different.
 */
export function formatMoney(
  amount: number,
  rawCurrency: string,
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }
): string {
  const code = rawCurrency.trim().toUpperCase();
  if (ISO_4217_RE.test(code)) {
    return formatCurrency(amount, { ...options, currency: code });
  }
  return formatLabeledNumber(amount, {
    minimumFractionDigits: options?.minimumFractionDigits ?? 2,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2,
  });
}

interface LabeledTextProps<T> {
  labeled: Labeled<T>;
  /** Formats a present value. Defaults to String(value). */
  format?: (value: T) => string;
  className?: string;
}

/**
 * Inline/table rendering. UNAVAILABLE never falls through to
 * "0"/"null"/blank -- it always reads "Unavailable", with the
 * backend's `reason` as a hover title so a reader can see why without
 * cluttering the table.
 */
export function LabeledText<T>({ labeled, format, className }: LabeledTextProps<T>) {
  if (labeled.status === 'UNAVAILABLE' || labeled.value === null) {
    return (
      <span className={`text-muted-foreground italic ${className ?? ''}`} title={labeled.reason}>
        Unavailable
      </span>
    );
  }

  const text = format ? format(labeled.value) : String(labeled.value);

  if (labeled.status === 'ESTIMATED') {
    return (
      <span className={className} title={labeled.reason}>
        {text} <Badge variant="outline" className="align-middle">Estimated</Badge>
      </span>
    );
  }

  if (labeled.status === 'DATA_QUALITY_ISSUE') {
    return (
      <span className={`text-warning ${className ?? ''}`} title={labeled.reason}>
        {text} <Badge variant="outline" className="align-middle border-warning text-warning">Data quality</Badge>
      </span>
    );
  }

  return <span className={className} title={labeled.status === 'CALCULATED' ? labeled.reason : undefined}>{text}</span>;
}

interface LabeledMetricProps<T extends number> extends Omit<MetricCardProps, 'value' | 'error' | 'errorMessage' | 'emptyValue'> {
  labeled: Labeled<T>;
  format?: (value: T) => string;
}

/** Top-of-page stat card rendering of a Labeled<number>. */
export function LabeledMetric<T extends number>({ labeled, format, ...cardProps }: LabeledMetricProps<T>) {
  const isUnavailable = labeled.status === 'UNAVAILABLE' || labeled.value === null;

  return (
    <MetricCard
      {...cardProps}
      value={isUnavailable ? null : format ? format(labeled.value as T) : String(labeled.value)}
      error={isUnavailable}
      errorMessage={labeled.reason ?? 'Unavailable'}
      hint={
        cardProps.hint ??
        (labeled.status === 'ESTIMATED' || labeled.status === 'DATA_QUALITY_ISSUE' ? labeled.reason : undefined)
      }
    />
  );
}
