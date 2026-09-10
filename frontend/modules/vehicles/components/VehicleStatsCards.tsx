//frontend/modules/vehicles/components/VehicleStatsCards.tsx

'use client';

import { Truck, CheckCircle2, Wrench, PauseCircle } from 'lucide-react';
import { StatsCard } from '@/shared/ui/cards/StatsCard';
import { useVehicleStats } from '../hooks/useVehicles';

/**
 * The four figures at the top of the Vehicles page.
 *
 * FIXED (empty-organisation round): this component never destructured
 * `isError`, and every value was `data?.x ?? 0`. A failed request
 * therefore rendered four confident zeroes -- including a card titled
 * "Active" showing 0 -- directly above the page's own, correct, empty
 * state. An operator with 400 vehicles saw their fleet reported as
 * empty, with nothing to indicate the number was not a measurement.
 *
 * `?? 0` is now `?? null`, which `MetricCard` renders as a placeholder
 * rather than a figure, and `error` is threaded so a failure says so.
 * (The `error`/`emptyValue` pass-through was added to the `StatsCard`
 * adapter for this; `MetricCard` had supported both all along.)
 *
 * A genuine 0 still renders as 0: `data` is defined and its counts are
 * real, which is the correct reading for an organisation that has not
 * added a vehicle yet -- and the page's empty state below says what to
 * do about it.
 */
export function VehicleStatsCards() {
  const { data, isLoading, isError } = useVehicleStats();

  const value = (n: number | undefined) => (n === undefined ? null : n.toLocaleString());

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatsCard
        title="Total fleet"
        value={value(data?.total)}
        icon={<Truck className="w-4 h-4" />}
        loading={isLoading}
        error={isError}
        emptyValue="—"
      />
      <StatsCard
        title="Active"
        value={value(data?.active)}
        icon={<CheckCircle2 className="w-4 h-4" />}
        loading={isLoading}
        error={isError}
        emptyValue="—"
      />
      <StatsCard
        title="In maintenance"
        value={value(data?.maintenance)}
        icon={<Wrench className="w-4 h-4" />}
        loading={isLoading}
        error={isError}
        emptyValue="—"
      />
      <StatsCard
        title="Inactive"
        value={value(data?.inactive)}
        icon={<PauseCircle className="w-4 h-4" />}
        loading={isLoading}
        error={isError}
        emptyValue="—"
      />
    </div>
  );
}
