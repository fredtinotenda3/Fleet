// frontend/modules/workorders/components/WorkOrderFilters.tsx

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
import { WORK_ORDER_STATUSES, WORK_ORDER_STATUS_LABELS } from '../types';
import type { WorkOrderFilters as WorkOrderFiltersType } from '../types';

interface WorkOrderFiltersProps {
  filters: WorkOrderFiltersType;
  onChange: (filters: WorkOrderFiltersType) => void;
}

export function WorkOrderFilters({ filters, onChange }: WorkOrderFiltersProps) {
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

  const hasActiveFilters = Boolean(filters.license_plate || filters.status || filters.priority);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-50 flex-1 space-y-1.5">
        <Label htmlFor="workorder-plate-search">License plate</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            id="workorder-plate-search"
            className="pl-8"
            placeholder="Search by plate..."
            value={localPlate}
            onChange={(e) => handlePlateChange(e.target.value)}
          />
        </div>
      </div>

      <div className="w-44 space-y-1.5">
        <Label>Status</Label>
        <Select
          value={filters.status ?? 'all'}
          onValueChange={(value) => onChange({ ...filters, status: value === 'all' ? undefined : (value as WorkOrderFiltersType['status']) })}
        >
          <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {WORK_ORDER_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {WORK_ORDER_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-40 space-y-1.5">
        <Label>Priority</Label>
        <Select
          value={filters.priority ?? 'all'}
          onValueChange={(value) => onChange({ ...filters, priority: value === 'all' ? undefined : (value as WorkOrderFiltersType['priority']) })}
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

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={handleClear}>
          <X className="h-3.5 w-3.5" />
          Clear filters
        </Button>
      )}
    </div>
  );
}