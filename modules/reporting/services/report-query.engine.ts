// modules/reporting/services/report-query.engine.ts

import { dataSourceRegistry } from '../registry/DataSourceRegistry';
import { bootstrapDataSources } from '../registry/bootstrap-data-sources';
import {
  ReportDefinition,
  ReportFilterCondition,
  ReportResult,
  ReportResultColumn,
  ReportGroupSummary,
  ReportAggregation,
} from '../types/report-definition.types';
import { AppError } from '@/server/errors/app.errors';

bootstrapDataSources();

type Row = Record<string, unknown>;

function toComparable(value: unknown): number | string {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
}

function matchesCondition(row: Row, condition: ReportFilterCondition): boolean {
  const actual = row[condition.field];

  switch (condition.operator) {
    case 'eq':
      return toComparable(actual) === toComparable(condition.value);
    case 'neq':
      return toComparable(actual) !== toComparable(condition.value);
    case 'gt':
      return toComparable(actual) > toComparable(condition.value);
    case 'gte':
      return toComparable(actual) >= toComparable(condition.value);
    case 'lt':
      return toComparable(actual) < toComparable(condition.value);
    case 'lte':
      return toComparable(actual) <= toComparable(condition.value);
    case 'in':
      return Array.isArray(condition.value) && condition.value.some((v) => toComparable(v) === toComparable(actual));
    case 'contains':
      return typeof actual === 'string' && actual.toLowerCase().includes(String(condition.value).toLowerCase());
    case 'between':
      return toComparable(actual) >= toComparable(condition.value) && toComparable(actual) <= toComparable(condition.value2);
    default:
      return true;
  }
}

function applyFilters(rows: Row[], conditions: ReportFilterCondition[]): Row[] {
  if (!conditions.length) return rows;
  return rows.filter((row) => conditions.every((c) => matchesCondition(row, c)));
}

function applySort(rows: Row[], sort?: ReportDefinition['sort']): Row[] {
  if (!sort || sort.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const s of sort) {
      const av = toComparable(a[s.field]);
      const bv = toComparable(b[s.field]);
      if (av < bv) return s.direction === 'asc' ? -1 : 1;
      if (av > bv) return s.direction === 'asc' ? 1 : -1;
    }
    return 0;
  });
}

function aggregate(rows: Row[], agg: ReportAggregation): number {
  const values = rows
    .map((r) => Number(r[agg.field]))
    .filter((n) => !Number.isNaN(n));

  switch (agg.fn) {
    case 'sum':
      return values.reduce((s, v) => s + v, 0);
    case 'avg':
      return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
    case 'count':
      return rows.length;
    case 'min':
      return values.length ? Math.min(...values) : 0;
    case 'max':
      return values.length ? Math.max(...values) : 0;
    default:
      return 0;
  }
}

function groupKey(row: Row, fields: string[]): string {
  return fields.map((f) => String(row[f] ?? '')).join(' / ');
}

export class ReportQueryEngine {
  /**
   * Executes a ReportDefinition against its data source and returns a
   * flat, generic tabular result. `extraFilters` lets callers (drill-down,
   * scheduled runs with runtime overrides) layer additional conditions on
   * top of the definition's own saved filters without mutating it.
   */
  async run(
    definition: ReportDefinition,
    tenantId: string,
    extraFilters: ReportFilterCondition[] = []
  ): Promise<ReportResult> {
    const source = dataSourceRegistry.get(definition.dataSource);
    if (!source) {
      throw new AppError(`Unknown data source "${definition.dataSource}"`, 'UNKNOWN_DATA_SOURCE', 400);
    }

    const allRows = await source.fetch(tenantId);
    const filtered = applyFilters(allRows, [...definition.filters, ...extraFilters]);

    if (definition.groupBy.length > 0 && definition.aggregations.length > 0) {
      return this.buildGrouped(filtered, definition, source.fields);
    }

    const fieldKeys = definition.fields.length ? definition.fields : source.fields.map((f) => f.key);
    const columns: ReportResultColumn[] = fieldKeys.map((key) => {
      const def = source.fields.find((f) => f.key === key);
      return { key, label: def?.label ?? key, type: def?.type ?? 'string' };
    });

    const sorted = applySort(filtered, definition.sort);
    const rows = sorted.map((row) => {
      const picked: Row = {};
      for (const key of fieldKeys) picked[key] = row[key];
      return picked;
    });

    const totals: Record<string, number> = {};
    for (const key of fieldKeys) {
      const def = source.fields.find((f) => f.key === key);
      if (def?.aggregatable) {
        totals[key] = aggregate(filtered, { field: key, fn: 'sum', alias: key });
      }
    }

    return { columns, rows, totals };
  }

  private buildGrouped(
    rows: Row[],
    definition: ReportDefinition,
    sourceFields: { key: string; label: string; type: string }[]
  ): ReportResult {
    const groupFields = definition.groupBy.map((g) => g.field);
    const buckets = new Map<string, Row[]>();

    for (const row of rows) {
      const key = groupKey(row, groupFields);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(row);
    }

    const groupSummaries: ReportGroupSummary[] = [];
    const flatRows: Row[] = [];

    for (const [key, bucketRows] of buckets.entries()) {
      const aggregates: Record<string, number> = {};
      for (const agg of definition.aggregations) {
        aggregates[agg.alias] = aggregate(bucketRows, agg);
      }
      groupSummaries.push({ key, label: key, count: bucketRows.length, aggregates });

      const flatRow: Row = {};
      groupFields.forEach((f, i) => {
        flatRow[f] = key.split(' / ')[i];
      });
      Object.assign(flatRow, aggregates);
      flatRow.count = bucketRows.length;
      flatRows.push(flatRow);
    }

    const columns: ReportResultColumn[] = [
      ...groupFields.map((f) => {
        const def = sourceFields.find((sf) => sf.key === f);
        return { key: f, label: def?.label ?? f, type: (def?.type as any) ?? 'string' };
      }),
      { key: 'count', label: 'Count', type: 'number' as const },
      ...definition.aggregations.map((a) => ({ key: a.alias, label: a.alias, type: 'number' as const })),
    ];

    const totals: Record<string, number> = { count: rows.length };
    for (const agg of definition.aggregations) {
      totals[agg.alias] = aggregate(rows, agg);
    }

    return { columns, rows: flatRows, totals, groupSummaries };
  }
}

export const reportQueryEngine = new ReportQueryEngine();