// frontend/modules/trips/components/TripStatsCards.tsx

'use client';

import { Route, TrendingUp, Gauge, Users } from 'lucide-react';
import { StatsCard } from '@/shared/ui/cards/StatsCard';
import { useTripStats } from '../hooks/useTrips';
import { formatDistance } from '@/shared/utils/distance.utils';

export function TripStatsCards() {
  const { data, isLoading } = useTripStats();

  const driverCount = data ? Object.keys(data.byDriver).length : 0;
  const averageDistance = data?.averageDistance ?? 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatsCard
        title="Total trips"
        value={data?.totalTrips ?? 0}
        icon={<Route className="w-4 h-4" />}
        loading={isLoading}
        color="blue"
      />
      <StatsCard
        title="Total distance"
        value={formatDistance(data?.totalDistance ?? 0)}
        icon={<TrendingUp className="w-4 h-4" />}
        loading={isLoading}
        color="green"
      />
      <StatsCard
        title="Average trip distance"
        value={formatDistance(averageDistance)}
        icon={<Gauge className="w-4 h-4" />}
        loading={isLoading}
        color="purple"
      />
      <StatsCard
        title="Active drivers"
        value={driverCount}
        icon={<Users className="w-4 h-4" />}
        loading={isLoading}
        color="yellow"
      />
    </div>
  );
}