// frontend/modules/trips/components/TripSelect.tsx
//
// PHASE 3: reusable "link to trip" selector used by FuelForm and
// ExpenseForm. Scoped to the vehicle already chosen on the parent
// form, since a fuel-up or expense can only be linked to a trip taken
// by the same vehicle (enforced again server-side in
// CreateFuelLogHandler/CreateExpenseHandler).

'use client';

import { useQuery } from '@tanstack/react-query';
import { tripsApi } from '../services/trips.api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { formatDate } from '@/shared/utils/date.utils';
import { formatDistance } from '@/shared/utils/distance.utils';

interface TripSelectProps {
  licensePlate?: string | null;
  value?: string | null;
  onChange: (tripId: string | undefined) => void;
  disabled?: boolean;
}

const NONE = '__none__';

export function TripSelect({ licensePlate, value, onChange, disabled }: TripSelectProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['trips', 'select', licensePlate],
    queryFn: () => tripsApi.list({ license_plate: licensePlate ?? undefined, page: 1, limit: 50 }),
    enabled: Boolean(licensePlate),
    staleTime: 30_000,
  });

  const trips = data?.data ?? [];

  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE || v === null ? undefined : v)}
      disabled={disabled || !licensePlate}
    >
      <SelectTrigger className="w-full">
        <SelectValue
          placeholder={
            !licensePlate
              ? 'Select a vehicle first'
              : isLoading
                ? 'Loading trips...'
                : 'No trip linked'
          }
        />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>No trip linked</SelectItem>
        {trips.map((trip) => (
          <SelectItem key={trip._id} value={trip._id!}>
            {formatDate(trip.date)} &middot; {formatDistance(trip.distance_calculated)}
            {trip.start_location || trip.end_location
              ? ` \u00B7 ${trip.start_location ?? ''}${trip.start_location && trip.end_location ? ' \u2192 ' : ''}${trip.end_location ?? ''}`
              : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}