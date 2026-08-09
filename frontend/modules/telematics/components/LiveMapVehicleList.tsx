// frontend/modules/telematics/components/LiveMapVehicleList.tsx

'use client';

import { Fuel, Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LiveMapVehicle } from '../types';

interface LiveMapVehicleListProps {
  vehicles: LiveMapVehicle[];
  selectedVehicleId: string | null;
  onSelectVehicle: (vehicleId: string | null) => void;
}

const STATUS_DOT_CLASS: Record<LiveMapVehicle['status'], string> = {
  moving: 'bg-success',
  idle: 'bg-warning',
  offline: 'bg-muted-foreground',
};

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
                  <span className={cn('h-2 w-2 rounded-full', STATUS_DOT_CLASS[vehicle.status])} aria-hidden="true" />
                  {STATUS_LABEL[vehicle.status]}
                </span>
              </div>
              <p className="truncate text-caption text-muted-foreground">
                {vehicle.make} {vehicle.model}
              </p>
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