// frontend/modules/vehicles/components/operations/VehicleOperationalHeader.tsx
//
// WAVE 1 PART 2, item 2: the Vehicle Operational Hub's operational
// header (spec section 4.11).
//
// ---------------------------------------------------------------------
// WHAT WAS THERE BEFORE
// ---------------------------------------------------------------------
// The page's PageHeader carried the vehicle's name and license plate
// (2 of the 13 required fields), and the badge row below it carried
// status and registration-expiry warnings (arguably a 3rd/4th, though
// those are compliance flags rather than the "state" field the spec
// means). Type, driver, location, speed, odometer, today's trip count,
// today's distance, today's fuel spend, telemetry freshness and tracking
// health were not shown anywhere above the tabs -- an operator had to
// open the Driver tab, the Overview gauges, AND the (until this wave,
// nonexistent) map to reconstruct "what is this vehicle doing right
// now", which is the exact question this header exists to answer in one
// glance.
//
// ---------------------------------------------------------------------
// NO NEW DATA SOURCES
// ---------------------------------------------------------------------
// Every figure here comes from a query this page (or a sibling on it)
// already makes or that already exists for exactly this purpose:
//   * identity/registration/type/driver/static odometer -- the `vehicle`
//     prop, already fetched by VehicleDetailPage.
//   * location/speed/live odometer/freshness/tracking health --
//     `useVehicleDetail`, the SAME query VehicleInstrumentCluster and
//     VehicleLiveMapCard call; React Query dedupes it to one request.
//   * today's trip count/distance -- `useTripKpis` scoped to this
//     vehicle's plate and to the CALENDAR day via the new `'today'`
//     preset on `getDateRangePreset` (see date.utils.ts) -- the same
//     hook VehicleAnalyticsPanel already uses for the Analytics tab,
//     just with a narrower window.
//   * today's fuel spend -- `useFuelStats`, same pattern.
// Both KPI queries are tenant/org-unit/license-plate scoped AT THE
// AGGREGATION QUERY (buildBaseMatch's $match stage), not filtered in
// memory after a broader fetch -- see trip.repository.ts/fuel.repository.ts.
//
// ---------------------------------------------------------------------
// WHAT THIS HEADER REFUSES TO DO
// ---------------------------------------------------------------------
//   * It never shows a live figure (location/speed/odometer/freshness)
//     as a static one. Those come from `useVehicleDetail` and inherit
//     its "no telemetry" / "request failed" distinction rather than
//     silently falling back to the vehicle record's own stale odometer.
//   * It never renders "0 trips today" as though it were a loading
//     state, or a loading state as though it were zero. A real zero (no
//     trips logged yet today) IS a fact and is shown as one; a query
//     that failed is shown as unavailable, not folded into the same
//     zero.
//   * It never re-derives tracking health independently of the freshness
//     rules the instrument cluster already codified in signal-state.ts --
//     it reads the same `freshnessFor`/`freshnessCopy` pair.

'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, MapPin, User } from 'lucide-react';
import { Card, CardContent } from '@/frontend/shared/ui/data-display/card';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';
import { cn } from '@/lib/utils';
import { useVehicleDetail } from '@/frontend/modules/telematics/hooks/useLiveMap';
import { useTripKpis } from '@/frontend/modules/trips/hooks/useTrips';
import { useFuelStats } from '@/frontend/modules/fuel/hooks/useFuel';
import {
  freshnessCopy,
  freshnessFor,
} from '@/frontend/shared/ui/instruments/signal-state';
import {
  sourceLabel,
  formatFixAge,
  ADDRESS_UNAVAILABLE,
} from '@/frontend/modules/telematics/components/VehicleDetailPanel';
import { getVehicleStatusMeta } from '../../utils';
import { formatDistance } from '@/shared/utils/distance.utils';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { getDateRangePreset } from '@/shared/utils/date.utils';
import type { VehicleWithAssignment } from '../../types';

interface VehicleOperationalHeaderProps {
  vehicle: VehicleWithAssignment;
}

function Stat({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'muted' | 'warning' | 'danger';
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 py-1" title={hint}>
      <span className="text-caption text-muted-foreground">{label}</span>
      <span
        className={cn(
          'flex items-center gap-1 text-body-sm font-medium tabular-nums',
          tone === 'warning' && 'text-warning',
          tone === 'danger' && 'text-danger',
          tone === 'muted' && 'text-muted-foreground'
        )}
      >
        {icon}
        {value}
      </span>
    </div>
  );
}

/**
 * Today's window, RECOMPUTED ON EVERY RENDER rather than memoised with an
 * empty dependency array. A calendar-day boundary that never updates
 * would keep querying yesterday's "today" for anyone who leaves this
 * page open across midnight -- an edge case, but a wrong one is worse
 * than the cost of building two Dates per render.
 */
function todayWindow(): { startDate: Date; endDate: Date } {
  const { start, end } = getDateRangePreset('today');
  return { startDate: start, endDate: end };
}

export function VehicleOperationalHeader({ vehicle }: VehicleOperationalHeaderProps) {
  const vehicleId = vehicle._id;
  const { data: detail, isLoading: isDetailLoading, isError: isDetailError } = useVehicleDetail(vehicleId);
  const { data: tripKpis, isLoading: isTripLoading, isError: isTripError } = useTripKpis(
    todayWindow(),
    vehicle.license_plate
  );
  const { data: fuelStats, isLoading: isFuelLoading, isError: isFuelError } = useFuelStats(
    todayWindow(),
    vehicle.license_plate
  );

  const statusMeta = getVehicleStatusMeta(vehicle.status);
  const fixAgeSeconds = detail?.fixAgeSeconds ?? null;
  const freshness = freshnessFor(fixAgeSeconds, { isTracked: true });
  const copy = freshnessCopy(freshness, fixAgeSeconds);

  const liveOdometer = detail?.odometer;
  const odometerValue = typeof liveOdometer === 'number' ? liveOdometer : vehicle.odometer;
  const odometerIsLive = typeof liveOdometer === 'number';

  return (
    <Card>
      <CardContent className="grid grid-cols-2 py-4 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
        <Stat label="Type" value={vehicle.vehicle_type || 'Not recorded'} />

        <Stat
          label="State"
          value={statusMeta.label}
          tone={vehicle.status === 'maintenance' ? 'warning' : vehicle.status === 'inactive' ? 'muted' : undefined}
        />

        <Stat
          label="Driver"
          value={vehicle.assignedDriver?.name ?? 'Unassigned'}
          tone={vehicle.assignedDriver ? undefined : 'muted'}
          icon={<User className="w-3 h-3 shrink-0" aria-hidden="true" />}
        />

        {isDetailLoading ? (
          <div className="flex flex-col gap-1 py-1">
            <Skeleton className="w-10 h-3" />
            <Skeleton className="w-20 h-4" />
          </div>
        ) : isDetailError ? (
          <Stat label="Location" value="Unavailable" hint="Couldn't load live telemetry." tone="warning" />
        ) : (
          <Stat
            label="Location"
            value={
              detail?.location
                ? detail.address
                  ? detail.address
                  : detail.address === null
                    ? ADDRESS_UNAVAILABLE
                    : `${detail.location.lat.toFixed(4)}, ${detail.location.lng.toFixed(4)}`
                : 'No position reported'
            }
            tone={detail?.location ? undefined : 'muted'}
            icon={<MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />}
          />
        )}

        {isDetailLoading ? (
          <div className="flex flex-col gap-1 py-1">
            <Skeleton className="w-10 h-3" />
            <Skeleton className="w-16 h-4" />
          </div>
        ) : (
          <Stat
            label="Speed"
            value={
              isDetailError
                ? 'Unavailable'
                : typeof detail?.location?.speed === 'number'
                  ? `${Math.round(detail.location.speed)} km/h`
                  : 'No data'
            }
            tone={isDetailError ? 'warning' : detail?.location?.speed ? undefined : 'muted'}
          />
        )}

        <Stat
          label="Odometer"
          value={typeof odometerValue === 'number' ? formatDistance(odometerValue) : 'Not recorded'}
          hint={odometerIsLive ? 'From the vehicle’s latest telemetry fix.' : 'From the vehicle record, not a live reading.'}
          tone={typeof odometerValue === 'number' ? undefined : 'muted'}
        />

        <Stat
          label="Trips today"
          value={isTripLoading ? '…' : isTripError ? 'Unavailable' : String(tripKpis?.totalTrips ?? 0)}
          tone={isTripError ? 'warning' : undefined}
        />

        <Stat
          label="Distance today"
          value={
            isTripLoading
              ? '…'
              : isTripError
                ? 'Unavailable'
                : formatDistance(tripKpis?.totalDistance ?? 0)
          }
          tone={isTripError ? 'warning' : undefined}
        />

        <Stat
          label="Fuel spend today"
          value={
            isFuelLoading
              ? '…'
              : isFuelError
                ? 'Unavailable'
                : formatCurrency(fuelStats?.totalCost ?? 0)
          }
          tone={isFuelError ? 'warning' : undefined}
        />

        {/*
          Freshness and source together ARE "tracking health" -- whether
          this vehicle is being tracked at all, and how current that
          tracking is. Spans the last two columns on the wide layout
          since it is the field an operator scans for first.
        */}
        <div className="col-span-2 flex flex-col gap-0.5 py-1 xl:col-span-2" title={copy.description}>
          <span className="text-caption text-muted-foreground">Tracking health</span>
          <span
            className={cn(
              'flex items-center gap-1 text-body-sm font-medium',
              copy.tone === 'positive' && 'text-success',
              copy.tone === 'neutral' && 'text-muted-foreground',
              copy.tone === 'warning' && 'text-warning',
              copy.tone === 'danger' && 'text-danger'
            )}
          >
            {(copy.tone === 'warning' || copy.tone === 'danger') && (
              <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
            )}
            {isDetailError ? 'Unavailable' : detail ? `${copy.label} · ${sourceLabel(detail.source)}` : copy.label}
            {formatFixAge(fixAgeSeconds) && !isDetailError && (
              <span className="font-normal text-muted-foreground">({formatFixAge(fixAgeSeconds)})</span>
            )}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}