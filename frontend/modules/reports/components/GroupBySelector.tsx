// frontend/modules/reports/components/GroupBySelector.tsx

'use client';

import { getGroupableFields } from '../utils/columnResolvers';
import type { ReportDataSource } from '../schemas/reportDefinition';

interface GroupBySelectorProps {
  dataSource: ReportDataSource;
  groupBy: string[];
  onChange: (groupBy: string[]) => void;
}

export function GroupBySelector({ dataSource, groupBy, onChange }: GroupBySelectorProps) {
  const fields = getGroupableFields(dataSource);

  function toggle(field: string) {
    onChange(groupBy.includes(field) ? groupBy.filter((f) => f !== field) : [...groupBy, field]);
  }

  if (fields.length === 0) {
    return <p className="text-sm text-muted-foreground">No groupable fields for this data source.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {fields.map((field) => {
        const active = groupBy.includes(field.field);
        return (
          <button
            key={field.field}
            type="button"
            onClick={() => toggle(field.field)}
            aria-pressed={active}
            className={
              active
                ? 'rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground'
                : 'rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-accent'
            }
          >
            {field.label}
          </button>
        );
      })}
    </div>
  );
}