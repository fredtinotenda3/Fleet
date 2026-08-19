// frontend/modules/telematics/hooks/useLiveMap.ts

import { useQuery } from '@tanstack/react-query';
import { telematicsApi } from '../services/telematics.api';

export const telematicsKeys = {
  all: ['telematics'] as const,
  liveMap: () => [...telematicsKeys.all, 'live-map'] as const,
  routeHistory: (vehicleId: string) => [...telematicsKeys.all, 'route-history', vehicleId] as const,
  vehicleDetail: (vehicleId: string) => [...telematicsKeys.all, 'vehicle-detail', vehicleId] as const,
  demoStatus: () => [...telematicsKeys.all, 'demo-status'] as const,
  cartrackConfig: () => [...telematicsKeys.all, 'cartrack-config'] as const,
  eagletrackConfig: () => [...telematicsKeys.all, 'eagletrack-config'] as const,
};

/**
 * GET /api/telematics/live-map, polled every 10s -- the payload's
 * `source` per vehicle and top-level `demoMode` flag differ depending
 * on whether the tenant has Cartrack configured or Demo Mode on, but
 * both are handled by the same LiveMapPage render path.
 */
export function useLiveMap(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: telematicsKeys.liveMap(),
    queryFn: () => telematicsApi.getLiveMap(),
    enabled: options?.enabled ?? true,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

/** Org-unit-scoped route trail for one vehicle, used to draw the breadcrumb line on the live map. */
export function useVehicleRouteHistory(vehicleId: string | undefined, minutes?: number) {
  return useQuery({
    queryKey: telematicsKeys.routeHistory(vehicleId ?? ''),
    queryFn: () => telematicsApi.getRouteHistory(vehicleId as string, minutes),
    enabled: Boolean(vehicleId),
    staleTime: 5_000,
  });
}

/**
 * Full live telemetry (engine, trip/odometer, fuel, device health) for
 * the currently-selected vehicle. Polled on the same 10s cadence as the
 * live map itself so the detail panel doesn't visibly lag the marker it
 * describes.
 */
export function useVehicleDetail(vehicleId: string | undefined) {
  return useQuery({
    queryKey: telematicsKeys.vehicleDetail(vehicleId ?? ''),
    queryFn: () => telematicsApi.getVehicleDetail(vehicleId as string),
    enabled: Boolean(vehicleId),
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}