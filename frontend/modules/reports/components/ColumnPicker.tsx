// frontend/modules/reports/components/ColumnPicker.tsx
//
// Lets the user pick which fields from the selected data source become
// report columns, choose an aggregation per numeric column, and reorder /
// toggle visibility.

'use client';

import { GripVertical, Eye, EyeOff } from 'lucide-react';
import { getFieldsForDataSource } from '../utils/columnResolvers';
import { toReportColumn } from '../utils/columnResolvers';
import { AGGREGATION_FUNCTIONS, type ReportColumn } from '../schemas/reportColumn';
import type { ReportDataSource } from '../schemas/reportDefinition';

interface ColumnPickerProps {
  dataSource: ReportDataSource;
  columns: ReportColumn[];
  onChange: (columns: ReportColumn[]) => void;
}

export function ColumnPicker({ dataSource, columns, onChange }: ColumnPickerProps) {
  const availableFields = getFieldsForDataSource(dataSource);
  const selectedIds = new Set(columns.map((c) => c.id));

  function toggleField(fieldId: string) {
    const field = availableFields.find((f) => f.field === fieldId);
    if (!field) return;
    const column = toReportColumn(dataSource, field);
    if (selectedIds.has(column.id)) {
      onChange(columns.filter((c) => c.id !== column.id));
    } else {
      onChange([...columns, column]);
    }
  }

  function updateAggregation(columnId: string, aggregation: ReportColumn['aggregation']) {
    onChange(columns.map((c) => (c.id === columnId ? { ...c, aggregation } : c)));
  }

  function toggleVisible(columnId: string) {
    onChange(columns.map((c) => (c.id === columnId ? { ...c, visible: !c.visible } : c)));
  }

  function moveColumn(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= columns.length) return;
    const next = [...columns];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div>
        <h3 className="mb-2 text-sm font-medium">Available fields</h3>
        <div className="overflow-y-auto border divide-y rounded-md max-h-96">
          {availableFields.map((field) => {
            const columnId = `${dataSource}.${field.field}`;
            const checked = selectedIds.has(columnId);
            return (
              <label
                key={field.field}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent"
              >
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleField(field.field)}
                    className="w-4 h-4 rounded border-input"
                  />
                  {field.label}
                </span>
                <span className="text-xs text-muted-foreground">{field.dataType}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Selected columns ({columns.length})</h3>
        {columns.length === 0 ? (
          <p className="p-4 text-sm border border-dashed rounded-md text-muted-foreground">
            Choose at least one field on the left to build this report.
          </p>
        ) : (
          <ul className="space-y-2">
            {columns.map((column, index) => {
              const field = availableFields.find((f) => f.field === column.field);
              return (
                <li
                  key={column.id}
                  className="flex items-center gap-2 px-3 py-2 text-sm border rounded-md"
                >
                  <GripVertical className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="flex flex-col">
                    <button type="button" onClick={() => moveColumn(index, -1)} disabled={index === 0} className="text-[10px] leading-none disabled:opacity-30">▲</button>
                    <button type="button" onClick={() => moveColumn(index, 1)} disabled={index === columns.length - 1} className="text-[10px] leading-none disabled:opacity-30">▼</button>
                  </div>
                  <span className="flex-1 truncate">{column.label}</span>
                  {field?.aggregatable && (
                    <select
                      value={column.aggregation}
                      onChange={(e) => updateAggregation(column.id, e.target.value as ReportColumn['aggregation'])}
                      className="rounded-md border bg-background px-1.5 py-1 text-xs"
                    >
                      {AGGREGATION_FUNCTIONS.map((fn) => (
                        <option key={fn} value={fn}>
                          {fn}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleVisible(column.id)}
                    className="p-1 rounded-md hover:bg-accent"
                    aria-label={column.visible ? 'Hide column' : 'Show column'}
                    title={column.visible ? 'Hide column' : 'Show column'}
                  >
                    {column.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}