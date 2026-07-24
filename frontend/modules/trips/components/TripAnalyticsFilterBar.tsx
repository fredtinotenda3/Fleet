// frontend/modules/trips/components/TripAnalyticsFilterBar.tsx
//
// PHASE 2: shared date-range control for every enterprise analytics chart
// on TripAnalyticsPage. Mirrors FuelAnalyticsFilterBar.tsx exactly.

'use client';

import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { X } from 'lucide-react';

export interface TripAnalyticsDateRange {
  startDate?: Date;
  endDate?: Date;
}

interface TripAnalyticsFilterBarProps {
  value: TripAnalyticsDateRange;
  onChange: (value: TripAnalyticsDateRange) => void;
}

function toDateInputValue(value: Date | undefined): string {
  if (!value) return '';
  return value.toISOString().slice(0, 10);
}

export function TripAnalyticsFilterBar({ value, onChange }: TripAnalyticsFilterBarProps) {
  const hasFilters = Boolean(value.startDate || value.endDate);

  return (
    <div className="flex flex-wrap items-end gap-4 p-4 surface-card">
      <div className="w-40">
        <Label htmlFor="trip-analytics-from" className="text-sm">From</Label>
        <Input
          id="trip-analytics-from"
          type="date"
          value={toDateInputValue(value.startDate)}
          onChange={(e) =>
            onChange({ ...value, startDate: e.target.value ? new Date(e.target.value) : undefined })
          }
        />
      </div>
      <div className="w-40">
        <Label htmlFor="trip-analytics-to" className="text-sm">To</Label>
        <Input
          id="trip-analytics-to"
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