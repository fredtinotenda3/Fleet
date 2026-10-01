// frontend/modules/trips/components/MapAssistedTripLogMap.tsx
//
// The Leaflet layer for the map-assisted trip log (PART 3). Loaded only
// client-side via next/dynamic from MapAssistedTripLog.tsx -- Leaflet
// touches `window` at module-eval time, same reason LiveMapPage dynamic-
// imports LiveMapLeaflet.
//
// Free OSM tiles, no key -- same provider this product already uses for
// the live fleet map (see LiveMapLeaflet.tsx's own header).
//
// WHAT THIS DRAWS, deliberately kept separate from LiveMapLeaflet's
// vehicle-position markers: numbered, draggable stop pins (green start,
// red end, blue waypoints) and the MAP-DERIVED route polyline. There is
// no vehicle position here at all -- this is a planning surface for
// where the trip WILL go, not a display of where a vehicle IS.

'use client';

import { useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMapEvents } from 'react-leaflet';
import type { TripStop } from '../types';

export interface MapAssistedTripLogMapProps {
  stops: TripStop[];
  /** [lng, lat] pairs from the latest route preview, or empty when none is available yet. */
  routeGeometry: [number, number][];
  onAddStopAt: (lat: number, lng: number) => void;
  onMoveStop: (sequence: number, lat: number, lng: number) => void;
  className?: string;
}

const DEFAULT_CENTER: [number, number] = [-17.825, 31.033];
const DEFAULT_ZOOM = 12;

function colorForRole(role: TripStop['role']): string {
  if (role === 'start') return '#0e8a5f';
  if (role === 'end') return '#b3261e';
  return '#2563eb';
}

function buildStopIcon(stop: TripStop, orderLabel: number): L.DivIcon {
  const color = colorForRole(stop.role);
  const size = 30;
  const html = `
    <div style="position:relative;width:${size}px;height:${size}px;">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="position:absolute;inset:0;">
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" style="fill:${color};stroke:#ffffff;stroke-width:2;" />
      </svg>
      <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:600;font-family:system-ui,sans-serif;">${orderLabel}</span>
    </div>`;
  return L.divIcon({ html, className: 'trip-stop-marker', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

/** Clicking empty map background adds a new stop at that location -- PART 3, item 8. Leaflet already suppresses this when the click lands on a marker (which has its own handler), so this never fights a marker drag. */
function AddStopOnMapClick({ onAddStopAt }: { onAddStopAt: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => onAddStopAt(e.latlng.lat, e.latlng.lng),
  });
  return null;
}

export function MapAssistedTripLogMap({
  stops,
  routeGeometry,
  onAddStopAt,
  onMoveStop,
  className,
}: MapAssistedTripLogMapProps) {
  const center = useMemo<[number, number]>(() => {
    if (stops.length === 0) return DEFAULT_CENTER;
    return [stops[0].lat, stops[0].lng];
  }, [stops]);

  const routeLatLngs = useMemo<L.LatLngExpression[]>(
    () => routeGeometry.map(([lng, lat]) => [lat, lng]),
    [routeGeometry]
  );

  return (
    <MapContainer
      center={center}
      zoom={DEFAULT_ZOOM}
      className={className}
      style={{ minHeight: 'inherit', width: '100%', height: '100%' }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <AddStopOnMapClick onAddStopAt={onAddStopAt} />

      {routeLatLngs.length >= 2 && (
        <Polyline
          positions={routeLatLngs}
          pathOptions={{ color: 'var(--primary, #2563eb)', weight: 3, dashArray: '0' }}
        />
      )}

      {stops.map((stop, i) => (
        <Marker
          key={stop.sequence}
          position={[stop.lat, stop.lng]}
          icon={buildStopIcon(stop, i + 1)}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const latlng = (e.target as L.Marker).getLatLng();
              onMoveStop(stop.sequence, latlng.lat, latlng.lng);
            },
          }}
        >
          <Tooltip direction="top" offset={[0, -16]}>
            <span className="text-xs">
              {stop.role === 'start' ? 'Start' : stop.role === 'end' ? 'End' : `Stop ${i + 1}`}: {stop.label}
            </span>
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
