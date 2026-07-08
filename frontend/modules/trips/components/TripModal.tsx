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
import type { Trip } from '../types';
import type { TripFormValues } from '../schemas';

export type TripModalMode = 'create' | 'edit';

interface TripModalProps {
  open: boolean;
  mode: TripModalMode;
  trip?: Trip | null;
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

function toFormValues(trip: Trip | null | undefined): Partial<TripFormValues> | undefined {
  if (!trip) return undefined;
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
  };
}

export function TripModal({ open, mode, trip, onOpenChange, onSubmit }: TripModalProps) {
  const { data: units = [] } = useDistanceUnits();
  const unitOptions = units.map((u) => ({ value: u.unit_id, label: `${u.name} (${u.symbol})` }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-form-wide">
        <DialogHeader>
          <DialogTitle>{TITLES[mode]}</DialogTitle>
          <DialogDescription>{DESCRIPTIONS[mode]}</DialogDescription>
        </DialogHeader>
        <TripForm
          key={`${mode}-${trip?._id ?? 'new'}`}
          defaultValues={toFormValues(trip)}
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