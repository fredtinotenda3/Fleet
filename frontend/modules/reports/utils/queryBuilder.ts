// frontend/modules/reports/utils/queryBuilder.ts
//
// Translates the builder's client-side draft (ReportDefinitionForm) into the
// ReportDefinitionCreateDTO/UpdateDTO shape reportDefinitionsApi.create/update
// send to report-definition.controller.ts. Keeping this conversion in one
// place means the builder UI can evolve its own field names without every
// component needing to know the exact wire format the backend validates
// against (shared/validations/report-definition.schema.ts).

import type { ReportDefinitionForm } from '../schemas/reportDefinition';
import type { ReportDefinitionCreateDTO, ReportDefinitionUpdateDTO } from '../types';

export function buildReportDefinitionPayload(
  form: ReportDefinitionForm,
): ReportDefinitionCreateDTO {
  return {
    name: form.name,
    description: form.description,
    dataSource: form.dataSource,
    columns: form.columns.map((c) => ({
      field: c.field,
      label: c.label,
      dataType: c.dataType,
      aggregation: c.aggregation === 'none' ? undefined : c.aggregation,
      visible: c.visible,
    })),
    filters: {
      logic: form.filters.logic,
      conditions: form.filters.conditions.map((c) => ({
        field: c.field,
        operator: c.operator,
        value: c.value,
      })),
    },
    groupBy: form.groupBy,
    sort: form.sort,
    limit: form.limit,
    pivot: form.isPivot
      ? {
          rowField: form.pivotRowField ?? '',
          columnField: form.pivotColumnField ?? '',
          valueField: form.pivotValueField ?? '',
        }
      : undefined,
    schedule: form.schedule?.enabled
      ? {
          cron: form.schedule.cron ?? '',
          timezone: form.schedule.timezone,
          recipients: form.schedule.recipients,
        }
      : undefined,
    isShared: form.isShared,
    tags: form.tags,
  } as unknown as ReportDefinitionCreateDTO;
}

export function buildReportDefinitionUpdatePayload(
  form: ReportDefinitionForm,
): ReportDefinitionUpdateDTO {
  // The backend treats update as a partial replace of the same shape as
  // create (see report-definition.controller.ts#update ->
  // reportBuilderService.update), so we reuse the same mapping.
  return buildReportDefinitionPayload(form) as unknown as ReportDefinitionUpdateDTO;
}

/** Reverse mapping: hydrates the builder draft from a saved ReportDefinition. */
export function mapDefinitionToForm(
  definition: Record<string, unknown>,
): Partial<ReportDefinitionForm> {
  const raw = definition as {
    name?: string;
    description?: string;
    dataSource?: string;
    columns?: Array<Record<string, unknown>>;
    filters?: { logic?: string; conditions?: Array<Record<string, unknown>> };
    groupBy?: string[];
    sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
    limit?: number;
    pivot?: { rowField?: string; columnField?: string; valueField?: string };
    schedule?: { cron?: string; timezone?: string; recipients?: string[] };
    isShared?: boolean;
    tags?: string[];
  };

  return {
    name: raw.name ?? '',
    description: raw.description,
    dataSource: (raw.dataSource ?? 'vehicles') as ReportDefinitionForm['dataSource'],
    columns:
      raw.columns?.map((c, index) => ({
        id: String(c.id ?? `${c.field}-${index}`),
        field: String(c.field),
        label: String(c.label ?? c.field),
        dataSource: raw.dataSource ?? 'vehicles',
        dataType: (c.dataType ?? 'string') as ReportDefinitionForm['columns'][number]['dataType'],
        aggregation: (c.aggregation ?? 'none') as ReportDefinitionForm['columns'][number]['aggregation'],
        visible: c.visible !== false,
      })) ?? [],
    filters: {
      logic: (raw.filters?.logic ?? 'and') as 'and' | 'or',
      conditions:
        raw.filters?.conditions?.map((c, index) => ({
          id: String(c.id ?? `cond-${index}`),
          field: String(c.field),
          dataSource: raw.dataSource ?? 'vehicles',
          operator: c.operator as ReportDefinitionForm['filters']['conditions'][number]['operator'],
          value: c.value as never,
        })) ?? [],
    },
    groupBy: raw.groupBy ?? [],
    sort: raw.sort ?? [],
    limit: raw.limit ?? 1000,
    isPivot: !!raw.pivot,
    pivotRowField: raw.pivot?.rowField,
    pivotColumnField: raw.pivot?.columnField,
    pivotValueField: raw.pivot?.valueField,
    schedule: raw.schedule
      ? {
          enabled: true,
          cron: raw.schedule.cron,
          timezone: raw.schedule.timezone ?? 'UTC',
          recipients: raw.schedule.recipients ?? [],
        }
      : undefined,
    isShared: raw.isShared ?? false,
    tags: raw.tags ?? [],
  };
}