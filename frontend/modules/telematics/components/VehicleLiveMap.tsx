// frontend/modules/telematics/components/VehicleLiveMap.tsx
//
// The map half of the Vehicle Operational Hub's live-instruments block --
// ONE vehicle's current position and recent breadcrumb, not the fleet.
//
// ---------------------------------------------------------------------
// WHY THIS ISN'T LiveMapLeaflet WITH A ONE-VEHICLE ARRAY
// ---------------------------------------------------------------------
// LiveMapLeaflet's own contract is fleet-shaped: click-to-deselect on
// background click, per-marker interpolation shared across the whole
// fleet via one rAF loop, multi-vehicle bounds fitting, geofences drawn
// for every vehicle on the tenant. Feeding it a one-element array would
// carry all of that machinery to answer a question it wasn't built to
// ask ("where is THIS vehicle"), and would still require a
// `LiveMapVehicle`-shaped object this screen does not otherwise need to
// assemble. TripPlaybackMap.tsx already established the precedent this
// file follows: a second, smaller Leaflet component that deliberately
// reuses the fleet map's hard-won conventions (marker-as-inline-SVG,
// colour via a `style` declaration rather than an SVG presentation
// attribute, the shared OSM tile layer, fit-bounds-once) rather than
// wiring a one-vehicle case through the fleet component. See its header
// for the fuller version of this rationale.
//
// ---------------------------------------------------------------------
// WHAT IT REFUSES TO DO
// ---------------------------------------------------------------------
//   * It never plots a vehicle that has no reported position. The
//     camera falls back to a fixed depot view (same fallback centre
//     LiveMapLeaflet uses) so an untracked/never-reported vehicle shows
//     an honest "no position reported" map, not a marker at (0, 0) or at
//     the depot.
//   * It never draws a heading wedge from a stale bearing. Heading is
//     suppressed once the vehicle is offline, same rule as the fleet
//     map -- a last-known bearing says nothing about which way a parked
//     vehicle is now facing.
//   * It never extrapolates the breadcrumb forward. The trail is exactly
//     the points the route-history endpoint returned, plus the current
//     fix; nothing is interpolated between polls.

'use client';

import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Tooltip, Polyline, useMap } from 'react-leaflet';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { glyphForVehicleType, glyphPathFragment } from '../utils/vehicle-glyph';
import type { LiveMapAlertState, LiveMapRoutePoint, LiveMapVehicleStatus } from '../types';

const DEFAULT_CENTER: [number, number] = [-17.825, 31.033];
const DEFAULT_ZOOM = 13;
const SINGLE_VEHICLE_ZOOM = 15;
const FIT_BOUNDS_PADDING: [number, number] = [40, 40];
const MARKER_SIZE = 44;
const WEDGE_REACH = 17;
const WEDGE_HALF_WIDTH = 10;
const WEDGE_TAIL = 9;
const WEDGE_NOTCH = 3.5;
const DISC_RADIUS = 7;

/** Same palette LiveMapLeaflet uses, so a vehicle reads the same colour whether seen on the fleet map or on its own page. */
const STATUS_COLOR_VAR: Record<LiveMapVehicleStatus, string> = {
  moving: 'var(--map-marker-moving, #0e8a5f)',
  idle: 'var(--map-marker-idle, #a15c00)',
  offline: 'var(--map-marker-offline, #6b7488)',
};
const ALERT_COLOR_VAR = 'var(--map-marker-alert, #b3261e)';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Builds the marker icon. Deliberately mirrors LiveMapLeaflet's
 * `buildVehicleIcon` (colour-as-CSS-declaration, disc + heading wedge +
 * glyph cut-out) rather than importing it -- that function is not
 * exported, and its `active`/halo concept has no meaning on a page that
 * always shows exactly one vehicle.
 */
function buildMarkerIcon(options: {
  colorVar: string;
  heading?: number;
  showHeading: boolean;
  label: string;
  vehicleType?: string | null;
}): L.DivIcon {
  const { colorVar, heading, showHeading, label, vehicleType } = options;
  const size = MARKER_SIZE;
  const c = size / 2;
  const hasHeading = showHeading && typeof heading === 'number' && Number.isFinite(heading);

  const wedge = hasHeading
    ? `<path d="M ${c} ${c - WEDGE_REACH}
               L ${c + WEDGE_HALF_WIDTH} ${c + WEDGE_TAIL}
               L ${c} ${c + WEDGE_NOTCH}
               L ${c - WEDGE_HALF_WIDTH} ${c + WEDGE_TAIL} Z"
             style="fill:currentColor;stroke:var(--map-marker-ring, #ffffff);stroke-width:1.75;stroke-linejoin:round;"
             transform="rotate(${(heading as number) % 360} ${c} ${c})" />`
    : '';

  const glyph = glyphForVehicleType(vehicleType);
  const glyphSvg = `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"
           style="position:absolute;inset:0;color:var(--map-marker-ring, #ffffff);" aria-hidden="true" focusable="false">
        ${glyphPathFragment(glyph, size, 0.34)}
      </svg>`;

  const html = `
    <div class="fleet-vehicle-marker__body" role="img" aria-label="${escapeHtml(label)}"
         style="position:relative;width:${size}px;height:${size}px;color:${colorVar};">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"
           style="position:absolute;inset:0;overflow:visible;" aria-hidden="true" focusable="false">
        ${wedge}
        <circle cx="${c}" cy="${c}" r="${DISC_RADIUS}"
                style="fill:currentColor;stroke:var(--map-marker-ring, #ffffff);stroke-width:2.5;" />
      </svg>
      ${glyphSvg}
    </div>`;

  return L.divIcon({ html, className: 'fleet-vehicle-marker', iconSize: [size, size], iconAnchor: [c, c] });
}

/** Fits to the breadcrumb + current fix once data first arrives, then leaves the operator's own pan/zoom alone -- refitting on every 10s poll would fight anyone who has zoomed in to read a street name. */
function FitOnce({ points }: { points: L.LatLngExpression[] }) {
  const map = useMap();
  const hasFit = useRef(false);

  useEffect(() => {
    if (hasFit.current || points.length === 0) return;
    hasFit.current = true;
    if (points.length === 1) {
      map.setView(points[0], SINGLE_VEHICLE_ZOOM);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: FIT_BOUNDS_PADDING });
    }
  }, [points, map]);

  return null;
}

export interface VehicleLiveMapProps {
  licensePlate: string;
  vehicleType?: string | null;
  status: LiveMapVehicleStatus;
  alert: LiveMapAlertState | null;
  location: {
    lat: number;
    lng: number;
    speed: number;
    heading?: number;
    timestamp: string;
  } | null;
  /** Chronological breadcrumb trail, oldest first -- see useVehicleRouteHistory. */
  routePoints: LiveMapRoutePoint[];
  className?: string;
}

/**
 * ONE vehicle's live position and recent trail. `location: null` renders
 * an honest "no position reported" map rather than a marker anywhere --
 * see the file header.
 */
export function VehicleLiveMap({
  licensePlate,
  vehicleType,
  status,
  alert,
  location,
  routePoints,
  className,
}: VehicleLiveMapProps) {
  const trailLatLngs = useMemo<L.LatLngExpression[]>(
    () => routePoints.map((p): L.LatLngExpression => [p.lat, p.lng]),
    [routePoints]
  );

  const fitPoints = useMemo<L.LatLngExpression[]>(() => {
    const points = [...trailLatLngs];
    if (location) points.push([location.lat, location.lng]);
    return points;
  }, [trailLatLngs, location]);

  const icon = useMemo(
    () =>
      buildMarkerIcon({
        colorVar: alert ? ALERT_COLOR_VAR : STATUS_COLOR_VAR[status],
        heading: location?.heading,
        // Same rule as the fleet map: a last-known bearing is not a
        // claim about which way a parked/offline vehicle now faces.
        showHeading: status !== 'offline',
        label: `${licensePlate}${alert ? ' -- alert' : ''}`,
        vehicleType,
      }),
    [alert, status, location?.heading, licensePlate, vehicleType]
  );

  return (
    <div className={cn('relative', className)}>
      <MapContainer
        center={location ? [location.lat, location.lng] : DEFAULT_CENTER}
        zoom={location ? SINGLE_VEHICLE_ZOOM : DEFAULT_ZOOM}
        scrollWheelZoom
        className="w-full h-full"
        style={{ minHeight: 'inherit' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitOnce points={fitPoints} />

        {trailLatLngs.length >= 2 && (
          <Polyline positions={trailLatLngs} pathOptions={{ color: 'var(--primary, #2563eb)', weight: 2.5 }} />
        )}

        {location && (
          <Marker position={[location.lat, location.lng]} icon={icon} zIndexOffset={500}>
            <Tooltip permanent direction="right" offset={[14, 0]} opacity={1} className="fleet-map-tooltip">
              <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-md shadow-sm bg-popover text-popover-foreground whitespace-nowrap">
                {licensePlate}
                {Number.isFinite(location.speed) && <span>&middot; {Math.round(location.speed)} km/h</span>}
              </span>
            </Tooltip>
          </Marker>
        )}
      </MapContainer>

      {/*
        A depot-centred map with no marker looks identical to a broken
        one. Naming the state -- over the map, not instead of it -- keeps
        the camera fallback from being mistaken for a real position.
      */}
      {!location && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 p-2 pointer-events-none">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-popover/95 px-2.5 py-1 text-caption text-muted-foreground shadow-sm">
            <MapPin className="w-3 h-3" aria-hidden="true" />
            No position reported for this vehicle yet
          </span>
        </div>
      )}
    </div>
  );
}