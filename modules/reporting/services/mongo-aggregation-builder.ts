// modules/reporting/services/mongo-aggregation-builder.ts
//
// Builds the `$group` stage for a report's groupBy + aggregations, and
// flattens the resulting grouped Mongo documents back into the same
// flat-row shape the previous in-memory `buildGrouped()` produced --
// so every downstream consumer (pivot engine, CSV/Excel/PDF/Word
// generators, the builder preview UI) sees an unchanged row shape even
// though the grouping itself now happens in the database.

import { Document } from 'mongodb';
import { ReportAggregation, ReportGroupField } from '../types/report-definition.types';

const AGG_OPERATOR: Record<ReportAggregation['fn'], '$sum' | '$avg' | '$min' | '$max'> = {
  sum: '$sum',
  avg: '$avg',
  count: '$sum',
  min: '$min',
  max: '$max',
};

/**
 * `count` aggregations use `{ $sum: 1 }` (there is no per-document
 * value to aggregate for a row count) -- every other function
 * aggregates `$<field>` directly, matching the in-memory `aggregate()`
 * helper this replaces field-for-field.
 */
export function buildGroupStage(groupBy: ReportGroupField[], aggregations: ReportAggregation[]): Document {
  const idSpec: Record<string, string> = {};
  for (const g of groupBy) {
    idSpec[g.field] = `$${g.field}`;
  }

  const group: Document = {
    _id: groupBy.length ? idSpec : null,
    __count: { $sum: 1 },
  };

  for (const agg of aggregations) {
    group[agg.alias] = agg.fn === 'count' ? { $sum: 1 } : { [AGG_OPERATOR[agg.fn]]: `$${agg.field}` };
  }

  return { $group: group };
}

/**
 * Flattens one grouped Mongo doc (`{ _id: {...}, __count, ...aggAliases }`)
 * back into `{ key, row }`, where `key` matches the previous
 * `groupKey()` format (`" / "`-joined group values) so
 * DrilldownService's click-to-filter behavior (which parses that key
 * back apart) keeps working unchanged.
 */
export function flattenGroupedDoc(
  doc: Record<string, unknown>,
  groupFields: string[]
): { key: string; row: Record<string, unknown> } {
  const idValue = (doc._id ?? {}) as Record<string, unknown>;
  const parts = groupFields.map((f) => String(idValue[f] ?? ''));
  const key = parts.join(' / ');

  const row: Record<string, unknown> = {};
  groupFields.forEach((f, i) => {
    row[f] = idValue[f] ?? parts[i];
  });

  for (const [k, v] of Object.entries(doc)) {
    if (k === '_id' || k === '__count') continue;
    row[k] = v;
  }
  row.count = doc.__count ?? 0;

  return { key, row };
}