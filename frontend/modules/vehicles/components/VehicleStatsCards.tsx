//frontend/modules/vehicles/components/VehicleStatsCards.tsx

'use client';

import { Truck, CheckCircle2, Wrench, PauseCircle } from 'lucide-react';
import { StatsCard } from '@/shared/ui/cards/StatsCard';
import { useVehicleStats } from '../hooks/useVehicles';

export function VehicleStatsCards() {
  const { data, isLoading } = useVehicleStats();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatsCard title="Total fleet" value={data?.total ?? 0} icon={<Truck className="w-4 h-4" />} loading={isLoading} color="blue" />
      <StatsCard title="Active" value={data?.active ?? 0} icon={<CheckCircle2 className="w-4 h-4" />} loading={isLoading} color="green" />
      <StatsCard title="In maintenance" value={data?.maintenance ?? 0} icon={<Wrench className="w-4 h-4" />} loading={isLoading} color="yellow" />
      <StatsCard title="Inactive" value={data?.inactive ?? 0} icon={<PauseCircle className="w-4 h-4" />} loading={isLoading} color="gray" />
    </div>
  );
}