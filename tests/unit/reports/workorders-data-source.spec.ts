// tests/unit/reports/workorders-data-source.spec.ts
//
// WAVE 3, R.3.6 -- Work Order Reporting.
//
// Pins the `workorders` report data source itself: it is registered
// into the shared DataSourceRegistry (not a parallel/second reporting
// engine), reads from `tblworkorders` (the one authoritative work-order
// collection), is tenant-scoped like every other source, and -- the
// data-truth-relevant assertion -- exposes no "overdue"/SLA/downtime
// field, because WorkOrder has no due-date or out-of-service timestamp
// to honestly derive one from. Export/scheduling authorization for this
// source is not re-tested here: both paths run through
// ReportQueryEngine.run() -> orgUnitPredicate(), already pinned
// end-to-end by tests/security/report-scope.spec.ts (extended in this
// delivery to include 'tblworkorders'), so a second test of the same
// shared mechanism would just be redundant coverage.

import { dataSourceRegistry } from '../../../modules/reporting/registry/DataSourceRegistry';
import { bootstrapDataSources } from '../../../modules/reporting/registry/bootstrap-data-sources';
import { workordersDataSource } from '../../../modules/reporting/registry/data-sources/workorders.data-source';
import { REPORT_DATA_SOURCES } from '../../../frontend/modules/reports/schemas/reportDefinition';
import { getFieldsForDataSource } from '../../../frontend/modules/reports/utils/columnResolvers';

describe('workorders report data source', () => {
  beforeAll(() => bootstrapDataSources());

  it('is registered in the shared DataSourceRegistry under the key "workorders"', () => {
    const registered = dataSourceRegistry.get('workorders');
    expect(registered).toBeDefined();
    expect(registered?.collectionName).toBe('tblworkorders');
  });

  it('base-filters by tenantId and excludes soft-deleted rows, like every other source', () => {
    const filter = workordersDataSource.baseFilter('org-1');
    expect(filter).toEqual({ tenantId: 'org-1', isDeleted: { $ne: true } });
  });

  it('exposes vehicle (license_plate), workshop (bayName/orgUnitName), technician (mechanicName), cost, and timestamp fields', () => {
    const keys = workordersDataSource.fields.map((f) => f.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'license_plate',
        'bayName',
        'orgUnitName',
        'mechanicName',
        'status',
        'priority',
        'source',
        'openedAt',
        'completedAt',
        'turnaroundHours',
        'totalCost',
        'partsCost',
        'laborCost',
      ])
    );
  });

  it('does NOT expose an overdue/SLA/downtime field -- WorkOrder has no due-date or out-of-service field to derive one from', () => {
    const keys = workordersDataSource.fields.map((f) => f.key.toLowerCase());
    expect(keys.some((k) => k.includes('overdue'))).toBe(false);
    expect(keys.some((k) => k.includes('sla'))).toBe(false);
    expect(keys.some((k) => k.includes('downtime'))).toBe(false);
  });

  it('turnaroundHours is aggregatable (so a report can average/sum it) but not a fabricated always-present figure -- see the prePipeline $cond', () => {
    const field = workordersDataSource.fields.find((f) => f.key === 'turnaroundHours');
    expect(field?.aggregatable).toBe(true);
    expect(field?.type).toBe('number');
  });

  it('prePipeline derives turnaroundHours only when completedAt is present, and mechanic/bay names default to null rather than a guess', () => {
    const stages = workordersDataSource.prePipeline?.('org-1') ?? [];
    const addFieldsStage = stages.find((s) => '$addFields' in (s as Record<string, unknown>)) as any;
    expect(addFieldsStage).toBeDefined();
    const turnaroundExpr = JSON.stringify(addFieldsStage.$addFields.turnaroundHours);
    expect(turnaroundExpr).toContain('completedAt');
    expect(turnaroundExpr).toContain('null');
    expect(JSON.stringify(addFieldsStage.$addFields.mechanicName)).toContain('null');
  });
});

describe('DataSourceKey / frontend mirrors include "workorders"', () => {
  it('REPORT_DATA_SOURCES (report builder form schema) includes workorders', () => {
    expect(REPORT_DATA_SOURCES).toContain('workorders');
  });

  it('columnResolvers FIELD_CATALOG resolves fields for workorders', () => {
    const fields = getFieldsForDataSource('workorders');
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.some((f) => f.field === 'totalCost')).toBe(true);
  });
});
