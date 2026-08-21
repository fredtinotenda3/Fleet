// frontend/modules/telematics/hooks/useEagleTrack.ts
//
// Query hooks for the Eagle Track extensions: historical route playback,
// the provider fuel report, the synced trigger list, and the admin
// uin -> vehicle mapping screen.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { telematicsApi } from '../services/telematics.api';
import { telematicsKeys } from './useLiveMap';

export const eagletrackKeys = {
  history: (vehicleId: string, from: string, to: string) =>
    [...telematicsKeys.all, 'eagletrack-history', vehicleId, from, to] as const,
  fuel: (vehicleId: string, from: string, to: string) =>
    [...telematicsKeys.all, 'eagletrack-fuel', vehicleId, from, to] as const,
  triggers: () => [...telematicsKeys.all, 'eagletrack-triggers'] as const,
  trackerMapping: () => [...telematicsKeys.all, 'eagletrack-tracker-mapping'] as const,
};

/**
 * Rounds a window to the hour.
 *
 * The window is part of the query key, so an un-rounded `new Date()`
 * would produce a NEW key on every render -- a fresh cache miss, and
 * behind it a fresh paged pull against the vendor's API. Rounding makes
 * the key stable for an hour, which is what turns this from "one vendor
 * request per render" into "one per hour per vehicle".
 */
export function hourlyWindow(hoursBack: number): { from: string; to: string } {
  const to = new Date();
  to.setMinutes(0, 0, 0);
  const from = new Date(to.getTime() - hoursBack * 60 * 60_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

/**
 * Historical route playback for the selected vehicle.
 *
 * NOT polled. Unlike the live map's 10s cadence, this issues a paged
 * vendor pull on a cache miss, so a refetch interval here would hammer a
 * third-party API for data that by definition is not changing -- history
 * is the past. It refetches when the vehicle or the window changes, and
 * otherwise sits on the cache.
 */
export function useEagleTrackHistory(
  vehicleId: string | undefined,
  window: { from: string; to: string },
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: eagletrackKeys.history(vehicleId ?? '', window.from, window.to),
    queryFn: () =>
      telematicsApi.getEagleTrackHistory(vehicleId as string, {
        from: window.from,
        to: window.to,
      }),
    enabled: Boolean(vehicleId) && (options?.enabled ?? true),
    // An hour: the same reasoning as hourlyWindow. Past history does not
    // change, so anything shorter only costs vendor requests.
    staleTime: 60 * 60_000,
    // A vendor outage should not retry a paged pull three times; the
    // endpoint already returns stored points with `providerError` set.
    retry: 1,
  });
}

/** The provider's fuel report for the selected vehicle. Gated on FUEL_VIEW server-side, so a 403 here is expected for view-only roles. */
export function useEagleTrackFuelReport(
  vehicleId: string | undefined,
  window: { from: string; to: string },
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: eagletrackKeys.fuel(vehicleId ?? '', window.from, window.to),
    queryFn: () =>
      telematicsApi.getEagleTrackFuelReport(vehicleId as string, {
        from: window.from,
        to: window.to,
      }),
    enabled: Boolean(vehicleId) && (options?.enabled ?? true),
    staleTime: 60 * 60_000,
    retry: 1,
  });
}

/** The provider's trigger objects as last synced. Reads our own store, so this is a cheap local query. */
export function useEagleTrackTriggers(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: eagletrackKeys.triggers(),
    queryFn: () => telematicsApi.getEagleTrackTriggers(),
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
  });
}

/** Unmatched trackers from the last sync, plus the links this caller can see. */
export function useEagleTrackTrackerMapping(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: eagletrackKeys.trackerMapping(),
    queryFn: () => telematicsApi.getEagleTrackTrackerMapping(),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  });
}

/**
 * Creates a uin -> vehicle link.
 *
 * Invalidates the live map as well as the mapping list: a newly linked
 * tracker starts being attributed to its vehicle on the very next sync,
 * so the map's contents genuinely change as a result of this write.
 */
export function useCreateTrackerLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { uin: string; vehicleId: string; note?: string }) =>
      telematicsApi.createEagleTrackTrackerLink(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eagletrackKeys.trackerMapping() });
      queryClient.invalidateQueries({ queryKey: telematicsKeys.liveMap() });
    },
  });
}

export function useDeleteTrackerLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (uin: string) => telematicsApi.deleteEagleTrackTrackerLink(uin),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eagletrackKeys.trackerMapping() });
      queryClient.invalidateQueries({ queryKey: telematicsKeys.liveMap() });
    },
  });
}
