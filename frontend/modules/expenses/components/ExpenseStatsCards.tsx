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

const CHART_COLOR_COUNT = 6;

function categoryColorIndex(label: string): number {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  return (hash % CHART_COLOR_COUNT) + 1;
}

interface ExpenseStatsCardsProps {
  /** Vehicle-Level Analytics: scope every stat to a single vehicle instead of the fleet. */
  licensePlate?: string;
}

export function ExpenseStatsCards({ licensePlate }: ExpenseStatsCardsProps = {}) {
  const [period, setPeriod] = useState<StatsPeriod>('all');
  const dateRange = useMemo(() => getRangeForPeriod(period), [period]);
  const { data: stats, isLoading, error } = useExpenseStats(dateRange, licensePlate);

  const topCategory = stats?.topCategories?.[0];
  const categoryCount = stats?.byType ? Object.keys(stats.byType).length : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm text-muted-foreground">
          {licensePlate ? `${licensePlate} expense totals` : 'Fleet expense totals'} &middot; {PERIOD_LABELS[period]}
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