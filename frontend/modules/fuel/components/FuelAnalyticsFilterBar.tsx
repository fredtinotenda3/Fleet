// frontend/modules/fuel/components/FuelAnalyticsFilterBar.tsx
//
// Shared date-range control for every enterprise analytics chart on
// FuelAnalyticsPage. Deliberately reuses the same "from/to" input pattern
// as FuelFilters.tsx rather than introducing a second date-picker
// convention.

'use client';

import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { X } from 'lucide-react';

export interface FuelAnalyticsDateRange {
  startDate?: Date;
  endDate?: Date;
}

interface FuelAnalyticsFilterBarProps {
  value: FuelAnalyticsDateRange;
  onChange: (value: FuelAnalyticsDateRange) => void;
}

function toDateInputValue(value: Date | undefined): string {
  if (!value) return '';
  return value.toISOString().slice(0, 10);
}

export function FuelAnalyticsFilterBar({ value, onChange }: FuelAnalyticsFilterBarProps) {
  const hasFilters = Boolean(value.startDate || value.endDate);

  return (
    <div className="flex flex-wrap items-end gap-4 p-4 surface-card">
      <div className="w-40">
        <Label htmlFor="analytics-from" className="text-sm">From</Label>
        <Input
          id="analytics-from"
          type="date"
          value={toDateInputValue(value.startDate)}
          onChange={(e) =>
            onChange({ ...value, startDate: e.target.value ? new Date(e.target.value) : undefined })
          }
        />
      </div>
      <div className="w-40">
        <Label htmlFor="analytics-to" className="text-sm">To</Label>
        <Input
          id="analytics-to"
          type="date"
          value={toDateInputValue(value.endDate)}
          onChange={(e) =>
            onChange({ ...value, endDate: e.target.value ? new Date(e.target.value) : undefined })
          }
        />
      </div>
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => onChange({})} className="h-9">
          <X className="h-3.5 w-3.5 mr-1" /> Clear
        </Button>
      )}
    </div>
  );
}