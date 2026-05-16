// C:\Users\user\Desktop\Fleet\modules\vehicles\components\VehicleStatsCards.tsx

'use client';

import { StatsCard } from '@/shared/ui/cards/StatsCard';
import { Car, Wrench, Truck } from 'lucide-react';
import { VehicleStats } from '@/shared/types/vehicle.types';

interface VehicleStatsCardsProps {
  stats: VehicleStats | undefined;
  isLoading: boolean;
}

export function VehicleStatsCards({ stats, isLoading }: VehicleStatsCardsProps) {
  console.log('VehicleStatsCards - stats:', stats); // Add this debug line
  
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatsCard
        title="Total Vehicles"
        value={stats?.total?.toLocaleString() || '0'}
        icon={<Truck className="h-4 w-4" />}
        loading={isLoading}
        color="blue"
      />
      <StatsCard
        title="Active Vehicles"
        value={stats?.active?.toLocaleString() || '0'}
        icon={<Car className="h-4 w-4" />}
        loading={isLoading}
        color="green"
        description="Currently in operation"
      />
      <StatsCard
        title="Inactive Vehicles"
        value={stats?.inactive?.toLocaleString() || '0'}
        icon={<Car className="h-4 w-4" />}
        loading={isLoading}
        color="gray"
        description="Not in operation"
      />
      <StatsCard
        title="In Maintenance"
        value={stats?.maintenance?.toLocaleString() || '0'}
        icon={<Wrench className="h-4 w-4" />}
        loading={isLoading}
        color="yellow"
        description="Undergoing service"
      />
    </div>
  );
}