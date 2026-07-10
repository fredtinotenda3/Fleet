// frontend/modules/expenses/components/ExpenseFilters.tsx

'use client';

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
import { useExpenseTypes } from '../hooks/useExpenses';
import type { ExpenseTableFilters } from '../types';

interface ExpenseFiltersProps {
  filters: ExpenseTableFilters;
  onChange: (filters: ExpenseTableFilters) => void;
}

const ALL = '__all__';

function toDateInputValue(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function ExpenseFilters({ filters, onChange }: ExpenseFiltersProps) {
  const { data: expenseTypes } = useExpenseTypes();
  const hasFilters = Boolean(
    filters.license_plate || filters.type || filters.startDate || filters.endDate || filters.minAmount || filters.maxAmount
  );

  function handleChange<K extends keyof ExpenseTableFilters>(key: K, value: ExpenseTableFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex-1 min-w-55">
        <Label htmlFor="expense-plate-search" className="text-sm">License plate</Label>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            id="expense-plate-search"
            placeholder="Search by plate..."
            value={filters.license_plate || ''}
            onChange={(e) => handleChange('license_plate', e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <div className="w-48">
        <Label htmlFor="expense-type-filter" className="text-sm">Category</Label>
        <Select
          value={filters.type ?? ALL}
          onValueChange={(value) => handleChange('type', value === ALL ? undefined : value)}
        >
          <SelectTrigger id="expense-type-filter"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {expenseTypes?.map((t) => (
              <SelectItem key={t._id} value={t._id!}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-40">
        <Label htmlFor="expense-start" className="text-sm">From</Label>
        <Input
          id="expense-start"
          type="date"
          value={toDateInputValue(filters.startDate)}
          onChange={(e) => handleChange('startDate', e.target.value ? new Date(e.target.value) : undefined)}
        />
      </div>

      <div className="w-40">
        <Label htmlFor="expense-end" className="text-sm">To</Label>
        <Input
          id="expense-end"
          type="date"
          value={toDateInputValue(filters.endDate)}
          onChange={(e) => handleChange('endDate', e.target.value ? new Date(e.target.value) : undefined)}
        />
      </div>

      <div className="w-32">
        <Label htmlFor="expense-min" className="text-sm">Min amount</Label>
        <Input
          id="expense-min"
          type="number"
          step="0.01"
          value={filters.minAmount ?? ''}
          onChange={(e) => handleChange('minAmount', e.target.value ? Number(e.target.value) : undefined)}
        />
      </div>

      <div className="w-32">
        <Label htmlFor="expense-max" className="text-sm">Max amount</Label>
        <Input
          id="expense-max"
          type="number"
          step="0.01"
          value={filters.maxAmount ?? ''}
          onChange={(e) => handleChange('maxAmount', e.target.value ? Number(e.target.value) : undefined)}
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