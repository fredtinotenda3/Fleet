// frontend/modules/trips/components/MapAssistedTripLog.tsx
//
// PART 3 -- THE MAP-ASSISTED TRIP LOG. Combines a location search box,
// an editable ordered stop list, and an interactive map into one
// workflow, as a controlled sub-form embedded in TripForm when
// `mode === 'map'`.
//
// ---------------------------------------------------------------------
// WHAT IS STORED VS. WHAT IS DISPLAYED
// ---------------------------------------------------------------------
// This component's only output is the ORDERED STOP LIST (lat/lng/label/
// provenance) -- see `onChange`. The route distance shown here (from
// POST /api/trips/route-preview) is a PREVIEW for the operator's benefit
// while editing; CreateTripHandler/UpdateTripHandler independently
// recompute the authoritative route from the submitted stops at save
// time (see those handlers' own comments on why a client-submitted
// route is never trusted). If the preview and the saved figure ever
// differ by more than routing-engine jitter, the saved figure is the
// one that is correct by construction.
//
// ---------------------------------------------------------------------
// LABELLING (PART 4)
// ---------------------------------------------------------------------
// The distance shown here is ALWAYS captioned "Map-derived" and is
// never described as GPS, actual, or observed -- this entry mode has no
// telemetry at all, by definition.

'use client';

import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Spinner } from '@/frontend/shared/ui/feedback/spinner';
import { useLocationSearch, useRoutePreview } from '../hooks/useMapAssistedTrip';
import type { TripStop } from '../types';

const MapAssistedTripLogMap = dynamic(
  () => import('./MapAssistedTripLogMap').then((mod) => mod.MapAssistedTripLogMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center w-full h-full text-body-sm text-muted-foreground">
        Loading map…
      </div>
    ),
  }
);

export interface MapAssistedTripLogProps {
  value: TripStop[];
  onChange: (stops: TripStop[]) => void;
}

/** Re-derives role/sequence from array ORDER alone -- there is no separately persisted order, see trip.map-assisted-addendum.ts. */
function withRoles(stops: Omit<TripStop, 'sequence' | 'role'>[]): TripStop[] {
  return stops.map((s, i) => ({
    ...s,
    sequence: i,
    role: i === 0 ? 'start' : i === stops.length - 1 ? 'end' : 'waypoint',
  }));
}

function roleLabel(role: TripStop['role'], index: number, total: number): string {
  if (role === 'start') return 'Start';
  if (role === 'end') return 'End';
  return `Stop ${index + 1} of ${total}`;
}

export function MapAssistedTripLog({ value, onChange }: MapAssistedTripLogProps) {
  const [query, setQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const search = useLocationSearch(query);

  const previewStops = useMemo(
    () => value.map((s) => ({ sequence: s.sequence, lat: s.lat, lng: s.lng })),
    [value]
  );
  const preview = useRoutePreview(previewStops);

  const mutate = useCallback(
    (next: Omit<TripStop, 'sequence' | 'role'>[]) => onChange(withRoles(next)),
    [onChange]
  );

  const addStop = useCallback(
    (stop: Omit<TripStop, 'sequence' | 'role'>) => {
      mutate([...value, stop]);
    },
    [value, mutate]
  );

  const removeStop = useCallback(
    (sequence: number) => {
      mutate(value.filter((s) => s.sequence !== sequence));
    },
    [value, mutate]
  );

  const moveStop = useCallback(
    (sequence: number, direction: -1 | 1) => {
      const index = value.findIndex((s) => s.sequence === sequence);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= value.length) return;
      const next = [...value];
      [next[index], next[target]] = [next[target], next[index]];
      mutate(next);
    },
    [value, mutate]
  );

  const updateStopPosition = useCallback(
    (sequence: number, lat: number, lng: number) => {
      mutate(
        value.map((s) =>
          s.sequence === sequence
            ? { ...s, lat, lng, geocodeProvenance: 'map-drag' as const, address: undefined }
            : s
        )
      );
    },
    [value, mutate]
  );

  const addStopFromMapClick = useCallback(
    (lat: number, lng: number) => {
      addStop({
        label: `Pinned location (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
        lat,
        lng,
        geocodeProvenance: 'map-click',
      });
    },
    [addStop]
  );

  const routeGeometry = preview.data?.available ? preview.data.geometry : [];

  return (
    <div className="space-y-4">
      <div className="relative">
        <Label htmlFor="trip-stop-search" className="form-label">
          Add a stop
        </Label>
        <Input
          id="trip-stop-search"
          placeholder="Search for a place, e.g. Mt Pleasant, Harare"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
        />
        {showResults && query.trim().length >= 2 && (
          <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-md max-h-60 overflow-y-auto">
            {search.isFetching && (
              <div className="flex items-center gap-2 px-3 py-2 text-caption text-muted-foreground">
                <Spinner className="w-3 h-3" /> Searching…
              </div>
            )}
            {!search.isFetching && (search.data?.candidates.length ?? 0) === 0 && (
              <div className="px-3 py-2 text-caption text-muted-foreground">No locations found</div>
            )}
            {search.data?.candidates.map((candidate, i) => (
              <button
                key={`${candidate.lat}-${candidate.lng}-${i}`}
                type="button"
                className="block w-full text-left px-3 py-2 text-body-sm hover:bg-muted"
                onClick={() => {
                  addStop({
                    label: candidate.label,
                    lat: candidate.lat,
                    lng: candidate.lng,
                    address: candidate.address,
                    geocodeProvenance: 'nominatim-search',
                    geocodeProvider: 'nominatim',
                    geocodedAt: new Date().toISOString(),
                  });
                  setQuery('');
                  setShowResults(false);
                }}
              >
                {candidate.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-caption text-muted-foreground">
        You can also click directly on the map to drop a stop, or drag an existing pin to adjust it.
      </p>

      <div className="rounded-md border overflow-hidden" style={{ height: 320 }}>
        <MapAssistedTripLogMap
          stops={value}
          routeGeometry={routeGeometry}
          onAddStopAt={addStopFromMapClick}
          onMoveStop={updateStopPosition}
        />
      </div>

      <div className="space-y-2">
        {value.length === 0 && (
          <p className="text-body-sm text-muted-foreground">
            Add at least a start and an end stop above or by clicking the map.
          </p>
        )}
        {value.map((stop, i) => (
          <div key={stop.sequence} className="flex items-center gap-2 rounded-md border px-3 py-2">
            <span className="text-caption font-medium text-muted-foreground w-20 shrink-0">
              {roleLabel(stop.role, i, value.length)}
            </span>
            <span className="text-body-sm flex-1 truncate">{stop.label}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={i === 0}
              onClick={() => moveStop(stop.sequence, -1)}
              aria-label="Move stop up"
            >
              ↑
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={i === value.length - 1}
              onClick={() => moveStop(stop.sequence, 1)}
              aria-label="Move stop down"
            >
              ↓
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeStop(stop.sequence)}
              aria-label="Remove stop"
            >
              ✕
            </Button>
          </div>
        ))}
      </div>

      <div className="rounded-md border bg-muted/40 p-3 space-y-1">
        <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
          Map-derived distance
        </p>
        {value.length < 2 && (
          <p className="text-body-sm text-muted-foreground">Add at least two stops to see a route.</p>
        )}
        {value.length >= 2 && preview.isFetching && (
          <p className="text-body-sm text-muted-foreground">Calculating route…</p>
        )}
        {value.length >= 2 && !preview.isFetching && preview.data?.available === false && (
          <p className="text-body-sm text-destructive">{preview.data.reason}</p>
        )}
        {value.length >= 2 && !preview.isFetching && preview.data?.available && (
          <>
            <p className="text-heading-sm">
              {preview.data.totalDistanceKm.toFixed(1)} km{' '}
              <span className="text-caption font-normal text-muted-foreground">(map-derived, not GPS)</span>
            </p>
            <ul className="text-caption text-muted-foreground space-y-0.5">
              {preview.data.legs.map((leg, i) => (
                <li key={i}>
                  Leg {i + 1}: {leg.distanceKm.toFixed(1)} km
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="text-caption text-muted-foreground pt-1">
          This distance follows the road network between your stops. It is not a GPS reading -- no
          telemetry is used for a map-assisted trip. If this vehicle has an active tracker, consider
          recording the trip from its live GPS instead.
        </p>
      </div>
    </div>
  );
}
