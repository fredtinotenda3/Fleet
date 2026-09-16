// tests/unit/reports/allocations-data-source.spec.ts
//
// WAVE 3, R.3.7 -- Financial / Cost Intelligence Reporting.
//
// Pins the `allocations` report data source itself: it is registered
// into the shared DataSourceRegistry (not a parallel/second reporting
// engine or a second cost-per-km implementation), reads from
// `tblallocationledger` (the cost-per-km engine's own ledger), is
// tenant-scoped like every other source, requires FINANCE_VIEW, and --
// the data-truth-relevant assertions -- never marks a mixed-currency-
// risk field (`amount`, `currency`, `quantity`) aggregatable, while the
// one genuinely summable figure (`reportingAmount`, already normalized
// into the tenant's single reporting currency) is. Org-unit scoping and
// permission-gating end-to-end are pinned separately by
// tests/security/report-scope.spec.ts and
// tests/security/report-builder-permission-gating.spec.ts respectively
// -- not re-tested here, to avoid redundant coverage of the same shared
// mechanisms.

import { dataSourceRegistry } from '../../../modules/reporting/registry/DataSourceRegistry';
import { bootstrapDataSources } from '../../../modules/reporting/registry/bootstrap-data-sources';
import { allocationsDataSource } from '../../../modules/reporting/registry/data-sources/allocations.data-source';
import { Permission } from '../../../server/permissions/roles';
import { REPORT_DATA_SOURCES } from '../../../frontend/modules/reports/schemas/reportDefinition';
import { getFieldsForDataSource } from '../../../frontend/modules/reports/utils/columnResolvers';

describe('allocations report data source', () => {
  beforeAll(() => bootstrapDataSources());

  it('is registered in the shared DataSourceRegistry under the key "allocations", reading tblallocationledger', () => {
    const registered = dataSourceRegistry.get('allocations');
    expect(registered).toBeDefined();
    expect(registered?.collectionName).toBe('tblallocationledger');
  });

  it('requires FINANCE_VIEW -- the same permission every other allocation-ledger read path (postings, cost-per-km, GL reconciliation) already requires', () => {
    expect(allocationsDataSource.requiredPermission).toBe(Permission.FINANCE_VIEW);
  });

  it('base-filters by tenantId and excludes soft-deleted rows, like every other source', () => {
    const filter = allocationsDataSource.baseFilter('org-1');
    expect(filter).toEqual({ tenantId: 'org-1', isDeleted: { $ne: true } });
  });

  it('exposes vehicle, driver, cost category, allocation rule, provenance, period, currency/FX, GL, and reversal fields', () => {
    const keys = allocationsDataSource.fields.map((f) => f.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'license_plate',
        'vehicleId',
        'driverName',
        'driverId',
        'costCategory',
        'allocationRule',
        'sourceCollection',
        'sourceId',
        'periodStart',
        'periodEnd',
        'quantity',
        'unit',
        'currency',
        'amount',
        'fxRate',
        'fxRateDate',
        'fxSource',
        'reportingCurrency',
        'reportingAmount',
        'glAccountCode',
        'postedAt',
        'postedBy',
        'isReversal',
        'reversalOfPostingId',
        'reversalReason',
        'orgUnitId',
        'orgUnitName',
      ])
    );
  });

  it('never marks the ORIGINAL transaction currency/amount aggregatable -- postings can legitimately mix currencies, and summing raw amount would fabricate a figure', () => {
    const amount = allocationsDataSource.fields.find((f) => f.key === 'amount');
    const currency = allocationsDataSource.fields.find((f) => f.key === 'currency');
    expect(amount?.aggregatable).toBe(false);
    expect(currency?.aggregatable).toBe(false);
  });

  it('never marks quantity aggregatable -- allocationRule denominators (km/day/engine-hour/driver-share) cannot be summed across mixed units', () => {
    const quantity = allocationsDataSource.fields.find((f) => f.key === 'quantity');
    expect(quantity?.aggregatable).toBe(false);
  });

  it('marks reportingAmount (and only reportingAmount) as the aggregatable monetary figure -- already normalized into the tenant\'s one configured reporting currency', () => {
    const reportingAmount = allocationsDataSource.fields.find((f) => f.key === 'reportingAmount');
    expect(reportingAmount?.aggregatable).toBe(true);
    expect(reportingAmount?.type).toBe('currency');

    const aggregatableKeys = allocationsDataSource.fields.filter((f) => f.aggregatable).map((f) => f.key);
    expect(aggregatableKeys).toEqual(['reportingAmount']);
  });

  it('exposes reportingCurrency as groupable, so a report summing reportingAmount can also group by currency to surface a mixed-currency period rather than hide it', () => {
    const reportingCurrency = allocationsDataSource.fields.find((f) => f.key === 'reportingCurrency');
    expect(reportingCurrency?.groupable).toBe(true);
  });

  it('does not fabricate an ROI/estimatedBenefit field -- the audit found no defensible ROI in this ledger (see the R.3.7 handoff)', () => {
    const keys = allocationsDataSource.fields.map((f) => f.key.toLowerCase());
    expect(keys.some((k) => k.includes('roi'))).toBe(false);
    expect(keys.some((k) => k.includes('estimatedbenefit'))).toBe(false);
    expect(keys.some((k) => k.includes('savings'))).toBe(false);
  });

  it('prePipeline resolves vehicle/driver names via $lookup and derives isReversal in Mongo, defaulting missing joins to null rather than a guess', () => {
    const stages = allocationsDataSource.prePipeline?.('org-1') ?? [];
    const addFieldsStage = stages.find(
      (s) => '$addFields' in (s as Record<string, unknown>) && Boolean((s as any).$addFields?.isReversal)
    ) as any;
    expect(addFieldsStage).toBeDefined();
    expect(JSON.stringify(addFieldsStage.$addFields.license_plate)).toContain('null');
    expect(JSON.stringify(addFieldsStage.$addFields.driverName)).toContain('null');
    expect(JSON.stringify(addFieldsStage.$addFields.isReversal)).toContain('reversalOfPostingId');
  });
});

describe('DataSourceKey / frontend mirrors include "allocations"', () => {
  it('REPORT_DATA_SOURCES (report builder form schema) includes allocations', () => {
    expect(REPORT_DATA_SOURCES).toContain('allocations');
  });

  it('columnResolvers FIELD_CATALOG resolves fields for allocations, matching the backend keys byte-for-byte', () => {
    const fields = getFieldsForDataSource('allocations');
    expect(fields.length).toBeGreaterThan(0);
    const frontendKeys = new Set(fields.map((f) => f.field));
    for (const backendField of allocationsDataSource.fields) {
      expect(frontendKeys.has(backendField.key)).toBe(true);
    }
  });

  it('the frontend catalog agrees with the backend on which single field is aggregatable (reportingAmount)', () => {
    const fields = getFieldsForDataSource('allocations');
    const aggregatable = fields.filter((f) => f.aggregatable).map((f) => f.field);
    expect(aggregatable).toEqual(['reportingAmount']);
  });
});
