// frontend/modules/trips/components/TripFilters.tsx

'use client';

import { FilterBar } from '@/shared/ui/filters/FilterBar';
import { Input } from '@/frontend/shared/ui/forms/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { X } from 'lucide-react';
import { TRIP_MODES, type TripTableFilters } from '../types';
import { tripModeLabel } from '../utils';

interface TripFiltersProps {
  filters: TripTableFilters;
  onChange: (filters: TripTableFilters) => void;
}

const ALL = '__all__';

function toDateInputValue(value: Date | string | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function TripFilters({ filters, onChange }: TripFiltersProps) {
  const hasActiveFilters = Boolean(
    filters.mode || filters.driver_id || filters.startDate || filters.endDate
  );

  function clearAll() {
    onChange({});
  }

  return (
    <FilterBar
      searchPlaceholder="Search by license plate..."
      searchValue={filters.license_plate ?? ''}
      onSearchChange={(value) => onChange({ ...filters, license_plate: value })}
      onSearchClear={() => onChange({ ...filters, license_plate: '' })}
      filters={
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={filters.mode ?? ALL}
            onValueChange={(value) =>
              onChange({ ...filters, mode: value === ALL ? undefined : (value as TripTableFilters['mode']) })
            }
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All modes</SelectItem>
              {TRIP_MODES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {tripModeLabel(mode)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            placeholder="Driver ID"
            className="w-32"
            value={filters.driver_id ?? ''}
            onChange={(e) => onChange({ ...filters, driver_id: e.target.value || undefined })}
          />

          <Input
            type="date"
            className="w-36"
            value={toDateInputValue(filters.startDate)}
            onChange={(e) => onChange({ ...filters, startDate: e.target.value ? new Date(e.target.value) : undefined })}
            aria-label="From date"
          />

          <Input
            type="date"
            className="w-36"
            value={toDateInputValue(filters.endDate)}
            onChange={(e) => onChange({ ...filters, endDate: e.target.value ? new Date(e.target.value) : undefined })}
            aria-label="To date"
          />

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>
      }
    />
  );
}