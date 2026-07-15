// frontend/modules/drivers/components/DriverSelect.tsx
//
// Reusable driver picker. FuelForm and FuelFilters currently inline
// their own <Select> with useDriversList() directly -- this component
// exists so those two (and any future consumer, e.g. Trips) can be
// refactored onto a single implementation without behavior drift.

'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { useDriversList } from '../hooks/useDrivers';

const UNASSIGNED = '__unassigned__';

interface DriverSelectProps {
  value?: string;
  onChange: (driverId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Show an explicit "Unassigned" option that clears the value. Default true. */
  allowUnassigned?: boolean;
  unassignedLabel?: string;
  /** Restrict the roster to status === 'active'. Default true. */
  activeOnly?: boolean;
  id?: string;
}

export function DriverSelect({
  value,
  onChange,
  disabled,
  placeholder = 'Select driver',
  allowUnassigned = true,
  unassignedLabel = 'Unassigned',
  activeOnly = true,
  id = 'driver_id',
}: DriverSelectProps) {
  const { data: drivers, isLoading } = useDriversList({
    status: activeOnly ? 'active' : undefined,
    limit: 1000,
  });

  return (
    <Select
      value={value || (allowUnassigned ? UNASSIGNED : '')}
      onValueChange={(v) => onChange(v === UNASSIGNED ? '' : v)}
      disabled={disabled || isLoading}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={isLoading ? 'Loading drivers…' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowUnassigned && <SelectItem value={UNASSIGNED}>{unassignedLabel}</SelectItem>}
        {drivers?.data?.map((d) => (
          <SelectItem key={d._id} value={d._id!}>
            {d.name}
            {d.driver_code ? ` (${d.driver_code})` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
