// frontend/modules/expenses/components/ExpenseStatsCards.tsx

'use client';

import { useMemo, useState } from 'react';
import { Wallet, TrendingUp, Hash, Tag, CalendarRange, AlertCircle } from 'lucide-react';
import { StatisticCard, StatisticCards } from '@/frontend/shared/ui/data-display/StatisticCards';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { Label } from '@/frontend/shared/ui/forms/label';
import { useExpenseStats } from '../hooks/useExpenses';
import { formatCurrency } from '@/shared/utils/currency.utils';

type StatsPeriod = 'all' | 'month' | '30d' | 'year';

const PERIOD_LABELS: Record<StatsPeriod, string> = {
  all: 'All time',
  month: 'This month',
  '30d': 'Last 30 days',
  year: 'This year',
};

function getRangeForPeriod(period: StatsPeriod): { startDate?: Date; endDate?: Date } | undefined {
  if (period === 'all') return undefined;
  const end = new Date();
  let start = new Date();
  if (period === 'month') start = new Date(end.getFullYear(), end.getMonth(), 1);
  if (period === '30d') start.setDate(end.getDate() - 30);
  if (period === 'year') start = new Date(end.getFullYear(), 0, 1);
  return { startDate: start, endDate: end };
}

/**
 * Small colored icon badge, replacing the previous plain muted-foreground
 * icon. Each stat gets a distinct semantic accent (spend = primary,
 * average = success, category count = info, top category = accent) so
 * the four cards are scannable at a glance rather than four identical
 * gray icons.
 */
function StatIcon({
  icon: Icon,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: 'primary' | 'success' | 'info' | 'accent';
}) {
  const toneVar =
    tone === 'primary' ? 'var(--primary)' :
    tone === 'success' ? 'var(--success)' :
    tone === 'info' ? 'var(--info)' :
    'var(--accent)';

  return (
    <span
      className="flex items-center justify-center rounded-lg h-7 w-7 shrink-0"
      style={{ backgroundColor: `color-mix(in oklab, ${toneVar} 14%, transparent)`, color: toneVar }}
    >
      <Icon className="w-3.5 h-3.5" />
    </span>
  );
}

/**
 * Same deterministic hash used by ExpensesTable's CategoryBadge, so the
 * "Top category" figure here always matches the color that category
 * shows as in the table below -- one category, one color, everywhere.
 */
const CHART_COLOR_COUNT = 6;

function categoryColorIndex(label: string): number {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  return (hash % CHART_COLOR_COUNT) + 1;
}

export function ExpenseStatsCards() {
  /**
   * FIX: this previously defaulted to 'month', which silently scoped the
   * dashboard's KPI cards ("Total expenses", "Average expense",
   * "Categories used", "Top category") to the current calendar month on
   * every page load -- while the cards themselves read as if they were
   * showing all-time figures, and the paired KPIsWidget on the main
   * dashboard explicitly labels the same number "All recorded expenses".
   * That mismatch (a few current-month rows vs. the full 101-record
   * history going back to April) is exactly what produced the
   * dashboard-vs-list-page total discrepancy. Defaulting to 'all' makes
   * getRangeForPeriod() return `undefined`, which (paired with the fixed
   * useExpenseStats hook) sends no date filter at all and matches the
   * backend's own all-time aggregation. The selector still lets the
   * person narrow to This month / Last 30 days / This year on demand.
   */
  const [period, setPeriod] = useState<StatsPeriod>('all');
  const dateRange = useMemo(() => getRangeForPeriod(period), [period]);
  const { data: stats, isLoading, error } = useExpenseStats(dateRange);

  const topCategory = stats?.topCategories?.[0];

  // FIX (crash -- "Cannot convert undefined or null to object"):
  // `stats ? Object.keys(stats.byType).length : 0` only guarded against
  // `stats` itself being undefined -- it did not check whether `byType`
  // was present ON `stats`. If the response resolved but `byType` was
  // missing (stale cached response, partial envelope, or any shape drift
  // between deploys), `Object.keys(undefined)` threw and took down the
  // whole page. Guarding `stats?.byType` directly (not just `stats`)
  // makes this impossible regardless of what the rest of the object
  // looks like.
  const categoryCount = stats?.byType ? Object.keys(stats.byType).length : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm text-muted-foreground">
          Fleet expense totals &middot; {PERIOD_LABELS[period]}
        </Label>
        <Select value={period} onValueChange={(v) => setPeriod(v as StatsPeriod)}>
          <SelectTrigger className="w-40">
            <CalendarRange className="w-3.5 h-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PERIOD_LABELS) as StatsPeriod[]).map((p) => (
              <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl skeleton" />)}
        </div>
      ) : error || !stats ? (
        <div className="flex items-center gap-2 p-4 text-sm surface-card text-muted-foreground">
          <AlertCircle className="w-4 h-4 shrink-0 text-danger" />
          Unable to load expense statistics
        </div>
      ) : (
        <StatisticCards>
          <StatisticCard
            title="Total expenses"
            value={formatCurrency(stats.total)}
            icon={<StatIcon icon={Wallet} tone="primary" />}
          />
          <StatisticCard
            title="Average expense"
            value={formatCurrency(stats.average)}
            icon={<StatIcon icon={TrendingUp} tone="success" />}
          />
          <StatisticCard
            title="Categories used"
            value={categoryCount}
            icon={<StatIcon icon={Hash} tone="info" />}
          />
          <StatisticCard
            title="Top category"
            value={
              topCategory ? (
                <Badge
                  variant="outline"
                  className="text-base font-semibold border-transparent"
                  style={{
                    backgroundColor: `color-mix(in oklab, var(--chart-${categoryColorIndex(topCategory.name)}) 14%, transparent)`,
                    color: `var(--chart-${categoryColorIndex(topCategory.name)})`,
                  }}
                >
                  {topCategory.name}
                </Badge>
              ) : (
                'N/A'
              )
            }
            description={topCategory ? formatCurrency(topCategory.amount) : undefined}
            icon={<StatIcon icon={Tag} tone="accent" />}
          />
        </StatisticCards>
      )}
    </div>
  );
}