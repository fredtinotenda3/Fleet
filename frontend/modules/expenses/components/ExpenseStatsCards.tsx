
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
  const [period, setPeriod] = useState<StatsPeriod>('month');
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