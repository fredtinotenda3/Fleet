//frontend/modules/vehicles/components/vehicleFilters

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
import { VEHICLE_STATUSES, type VehicleTableFilters } from '../types';
import { VEHICLE_TYPE_OPTIONS } from '../utils';

interface VehicleFiltersProps {
  filters: VehicleTableFilters;
  onChange: (filters: VehicleTableFilters) => void;
}

const ALL = '__all__';

export function VehicleFilters({ filters, onChange }: VehicleFiltersProps) {
  const searching = Boolean(filters.search && filters.search.trim().length >= 2);
  const hasActiveFilters = Boolean(
    filters.status || filters.vehicle_type || filters.make || filters.model || filters.year
  );

  function clearAll() {
    onChange({});
  }

  return (
    <FilterBar
      searchPlaceholder="Search by plate, make, model, or VIN..."
      searchValue={filters.search ?? ''}
      onSearchChange={(value) => onChange({ ...filters, search: value })}
      onSearchClear={() => onChange({ ...filters, search: '' })}
      filters={
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={filters.status ?? ALL}
            onValueChange={(value) =>
              onChange({ ...filters, status: value === ALL ? undefined : (value as VehicleTableFilters['status']) })
            }
            disabled={searching}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {VEHICLE_STATUSES.map((status) => (
                <SelectItem key={status} value={status} className="capitalize">
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.vehicle_type ?? ALL}
            onValueChange={(value) => 
              onChange({ ...filters, vehicle_type: value === ALL ? undefined : (value as string) })
            }
            disabled={searching}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Vehicle type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All types</SelectItem>
              {VEHICLE_TYPE_OPTIONS.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            placeholder="Make"
            className="w-28"
            value={filters.make ?? ''}
            onChange={(e) => onChange({ ...filters, make: e.target.value || undefined })}
            disabled={searching}
          />

          <Input
            placeholder="Model"
            className="w-28"
            value={filters.model ?? ''}
            onChange={(e) => onChange({ ...filters, model: e.target.value || undefined })}
            disabled={searching}
          />

          <Input
            type="number"
            placeholder="Year"
            className="w-24"
            value={filters.year ?? ''}
            onChange={(e) => onChange({ ...filters, year: e.target.value ? Number(e.target.value) : undefined })}
            disabled={searching}
          />

          {(hasActiveFilters || searching) && (
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