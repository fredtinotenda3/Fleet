// modules/vehicles/components/VehicleFilters.tsx

'use client';

import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { VehicleFilters as VehicleFiltersType } from '@/shared/types/vehicle.types';

interface VehicleFiltersProps {
  filters: VehicleFiltersType;
  onFilterChange: (filters: VehicleFiltersType) => void;
}

export function VehicleFilters({ filters, onFilterChange }: VehicleFiltersProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-2">
        <Label>Make</Label>
        <Input
          placeholder="Filter by make..."
          value={filters.make || ''}
          onChange={(e) => onFilterChange({ ...filters, make: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>Model</Label>
        <Input
          placeholder="Filter by model..."
          value={filters.model || ''}
          onChange={(e) => onFilterChange({ ...filters, model: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>Year</Label>
        <Input
          type="number"
          placeholder="Filter by year..."
          value={filters.year || ''}
          onChange={(e) => onFilterChange({ ...filters, year: parseInt(e.target.value) || undefined })}
        />
      </div>

      <div className="space-y-2">
        <Label>Status</Label>
        <Select
          value={filters.status || 'all'}
          onValueChange={(value) => onFilterChange({ ...filters, status: value === 'all' ? undefined : value as any })}
        >
          <SelectTrigger>
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}