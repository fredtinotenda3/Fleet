// frontend/modules/trips/components/TripKpiCards.tsx

'use client';

import { TrendingUp, TrendingDown, Route, Clock, Users, Trophy } from 'lucide-react';
import { StatisticCard, StatisticCards } from '@/frontend/shared/ui/data-display/StatisticCards';
import { useTripKpis } from '../hooks/useTrips';

/**
 * PHASE 1: executive KPI cards for the Trip Analytics page, mirroring
 * FuelKpiCards' layout/loading/error handling exactly so the two
 * analytics pages feel like the same product. Only the metrics differ
 * (operational: distance/duration/utilization vs. Fuel's cost/efficiency).
 *
 * VEHICLE-SCOPE ADDITION: optional `dateRange` and `licensePlate` props.
 * When `licensePlate` is supplied (VehicleTripAnalyticsPanel), every KPI
 * -- total distance, driving hours, trip status, utilization, longest
 * trip, top driver -- reflects that single vehicle instead of the fleet.
 * Omitting both props preserves the original fleet-wide behavior used
 * by TripAnalyticsPage.
 */
interface TripKpiCardsProps {
  dateRange?: { startDate?: Date; endDate?: Date };
  licensePlate?: string;
}

export function TripKpiCards({ dateRange, licensePlate }: TripKpiCardsProps = {}) {
  const { data: kpis, isLoading, error } = useTripKpis(dateRange, licensePlate);

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl skeleton" />)}
      </div>
    );
  }

  if (error || !kpis) {
    return <div className="text-sm text-muted-foreground">Unable to load trip KPIs</div>;
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
        title="Total distance"
        value={`${kpis.totalDistance.toLocaleString()} km`}
        description={`${kpis.totalTrips.toLocaleString()} trips \u00B7 avg ${kpis.averageDistance.toFixed(1)} km`}
        icon={trendIcon(kpis.distanceTrend, true)}
      />
      <StatisticCard
        title="Driving hours"
        value={kpis.totalDrivingHours.toFixed(1)}
        description={
          kpis.averageDurationMinutes > 0
            ? `avg ${kpis.averageDurationMinutes.toFixed(0)} min/trip`
            : 'No timing data yet'
        }
        icon={<Clock className="w-4 h-4 text-muted-foreground" />}
      />
      <StatisticCard
        title="Trip status"
        value={`${kpis.completedTrips.toLocaleString()} completed`}
        description={`${kpis.ongoingTrips} ongoing \u00B7 ${kpis.cancelledTrips} cancelled`}
        icon={trendIcon(kpis.tripCountTrend, true)}
      />
      <StatisticCard
        title={licensePlate ? 'Driver activity' : 'Fleet utilization'}
        value={
          licensePlate
            ? `${kpis.activeDrivers} driver${kpis.activeDrivers === 1 ? '' : 's'}`
            : `${kpis.activeVehicles} vehicles \u00B7 ${kpis.activeDrivers} drivers`
        }
        description={
          kpis.mostUtilizedDriver
            ? `Top driver: ${kpis.mostUtilizedDriver.driver_id} (${kpis.mostUtilizedDriver.trips} trips)`
            : 'No trips in this period'
        }
        icon={<Users className="w-4 h-4 text-muted-foreground" />}
      />
      <StatisticCard
        title="Longest trip"
        value={kpis.longestTrip ? `${kpis.longestTrip.distance.toLocaleString()} km` : 'N/A'}
        description={
          kpis.longestTrip
            ? licensePlate
              ? formatShortDate(kpis.longestTrip._id)
              : kpis.longestTrip.license_plate
            : 'No trips in this period'
        }
        icon={<Route className="w-4 h-4 text-muted-foreground" />}
      />
      <StatisticCard
        title="Top driver"
        value={kpis.mostUtilizedDriver ? `${kpis.mostUtilizedDriver.trips} trips` : 'N/A'}
        description={kpis.mostUtilizedDriver ? kpis.mostUtilizedDriver.driver_id : 'No driver data yet'}
        icon={<Trophy className="w-4 h-4 text-muted-foreground" />}
      />
    </StatisticCards>
  );
}

/** Falls back gracefully -- longestTrip._id is a trip id, not a date;
 *  kept as a harmless no-op label when vehicle-scoped since the vehicle
 *  is already implied by the panel context. */
function formatShortDate(_id: string): string {
  return 'This vehicle';
}