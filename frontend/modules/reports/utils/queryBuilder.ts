// frontend/modules/reports/utils/queryBuilder.ts

import type { ReportDefinitionForm } from '../schemas/reportDefinition';
import type { ReportColumn } from '../schemas/reportColumn';
import { resolveField } from './columnResolvers';
import type {
  ReportDefinitionCreateDTO,
  ReportDefinitionUpdateDTO,
  ReportFilterOperator,
  ReportAggregationFn,
  DataSourceKey,
} from '../types';

const DTO_SUPPORTED_OPERATORS: ReadonlySet<ReportFilterOperator> = new Set([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'contains',
  'between',
]);

function toDtoAggregationFn(aggregation: ReportColumn['aggregation']): ReportAggregationFn | null {
  switch (aggregation) {
    case 'sum':
    case 'avg':
    case 'count':
    case 'min':
    case 'max':
      return aggregation;
    case 'countDistinct':
      return 'count';
    case 'none':
    default:
      return null;
  }
}

export function buildReportDefinitionPayload(
  form: ReportDefinitionForm,
): ReportDefinitionCreateDTO {
  const fields = form.columns.map((c) => c.field);

  const aggregations = form.columns.reduce<ReportDefinitionCreateDTO['aggregations']>((acc, column) => {
    const fn = toDtoAggregationFn(column.aggregation);
    if (fn) {
      acc!.push({ field: column.field, fn, alias: column.label || column.field });
    }
    return acc;
  }, []);

  const groupBy = form.groupBy.map((field) => {
    const column = form.columns.find((c) => c.field === field);
    return { field, label: column?.label };
  });

  const filters = form.filters.conditions
    .filter((c) => DTO_SUPPORTED_OPERATORS.has(c.operator as ReportFilterOperator))
    .map((c) => {
      if (c.operator === 'between' && Array.isArray(c.value)) {
        const [value, value2] = c.value;
        return { field: c.field, operator: 'between' as const, value, value2 };
      }
      return {
        field: c.field,
        operator: c.operator as ReportFilterOperator,
        value: Array.isArray(c.value) ? c.value[0] : c.value,
      };
    });

  const pivot =
    form.isPivot && form.pivotRowField && form.pivotColumnField && form.pivotValueField
      ? {
          rowFields: [form.pivotRowField],
          columnField: form.pivotColumnField,
          valueField: form.pivotValueField,
          aggregator: 'sum' as const,
        }
      : undefined;

  // Chart config: only include if chartType is not 'none' and required fields are set
  const chart =
    form.chart.chartType !== 'none' && form.chart.chartXField && form.chart.chartYField
      ? {
          type: form.chart.chartType as 'bar' | 'line' | 'pie',
          xField: form.chart.chartXField,
          yField: form.chart.chartYField,
        }
      : undefined;

  return {
    name: form.name,
    description: form.description,
    dataSource: form.dataSource as DataSourceKey,
    fields,
    filters,
    groupBy,
    aggregations,
    sort: form.sort,
    pivot,
    chart,
  };
}

export function buildReportDefinitionUpdatePayload(
  form: ReportDefinitionForm,
): ReportDefinitionUpdateDTO {
  return buildReportDefinitionPayload(form) as ReportDefinitionUpdateDTO;
}

export function mapDefinitionToForm(
  definition: Record<string, unknown>,
): Partial<ReportDefinitionForm> {
  const raw = definition as {
    name?: string;
    description?: string;
    dataSource?: string;
    fields?: string[];
    aggregations?: Array<{ field: string; fn: string; alias: string }>;
    filters?: Array<{ field: string; operator: string; value: unknown; value2?: unknown }>;
    groupBy?: Array<{ field: string; label?: string }>;
    sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
    pivot?: { rowFields?: string[]; columnField?: string; valueField?: string; aggregator?: string };
    chart?: { type?: string; xField?: string; yField?: string };
    isShared?: boolean;
    tags?: string[];
  };

  const dataSource = (raw.dataSource ?? 'vehicles') as ReportDefinitionForm['dataSource'];
  const aggregationByField = new Map((raw.aggregations ?? []).map((a) => [a.field, a]));

  const validFields = (raw.fields ?? []).filter((field) => !!resolveField(dataSource, field));

  const columns: ReportDefinitionForm['columns'] = validFields.map((field) => {
    const aggregation = aggregationByField.get(field);
    const resolved = resolveField(dataSource, field)!;
    return {
      id: `${dataSource}.${field}`,
      field,
      label: aggregation?.alias ?? resolved.label ?? field,
      dataSource,
      dataType: resolved.dataType,
      aggregation: (aggregation?.fn ?? 'none') as ReportColumn['aggregation'],
      visible: true,
    };
  });

  const chartConfig: ReportDefinitionForm['chart'] = raw.chart
    ? {
        chartType: (raw.chart.type as ReportDefinitionForm['chart']['chartType']) ?? 'none',
        chartXField: raw.chart.xField,
        chartYField: raw.chart.yField,
      }
    : { chartType: 'none' };

  return {
    name: raw.name ?? '',
    description: raw.description,
    dataSource,
    columns,
    filters: {
      logic: 'and',
      conditions: (raw.filters ?? []).map((f, index) => ({
        id: `cond-${index}`,
        field: f.field,
        dataSource,
        operator: f.operator as ReportDefinitionForm['filters']['conditions'][number]['operator'],
        value:
          f.operator === 'between' && f.value2 !== undefined
            ? [f.value, f.value2]
            : f.value,
      })),
    },
    groupBy: (raw.groupBy ?? []).map((g) => g.field).filter((field) => columns.some((c) => c.field === field)),
    sort: (raw.sort ?? []).filter((s) => columns.some((c) => c.field === s.field)),
    limit: 1000,
    isPivot: !!raw.pivot,
    pivotRowField: raw.pivot?.rowFields?.[0],
    pivotColumnField: raw.pivot?.columnField,
    pivotValueField: raw.pivot?.valueField,
    chart: chartConfig,
    isShared: raw.isShared ?? false,
    tags: raw.tags ?? [],
  };
}