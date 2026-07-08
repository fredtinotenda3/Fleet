
// frontend/shared/dashboards/widgets/TripsWidget.tsx

'use client';

import Link from 'next/link';
import { Route, ArrowUpRight } from 'lucide-react';
import { DashboardWidget } from '@/frontend/shared/dashboards/DashboardWidget';
import { useRecentTripsWidget } from '@/frontend/modules/dashboard/hooks/useDashboardData';
import { formatDistance } from '@/shared/utils/distance.utils';
import { formatDate } from '@/shared/utils/date.utils';

export function TripsWidget() {
  const { data, isLoading, isError, refetch } = useRecentTripsWidget();

  return (
    <DashboardWidget
      title="Recent trips"
      icon={<Route className="w-4 h-4" />}
      isLoading={isLoading}
      isError={isError}
      onRefresh={() => refetch()}
      footer={
        <Link href="/trips" className="flex items-center gap-1 text-body-sm text-primary hover:underline">
          View all trips
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      }
    >
      {!data || data.recent.length === 0 ? (
        <p className="py-6 text-center text-body-sm text-muted-foreground">No trips recorded yet.</p>
      ) : (
        <>
          <p className="mb-3 text-body-sm text-muted-foreground">
            {data.totalTrips} trips &middot; {formatDistance(data.totalDistance)} total
          </p>
          <ul className="divide-y divide-border">
            {data.recent.map((trip) => (
              <li key={trip._id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="font-medium truncate text-body-sm text-foreground">{trip.license_plate}</p>
                  <p className="truncate text-caption text-muted-foreground">{formatDate(trip.date)}</p>
                </div>
                <span className="shrink-0 text-body-sm tabular-nums text-foreground">
                  {formatDistance(trip.distance_calculated)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </DashboardWidget>
  );
}