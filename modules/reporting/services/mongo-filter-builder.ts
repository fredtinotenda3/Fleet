// modules/reporting/services/mongo-filter-builder.ts
//
// Translates the report engine's generic ReportFilterCondition[] into a
// real Mongo `$match`-ready filter object, with field-type-aware
// coercion (a date filter submitted as an ISO string becomes a real
// Date; a numeric filter submitted as a string becomes a number)
// before comparison -- this is the piece that lets user-built report
// filters run as native Mongo operators instead of the previous
// `rows.filter(row => conditions.every(...))` JS loop.

import { Filter, Document } from 'mongodb';
import { ReportFilterCondition } from '../types/report-definition.types';
import { DataSourceFieldDefinition } from '../types/data-source.types';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function coerce(value: unknown, fieldDef?: DataSourceFieldDefinition): unknown {
  if (value == null) return value;

  if (fieldDef?.type === 'date' && !(value instanceof Date)) {
    const parsed = new Date(value as string);
    return Number.isNaN(parsed.getTime()) ? value : parsed;
  }

  if ((fieldDef?.type === 'number' || fieldDef?.type === 'currency') && typeof value !== 'number') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  }

  return value;
}

function coerceArray(value: unknown, fieldDef?: DataSourceFieldDefinition): unknown[] {
  const arr = Array.isArray(value) ? value : [value];
  return arr.map((v) => coerce(v, fieldDef));
}

function buildClause(
  condition: ReportFilterCondition,
  fields: DataSourceFieldDefinition[]
): Record<string, unknown> {
  const fieldDef = fields.find((f) => f.key === condition.field);
  const value = coerce(condition.value, fieldDef);

  switch (condition.operator) {
    case 'eq':
      return { [condition.field]: value };
    case 'neq':
      return { [condition.field]: { $ne: value } };
    case 'gt':
      return { [condition.field]: { $gt: value } };
    case 'gte':
      return { [condition.field]: { $gte: value } };
    case 'lt':
      return { [condition.field]: { $lt: value } };
    case 'lte':
      return { [condition.field]: { $lte: value } };
    case 'in':
      return { [condition.field]: { $in: coerceArray(condition.value, fieldDef) } };
    case 'contains':
      return {
        [condition.field]: { $regex: escapeRegex(String(condition.value)), $options: 'i' },
      };
    case 'between': {
      const value2 = coerce(condition.value2, fieldDef);
      return { [condition.field]: { $gte: value, $lte: value2 } };
    }
    default:
      return {};
  }
}

/**
 * Builds a single Mongo `$match`-ready filter from a list of report
 * filter conditions, ANDed together -- mirrors the exact semantics of
 * the previous `conditions.every(c => matchesCondition(row, c))`
 * in-memory check, just expressed as a Mongo query instead of a JS
 * predicate.
 */
export function buildMongoFilter(
  conditions: ReportFilterCondition[],
  fields: DataSourceFieldDefinition[]
): Filter<Document> {
  if (!conditions.length) return {};
  const clauses = conditions.map((c) => buildClause(c, fields));
  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

export function buildMongoSort(
  sort?: { field: string; direction: 'asc' | 'desc' }[]
): Record<string, 1 | -1> | undefined {
  if (!sort || sort.length === 0) return undefined;
  const spec: Record<string, 1 | -1> = {};
  for (const s of sort) {
    spec[s.field] = s.direction === 'asc' ? 1 : -1;
  }
  return spec;
}