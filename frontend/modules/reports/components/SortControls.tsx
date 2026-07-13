// frontend/modules/reports/components/SortControls.tsx

'use client';

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { ReportColumn } from '../schemas/reportColumn';
import type { ReportSort } from '../schemas/reportDefinition';

interface SortControlsProps {
  columns: ReportColumn[];
  sort: ReportSort[];
  onChange: (sort: ReportSort[]) => void;
}

export function SortControls({ columns, sort, onChange }: SortControlsProps) {
  const sortedFields = new Set(sort.map((s) => s.field));
  const availableColumns = columns.filter((c) => !sortedFields.has(c.field));

  function addSort() {
    const next = availableColumns[0];
    if (!next) return;
    onChange([...sort, { field: next.field, direction: 'asc' }]);
  }

  function updateSort(index: number, patch: Partial<ReportSort>) {
    onChange(sort.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function removeSort(index: number) {
    onChange(sort.filter((_, i) => i !== index));
  }

  if (columns.length === 0) {
    return <p className="text-sm text-muted-foreground">Select columns first to enable sorting.</p>;
  }

  return (
    <div className="space-y-2">
      {sort.map((s, index) => {
        const column = columns.find((c) => c.field === s.field);
        return (
          <div key={s.field} className="flex items-center gap-2 p-2 border rounded-md">
            <select
              value={s.field}
              onChange={(e) => updateSort(index, { field: e.target.value })}
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              <option value={s.field}>{column?.label ?? s.field}</option>
              {availableColumns.map((c) => (
                <option key={c.field} value={c.field}>
                  {c.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => updateSort(index, { direction: s.direction === 'asc' ? 'desc' : 'asc' })}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs hover:bg-accent"
            >
              {s.direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
              {s.direction === 'asc' ? 'Ascending' : 'Descending'}
            </button>
            <button
              type="button"
              onClick={() => removeSort(index)}
              className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
              aria-label="Remove sort level"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      })}

      {availableColumns.length > 0 && (
        <button
          type="button"
          onClick={addSort}
          className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm hover:bg-accent"
        >
          <Plus className="h-3.5 w-3.5" /> Add sort level
        </button>
      )}
    </div>
  );
}