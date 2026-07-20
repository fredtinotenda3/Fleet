// frontend/modules/expenses/components/ExpenseAnalyticsFilterBar.tsx

'use client';

import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { X } from 'lucide-react';

export interface ExpenseAnalyticsDateRange {
  startDate?: Date;
  endDate?: Date;
}

interface ExpenseAnalyticsFilterBarProps {
  value: ExpenseAnalyticsDateRange;
  onChange: (value: ExpenseAnalyticsDateRange) => void;
}

function toDateInputValue(value: Date | undefined): string {
  if (!value) return '';
  return value.toISOString().slice(0, 10);
}

export function ExpenseAnalyticsFilterBar({ value, onChange }: ExpenseAnalyticsFilterBarProps) {
  const hasFilters = Boolean(value.startDate || value.endDate);

  return (
    <div className="flex flex-wrap items-end gap-4 p-4 surface-card">
      <div className="w-40">
        <Label htmlFor="expense-analytics-from" className="text-sm">From</Label>
        <Input
          id="expense-analytics-from"
          type="date"
          value={toDateInputValue(value.startDate)}
          onChange={(e) =>
            onChange({ ...value, startDate: e.target.value ? new Date(e.target.value) : undefined })
          }
        />
      </div>
      <div className="w-40">
        <Label htmlFor="expense-analytics-to" className="text-sm">To</Label>
        <Input
          id="expense-analytics-to"
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