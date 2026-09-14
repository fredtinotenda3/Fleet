// frontend/modules/vehicles/components/operations/VehicleLiveMapCard.tsx
//
// The vehicle-scoped live map for the Vehicle Operational Hub -- item 1
// of the Wave 1 Part 2 priority list.
//
// ---------------------------------------------------------------------
// NO FLEET-WIDE FETCH
// ---------------------------------------------------------------------
// The only pattern this codebase had for "show one vehicle on a map" was
// LiveMapPage's `useLiveMap()` then `.find(v => v.vehicleId === id)` --
// which pulls every vehicle's telemetry, on a 10s poll, to render one.
// That is exactly what §12.3 rules out for a page scoped to a single
// vehicle. This card uses the two endpoints that were already
// vehicle-scoped and already existed for this reason:
// `useVehicleDetail` (GET .../live-map/vehicle/[vehicleId]) and
// `useVehicleRouteHistory` (GET .../live-map/history/[vehicleId]) --
// both org-unit-scoped and VEHICLE_VIEW-gated server-side, and both
// already reachable only because this page itself required VEHICLE_VIEW
// to load the vehicle in the first place. `useVehicleDetail` is the same
// query VehicleInstrumentCluster already calls for the gauges beside
// this card; React Query dedupes the two calls into one request rather
// than fetching the same telemetry twice.
//
// ---------------------------------------------------------------------
// WHY THIS ISN'T VehicleDetailPanel
// ---------------------------------------------------------------------
// VehicleDetailPanel (the fleet map's selected-vehicle drawer) dumps
// every stored telemetry field -- engine, fuel, device health, trip
// aggregates. Mounting it here would duplicate the gauge cluster above
// it almost field-for-field. This card renders only what a MAP needs
// beyond the pins: status/freshness/source and, when resolved, the
// address -- the position-specific facts, not a second instrument
// readout.
//
// ---------------------------------------------------------------------
// GEOFENCES ARE DELIBERATELY NOT DRAWN HERE
// ---------------------------------------------------------------------
// They are only available from the fleet-wide live-map payload, and
// fetching that just to overlay geofence shapes on a single-vehicle map
// would reintroduce the fleet-wide request this card exists to avoid.
// A vehicle-scoped geofence view, if wanted, is a backend read-model
// question (a geofences-in-scope-of-one-vehicle endpoint), not something
// to route around by pulling the whole fleet here.

'use client';

import dynamic from 'next/dynamic';
import { AlertTriangle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';
import { cn } from '@/lib/utils';
import { useVehicleDetail, useVehicleRouteHistory } from '@/frontend/modules/telematics/hooks/useLiveMap';
import {
  STATUS_BADGE,
  sourceLabel,
  formatFixAge,
  ADDRESS_UNAVAILABLE,
} from '@/frontend/modules/telematics/components/VehicleDetailPanel';

// Leaflet touches `window` at module-eval time -- same reason
// LiveMapPage and TripPlaybackPanel load their map halves this way.
const VehicleLiveMap = dynamic(
  () => import('@/frontend/modules/telematics/components/VehicleLiveMap').then((mod) => mod.VehicleLiveMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center w-full h-full text-body-sm text-muted-foreground">
        Loading map&hellip;
      </div>
    ),
  }
);

/** Minutes of breadcrumb trail to request. Matches the fleet map's default live-trail window. */
const ROUTE_HISTORY_MINUTES = 60;

interface VehicleLiveMapCardProps {
  vehicleId: string;
  vehicleType?: string | null;
  licensePlate: string;
}

export function VehicleLiveMapCard({ vehicleId, vehicleType, licensePlate }: VehicleLiveMapCardProps) {
  const { data: detail, isLoading, isError } = useVehicleDetail(vehicleId);
  const { data: routeHistory } = useVehicleRouteHistory(vehicleId, ROUTE_HISTORY_MINUTES);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Live position</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="w-full h-80" />
        </CardContent>
      </Card>
    );
  }

  /*
    Same rule as the instrument cluster: a failed request is not a claim
    that the vehicle has no position, so it gets its own message rather
    than falling into the map's own "no position reported" state, which
    is reserved for a request that actually succeeded and found nothing.
  */
  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Live position</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 py-6 text-body-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-warning" aria-hidden="true" />
            <p className="text-muted-foreground">
              Couldn&apos;t load this vehicle&apos;s position. This is a problem reading the data, not a
              report that the vehicle is untracked.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const status = detail?.status ?? 'offline';
  const badge = STATUS_BADGE[status];
  const lastPing = formatFixAge(detail?.fixAgeSeconds ?? null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <CardTitle className="text-sm font-medium">Live position</CardTitle>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {detail?.location && <Badge className={badge.className}>{badge.label}</Badge>}
          {detail?.alert && (
            <Badge className="gap-1 bg-danger-bg text-danger">
              <AlertTriangle className="w-3 h-3" aria-hidden="true" />
              Alert
            </Badge>
          )}
          {detail?.stale && (
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <Clock className="w-3 h-3" aria-hidden="true" />
              Stale fix
            </Badge>
          )}
          {detail?.location && <Badge variant="outline">{sourceLabel(detail.source)}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {detail?.location && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
            {lastPing && <span>Last ping {lastPing}</span>}
            <span className={cn(detail.address === null && 'italic')}>
              {detail.address ? detail.address : detail.address === null ? ADDRESS_UNAVAILABLE : null}
            </span>
          </p>
        )}
        <div className="overflow-hidden border rounded-lg h-80 border-border">
          <VehicleLiveMap
            licensePlate={licensePlate}
            vehicleType={vehicleType}
            status={status}
            alert={detail?.alert ?? null}
            location={detail?.location ?? null}
            routePoints={routeHistory?.points ?? []}
            className="w-full h-full"
          />
        </div>
      </CardContent>
    </Card>
  );
}