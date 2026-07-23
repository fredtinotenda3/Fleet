// modules/reporting/services/report-query.engine.ts
//
// FIX (Critical -- 10k-row in-memory truncation): this engine
// previously received an already-fetched, hard-capped-at-10,000-row
// array from each DataSourceDefinition.fetch() and did every filter/
// sort/group/aggregate step in JavaScript. That silently dropped any
// row beyond the 10,000th with no warning, and re-fetched/re-scanned
// the FULL row set on every single preview/refresh/export/drilldown
// even when the report's own filters matched almost nothing.
//
// The engine now builds one Mongo aggregation pipeline per run --
// `$match` (tenant scope + user filters) -> optional `$group`
// (groupBy/aggregations) -> `$sort` -> `$facet` (paginated data +
// total count + grand totals) -- so filtering, sorting, grouping, and
// aggregation all happen inside MongoDB. Only the requested page of
// already-computed rows crosses into Node memory.

import { Collection, Document, Filter } from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { dataSourceRegistry } from '../registry/DataSourceRegistry';
import { bootstrapDataSources } from '../registry/bootstrap-data-sources';
import {
  ReportDefinition,
  ReportFilterCondition,
  ReportResult,
  ReportResultColumn,
  ReportGroupSummary,
} from '../types/report-definition.types';
import { DataSourceFieldDefinition } from '../types/data-source.types';
import { buildMongoFilter, buildMongoSort } from './mongo-filter-builder';
import { buildGroupStage, flattenGroupedDoc } from './mongo-aggregation-builder';
import { AppError } from '@/server/errors/app.errors';
import { EXPORT_ROW_CAP } from '@/shared/export/export.constants';
import { PaginationParams } from '@/shared/types/common.types';

bootstrapDataSources();

/** Interactive builder/preview default page size -- the UI renders one page at a time, so there's no reason to pull more. */
const DEFAULT_PREVIEW_LIMIT = 100;
/** Ceiling for a single preview page, even if the caller asks for more. */
const MAX_PREVIEW_LIMIT = 1000;
/**
 * Ceiling for "give me everything matching" calls (export, pivot
 * input, drilldown detail). Deliberately reuses the same
 * EXPORT_ROW_CAP already defined in shared/export/export.constants.ts
 * so reporting and the Export Framework share one row-cap philosophy
 * instead of two different undocumented limits.
 */
const FULL_RESULT_CAP = EXPORT_ROW_CAP;

export interface RunOptions {
  extraFilters?: ReportFilterCondition[];
  pagination?: PaginationParams;
  /** Raises the row cap for this call (e.g. FULL_RESULT_CAP for exports/pivots). Ignored for grouped definitions -- grouped results are bounded by group cardinality, not a row cap. */
  capOverride?: number;
}

export class ReportQueryEngine {
  /**
   * Executes a ReportDefinition against its data source, entirely
   * inside MongoDB. Accepts either an options object, or (for
   * backward compatibility with existing callers) a bare
   * ReportFilterCondition[] as the 3rd argument.
   */
  async run(
    definition: ReportDefinition,
    tenantId: string,
    options: RunOptions | ReportFilterCondition[] = {}
  ): Promise<ReportResult> {
    const normalizedOptions: RunOptions = Array.isArray(options) ? { extraFilters: options } : options;

    const source = dataSourceRegistry.get(definition.dataSource);
    if (!source) {
      throw new AppError(`Unknown data source "${definition.dataSource}"`, 'UNKNOWN_DATA_SOURCE', 400);
    }

    const db = await connectToDatabase();
    const collection = db.collection(source.collectionName);

    const matchStage: Filter<Document> = {
      ...source.baseFilter(tenantId),
      ...buildMongoFilter(
        [...definition.filters, ...(normalizedOptions.extraFilters ?? [])],
        source.fields
      ),
    };

    const prePipeline = source.prePipeline?.(tenantId) ?? [];
    const isGrouped = definition.groupBy.length > 0 && definition.aggregations.length > 0;

    return isGrouped
      ? this.runGrouped(collection, matchStage, prePipeline, definition, source.fields)
      : this.runFlat(collection, matchStage, prePipeline, definition, source.fields, normalizedOptions);
  }

  /**
   * Convenience wrapper for callers that need the FULL matching result
   * set rather than one preview page -- exports, pivot input, and
   * drill-down detail all want "every row matching these filters," not
   * page 1 of a paginated preview. Still capped at FULL_RESULT_CAP
   * (never an unbounded query against Mongo from a synchronous
   * request), with `truncated` reported on the result so callers can
   * warn the user their filters matched more than the cap.
   */
  async runFull(
    definition: ReportDefinition,
    tenantId: string,
    extraFilters: ReportFilterCondition[] = []
  ): Promise<ReportResult> {
    return this.run(definition, tenantId, {
      extraFilters,
      pagination: { page: 1, limit: FULL_RESULT_CAP },
      capOverride: FULL_RESULT_CAP,
    });
  }

  private async runFlat(
    collection: Collection<Document>,
    matchStage: Filter<Document>,
    prePipeline: Document[],
    definition: ReportDefinition,
    sourceFields: DataSourceFieldDefinition[],
    options: RunOptions
  ): Promise<ReportResult> {
    const fieldKeys = definition.fields.length ? definition.fields : sourceFields.map((f) => f.key);
    const sortSpec = buildMongoSort(definition.sort);

    const page = options.pagination?.page ?? 1;
    const limit = Math.min(
      options.pagination?.limit ?? DEFAULT_PREVIEW_LIMIT,
      options.capOverride ?? MAX_PREVIEW_LIMIT
    );
    const skip = (page - 1) * limit;

    const projection: Record<string, 1> = { _id: 0 };
    for (const key of fieldKeys) projection[key] = 1;

    const aggregatableKeys = fieldKeys.filter(
      (key) => sourceFields.find((f) => f.key === key)?.aggregatable
    );
    const totalsGroup: Document = { _id: null };
    for (const key of aggregatableKeys) totalsGroup[key] = { $sum: `$${key}` };

    const dataPipeline: Document[] = [];
    if (sortSpec) dataPipeline.push({ $sort: sortSpec });
    dataPipeline.push({ $skip: skip }, { $limit: limit }, { $project: projection });

    const pipeline: Document[] = [
      { $match: matchStage },
      ...prePipeline,
      {
        $facet: {
          data: dataPipeline,
          totalCount: [{ $count: 'count' }],
          totals: aggregatableKeys.length ? [{ $group: totalsGroup }] : [],
        },
      },
    ];

    const [facetResult] = await collection.aggregate(pipeline).toArray();
    const rows = (facetResult?.data ?? []) as Record<string, unknown>[];
    const totalMatched: number = facetResult?.totalCount?.[0]?.count ?? 0;
    const totalsDoc = (facetResult?.totals?.[0] ?? {}) as Record<string, number>;

    const columns: ReportResultColumn[] = fieldKeys.map((key) => {
      const def = sourceFields.find((f) => f.key === key);
      return { key, label: def?.label ?? key, type: def?.type ?? 'string' };
    });

    const totals: Record<string, number> = {};
    for (const key of aggregatableKeys) {
      totals[key] = totalsDoc[key] ?? 0;
    }

    return {
      columns,
      rows,
      totals,
      totalMatched,
      truncated: totalMatched > skip + rows.length,
      page,
      pageSize: limit,
    };
  }

  private async runGrouped(
    collection: Collection<Document>,
    matchStage: Filter<Document>,
    prePipeline: Document[],
    definition: ReportDefinition,
    sourceFields: DataSourceFieldDefinition[]
  ): Promise<ReportResult> {
    const groupFields = definition.groupBy.map((g) => g.field);
    const groupStage = buildGroupStage(definition.groupBy, definition.aggregations);
    const sortSpec = buildMongoSort(definition.sort);

    const pipeline: Document[] = [
      { $match: matchStage },
      ...prePipeline,
      groupStage,
      ...(sortSpec ? [{ $sort: sortSpec }] : []),
    ];

    const groupedDocs = (await collection.aggregate(pipeline).toArray()) as Record<string, unknown>[];

    const groupSummaries: ReportGroupSummary[] = [];
    const flatRows: Record<string, unknown>[] = [];

    let grandTotalCount = 0;
    const grandTotals: Record<string, number> = {};

    for (const doc of groupedDocs) {
      const { key, row } = flattenGroupedDoc(doc, groupFields);

      const aggregates: Record<string, number> = {};
      for (const agg of definition.aggregations) {
        const value = Number(doc[agg.alias] ?? 0);
        aggregates[agg.alias] = value;
        grandTotals[agg.alias] = (grandTotals[agg.alias] ?? 0) + value;
      }
      const count = Number(doc.__count ?? 0);
      grandTotalCount += count;

      groupSummaries.push({ key, label: key, count, aggregates });
      flatRows.push(row);
    }

    const columns: ReportResultColumn[] = [
      ...groupFields.map((f) => {
        const def = sourceFields.find((sf) => sf.key === f);
        return { key: f, label: def?.label ?? f, type: (def?.type as ReportResultColumn['type']) ?? 'string' };
      }),
      { key: 'count', label: 'Count', type: 'number' as const },
      ...definition.aggregations.map((a) => ({ key: a.alias, label: a.alias, type: 'number' as const })),
    ];

    return {
      columns,
      rows: flatRows,
      totals: { count: grandTotalCount, ...grandTotals },
      groupSummaries,
      totalMatched: groupedDocs.length,
      truncated: false,
      page: 1,
      pageSize: groupedDocs.length,
    };
  }
}

export const reportQueryEngine = new ReportQueryEngine();