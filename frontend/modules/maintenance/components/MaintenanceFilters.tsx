// frontend/modules/maintenance/components/MaintenanceFilters.tsx

'use client';

import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Button } from '@/frontend/shared/ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { useDebouncedSearch } from '@/shared/hooks/useDebouncedSearch';
import { MAINTENANCE_CATEGORIES, MAINTENANCE_CATEGORY_LABELS } from '../types';
import type { MaintenanceTableFilters } from '../types';

interface MaintenanceFiltersProps {
  filters: MaintenanceTableFilters;
  onChange: (filters: MaintenanceTableFilters) => void;
}

export function MaintenanceFilters({ filters, onChange }: MaintenanceFiltersProps) {
  const [localPlate, setLocalPlate] = useState(filters.license_plate ?? '');
  const { setSearchTerm } = useDebouncedSearch({
    debounceMs: 400,
    minLength: 0,
    onSearch: (value) => onChange({ ...filters, license_plate: value || undefined }),
  });

  function handlePlateChange(value: string) {
    setLocalPlate(value);
    setSearchTerm(value);
  }

  function handleClear() {
    setLocalPlate('');
    onChange({});
  }

  const hasActiveFilters = Boolean(
    filters.license_plate || filters.status || filters.priority || filters.category || filters.assigned_to
  );

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[200px] flex-1 space-y-1.5">
        <Label htmlFor="maintenance-plate-search">License plate</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            id="maintenance-plate-search"
            className="pl-8"
            placeholder="Search by plate..."
            value={localPlate}
            onChange={(e) => handlePlateChange(e.target.value)}
          />
        </div>
      </div>

      <div className="w-40 space-y-1.5">
        <Label>Status</Label>
        <Select
          value={filters.status ?? 'all'}
          onValueChange={(value) => onChange({ ...filters, status: value === 'all' ? undefined : (value as MaintenanceTableFilters['status']) })}
        >
          <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="w-40 space-y-1.5">
        <Label>Priority</Label>
        <Select
          value={filters.priority ?? 'all'}
          onValueChange={(value) => onChange({ ...filters, priority: value === 'all' ? undefined : (value as MaintenanceTableFilters['priority']) })}
        >
          <SelectTrigger><SelectValue placeholder="All priorities" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="w-52 space-y-1.5">
        <Label>Category</Label>
        <Select
          value={filters.category ?? 'all'}
          onValueChange={(value) => onChange({ ...filters, category: value === 'all' ? undefined : value })}
        >
          <SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {MAINTENANCE_CATEGORIES.map((category) => (
              <SelectItem key={category} value={category}>
                {MAINTENANCE_CATEGORY_LABELS[category]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={handleClear}>
          <X className="h-3.5 w-3.5" />
          Clear filters
        </Button>
      )}
    </div>
  );
}