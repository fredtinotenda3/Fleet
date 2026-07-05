// modules/reporting/services/kpi.engine.ts

import { dataSourceRegistry } from '../registry/DataSourceRegistry';
import { bootstrapDataSources } from '../registry/bootstrap-data-sources';
import { KPIDefinition, KPIEvaluationResult, KPIStatus } from '../types/kpi.types';
import { ReportAggregation, ReportFilterCondition } from '../types/report-definition.types';
import { AppError } from '@/server/errors/app.errors';

bootstrapDataSources();

type Row = Record<string, unknown>;

function matchesCondition(row: Row, condition: ReportFilterCondition): boolean {
  const actual = row[condition.field];
  switch (condition.operator) {
    case 'eq':
      return actual === condition.value;
    case 'neq':
      return actual !== condition.value;
    case 'gt':
      return Number(actual) > Number(condition.value);
    case 'gte':
      return Number(actual) >= Number(condition.value);
    case 'lt':
      return Number(actual) < Number(condition.value);
    case 'lte':
      return Number(actual) <= Number(condition.value);
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(actual as never);
    case 'contains':
      return typeof actual === 'string' && actual.toLowerCase().includes(String(condition.value).toLowerCase());
    case 'between':
      return Number(actual) >= Number(condition.value) && Number(actual) <= Number(condition.value2);
    default:
      return true;
  }
}

function aggregate(rows: Row[], agg: ReportAggregation): number {
  const values = rows.map((r) => Number(r[agg.field])).filter((n) => !Number.isNaN(n));
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
  }
}

function formatValue(value: number, unit?: string): string {
  const rounded = Math.round(value * 100) / 100;
  if (!unit) return rounded.toLocaleString();
  if (unit === '$') return `$${rounded.toLocaleString()}`;
  if (unit === '%') return `${rounded.toLocaleString()}%`;
  return `${rounded.toLocaleString()} ${unit}`;
}

function resolveStatus(value: number, kpi: KPIDefinition): KPIStatus {
  if (!kpi.threshold) return 'neutral';
  const { warning, critical, direction } = kpi.threshold;

  if (direction === 'higher_is_better') {
    if (value <= critical) return 'critical';
    if (value <= warning) return 'warning';
    return 'good';
  }
  if (value >= critical) return 'critical';
  if (value >= warning) return 'warning';
  return 'good';
}

export class KpiEngine {
  async evaluate(kpi: KPIDefinition, tenantId: string): Promise<KPIEvaluationResult> {
    const source = dataSourceRegistry.get(kpi.dataSource);
    if (!source) {
      throw new AppError(`Unknown data source "${kpi.dataSource}"`, 'UNKNOWN_DATA_SOURCE', 400);
    }

    const rows = (await source.fetch(tenantId)).filter((row) => kpi.filters.every((c) => matchesCondition(row, c)));

    const numerator = aggregate(rows, kpi.numerator);
    const denominator = kpi.denominator ? aggregate(rows, kpi.denominator) : undefined;
    const value = denominator != null && denominator !== 0 ? numerator / denominator : numerator;

    return {
      kpiId: kpi._id!,
      name: kpi.name,
      value,
      formattedValue: formatValue(value, kpi.unit),
      unit: kpi.unit,
      status: resolveStatus(value, kpi),
      targetValue: kpi.targetValue,
      evaluatedAt: new Date(),
    };
  }

  async evaluateMany(kpis: KPIDefinition[], tenantId: string): Promise<KPIEvaluationResult[]> {
    return Promise.all(kpis.map((kpi) => this.evaluate(kpi, tenantId)));
  }
}

export const kpiEngine = new KpiEngine();