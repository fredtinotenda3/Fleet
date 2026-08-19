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
}): L.DivIcon {
  const { colorVar, heading, showHeading, active, label } = options;
  const size = 30;
  const c = size / 2;
  const hasHeading = showHeading && typeof heading === 'number' && Number.isFinite(heading);

  const halo = active
    ? `<span class="fleet-vehicle-marker__halo" style="position:absolute;inset:-7px;border-radius:9999px;background:currentColor;opacity:0.22;"></span>`
    : '';

  const wedge = hasHeading
    ? `<path d="M ${c} ${c - 13} L ${c + 5.5} ${c - 4.5} L ${c - 5.5} ${c - 4.5} Z"
             style="fill:currentColor;"
             transform="rotate(${(heading as number) % 360} ${c} ${c})" />`
    : '';

  const html = `
    <div class="fleet-vehicle-marker__body" role="img" aria-label="${escapeHtml(label)}"
         style="position:relative;width:${size}px;height:${size}px;color:${colorVar};">
      ${halo}
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"
           style="position:absolute;inset:0;overflow:visible;" aria-hidden="true" focusable="false">
        ${wedge}
        <circle cx="${c}" cy="${c}" r="7.5"
                style="fill:currentColor;stroke:var(--map-marker-ring, #ffffff);stroke-width:2.5;" />
      </svg>
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
        const selected = vehicle.vehicleId === selectedVehicleId;
        const active = activeVehicle === vehicle.vehicleId;
        // Alert overrides the status colour but NOT the heading wedge --
        // a red marker still shows which way the vehicle is pointing.
        const colorVar = vehicle.alert ? ALERT_COLOR_VAR : STATUS_COLOR_VAR[vehicle.status];
        const label = [
          vehicle.licensePlate,
          STATUS_LABEL[vehicle.status],
          vehicle.alert ? `alert: ${vehicle.alert.reasons[0]}` : null,
          vehicle.stale ? 'stale fix' : null,
        ]
          .filter(Boolean)
          .join(', ');

        const icon = buildVehicleIcon({
          colorVar,
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
            position={[vehicle.position.lat, vehicle.position.lng]}
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