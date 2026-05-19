// shared/utils/currency.utils.ts

export const CURRENCY_CONFIG = {
  locale: 'en-US',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
} as const;

export function formatCurrency(
  amount: number,
  options: Partial<typeof CURRENCY_CONFIG> = {}
): string {
  const config = { ...CURRENCY_CONFIG, ...options };
  return new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency: config.currency,
    minimumFractionDigits: config.minimumFractionDigits,
    maximumFractionDigits: config.maximumFractionDigits,
  }).format(amount);
}

export function formatCurrencyCompact(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(1)}K`;
  }
  return formatCurrency(amount);
}

export function calculateAverageCost(totalCost: number, totalUnits: number): number {
  if (totalUnits === 0) return 0;
  return totalCost / totalUnits;
}

export function getTrendIcon(change: number): string {
  if (change > 0) return '▲';
  if (change < 0) return '▼';
  return '●';
}

export function getTrendColor(change: number): string {
  if (change > 0) return 'text-red-600';
  if (change < 0) return 'text-green-600';
  return 'text-gray-500';
}