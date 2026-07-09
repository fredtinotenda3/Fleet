// frontend/modules/fuel/components/FuelFilters.tsx

'use client';

import { Search, X } from 'lucide-react';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Label } from '@/frontend/shared/ui/forms/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { useVehiclesList } from '@/frontend/modules/vehicles/hooks/useVehicles';
import type { FuelTableFilters } from '../types';

interface FuelFiltersProps {
  filters: FuelTableFilters;
  onChange: (filters: FuelTableFilters) => void;
}

const ALL = '__all__';

function toDateInputValue(value: Date | string | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function FuelFilters({ filters, onChange }: FuelFiltersProps) {
  const { data: vehicles } = useVehiclesList({ limit: 1000 });
  const hasFilters = Boolean(filters.license_plate || filters.unit_id || filters.startDate || filters.endDate);

  function handleChange<K extends keyof FuelTableFilters>(key: K, value: FuelTableFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex-1 min-w-55">
        <Label htmlFor="license_plate" className="text-sm">License plate</Label>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            id="license_plate"
            placeholder="Search by plate..."
            value={filters.license_plate || ''}
            onChange={(e) => handleChange('license_plate', e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <div className="w-55">
        <Label htmlFor="unit_id" className="text-sm">Vehicle</Label>
        <Select
          value={filters.unit_id ?? ALL}
          onValueChange={(value) => handleChange('unit_id', value === ALL ? undefined : value)}
        >
          <SelectTrigger id="unit_id"><SelectValue placeholder="All vehicles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All vehicles</SelectItem>
            {vehicles?.data?.map((v) => (
              <SelectItem key={v._id} value={v._id!}>{v.license_plate} - {v.make} {v.model}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-40">
        <Label htmlFor="startDate" className="text-sm">From</Label>
        <Input
          id="startDate"
          type="date"
          value={toDateInputValue(filters.startDate)}
          onChange={(e) => handleChange('startDate', e.target.value ? new Date(e.target.value) : undefined)}
        />
      </div>

      <div className="w-40">
        <Label htmlFor="endDate" className="text-sm">To</Label>
        <Input
          id="endDate"
          type="date"
          value={toDateInputValue(filters.endDate)}
          onChange={(e) => handleChange('endDate', e.target.value ? new Date(e.target.value) : undefined)}
        />
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => onChange({})} className="h-9">
          <X className="h-3.5 w-3.5 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}