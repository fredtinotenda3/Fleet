// frontend/modules/telematics/pages/LiveMapPage.tsx
//
// GET /api/telematics/live-map, polled every 10s (see useLiveMap), works
// identically whether the tenant has Cartrack configured or Demo Mode
// on -- the payload's `source` per vehicle and top-level `demoMode` flag
// are the only things that differ, and both are handled by the same
// render path here rather than a separate demo-only UI.

'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { formatDistanceToNow } from 'date-fns';
import { RefreshCw, MapPin, AlertTriangle, Clock } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { useLiveMap, useVehicleRouteHistory, useVehicleDetail } from '../hooks';
import { LiveMapLegend } from '../components/LiveMapLegend';
import { LiveMapVehicleList } from '../components/LiveMapVehicleList';
import { VehicleDetailPanel } from '../components/VehicleDetailPanel';
import { DemoModeToggle } from '../components/DemoModeToggle';
import { canViewLiveMap, canToggleDemoMode } from '../utils';
import type { LiveMapVehicleStatus } from '../types';

// Leaflet touches `window` at module-eval time, which breaks under
// Next's server render of this client component -- loaded client-only
// via next/dynamic, same pattern Next's own docs use for Leaflet.
const LiveMapLeaflet = dynamic(
  () => import('../components/LiveMapLeaflet').then((mod) => mod.LiveMapLeaflet),
  {
    ssr: false,
    loading: () => <div className="flex items-center justify-center w-full h-full text-body-sm text-muted-foreground">Loading map…</div>,
  }
);

export function LiveMapPage() {
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canView = canViewLiveMap(roles);
  const canToggleDemo = canToggleDemoMode(roles);

  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  const { data: payload, isLoading, isError, refetch, isFetching } = useLiveMap({ enabled: canView });
  const { data: routeHistory } = useVehicleRouteHistory(selectedVehicleId ?? undefined);
  const { data: vehicleDetail, isLoading: isDetailLoading } = useVehicleDetail(selectedVehicleId ?? undefined);

  const vehicles = payload?.vehicles ?? [];
  const geofences = payload?.geofences ?? [];
  const selectedVehicle = vehicles.find((v) => v.vehicleId === selectedVehicleId) ?? null;

  // If the selected vehicle drops out of scope/list (deleted, filtered,
  // reassigned to another org unit) between polls, clear the selection
  // rather than keep pointing the route-history query at a vehicle the
  // map no longer shows.
  useEffect(() => {
    if (selectedVehicleId && !vehicles.some((v) => v.vehicleId === selectedVehicleId)) {
      setSelectedVehicleId(null);
    }
  }, [vehicles, selectedVehicleId]);

  // Alert and stale are counted SEPARATELY and deliberately overlap the
  // three status buckets, so moving + idle + offline still sums to the
  // fleet total (MapsWidget relies on that too).
  const { statusCounts, alertCount, staleCount } = useMemo(() => {
    const counts: Record<LiveMapVehicleStatus, number> = { moving: 0, idle: 0, offline: 0 };
    let alerts = 0;
    let stale = 0;
    for (const v of vehicles) {
      counts[v.status] += 1;
      if (v.alert) alerts += 1;
      if (v.stale) stale += 1;
    }
    return { statusCounts: counts, alertCount: alerts, staleCount: stale };
  }, [vehicles]);

  // Eagle Track's own last-sync time, as refreshed by the read-through
  // trigger on GET /api/telematics/live-map (see
  // eagletrack-read-through.service.ts) -- not the same thing as
  // `generatedAt`, which is just when THIS response was assembled.
  // Absent for tenants that don't have Eagle Track configured/enabled,
  // in which case the indicator is simply not shown.
  const eagletrackLastSyncAt = payload?.eagletrackLastSyncAt ?? null;

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
        <AlertTriangle className="w-6 h-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-body-sm text-muted-foreground">
          You don&apos;t have permission to view the live fleet map.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live fleet map"
        description="Real-time vehicle positions, route history, and geofences."
        actions={
          <div className="flex items-center gap-3">
            <DemoModeToggle canToggle={canToggleDemo} />
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} aria-hidden="true" />
              Refresh
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <PageLoader label="Loading live map" fullScreen={false} />
      ) : isError ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center surface-card">
          <AlertTriangle className="w-5 h-5 text-danger" aria-hidden="true" />
          <p className="text-body-sm text-muted-foreground">Failed to load the live map.</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <LiveMapLegend counts={statusCounts} alertCount={alertCount} staleCount={staleCount} />
            <div className="flex items-center gap-2">
              {eagletrackLastSyncAt && (
                <Badge
                  variant={payload?.eagletrackLastSyncStatus === 'error' ? 'destructive' : 'outline'}
                  className="gap-1"
                  title={new Date(eagletrackLastSyncAt).toLocaleString()}
                >
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  Eagle Track synced {formatDistanceToNow(new Date(eagletrackLastSyncAt), { addSuffix: true })}
                </Badge>
              )}
              {payload?.demoMode && (
                <Badge variant="secondary" className="gap-1">
                  <MapPin className="h-3 w-3" aria-hidden="true" />
                  Showing simulated demo positions
                </Badge>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
            <div className="overflow-hidden surface-card">
              <LiveMapVehicleList
                vehicles={vehicles}
                selectedVehicleId={selectedVehicleId}
                onSelectVehicle={setSelectedVehicleId}
              />
            </div>

            <div className="p-2 overflow-hidden surface-card" style={{ minHeight: 560 }}>
              <LiveMapLeaflet
                vehicles={vehicles}
                geofences={geofences}
                routePoints={routeHistory?.points ?? []}
                selectedVehicleId={selectedVehicleId}
                onSelectVehicle={setSelectedVehicleId}
                className="rounded-lg"
              />
            </div>
          </div>

          {selectedVehicle && (
            <VehicleDetailPanel
              vehicle={selectedVehicle}
              detail={vehicleDetail}
              isLoading={isDetailLoading}
              onClose={() => setSelectedVehicleId(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}