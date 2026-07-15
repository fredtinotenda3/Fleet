// frontend/modules/reports/components/ChartConfigurator.tsx
'use client';

import { CHART_TYPES, type ChartType, type ChartConfig } from '../schemas/reportDefinition';
import type { ReportColumn } from '../schemas/reportColumn';

const CHART_TYPE_LABELS: Record<ChartType, string> = {
  none: 'No chart',
  bar: 'Bar chart',
  line: 'Line chart',
  pie: 'Pie chart',
};

interface ChartConfiguratorProps {
  columns: ReportColumn[];
  config: ChartConfig;
  onChange: (config: Partial<ChartConfig>) => void;
}

export function ChartConfigurator({ columns, config, onChange }: ChartConfiguratorProps) {
  const numericColumns = columns.filter(
    (c) => c.dataType === 'number' || c.dataType === 'currency' || c.dataType === 'percent'
  );
  const allColumns = columns;

  const handleTypeChange = (type: ChartType) => {
    onChange({ chartType: type });
    // Reset fields when switching away from chart or to none
    if (type === 'none') {
      onChange({ chartXField: undefined, chartYField: undefined });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block mb-1 text-sm font-medium">Chart type</label>
        <select
          value={config.chartType}
          onChange={(e) => handleTypeChange(e.target.value as ChartType)}
          className="w-full max-w-xs px-3 py-2 text-sm border rounded-md bg-background"
        >
          {CHART_TYPES.map((type) => (
            <option key={type} value={type}>
              {CHART_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      {config.chartType !== 'none' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="chart-x-field" className="block mb-1 text-sm font-medium">
              X-axis field
            </label>
            <select
              id="chart-x-field"
              value={config.chartXField ?? ''}
              onChange={(e) => onChange({ chartXField: e.target.value || undefined })}
              className="w-full px-3 py-2 text-sm border rounded-md bg-background"
            >
              <option value="">Select field...</option>
              {allColumns.map((col) => (
                <option key={col.field} value={col.field}>
                  {col.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="chart-y-field" className="block mb-1 text-sm font-medium">
              Y-axis field
            </label>
            <select
              id="chart-y-field"
              value={config.chartYField ?? ''}
              onChange={(e) => onChange({ chartYField: e.target.value || undefined })}
              className="w-full px-3 py-2 text-sm border rounded-md bg-background"
            >
              <option value="">Select field...</option>
              {numericColumns.map((col) => (
                <option key={col.field} value={col.field}>
                  {col.label}
                </option>
              ))}
            </select>
            {numericColumns.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                No numeric columns available. Add numeric columns in the Columns step.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}