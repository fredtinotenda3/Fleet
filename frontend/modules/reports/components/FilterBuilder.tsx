// frontend/modules/reports/components/FilterBuilder.tsx
//
// Builds the filter condition group for a report definition. Field choices
// are scoped to the report's active data source (getFieldsForDataSource),
// operator choices are scoped to what report-query.engine.ts accepts
// (FILTER_OPERATORS).

'use client';

import { Plus, Trash2 } from 'lucide-react';
import { getFieldsForDataSource } from '../utils/columnResolvers';
import { FILTER_OPERATORS, type FilterOperator, type ReportFilterCondition, type ReportFilterGroup } from '../schemas/reportFilter';
import type { ReportDataSource } from '../schemas/reportDefinition';

interface FilterBuilderProps {
  dataSource: ReportDataSource;
  filters: ReportFilterGroup;
  onChange: (filters: ReportFilterGroup) => void;
}

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: 'is',
  neq: 'is not',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  between: 'between',
  in: 'is any of',
  notIn: 'is none of',
  contains: 'contains',
  startsWith: 'starts with',
  isNull: 'is empty',
  isNotNull: 'is not empty',
};

function newConditionId() {
  return `cond-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function FilterBuilder({ dataSource, filters, onChange }: FilterBuilderProps) {
  const fields = getFieldsForDataSource(dataSource);

  function addCondition() {
    const firstField = fields[0];
    if (!firstField) return;
    const condition: ReportFilterCondition = {
      id: newConditionId(),
      field: firstField.field,
      dataSource,
      operator: 'eq',
      value: '',
    };
    onChange({ ...filters, conditions: [...filters.conditions, condition] });
  }

  function updateCondition(id: string, patch: Partial<ReportFilterCondition>) {
    onChange({
      ...filters,
      conditions: filters.conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  }

  function removeCondition(id: string) {
    onChange({ ...filters, conditions: filters.conditions.filter((c) => c.id !== id) });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <span>Match</span>
          <select
            value={filters.logic}
            onChange={(e) => onChange({ ...filters, logic: e.target.value as 'and' | 'or' })}
            className="px-2 py-1 border rounded-md bg-background"
          >
            <option value="and">all</option>
            <option value="or">any</option>
          </select>
          <span>of the following:</span>
        </div>
        <button
          type="button"
          onClick={addCondition}
          className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm hover:bg-accent"
        >
          <Plus className="h-3.5 w-3.5" /> Add condition
        </button>
      </div>

      {filters.conditions.length === 0 ? (
        <p className="p-4 text-sm border border-dashed rounded-md text-muted-foreground">
          No filters applied - this report includes all records.
        </p>
      ) : (
        <ul className="space-y-2">
          {filters.conditions.map((condition) => {
            const needsValue = !['isNull', 'isNotNull'].includes(condition.operator);
            const needsArrayValue = ['in', 'notIn', 'between'].includes(condition.operator);
            return (
              <li key={condition.id} className="flex flex-wrap items-center gap-2 p-2 border rounded-md">
                <select
                  value={condition.field}
                  onChange={(e) => updateCondition(condition.id, { field: e.target.value })}
                  className="rounded-md border bg-background px-2 py-1.5 text-sm"
                >
                  {fields.map((f) => (
                    <option key={f.field} value={f.field}>
                      {f.label}
                    </option>
                  ))}
                </select>

                <select
                  value={condition.operator}
                  onChange={(e) => updateCondition(condition.id, { operator: e.target.value as FilterOperator })}
                  className="rounded-md border bg-background px-2 py-1.5 text-sm"
                >
                  {FILTER_OPERATORS.map((op) => (
                    <option key={op} value={op}>
                      {OPERATOR_LABELS[op]}
                    </option>
                  ))}
                </select>

                {needsValue && (
                  <input
                    type="text"
                    value={
                      needsArrayValue
                        ? Array.isArray(condition.value)
                          ? condition.value.join(', ')
                          : ''
                        : (condition.value as string | number | undefined)?.toString() ?? ''
                    }
                    onChange={(e) =>
                      updateCondition(condition.id, {
                        value: needsArrayValue
                          ? e.target.value.split(',').map((v) => v.trim()).filter(Boolean)
                          : e.target.value,
                      })
                    }
                    placeholder={needsArrayValue ? 'value1, value2' : 'value'}
                    className="min-w-35 flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
                  />
                )}

                <button
                  type="button"
                  onClick={() => removeCondition(condition.id)}
                  className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                  aria-label="Remove condition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}