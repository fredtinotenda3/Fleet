// frontend/modules/fuel/components/FuelStatsCards.tsx

'use client';

import { useMemo, useState } from 'react';
import { Fuel, DollarSign, Gauge, Hash, Banknote, CreditCard } from 'lucide-react';
import { StatisticCard, StatisticCards } from '@/frontend/shared/ui/data-display/StatisticCards';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { Label } from '@/frontend/shared/ui/forms/label';
import { useFuelStats } from '../hooks/useFuel';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { PAYMENT_METHOD_LABELS } from '../types';

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

export function FuelStatsCards() {
  const [period, setPeriod] = useState<StatsPeriod>('all');
  const dateRange = useMemo(() => getRangeForPeriod(period), [period]);
  const { data: stats, isLoading, error } = useFuelStats(dateRange);

  // FIX (crash -- "Cannot read properties of undefined (reading 'find')"):
  // `stats?.paymentBreakdown.find(...)` only guarded against `stats` itself
  // being undefined. If `stats` resolves but `paymentBreakdown` is missing
  // (a stale cached response, a partial response shape, or any envelope
  // that doesn't carry every field the current UI expects), `.find` was
  // called directly on `undefined` and crashed the whole page instead of
  // just rendering zeros. Every access to `paymentBreakdown` below now
  // goes through a single `?? []` fallback so this can never happen again,
  // matching the defensive pattern already used elsewhere in this app
  // (see TripStatsCards.tsx's `data?.byDriver ?? {}`).
  const paymentBreakdown = stats?.paymentBreakdown ?? [];
  const cashRow = paymentBreakdown.find((p) => p.method === 'cash');
  const cardRow = paymentBreakdown.find((p) => p.method === 'fuel_card');
  const otherTotal = paymentBreakdown
    .filter((p) => p.method !== 'cash' && p.method !== 'fuel_card')
    .reduce((sum, p) => sum + p.totalCost, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm text-muted-foreground">
          Fleet fuel totals &middot; {PERIOD_LABELS[period]}
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
        <div className="text-sm text-muted-foreground">Unable to load fuel statistics</div>
      ) : (
        <>
          <StatisticCards>
            <StatisticCard title="Total fuel" value={`${stats.totalFuel.toFixed(1)} L`} icon={<Fuel className="w-4 h-4 text-muted-foreground" />} />
            <StatisticCard title="Total cost" value={formatCurrency(stats.totalCost)} icon={<DollarSign className="w-4 h-4 text-muted-foreground" />} />
            <StatisticCard title="Avg cost / L" value={formatCurrency(stats.averageCostPerUnit)} icon={<Gauge className="w-4 h-4 text-muted-foreground" />} />
            <StatisticCard title="Entries" value={stats.logCount} icon={<Hash className="w-4 h-4 text-muted-foreground" />} />
          </StatisticCards>

          {paymentBreakdown.length > 0 && (
            <div className="flex flex-wrap items-center gap-4 px-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Banknote className="w-3.5 h-3.5" />
                {PAYMENT_METHOD_LABELS.cash}: <span className="font-medium text-foreground">{formatCurrency(cashRow?.totalCost ?? 0)}</span>
                <span className="text-caption">({(cashRow?.totalVolume ?? 0).toFixed(1)} L)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" />
                {PAYMENT_METHOD_LABELS.fuel_card}: <span className="font-medium text-foreground">{formatCurrency(cardRow?.totalCost ?? 0)}</span>
                <span className="text-caption">({(cardRow?.totalVolume ?? 0).toFixed(1)} L)</span>
              </span>
              {otherTotal > 0 && (
                <span>
                  Other: <span className="font-medium text-foreground">{formatCurrency(otherTotal)}</span>
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}