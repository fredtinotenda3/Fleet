// frontend/modules/expenses/components/ExpenseFilters.tsx

'use client';

import { Search, X, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
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

  const activeCount = [
    filters.license_plate,
    filters.type,
    filters.startDate,
    filters.endDate,
    filters.minAmount,
    filters.maxAmount,
  ].filter((v) => v !== undefined && v !== null && v !== '').length;
  const hasFilters = activeCount > 0;

  function handleChange<K extends keyof ExpenseTableFilters>(key: K, value: ExpenseTableFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  /**
   * FIX: this app's <Select> is built on @base-ui/react/select, whose
   * <Select.Value> renders the raw `value` string verbatim unless given
   * a children render-function to map value -> label -- it does not
   * auto-resolve against the mounted <SelectItem>s the way Radix does.
   * Without this, selecting "All categories" displayed the literal
   * sentinel string "__all__", and selecting a real category would have
   * shown its raw id, same as the bug already fixed in ExpenseForm.tsx's
   * category picker.
   */
  function getCategoryFilterLabel(value: string | null | undefined): string {
    if (!value || value === ALL) return 'All categories';
    const match = expenseTypes?.find((t) => t._id === value);
    return match ? match.name : 'All categories';
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-medium text-foreground">Filters</span>
        {hasFilters && (
          <Badge variant="secondary" className="tabular-nums">
            {activeCount} active
          </Badge>
        )}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({})}
            className="ml-auto h-7 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Clear all
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-55">
          <Label htmlFor="expense-plate-search" className="form-label">License plate</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
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
          <Label htmlFor="expense-type-filter" className="form-label">Category</Label>
          <Select
            value={filters.type ?? ALL}
            onValueChange={(value) => handleChange('type', value === ALL ? undefined : value)}
          >
            <SelectTrigger id="expense-type-filter" className="w-full">
              <SelectValue>{(value: string) => getCategoryFilterLabel(value)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {expenseTypes?.map((t) => (
                <SelectItem key={t._id} value={t._id!}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-40">
          <Label htmlFor="expense-start" className="form-label">From</Label>
          <Input
            id="expense-start"
            type="date"
            value={toDateInputValue(filters.startDate)}
            onChange={(e) => handleChange('startDate', e.target.value ? new Date(e.target.value) : undefined)}
          />
        </div>

        <div className="w-40">
          <Label htmlFor="expense-end" className="form-label">To</Label>
          <Input
            id="expense-end"
            type="date"
            value={toDateInputValue(filters.endDate)}
            onChange={(e) => handleChange('endDate', e.target.value ? new Date(e.target.value) : undefined)}
          />
        </div>

        <div className="w-28">
          <Label htmlFor="expense-min" className="form-label">Min amount</Label>
          <Input
            id="expense-min"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={filters.minAmount ?? ''}
            onChange={(e) => handleChange('minAmount', e.target.value ? Number(e.target.value) : undefined)}
          />
        </div>

        <div className="w-28">
          <Label htmlFor="expense-max" className="form-label">Max amount</Label>
          <Input
            id="expense-max"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={filters.maxAmount ?? ''}
            onChange={(e) => handleChange('maxAmount', e.target.value ? Number(e.target.value) : undefined)}
          />
        </div>
      </div>
    </div>
  );
}