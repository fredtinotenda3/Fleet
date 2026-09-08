// frontend/modules/telematics/components/LiveMapLeaflet.tsx
//
// Real map background via Leaflet + free OpenStreetMap tiles, replacing
// LiveMapSvg's dependency-free equirectangular-projection grid. Same
// props, same data shapes (LiveMapVehicle/LiveMapGeofence/LiveMapRoutePoint)
// -- this is a drop-in visual swap, not a data-model change. All
// fetching, polling, and demo-mode state still live in LiveMapPage; this
// component is pure presentation, same as LiveMapSvg was.
//
// No paid provider, no API key, no billing: tiles are served from the
// standard free OSM tile endpoint (tile.openstreetmap.org), which is
// exactly what the Leaflet "quick start" documents and is fine at the
// traffic level a single fleet dashboard generates. If this product
// ever needs higher-volume tile traffic, OSM's usage policy asks for a
// dedicated/paid tile provider at that point -- not a concern for this
// change.
//
// STYLESHEETS ARE NOT IMPORTED HERE. Both 'leaflet/dist/leaflet.css'
// and the marker/tooltip overrides in 'app/leaflet-overrides.css' are
// imported by app/layout.tsx, in that order. The order matters: Leaflet
// ships default marker and tooltip chrome that only loses to a rule
// declared after it. (An earlier version of this comment claimed the
// Leaflet stylesheet was imported in this file. It never was -- corrected
// rather than left as a maintenance trap.)

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Tooltip, CircleMarker, Polyline, Polygon, Circle, useMap, useMapEvents } from 'react-leaflet';
import { cn } from '@/lib/utils';
import {
  glyphForVehicleType,
  glyphPathFragment,
  glyphLabel,
} from '../utils/vehicle-glyph';
import {
  planMovement,
  advanceTracks,
  type InterpolationTrack,
  type MarkerPosition,
} from '../utils/marker-interpolation';
import type { LiveMapVehicle, LiveMapGeofence, LiveMapRoutePoint } from '../types';

interface LiveMapLeafletProps {
  vehicles: LiveMapVehicle[];
  geofences: LiveMapGeofence[];
  routePoints: LiveMapRoutePoint[];
  selectedVehicleId: string | null;
  onSelectVehicle: (vehicleId: string | null) => void;
  className?: string;
}

// Depot default used when nothing has a position yet -- same fallback
// centre LiveMapSvg used, so an empty/loading map looks the same place
// as before rather than defaulting to Leaflet's usual (0, 0).
const DEFAULT_CENTER: [number, number] = [-17.825, 31.033];
const DEFAULT_ZOOM = 13;
const FIT_BOUNDS_PADDING: [number, number] = [48, 48];

/**
 * Marker colours, as references to the custom properties declared in
 * app/leaflet-overrides.css -- green moving, amber idle, grey offline,
 * with red reserved for the alert override below.
 *
 * These are consumed through an inline `style` DECLARATION, never
 * through an SVG presentation attribute. That distinction is the whole
 * reason markers previously rendered as flat grey dots regardless of
 * status: `fill="var(--success, #16a34a)"` puts a CSS function inside an
 * XML presentation attribute, which browsers do not reliably resolve
 * (Safari in particular), so the fill fell back and every marker looked
 * identical. `style="fill: var(...)"` is an ordinary CSS declaration and
 * resolves everywhere -- and, unlike a JS-resolved hex, it keeps
 * following the theme when the user toggles dark mode without any
 * observer wiring.
 */
const STATUS_COLOR_VAR: Record<LiveMapVehicle['status'], string> = {
  moving: 'var(--map-marker-moving, #0e8a5f)',
  idle: 'var(--map-marker-idle, #a15c00)',
  offline: 'var(--map-marker-offline, #6b7488)',
};

/** An alerting vehicle is drawn red whatever its motion state -- see LiveMapVehicleStatus's doc comment for why alert is not a status. */
const ALERT_COLOR_VAR = 'var(--map-marker-alert, #b3261e)';

/**
 * MARKER GEOMETRY, in one place.
 *
 * The direction wedge was previously a 13px-tall triangle on a 30px
 * icon, which at typical fleet zoom levels read as a slight bulge on a
 * dot rather than as a heading -- the information was technically drawn
 * and practically unreadable.
 *
 * These proportions make the ARROW the dominant shape: a 17px reach and
 * a notched tail against a 7px disc, on a 44px icon. The notch (a
 * concave rear edge rather than a flat one) is what makes the shape read
 * as a chevron pointing somewhere rather than as a generic triangle,
 * which matters most when several vehicles sit close together.
 *
 * `iconSize` grows with the marker so Leaflet's own hit box matches what
 * is drawn -- a wedge painted outside the icon box would be visible but
 * not clickable.
 */
const MARKER_SIZE = 44;
/** Distance from centre to the arrow tip. The number to change to resize the arrow. */
const WEDGE_REACH = 17;
/** Half-width at the arrow's widest point. */
const WEDGE_HALF_WIDTH = 10;
/** How far the trailing corners sit behind the centre. */
const WEDGE_TAIL = 9;
/** How far the concave notch cuts back in, between the trailing corners. */
const WEDGE_NOTCH = 3.5;
/** The status disc at the marker's centre. Deliberately small relative to the wedge. */
const DISC_RADIUS = 7;

const STATUS_LABEL: Record<LiveMapVehicle['status'], string> = {
  moving: 'Moving',
  idle: 'Idle',
  offline: 'Offline',
};

function vehicleLatLngs(vehicles: LiveMapVehicle[]): L.LatLngExpression[] {
  return vehicles.filter((v) => v.position).map((v) => [v.position!.lat, v.position!.lng]);
}

function geofenceLatLngs(geofences: LiveMapGeofence[]): L.LatLngExpression[] {
  const out: L.LatLngExpression[] = [];
  for (const g of geofences) {
    const coords = g.coordinates as any;
    if (g.type === 'circle' && coords?.center) {
      out.push([coords.center.lat, coords.center.lng]);
    } else if ((g.type === 'polygon' || g.type === 'route') && Array.isArray(coords?.points)) {
      for (const p of coords.points) out.push([p.lat, p.lng]);
    }
  }
  return out;
}

/**
 * Builds the vehicle marker as an inline SVG string -- no external image
 * asset, so Leaflet's default-icon-path problem (the classic broken
 * image when bundling Leaflet with webpack/Next, caused by its default
 * icon URLs pointing at files the bundler never copies) does not arise.
 *
 * THREE THINGS THIS FUNCTION IS CAREFUL ABOUT:
 *
 *  1. COLOUR IS SET AS A CSS DECLARATION, NOT A PRESENTATION ATTRIBUTE.
 *     The wrapper carries `style="color: <var>"` and every shape uses
 *     `fill: currentColor` in its own style attribute. See
 *     STATUS_COLOR_VAR above for why the previous
 *     `fill="var(--success)"` form did not work.
 *  2. THE ICON GETS AN EXPLICIT CLASS. `fleet-vehicle-marker` is what
 *     app/leaflet-overrides.css hangs the "no white box, no border"
 *     rules on. Passing `className: ''` (as before) merely avoids
 *     Leaflet's `leaflet-div-icon` default; it gives us nothing to
 *     target if a future Leaflet version changes that default.
 *  3. THE HEADING WEDGE IS DRAWN ONLY WHEN A HEADING EXISTS. `heading`
 *     is optional all the way from the provider adapter (see
 *     TelematicsLocation.heading): a device that reports no bearing gets
 *     a plain disc, not an arrow pointing due north. It is also
 *     suppressed for offline vehicles, whose last-known bearing says
 *     nothing about where they are pointing now.
 */
function buildVehicleIcon(options: {
  colorVar: string;
  heading?: number;
  showHeading: boolean;
  active: boolean;
  label: string;
  /** Free-text Vehicle.vehicle_type; resolved to a silhouette. */
  vehicleType?: string | null;
}): L.DivIcon {
  const { colorVar, heading, showHeading, active, label, vehicleType } = options;
  const size = MARKER_SIZE;
  const c = size / 2;
  const hasHeading = showHeading && typeof heading === 'number' && Number.isFinite(heading);

  const halo = active
    ? `<span class="fleet-vehicle-marker__halo" style="position:absolute;inset:-8px;border-radius:9999px;background:currentColor;opacity:0.22;"></span>`
    : '';

  /**
   * The direction wedge, drawn with its tip at 12 o'clock and rotated to
   * the vehicle's bearing.
   *
   * Sized from the constants above rather than from literals so "make
   * the arrow bigger" stays a one-number change. The tip now reaches
   * WEDGE_REACH (17px) from the centre against a 7px disc, so the arrow
   * -- not the dot -- is the dominant shape: at a glance the map reads
   * as headings, which is the whole point of showing bearing on a fleet
   * map.
   *
   * TWO THINGS KEEP IT LEGIBLE OVER RASTER TILES:
   *  - a contrast ring (`--map-marker-ring`, the surface colour) stroked
   *    around the wedge as well as the disc. Without it a green arrow
   *    over parkland or an amber one over a sandy area disappears.
   *  - `stroke-linejoin: round`, so the tip stays a clean point instead
   *    of growing a spike at this stroke width.
   *
   * Colour comes from `currentColor`, which the wrapper sets from a CSS
   * custom property. NOT an SVG presentation attribute -- see
   * STATUS_COLOR_VAR for why `fill="var(--success)"` silently fell back
   * and painted every marker the same grey.
   */
  const wedge = hasHeading
    ? `<path d="M ${c} ${c - WEDGE_REACH}
               L ${c + WEDGE_HALF_WIDTH} ${c + WEDGE_TAIL}
               L ${c} ${c + WEDGE_NOTCH}
               L ${c - WEDGE_HALF_WIDTH} ${c + WEDGE_TAIL} Z"
             style="fill:currentColor;stroke:var(--map-marker-ring, #ffffff);stroke-width:1.75;stroke-linejoin:round;"
             transform="rotate(${(heading as number) % 360} ${c} ${c})" />`
    : '';

  /**
   * The vehicle silhouette, drawn OVER the disc in the RING colour so it
   * reads as a cut-out rather than as a second coloured shape competing
   * with the heading wedge.
   *
   * In its own SVG layer above the disc deliberately: inside the same
   * <svg> as the wedge it would inherit `currentColor` and vanish
   * against the disc it sits on.
   */
  const glyph = glyphForVehicleType(vehicleType);
  const glyphSvg = `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"
           style="position:absolute;inset:0;color:var(--map-marker-ring, #ffffff);" aria-hidden="true" focusable="false">
        ${glyphPathFragment(glyph, size, 0.34)}
      </svg>`;

  const html = `
    <div class="fleet-vehicle-marker__body" role="img" aria-label="${escapeHtml(label)}"
         style="position:relative;width:${size}px;height:${size}px;color:${colorVar};">
      ${halo}
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"
           style="position:absolute;inset:0;overflow:visible;" aria-hidden="true" focusable="false">
        ${wedge}
        <circle cx="${c}" cy="${c}" r="${DISC_RADIUS}"
                style="fill:currentColor;stroke:var(--map-marker-ring, #ffffff);stroke-width:2.5;" />
      </svg>
      ${glyphSvg}
    </div>`;

  return L.divIcon({
    html,
    className: 'fleet-vehicle-marker',
    iconSize: [size, size],
    iconAnchor: [c, c],
  });
}

/** The marker html is assembled as a string, so anything interpolated into an attribute is escaped. License plates are tenant-supplied text. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function GeofenceShape({ geofence }: { geofence: LiveMapGeofence }) {
  const coords = geofence.coordinates as any;
  const primary = 'var(--primary, #2563eb)';

  if (geofence.type === 'circle' && coords?.center && typeof coords.radius === 'number') {
    return (
      <Circle
        center={[coords.center.lat, coords.center.lng]}
        // Real geographic radius (metres), unlike the fixed-pixel
        // marker LiveMapSvg drew for every circle geofence regardless
        // of its actual size -- Leaflet projects this correctly at any
        // zoom level, so this is strictly more accurate, not just a
        // like-for-like swap.
        radius={coords.radius}
        pathOptions={{
          color: primary,
          weight: 1.5,
          fillOpacity: 0.12,
          dashArray: geofence.active ? undefined : '4 3',
        }}
      />
    );
  }

  if ((geofence.type === 'polygon' || geofence.type === 'route') && Array.isArray(coords?.points)) {
    const positions: L.LatLngExpression[] = coords.points.map((p: { lat: number; lng: number }) => [p.lat, p.lng]);
    if (geofence.type === 'route') {
      return (
        <Polyline
          positions={positions}
          pathOptions={{ color: primary, weight: 2, dashArray: '6 4', opacity: geofence.active ? 0.7 : 0.3 }}
        />
      );
    }
    return (
      <Polygon
        positions={positions}
        pathOptions={{
          color: primary,
          weight: 1.5,
          fillOpacity: 0.1,
          dashArray: geofence.active ? undefined : '4 3',
        }}
      />
    );
  }

  return null;
}

/** Fits the map to every vehicle/geofence point once real data arrives, then leaves the user's own pan/zoom alone -- re-fitting on every 10s poll would fight anyone who has manually navigated the map. */
function FitBoundsOnce({ points }: { points: L.LatLngExpression[] }) {
  const map = useMap();
  const hasFit = useRef(false);

  useEffect(() => {
    if (hasFit.current || points.length === 0) return;
    hasFit.current = true;
    if (points.length === 1) {
      map.setView(points[0], DEFAULT_ZOOM);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: FIT_BOUNDS_PADDING });
    }
  }, [points, map]);

  return null;
}

/** Clicking empty map background clears the selection, matching LiveMapSvg's whole-canvas onClick. Leaflet already stops this event from firing when the click lands on a marker/shape, so this never fights a marker's own click handler. */
function DeselectOnMapClick({ onSelectVehicle }: { onSelectVehicle: (vehicleId: string | null) => void }) {
  useMapEvents({ click: () => onSelectVehicle(null) });
  return null;
}

/**
 * Eases every marker from where it is drawn to where the latest poll
 * says it is.
 *
 * ONE requestAnimationFrame loop for the whole fleet, not a timer per
 * marker. At 500 vehicles that is one callback per frame instead of five
 * hundred, and the per-marker version is how a live map becomes unusable
 * on a fleet large enough to need one.
 *
 * The loop only runs while something is actually moving, and cancels
 * itself when every track finishes -- a parked fleet costs nothing.
 *
 * The policy (animate / snap / ignore) lives in marker-interpolation.ts
 * as pure functions so it can be tested without a browser, a map or a
 * clock. This hook is only the plumbing.
 */
function useInterpolatedPositions(
  vehicles: LiveMapVehicle[]
): Map<string, MarkerPosition> {
  const [rendered, setRendered] = useState<Map<string, MarkerPosition>>(new Map());
  const renderedRef = useRef(rendered);
  const tracksRef = useRef<Map<string, InterpolationTrack>>(new Map());
  const frameRef = useRef<number | null>(null);

  renderedRef.current = rendered;

  useEffect(() => {
    const now = performance.now();
    const next = new Map(renderedRef.current);
    let changed = false;

    const liveIds = new Set<string>();

    for (const vehicle of vehicles) {
      if (!vehicle.position) continue;
      liveIds.add(vehicle.vehicleId);

      const target: MarkerPosition = { lat: vehicle.position.lat, lng: vehicle.position.lng };
      const plan = planMovement(renderedRef.current.get(vehicle.vehicleId), target, { now });

      if (plan.action === 'snap') {
        tracksRef.current.delete(vehicle.vehicleId);
        next.set(vehicle.vehicleId, plan.to);
        changed = true;
      } else if (plan.action === 'animate') {
        tracksRef.current.set(vehicle.vehicleId, plan.track);
      }
      // 'ignore' -- GPS jitter on a stationary vehicle. Leaving the
      // marker exactly where it is stops a parked fleet shimmering.
    }

    // Drop state for vehicles that have left the payload, so the maps do
    // not grow without bound across a long session.
    for (const id of next.keys()) {
      if (!liveIds.has(id)) {
        next.delete(id);
        tracksRef.current.delete(id);
        changed = true;
      }
    }

    if (changed) setRendered(next);
  }, [vehicles]);

  useEffect(() => {
    if (tracksRef.current.size === 0) return;

    const step = () => {
      const { positions, finished } = advanceTracks(tracksRef.current, performance.now());
      for (const id of finished) tracksRef.current.delete(id);

      if (positions.size > 0) {
        setRendered((current) => {
          const merged = new Map(current);
          for (const [id, position] of positions) merged.set(id, position);
          return merged;
        });
      }

      frameRef.current = tracksRef.current.size > 0 ? requestAnimationFrame(step) : null;
    };

    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [rendered]);

  return rendered;
}

export function LiveMapLeaflet({
  vehicles,
  geofences,
  routePoints,
  selectedVehicleId,
  onSelectVehicle,
  className,
}: LiveMapLeafletProps) {
  const [hoveredVehicleId, setHoveredVehicleId] = useState<string | null>(null);
  const activeVehicle = hoveredVehicleId ?? selectedVehicleId;

  /**
   * Drawn positions, eased toward the polled ones.
   *
   * NEVER extrapolated past the last known fix -- see the header of
   * marker-interpolation.ts. The marker lags reality by up to the
   * animation duration; it never leads it, because a marker drawn
   * somewhere the platform has no evidence the vehicle has been is a
   * fabricated measurement rendered identically to a real one.
   */
  const drawnPositions = useInterpolatedPositions(vehicles);

  const fitPoints = useMemo(
    () => [...vehicleLatLngs(vehicles), ...geofenceLatLngs(geofences)],
    [vehicles, geofences]
  );

  const routeLatLngs = useMemo<L.LatLngExpression[]>(
    () => routePoints.map((p) => [p.lat, p.lng]),
    [routePoints]
  );

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      className={cn('w-full h-full', className)}
      style={{ minHeight: 'inherit' }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <FitBoundsOnce points={fitPoints} />
      <DeselectOnMapClick onSelectVehicle={onSelectVehicle} />

      {geofences.map((g) => (
        <GeofenceShape key={g.id} geofence={g} />
      ))}

      {routeLatLngs.length >= 2 && (
        <Polyline positions={routeLatLngs} pathOptions={{ color: 'var(--primary, #2563eb)', weight: 2.5 }} />
      )}
      {routePoints.length > 0 && (
        <CircleMarker
          center={[routePoints[0].lat, routePoints[0].lng]}
          radius={4}
          pathOptions={{ color: 'var(--primary, #2563eb)', fillOpacity: 0.5, opacity: 0 }}
        />
      )}

      {vehicles.map((vehicle) => {
        if (!vehicle.position) return null;
        // Falls back to the true fix on the first frame, before the
        // interpolation state has seen this vehicle.
        const drawn = drawnPositions.get(vehicle.vehicleId) ?? vehicle.position;
        const selected = vehicle.vehicleId === selectedVehicleId;
        const active = activeVehicle === vehicle.vehicleId;
        // Alert overrides the status colour but NOT the heading wedge --
        // a red marker still shows which way the vehicle is pointing.
        const colorVar = vehicle.alert ? ALERT_COLOR_VAR : STATUS_COLOR_VAR[vehicle.status];
        const label = [
          vehicle.licensePlate,
          glyphLabel(glyphForVehicleType(vehicle.vehicleType)),
          STATUS_LABEL[vehicle.status],
          vehicle.alert ? `alert: ${vehicle.alert.reasons[0]}` : null,
          vehicle.stale ? 'stale fix' : null,
        ]
          .filter(Boolean)
          .join(', ');

        const icon = buildVehicleIcon({
          colorVar,
          vehicleType: vehicle.vehicleType,
          heading: vehicle.position.heading,
          // An offline vehicle's last-known bearing describes where it
          // WAS pointing, not where it is pointing; don't assert it.
          showHeading: vehicle.status !== 'offline',
          active: selected || active,
          label,
        });

        return (
          <Marker
            key={vehicle.vehicleId}
            position={[drawn.lat, drawn.lng]}
            icon={icon}
            eventHandlers={{
              click: () => onSelectVehicle(selected ? null : vehicle.vehicleId),
              mouseover: () => setHoveredVehicleId(vehicle.vehicleId),
              mouseout: () => setHoveredVehicleId((id) => (id === vehicle.vehicleId ? null : id)),
            }}
          >
            {active && (
              <Tooltip permanent direction="right" offset={[12, 0]} opacity={1} className="fleet-map-tooltip">
                <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-md shadow-sm bg-popover text-popover-foreground whitespace-nowrap">
                  {vehicle.alert && (
                    <span
                      className="inline-block rounded-full h-1.5 w-1.5"
                      style={{ background: ALERT_COLOR_VAR }}
                      aria-hidden="true"
                    />
                  )}
                  {vehicle.licensePlate} · {Math.round(vehicle.position.speed)} km/h
                  {vehicle.stale && <span className="text-muted-foreground">· stale</span>}
                </span>
              </Tooltip>
            )}
          </Marker>
        );
      })}
    </MapContainer>
  );
}