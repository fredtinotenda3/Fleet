// frontend/modules/trips/hooks/useMapAssistedTrip.ts
//
// PART 3/4 -- the two supporting queries behind the map-assisted trip
// log: typed-location search, and live route preview over the current
// stop list.

import { useQuery } from '@tanstack/react-query';
import { useDebounce } from 'use-debounce';
import { tripsApi } from '../services/trips.api';
import type { RoutePreviewRequestStop, RoutePreviewResult } from '../types/map-assisted';

const SEARCH_DEBOUNCE_MS = 400;
const ROUTE_DEBOUNCE_MS = 500;
const MIN_QUERY_LENGTH = 2;

/**
 * Debounced forward-geocode search. `enabled` gates the request so a
 * freshly-opened, empty search box never fires one -- the same
 * `minLength`-style guard useDebouncedSearch applies elsewhere, but
 * expressed as a query key here so React Query's own cache (by query
 * text) absorbs a user retyping the same thing after backspacing.
 */
export function useLocationSearch(query: string) {
  const [debounced] = useDebounce(query.trim(), SEARCH_DEBOUNCE_MS);

  return useQuery({
    queryKey: ['trip-location-search', debounced],
    queryFn: () => tripsApi.searchLocations(debounced),
    enabled: debounced.length >= MIN_QUERY_LENGTH,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Debounced route preview. Keyed on the stops' actual coordinates (not
 * on object identity, which changes every render) so dragging a marker
 * one pixel and releasing it in the same spot does not refetch, but
 * reordering, adding, removing, or moving a stop does.
 *
 * Disabled below 2 stops -- PART 3: a route needs a start and an end.
 */
export function useRoutePreview(stops: RoutePreviewRequestStop[]) {
  const key = stops.map((s) => `${s.sequence}:${s.lat.toFixed(6)},${s.lng.toFixed(6)}`).join('|');
  const [debouncedKey] = useDebounce(key, ROUTE_DEBOUNCE_MS);

  return useQuery<RoutePreviewResult>({
    queryKey: ['trip-route-preview', debouncedKey],
    queryFn: () => tripsApi.previewRoute(stops),
    enabled: stops.length >= 2 && debouncedKey === key,
    staleTime: 0,
  });
}
