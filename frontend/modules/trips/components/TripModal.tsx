// frontend/modules/trips/components/TripModal.tsx

'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/shared/ui/feedback/dialog';
import { TripForm } from './TripForm';
import { useDistanceUnits } from '../hooks/useTrips';
import type { Trip, TripStop } from '../types';
import type { TripFormValues } from '../schemas';

/**
 * `Trip.stops[].geocodedAt` (shared/types/evidence.types.ts) is typed as
 * `string | Date` because a server-side caller may stamp it with a real
 * `Date`. By the time it reaches the browser as JSON it is always
 * already a string, but the TYPE still says `string | Date`, which the
 * form's stricter `tripStopFormSchema` (string only) rejects at compile
 * time. This normalizes it defensively (handles either shape) rather
 * than just asserting the type away, and drops `arrivalTime`/
 * `departureTime`, which the map-assisted form does not model yet.
 */
function toFormStop(stop: TripStop): {
  sequence: number;
  role: TripStop['role'];
  label: string;
  lat: number;
  lng: number;
  address?: string;
  geocodeProvenance: TripStop['geocodeProvenance'];
  geocodeProvider?: 'nominatim';
  geocodedAt?: string;
} {
  return {
    sequence: stop.sequence,
    role: stop.role,
    label: stop.label,
    lat: stop.lat,
    lng: stop.lng,
    address: stop.address,
    geocodeProvenance: stop.geocodeProvenance,
    geocodeProvider: stop.geocodeProvider,
    geocodedAt:
      stop.geocodedAt == null
        ? undefined
        : typeof stop.geocodedAt === 'string'
          ? stop.geocodedAt
          : stop.geocodedAt.toISOString(),
  };
}

export type TripModalMode = 'create' | 'edit';

interface TripModalProps {
  open: boolean;
  mode: TripModalMode;
  trip?: Trip | null;
  /** Pre-selects the vehicle when creating. See FuelModal for the rationale. */
  defaultLicensePlate?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: TripFormValues) => Promise<unknown>;
}

const TITLES: Record<TripModalMode, string> = {
  create: 'Log a trip',
  edit: 'Edit trip',
};

const DESCRIPTIONS: Record<TripModalMode, string> = {
  create: 'Record a new trip for a vehicle in your fleet.',
  edit: "Update this trip's details.",
};

function toFormValues(
  trip: Trip | null | undefined,
  defaultLicensePlate?: string
): Partial<TripFormValues> | undefined {
  if (!trip) return defaultLicensePlate ? { license_plate: defaultLicensePlate } : undefined;
  const dateStr = typeof trip.date === 'string' ? trip.date : new Date(trip.date).toISOString();
  return {
    license_plate: trip.license_plate,
    date: dateStr.slice(0, 10),
    unit_id: trip.unit_id,
    mode: trip.mode,
    trip_distance: trip.trip_distance,
    start_odometer: trip.start_odometer,
    end_odometer: trip.end_odometer,
    notes: trip.notes ?? '',
    start_location: trip.start_location ?? '',
    end_location: trip.end_location ?? '',
    driver_id: trip.driver_id ?? '',
    // PART 3: carries an existing map-assisted trip's stops into the
    // form when editing, so MapAssistedTripLog opens pre-populated
    // instead of empty. See shared/types/trip.map-assisted-addendum.ts
    // for where `stops` is added to the Trip type.
    stops: trip.stops?.map(toFormStop),
  };
}

export function TripModal({
  open,
  mode,
  trip,
  defaultLicensePlate,
  onOpenChange,
  onSubmit,
}: TripModalProps) {
  const { data: units = [] } = useDistanceUnits();
  const unitOptions = units.map((u) => ({ value: u.unit_id, label: `${u.name} (${u.symbol})` }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-form-wide">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' && defaultLicensePlate
              ? `Log a trip for ${defaultLicensePlate}`
              : TITLES[mode]}
          </DialogTitle>
          <DialogDescription>{DESCRIPTIONS[mode]}</DialogDescription>
        </DialogHeader>
        <TripForm
          key={`${mode}-${trip?._id ?? defaultLicensePlate ?? 'new'}`}
          defaultValues={toFormValues(trip, defaultLicensePlate)}
          unitOptions={unitOptions}
          onSubmit={async (values) => {
            await onSubmit(values);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
          submitLabel={mode === 'edit' ? 'Save changes' : 'Log trip'}
        />
      </DialogContent>
    </Dialog>
  );
}