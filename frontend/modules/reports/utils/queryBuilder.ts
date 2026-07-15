// frontend/modules/reports/utils/queryBuilder.ts
//
// Translates the builder's client-side draft (ReportDefinitionForm) into the
// ReportDefinitionCreateDTO/UpdateDTO shape reportDefinitionsApi.create/update
// send to report-definition.controller.ts.
//
// FIX (Critical - payload shape mismatch causing 400s): this used to send
// `columns` (each carrying its own dataType/aggregation), a `filters` object
// wrapped in `{ logic, conditions }`, `groupBy` as a plain string[], a
// `limit` field, and a pivot shape with a single `rowField`. None of that
// matches ReportDefinitionCreateDTO in frontend/modules/reports/types/index.ts
// (the file that explicitly mirrors the backend's real DTO), which requires:
//   - fields: string[]                (required - was missing entirely)
//   - aggregations?: { field, fn, alias }[]   (separate from field selection)
//   - groupBy?: { field, label? }[]   (objects, not bare strings)
//   - filters?: { field, operator, value, value2? }[]  (flat array, no
//     logic wrapper, and only the operator set report-query.engine.ts
//     actually supports)
//   - pivot?: { rowFields: string[], columnField, valueField, aggregator }
// Sending `columns` instead of the required `fields` was the direct cause of
// the "POST /api/reporting/definitions 400" seen in the console - the
// request never satisfied the backend's validation schema.

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

/** Operators report-query.engine.ts actually accepts on the wire (see types/index.ts#ReportFilterOperator). */
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
    // The backend DTO has no distinct "count distinct" function - fold it
    // into a regular count rather than dropping the column's intent.
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

  return {
    name: form.name,
    description: form.description,
    // NOTE: the backend's DataSourceKey does not include "organizations" -
    // that data source is only registered for the executive dashboard's
    // Organization Reports today, not the ad-hoc builder. The builder still
    // offers it in the UI (REPORT_DATA_SOURCES); if a definition is saved
    // against it the backend will reject it until that registry entry is
    // added server-side, which is outside this module's scope.
    dataSource: form.dataSource as DataSourceKey,
    fields,
    filters,
    groupBy,
    aggregations,
    sort: form.sort,
    pivot,
  };
}

export function buildReportDefinitionUpdatePayload(
  form: ReportDefinitionForm,
): ReportDefinitionUpdateDTO {
  // The backend treats update as a partial replace of the same shape as
  // create (see report-definition.controller.ts#update ->
  // reportBuilderService.update), so we reuse the same mapping.
  return buildReportDefinitionPayload(form) as ReportDefinitionUpdateDTO;
}

/** Reverse mapping: hydrates the builder draft from a saved ReportDefinition. */
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
    isShared?: boolean;
    tags?: string[];
  };

  const dataSource = (raw.dataSource ?? 'vehicles') as ReportDefinitionForm['dataSource'];
  const aggregationByField = new Map((raw.aggregations ?? []).map((a) => [a.field, a]));

  const columns: ReportDefinitionForm['columns'] = (raw.fields ?? []).map((field) => {
    const aggregation = aggregationByField.get(field);
    const resolved = resolveField(dataSource, field);
    return {
      id: `${dataSource}.${field}`,
      field,
      label: aggregation?.alias ?? resolved?.label ?? field,
      dataSource,
      dataType: resolved?.dataType ?? 'string',
      aggregation: (aggregation?.fn ?? 'none') as ReportColumn['aggregation'],
      visible: true,
    };
  });

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
        value: (f.operator === 'between' && f.value2 !== undefined
          ? [f.value, f.value2]
          : f.value) as never,
      })),
    },
    groupBy: (raw.groupBy ?? []).map((g) => g.field),
    sort: raw.sort ?? [],
    limit: 1000,
    isPivot: !!raw.pivot,
    pivotRowField: raw.pivot?.rowFields?.[0],
    pivotColumnField: raw.pivot?.columnField,
    pivotValueField: raw.pivot?.valueField,
    isShared: raw.isShared ?? false,
    tags: raw.tags ?? [],
  };
}