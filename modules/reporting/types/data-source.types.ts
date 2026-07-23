// modules/reporting/types/data-source.types.ts

import type { Document, Filter } from 'mongodb';

export type DataSourceKey =
  | 'vehicles'
  | 'expenses'
  | 'fuel'
  | 'maintenance'
  | 'trips'
  | 'drivers'
  | 'organizations';

export interface DataSourceFieldDefinition {
  key: string;
  label: string;
  type: 'string' | 'number' | 'currency' | 'date' | 'boolean';
  aggregatable: boolean;
  groupable: boolean;
}

export interface DataSourceDefinition {
  key: DataSourceKey;
  label: string;
  fields: DataSourceFieldDefinition[];

  /** Underlying Mongo collection this source reads from (tenant-scoped). */
  collectionName: string;

  /**
   * Base `$match` clause applied to EVERY query against this source,
   * before any user-defined report filters are layered on -- tenant
   * scoping and soft-delete exclusion live here, so every report
   * definition against this source is automatically tenant-safe.
   */
  baseFilter: (tenantId: string) => Filter<Document>;

  /**
   * Optional pipeline stages (e.g. `$lookup` joins) run immediately
   * after the base `$match`, before user filters/grouping are applied.
   *
   * IMPORTANT: fields added by a prePipeline stage (e.g. a resolved
   * `orgUnitName` from a `$lookup`) are NOT available inside the
   * initial `$match` in report-query.engine.ts -- that match runs
   * first, using only fields already present on the source document.
   * They ARE available for grouping, sorting, and column projection.
   * Concretely: a report can group by / display `orgUnitName`, and can
   * filter by `orgUnitId` (present on the raw document), but cannot
   * filter by `orgUnitName` directly.
   */
  prePipeline?: (tenantId: string) => Document[];

  /**
   * LEGACY fallback: fetches a capped row set into memory via the
   * module's existing repository method. report-query.engine.ts's
   * pushdown path (`run`/`runFull`) does NOT call this.
   */
  fetch: (tenantId: string) => Promise<Array<Record<string, unknown>>>;
}