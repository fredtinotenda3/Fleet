// frontend/modules/fuel/components/FuelKpiCards.tsx

'use client';

import { TrendingUp, TrendingDown, AlertTriangle, Calendar } from 'lucide-react';
import { StatisticCard, StatisticCards } from '@/frontend/shared/ui/data-display/StatisticCards';
import { useFuelKpis } from '../hooks/useFuel';
import { formatCurrency } from '@/shared/utils/currency.utils';

export function FuelKpiCards() {
  const { data: kpis, isLoading, error } = useFuelKpis();

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl skeleton" />)}
      </div>
    );
  }

  if (error || !kpis) {
    return <div className="text-sm text-muted-foreground">Unable to load fuel KPIs</div>;
  }

  const trendIcon = (trend: number, goodWhenPositive: boolean) => {
    if (trend === 0) return null;
    const positive = trend > 0;
    const good = positive === goodWhenPositive;
    return positive ? (
      <TrendingUp className={`w-4 h-4 ${good ? 'text-success' : 'text-danger'}`} />
    ) : (
      <TrendingDown className={`w-4 h-4 ${good ? 'text-success' : 'text-danger'}`} />
    );
  };

  return (
    <StatisticCards>
      <StatisticCard
        title="Fuel efficiency"
        value={`${kpis.averageFuelEfficiency.toFixed(2)} km/L`}
        description={`${kpis.totalDistance.toLocaleString()} km driven`}
        icon={trendIcon(kpis.efficiencyTrend, true)}
      />
      <StatisticCard
        title="Cost per km"
        value={formatCurrency(kpis.costPerKm)}
        description={`${kpis.vehiclesTracked} vehicles tracked`}
        icon={trendIcon(kpis.costTrend, false)}
      />
      <StatisticCard
        title="Abnormal consumption"
        value={kpis.abnormalConsumptionCount}
        description={`${kpis.abnormalConsumptionPercentage}% of entries`}
        icon={<AlertTriangle className="w-4 h-4 text-warning" />}
      />
      <StatisticCard
        title="Days since last fill"
        value={kpis.daysSinceLastFill}
        description={kpis.mostRecentPlate ? `${kpis.mostRecentPlate}${kpis.mostRecentVehicle ? ` · ${kpis.mostRecentVehicle}` : ''}` : 'N/A'}
        icon={<Calendar className="w-4 h-4 text-muted-foreground" />}
      />
    </StatisticCards>
  );
}