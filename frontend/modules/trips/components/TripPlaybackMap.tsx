// frontend/modules/trips/components/TripPlaybackMap.tsx
//
// The map half of trip playback. Client-only: Leaflet touches `window`
// at module-eval time, so this must be reached through a `next/dynamic`
// import with `ssr: false` -- TripPlaybackPanel does that, and nothing
// else should import this module directly.
//
// ---------------------------------------------------------------------
// WHY IT LOOKS LIKE LiveMapLeaflet
// ---------------------------------------------------------------------
// Because it deliberately reuses that file's hard-won conventions rather
// than rediscovering them:
//
//   * Leaflet's stylesheets are imported ONCE in app/layout.tsx, in a
//     load-bearing order (leaflet.css then leaflet-overrides.css).
//     Importing them here would fight that.
//   * Markers are `L.divIcon`s built from inline SVG. Leaflet's DEFAULT
//     icon points at image URLs the bundler never copies, so a plain
//     <Marker> with no `icon` renders as a broken image.
//   * Colour goes in a `style` DECLARATION, never an SVG presentation
//     attribute: `fill="var(--x)"` silently fails in Safari.
//   * The route uses the same OpenStreetMap tile layer and attribution.
//
// The map fits the route ONCE, on load. After that the operator's pan
// and zoom are theirs -- a map that re-centres itself every frame is
// unusable for the thing playback is for, which is looking closely at
// one part of a journey.

'use client';

import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet';

import { cn } from '@/lib/utils';
import { glyphForVehicleType, glyphPathFragment } from '@/frontend/modules/telematics/utils/vehicle-glyph';
import { playbackPath, type PlaybackFrame, type TripPlaybackPoint } from '../utils/playback';

const DEFAULT_ZOOM = 14;
const FIT_BOUNDS_PADDING: [number, number] = [48, 48];
const MARKER_SIZE = 40;

/**
 * The moving marker.
 *
 * Same construction as the live map's vehicle marker, minus the status
 * colours and the alert ring: during playback there is exactly one
 * vehicle and its live status is irrelevant to where it was last March.
 * The heading wedge is drawn only when the reading actually reported a
 * heading -- `heading: 0` is due north, not "unknown", which is why the
 * server refuses to default it.
 */
function buildPlaybackIcon(options: { heading?: number; vehicleType?: string | null }): L.DivIcon {
  const size = MARKER_SIZE;
  const c = size / 2;
  const hasHeading = typeof options.heading === 'number' && Number.isFinite(options.heading);
  const glyph = glyphForVehicleType(options.vehicleType);

  const wedge = hasHeading
    ? `<g transform="rotate(${options.heading} ${c} ${c})">
         <path d="M ${c} ${c - 16} L ${c + 8} ${c - 5} L ${c - 8} ${c - 5} Z"
               style="fill:currentColor;opacity:0.85" />
       </g>`
    : '';

  const html = `
    <div style="color: var(--map-marker-moving, #0e8a5f); width:${size}px; height:${size}px;">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
        <circle cx="${c}" cy="${c}" r="${c - 2}"
                style="fill:var(--map-marker-ring, #ffffff);stroke:currentColor;stroke-width:2" />
        ${wedge}
        ${glyphPathFragment(glyph, size, 0.34)}
      </svg>
    </div>`;

  return L.divIcon({
    html,
    className: 'fleet-vehicle-marker',
    iconSize: [size, size],
    iconAnchor: [c, c],
  });
}

/** Fits the whole route once, then leaves the viewport alone. */
function FitRouteOnce({ path }: { path: Array<[number, number]> }) {
  const map = useMap();
  const hasFit = useRef(false);

  useEffect(() => {
    if (hasFit.current || path.length === 0) return;
    hasFit.current = true;
    if (path.length === 1) {
      map.setView(path[0], DEFAULT_ZOOM);
    } else {
      map.fitBounds(L.latLngBounds(path), { padding: FIT_BOUNDS_PADDING });
    }
  }, [path, map]);

  return null;
}

/**
 * Keeps the moving marker in view WITHOUT stealing the viewport.
 *
 * Pans only when the marker has left the visible area, and never zooms.
 * Re-centring on every frame would make it impossible to look at a
 * junction while the playhead runs; never panning at all would lose the
 * vehicle off-screen on a long trip.
 */
function KeepMarkerVisible({ position, follow }: { position: [number, number]; follow: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (!follow) return;
    if (!map.getBounds().pad(-0.15).contains(position)) {
      map.panTo(position, { animate: true });
    }
  }, [position, follow, map]);

  return null;
}

interface TripPlaybackMapProps {
  points: TripPlaybackPoint[];
  frame: PlaybackFrame | null;
  vehicleType?: string | null;
  licensePlate: string;
  /** Pan to keep the marker on screen. Off while the operator is scrubbing. */
  follow: boolean;
  className?: string;
}

export function TripPlaybackMap({
  points,
  frame,
  vehicleType,
  licensePlate,
  follow,
  className,
}: TripPlaybackMapProps) {
  const path = useMemo(() => playbackPath(points), [points]);
  const icon = useMemo(
    () => buildPlaybackIcon({ heading: frame?.heading, vehicleType }),
    [frame?.heading, vehicleType]
  );

  const center: [number, number] = frame
    ? [frame.lat, frame.lng]
    : path[0] ?? [-17.825, 31.033];

  return (
    <MapContainer
      center={center}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      className={cn('w-full h-full', className)}
      style={{ minHeight: 'inherit' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <FitRouteOnce path={path} />

      {path.length >= 2 && (
        <Polyline positions={path} pathOptions={{ color: 'var(--primary, #2563eb)', weight: 3 }} />
      )}

      {/*
        Start and end are CircleMarkers rather than pin markers: they are
        vectors, so they need no icon asset, and they read as "the track
        begins here" rather than as two more vehicles.
      */}
      {path.length > 0 && (
        <CircleMarker
          center={path[0]}
          radius={6}
          pathOptions={{ color: 'var(--success, #0e8a5f)', fillOpacity: 0.9, weight: 2 }}
        >
          <Tooltip direction="top" className="fleet-map-tooltip">
            <span className="px-2 py-1 text-xs rounded-md shadow-sm bg-popover text-popover-foreground">
              Trip start
            </span>
          </Tooltip>
        </CircleMarker>
      )}
      {path.length > 1 && (
        <CircleMarker
          center={path[path.length - 1]}
          radius={6}
          pathOptions={{ color: 'var(--destructive, #b3261e)', fillOpacity: 0.9, weight: 2 }}
        >
          <Tooltip direction="top" className="fleet-map-tooltip">
            <span className="px-2 py-1 text-xs rounded-md shadow-sm bg-popover text-popover-foreground">
              Trip end
            </span>
          </Tooltip>
        </CircleMarker>
      )}

      {frame && (
        <>
          <Marker position={[frame.lat, frame.lng]} icon={icon} zIndexOffset={500}>
            <Tooltip permanent direction="right" offset={[14, 0]} opacity={1} className="fleet-map-tooltip">
              <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-md shadow-sm bg-popover text-popover-foreground whitespace-nowrap">
                {licensePlate}
                {typeof frame.speed === 'number' && <span>· {Math.round(frame.speed)} km/h</span>}
              </span>
            </Tooltip>
          </Marker>
          <KeepMarkerVisible position={[frame.lat, frame.lng]} follow={follow} />
        </>
      )}
    </MapContainer>
  );
}
