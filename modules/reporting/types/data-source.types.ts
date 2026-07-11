// modules/reporting/types/data-source.types.ts

export type DataSourceKey = 'vehicles' | 'expenses' | 'fuel' | 'maintenance' | 'trips';

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
  fetch: (tenantId: string) => Promise<Array<Record<string, unknown>>>;
}