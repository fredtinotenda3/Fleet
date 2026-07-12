// frontend/modules/trips/components/TripStatsCards.tsx

'use client';

import { Route, TrendingUp, Gauge, Users } from 'lucide-react';
import { StatisticCard, StatisticCards } from '@/frontend/shared/ui/data-display/StatisticCards';
import { useTripStats } from '../hooks/useTrips';
import { formatDistance } from '@/shared/utils/distance.utils';

export function TripStatsCards() {
  const { data, isLoading } = useTripStats();

  const driverCount = data ? Object.keys(data.byDriver).length : 0;
  const averageDistance = data?.averageDistance ?? 0;

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl skeleton" />
        ))}
      </div>
    );
  }

  return (
    <StatisticCards>
      <StatisticCard
        title="Total trips"
        value={data?.totalTrips ?? 0}
        icon={<Route className="w-4 h-4 text-muted-foreground" />}
      />
      <StatisticCard
        title="Total distance"
        value={formatDistance(data?.totalDistance ?? 0)}
        icon={<TrendingUp className="w-4 h-4 text-muted-foreground" />}
      />
      <StatisticCard
        title="Average trip distance"
        value={formatDistance(averageDistance)}
        icon={<Gauge className="w-4 h-4 text-muted-foreground" />}
      />
      <StatisticCard
        title="Active drivers"
        value={driverCount}
        icon={<Users className="w-4 h-4 text-muted-foreground" />}
      />
    </StatisticCards>
  );
}