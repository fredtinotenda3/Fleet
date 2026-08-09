// frontend/modules/telematics/components/LiveMapSvg.tsx
//
// Dependency-free SVG rendering of the live map: no mapping library is a
// project dependency (see the MapsWidget placeholder this replaces), so
// vehicle/geofence lat-lng pairs are projected into an SVG viewBox with a
// simple equirectangular projection (fine at city/fleet scale -- the
// distances involved never approach the range where that projection's
// distortion would matter) rather than pulling in Leaflet/Mapbox.
//
// Pure presentation: takes already-fetched vehicles/geofences/route data
// and a selection callback. All fetching, polling, and demo-mode state
// live in LiveMapPage.

'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { LiveMapVehicle, LiveMapGeofence, LiveMapRoutePoint } from '../types';

interface LiveMapSvgProps {
  vehicles: LiveMapVehicle[];
  geofences: LiveMapGeofence[];
  routePoints: LiveMapRoutePoint[];
  selectedVehicleId: string | null;
  onSelectVehicle: (vehicleId: string | null) => void;
  className?: string;
}

const VIEW_WIDTH = 900;
const VIEW_HEIGHT = 560;
const PADDING = 48;
/** Minimum lat/lng span to project, so a single vehicle (or a very tight cluster) doesn't get a divide-by-near-zero, all-zoomed-in view. */
const MIN_SPAN_DEGREES = 0.02;

const STATUS_COLOR: Record<LiveMapVehicle['status'], string> = {
  moving: 'var(--success, #16a34a)',
  idle: 'var(--warning, #d97706)',
  offline: 'var(--muted-foreground, #94a3b8)',
};

interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

function computeBounds(vehicles: LiveMapVehicle[], geofences: LiveMapGeofence[]): Bounds {
  const lats: number[] = [];
  const lngs: number[] = [];

  for (const v of vehicles) {
    if (v.position) {
      lats.push(v.position.lat);
      lngs.push(v.position.lng);
    }
  }
  for (const g of geofences) {
    const coords = g.coordinates as any;
    if (g.type === 'circle' && coords?.center) {
      lats.push(coords.center.lat);
      lngs.push(coords.center.lng);
    } else if ((g.type === 'polygon' || g.type === 'route') && Array.isArray(coords?.points)) {
      for (const p of coords.points) {
        lats.push(p.lat);
        lngs.push(p.lng);
      }
    }
  }

  if (lats.length === 0) {
    // Fallback centre so the map still renders something (the depot
    // default the demo simulator uses) rather than an empty NaN-filled
    // viewBox when there's nothing with a position yet.
    return { minLat: -17.835, maxLat: -17.815, minLng: 31.0235, maxLng: 31.0435 };
  }

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const latSpan = Math.max(maxLat - minLat, MIN_SPAN_DEGREES);
  const lngSpan = Math.max(maxLng - minLng, MIN_SPAN_DEGREES);
  const latPad = (latSpan - (maxLat - minLat)) / 2;
  const lngPad = (lngSpan - (maxLng - minLng)) / 2;

  return {
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
    minLng: minLng - lngPad,
    maxLng: maxLng + lngPad,
  };
}

function makeProjector(bounds: Bounds) {
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 1e-6);
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 1e-6);
  const innerW = VIEW_WIDTH - PADDING * 2;
  const innerH = VIEW_HEIGHT - PADDING * 2;

  return (lat: number, lng: number): [number, number] => {
    const x = PADDING + ((lng - bounds.minLng) / lngSpan) * innerW;
    // Latitude increases northward; SVG y increases downward.
    const y = PADDING + (1 - (lat - bounds.minLat) / latSpan) * innerH;
    return [x, y];
  };
}

function GeofenceShape({
  geofence,
  project,
}: {
  geofence: LiveMapGeofence;
  project: (lat: number, lng: number) => [number, number];
}) {
  const coords = geofence.coordinates as any;

  if (geofence.type === 'circle' && coords?.center) {
    const [cx, cy] = project(coords.center.lat, coords.center.lng);
    // Radius is stored in meters; there's no single meters->px scale
    // once the bounding box stretches non-uniformly at the poles/edges,
    // so this renders a fixed, legible marker radius rather than a
    // geographically exact one -- the same simplification the "route"
    // dashed-line rendering below makes.
    return (
      <circle
        cx={cx}
        cy={cy}
        r={16}
        fill="var(--primary, #2563eb)"
        fillOpacity={0.12}
        stroke="var(--primary, #2563eb)"
        strokeWidth={1.5}
        strokeDasharray={geofence.active ? undefined : '4 3'}
      />
    );
  }

  if ((geofence.type === 'polygon' || geofence.type === 'route') && Array.isArray(coords?.points)) {
    const points = coords.points
      .map((p: { lat: number; lng: number }) => project(p.lat, p.lng).join(','))
      .join(' ');
    if (geofence.type === 'route') {
      return (
        <polyline
          points={points}
          fill="none"
          stroke="var(--primary, #2563eb)"
          strokeWidth={2}
          strokeDasharray="6 4"
          strokeOpacity={geofence.active ? 0.7 : 0.3}
        />
      );
    }
    return (
      <polygon
        points={points}
        fill="var(--primary, #2563eb)"
        fillOpacity={0.1}
        stroke="var(--primary, #2563eb)"
        strokeWidth={1.5}
        strokeDasharray={geofence.active ? undefined : '4 3'}
      />
    );
  }

  return null;
}

export function LiveMapSvg({
  vehicles,
  geofences,
  routePoints,
  selectedVehicleId,
  onSelectVehicle,
  className,
}: LiveMapSvgProps) {
  const [hoveredVehicleId, setHoveredVehicleId] = useState<string | null>(null);

  const bounds = useMemo(() => computeBounds(vehicles, geofences), [vehicles, geofences]);
  const project = useMemo(() => makeProjector(bounds), [bounds]);

  const routePath = useMemo(() => {
    if (routePoints.length < 2) return null;
    return routePoints.map((p) => project(p.lat, p.lng).join(',')).join(' ');
  }, [routePoints, project]);

  const activeVehicle = hoveredVehicleId ?? selectedVehicleId;

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      className={cn('w-full h-full', className)}
      role="img"
      aria-label="Live fleet map"
      onClick={() => onSelectVehicle(null)}
    >
      <rect x={0} y={0} width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="var(--muted, #f1f5f9)" rx={12} />

      {/* Light reference grid so empty space reads as a map, not a blank panel. */}
      <g opacity={0.4}>
        {Array.from({ length: 12 }).map((_, i) => (
          <line
            key={`v-${i}`}
            x1={(i * VIEW_WIDTH) / 12}
            y1={0}
            x2={(i * VIEW_WIDTH) / 12}
            y2={VIEW_HEIGHT}
            stroke="var(--border, #e2e8f0)"
            strokeWidth={1}
          />
        ))}
        {Array.from({ length: 8 }).map((_, i) => (
          <line
            key={`h-${i}`}
            x1={0}
            y1={(i * VIEW_HEIGHT) / 8}
            x2={VIEW_WIDTH}
            y2={(i * VIEW_HEIGHT) / 8}
            stroke="var(--border, #e2e8f0)"
            strokeWidth={1}
          />
        ))}
      </g>

      {/* Geofences render under vehicles/routes so markers stay legible on top of a filled zone. */}
      <g>
        {geofences.map((g) => (
          <GeofenceShape key={g.id} geofence={g} project={project} />
        ))}
      </g>

      {routePath && (
        <polyline
          points={routePath}
          fill="none"
          stroke="var(--primary, #2563eb)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {routePoints.length > 0 && (
        <circle
          cx={project(routePoints[0].lat, routePoints[0].lng)[0]}
          cy={project(routePoints[0].lat, routePoints[0].lng)[1]}
          r={4}
          fill="var(--primary, #2563eb)"
          fillOpacity={0.5}
        />
      )}

      {vehicles.map((vehicle) => {
        if (!vehicle.position) return null;
        const [x, y] = project(vehicle.position.lat, vehicle.position.lng);
        const selected = vehicle.vehicleId === selectedVehicleId;
        const hovered = vehicle.vehicleId === hoveredVehicleId;
        const color = STATUS_COLOR[vehicle.status];

        return (
          <g
            key={vehicle.vehicleId}
            transform={`translate(${x}, ${y})`}
            onClick={(e) => {
              e.stopPropagation();
              onSelectVehicle(selected ? null : vehicle.vehicleId);
            }}
            onMouseEnter={() => setHoveredVehicleId(vehicle.vehicleId)}
            onMouseLeave={() => setHoveredVehicleId((id) => (id === vehicle.vehicleId ? null : id))}
            className="cursor-pointer"
          >
            {(selected || hovered) && <circle r={13} fill={color} fillOpacity={0.18} />}
            <circle
              r={7}
              fill={color}
              stroke="var(--card, #fff)"
              strokeWidth={2}
              transform={
                vehicle.status === 'moving' ? `rotate(${vehicle.position.heading})` : undefined
              }
            />
            {vehicle.status === 'moving' && (
              <path
                d="M 0 -12 L 4 -6 L -4 -6 Z"
                fill={color}
                transform={`rotate(${vehicle.position.heading})`}
              />
            )}
            {activeVehicle === vehicle.vehicleId && (
              <g transform="translate(12, -10)">
                <rect
                  x={0}
                  y={-14}
                  width={Math.max(70, vehicle.licensePlate.length * 7 + 16)}
                  height={20}
                  rx={4}
                  fill="var(--popover, #0f172a)"
                  fillOpacity={0.92}
                />
                <text x={8} y={0} fontSize={11} fill="var(--popover-foreground, #fff)">
                  {vehicle.licensePlate} · {Math.round(vehicle.position.speed)} km/h
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}