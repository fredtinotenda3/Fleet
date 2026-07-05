// modules/reporting/types/data-source.types.ts

export type DataSourceKey =
  | 'vehicles'
  | 'expenses'
  | 'fuel'
  | 'maintenance'
  | 'trips';

export type ReportFieldType = 'string' | 'number' | 'date' | 'boolean' | 'currency';

export interface ReportFieldDefinition {
  key: string;
  label: string;
  type: ReportFieldType;
  /** Whether this field can be summed/averaged/etc in an aggregation. */
  aggregatable: boolean;
  /** Whether this field is sensible to group rows by (low-cardinality-ish). */
  groupable: boolean;
}

/**
 * A registered, queryable entity for the report builder. `fetch` returns
 * flat, denormalized rows keyed by each field's `key` — every data source
 * is responsible for shaping its own repository output into this flat
 * shape so the generic query/pivot/KPI engines never need to know about
 * domain-specific schemas.
 */
export interface DataSourceDefinition {
  key: DataSourceKey;
  label: string;
  fields: ReportFieldDefinition[];
  fetch: (tenantId: string) => Promise<Array<Record<string, unknown>>>;
}