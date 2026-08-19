// frontend/modules/telematics/components/LiveMapVehicleList.tsx

'use client';

import { AlertTriangle, Clock, Fuel, Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LiveMapVehicle } from '../types';

interface LiveMapVehicleListProps {
  vehicles: LiveMapVehicle[];
  selectedVehicleId: string | null;
  onSelectVehicle: (vehicleId: string | null) => void;
}

/** Same custom properties the markers use, so the list and the map can never disagree about a colour. See app/leaflet-overrides.css. */
const STATUS_COLOR_VAR: Record<LiveMapVehicle['status'], string> = {
  moving: 'var(--map-marker-moving, #0e8a5f)',
  idle: 'var(--map-marker-idle, #a15c00)',
  offline: 'var(--map-marker-offline, #6b7488)',
};

const ALERT_COLOR_VAR = 'var(--map-marker-alert, #b3261e)';

const STATUS_LABEL: Record<LiveMapVehicle['status'], string> = {
  moving: 'Moving',
  idle: 'Idle',
  offline: 'Offline',
};

export function LiveMapVehicleList({ vehicles, selectedVehicleId, onSelectVehicle }: LiveMapVehicleListProps) {
  if (vehicles.length === 0) {
    return <p className="p-4 text-body-sm text-muted-foreground">No vehicles in your scope yet.</p>;
  }

  return (
    <ul className="overflow-y-auto divide-y divide-border max-h-140">
      {vehicles.map((vehicle) => {
        const selected = vehicle.vehicleId === selectedVehicleId;
        return (
          <li key={vehicle.vehicleId}>
            <button
              type="button"
              onClick={() => onSelectVehicle(selected ? null : vehicle.vehicleId)}
              className={cn(
                'flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors hover:bg-muted/60',
                selected && 'bg-muted'
              )}
              aria-pressed={selected}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate text-body-sm text-foreground">{vehicle.licensePlate}</span>
                <span className="flex items-center gap-1 shrink-0 text-caption text-muted-foreground">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: vehicle.alert ? ALERT_COLOR_VAR : STATUS_COLOR_VAR[vehicle.status] }}
                    aria-hidden="true"
                  />
                  {STATUS_LABEL[vehicle.status]}
                </span>
              </div>
              <p className="truncate text-caption text-muted-foreground">
                {vehicle.make} {vehicle.model}
              </p>
              {(vehicle.alert || vehicle.stale) && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
                  {vehicle.alert && (
                    <span className="flex items-center gap-1" style={{ color: ALERT_COLOR_VAR }}>
                      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{vehicle.alert.reasons[0]}</span>
                    </span>
                  )}
                  {/* Stale is shown ALONGSIDE the status, never instead of
                      it -- the fix being old is a data-freshness caveat,
                      not a claim that the vehicle stopped reporting. */}
                  {vehicle.stale && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                      Stale fix
                    </span>
                  )}
                </div>
              )}
              {vehicle.position && (
                <div className="flex items-center gap-3 text-caption text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Gauge className="h-3 w-3" aria-hidden="true" />
                    {Math.round(vehicle.position.speed)} km/h
                  </span>
                  {typeof vehicle.position.fuelLevel === 'number' && (
                    <span className="flex items-center gap-1">
                      <Fuel className="h-3 w-3" aria-hidden="true" />
                      {Math.round(vehicle.position.fuelLevel)}%
                    </span>
                  )}
                </div>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}