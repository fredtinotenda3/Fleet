// frontend/modules/expenses/components/ExpenseStatsCards.tsx

'use client';

import { useMemo, useState } from 'react';
import { Wallet, TrendingUp, Hash, Tag } from 'lucide-react';
import { StatisticCard, StatisticCards } from '@/frontend/shared/ui/data-display/StatisticCards';
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
  const categoryCount = stats ? Object.keys(stats.byType).length : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm text-muted-foreground">
          Fleet expense totals &middot; {PERIOD_LABELS[period]}
        </Label>
        <Select value={period} onValueChange={(v) => setPeriod(v as StatsPeriod)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
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
        <div className="text-sm text-muted-foreground">Unable to load expense statistics</div>
      ) : (
        <StatisticCards>
          <StatisticCard title="Total expenses" value={formatCurrency(stats.total)} icon={<Wallet className="w-4 h-4 text-muted-foreground" />} />
          <StatisticCard title="Average expense" value={formatCurrency(stats.average)} icon={<TrendingUp className="w-4 h-4 text-muted-foreground" />} />
          <StatisticCard title="Categories used" value={categoryCount} icon={<Hash className="w-4 h-4 text-muted-foreground" />} />
          <StatisticCard
            title="Top category"
            value={topCategory ? topCategory.name : 'N/A'}
            description={topCategory ? formatCurrency(topCategory.amount) : undefined}
            icon={<Tag className="w-4 h-4 text-muted-foreground" />}
          />
        </StatisticCards>
      )}
    </div>
  );
}