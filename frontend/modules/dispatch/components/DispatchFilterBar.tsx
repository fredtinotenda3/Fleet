// frontend/modules/dispatch/components/DispatchFilterBar.tsx
//
// Mirrors WorkOrderFilterBar.tsx's structure. Named FilterBar for the
// same reason that file is -- DispatchFilters is also re-exported as a
// *type* from ../types, and a wildcard `export *` can't have a type and
// a value share one name.

'use client';

import { X } from 'lucide-react';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Button } from '@/frontend/shared/ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { DISPATCH_JOB_STATUSES, DISPATCH_JOB_STATUS_LABELS } from '../types';
import type { DispatchFilters } from '../types';

interface DispatchFilterBarProps {
  filters: DispatchFilters;
  onChange: (filters: DispatchFilters) => void;
}

export function DispatchFilterBar({ filters, onChange }: DispatchFilterBarProps) {
  function handleClear() {
    onChange({});
  }

  const hasActiveFilters = Boolean(filters.status || filters.priority);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-44 space-y-1.5">
        <Label>Status</Label>
        <Select
          value={filters.status ?? 'all'}
          onValueChange={(value) =>
            onChange({ ...filters, status: value === 'all' ? undefined : (value as DispatchFilters['status']) })
          }
        >
          <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {DISPATCH_JOB_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {DISPATCH_JOB_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-40 space-y-1.5">
        <Label>Priority</Label>
        <Select
          value={filters.priority ?? 'all'}
          onValueChange={(value) =>
            onChange({ ...filters, priority: value === 'all' ? undefined : (value as DispatchFilters['priority']) })
          }
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
