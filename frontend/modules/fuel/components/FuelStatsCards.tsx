// frontend/modules/fuel/components/FuelStatsCards.tsx

'use client';

import { Fuel, DollarSign, Gauge, Hash } from 'lucide-react';
import { StatisticCard, StatisticCards } from '@/frontend/shared/ui/data-display/StatisticCards';
import { useFuelStats } from '../hooks/useFuel';
import { formatCurrency } from '@/shared/utils/currency.utils';

export function FuelStatsCards() {
  const { data: stats, isLoading, error } = useFuelStats();

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl skeleton" />)}
      </div>
    );
  }

  if (error || !stats) {
    return <div className="text-sm text-muted-foreground">Unable to load fuel statistics</div>;
  }

  return (
    <StatisticCards>
      <StatisticCard title="Total fuel" value={`${stats.totalFuel.toFixed(1)} L`} icon={<Fuel className="w-4 h-4 text-muted-foreground" />} />
      <StatisticCard title="Total cost" value={formatCurrency(stats.totalCost)} icon={<DollarSign className="w-4 h-4 text-muted-foreground" />} />
      <StatisticCard title="Avg cost / L" value={formatCurrency(stats.averageCostPerUnit)} icon={<Gauge className="w-4 h-4 text-muted-foreground" />} />
      <StatisticCard title="Entries" value={stats.logCount} icon={<Hash className="w-4 h-4 text-muted-foreground" />} />
    </StatisticCards>
  );
}