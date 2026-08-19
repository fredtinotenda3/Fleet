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
// 'leaflet/dist/leaflet.css' is imported here rather than in
// app/globals.css so the ~4kb stylesheet only loads on pages that
// render a map, not on every route in the app.

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

const STATUS_COLOR: Record<LiveMapVehicle['status'], string> = {
  moving: 'var(--success, #16a34a)',
  idle: 'var(--warning, #d97706)',
  offline: 'var(--muted-foreground, #94a3b8)',
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
 * Builds a small rotated-arrow marker icon entirely from an inline SVG
 * string -- no external image asset, so there's no need to work around
 * Leaflet's default-marker-icon-path issue (the classic broken-image
 * problem when bundling Leaflet with webpack/Next, caused by its
 * default icon URLs pointing at files the bundler never copies).
 */
function buildVehicleIcon(color: string, heading: number, moving: boolean, active: boolean): L.DivIcon {
  const size = 28;
  const c = size / 2;
  const html = `
    <div style="position:relative;width:${size}px;height:${size}px;">
      ${active ? `<span style="position:absolute;inset:-6px;border-radius:9999px;background:${color};opacity:0.18;"></span>` : ''}
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="position:absolute;inset:0;overflow:visible;">
        ${
          moving
            ? `<path d="M ${c} ${c - 12} L ${c + 4} ${c - 6} L ${c - 4} ${c - 6} Z" fill="${color}" transform="rotate(${heading} ${c} ${c})" />`
            : ''
        }
        <circle cx="${c}" cy="${c}" r="7" fill="${color}" stroke="var(--card, #fff)" stroke-width="2" />
      </svg>
    </div>`;
  return L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [c, c] });
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
        const color = STATUS_COLOR[vehicle.status];
        const icon = buildVehicleIcon(color, vehicle.position.heading, vehicle.status === 'moving', selected || active);

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
              <Tooltip permanent direction="right" offset={[10, 0]} opacity={1} className="bg-transparent! !border-0 !shadow-none !p-0">
                <span className="px-2 py-1 rounded-md bg-popover text-popover-foreground text-xs whitespace-nowrap">
                  {vehicle.licensePlate} · {Math.round(vehicle.position.speed)} km/h
                </span>
              </Tooltip>
            )}
          </Marker>
        );
      })}
    </MapContainer>
  );
}