// tests/unit/telematics/report-alerts-data-source.spec.ts
//
// WAVE 3, R.3.8 -- Exception/Alert Reports. Source-conformance tests
// (the same approach as tests/unit/vehicles/vehicle-attention-wiring.spec.ts
// and this session's own maps-widget-wiring.spec.ts: jest runs
// `testEnvironment: 'node'` with no live Mongo here, and the report
// builder's data-source registrations and prePipeline stages are plain
// config objects best pinned at the source-text level plus the
// registry's own runtime behaviour, which IS testable directly).
//
// What this suite pins:
//   1. The `alerts` data source is registered over the SAME collection
//      the alert engine already writes (tbltelematics_alerts) -- no
//      second alert store.
//   2. Backend field keys and the frontend's mirrored field catalog stay
//      byte-for-byte identical (columnResolvers.ts's own stated
//      invariant) -- this is the drift regression columnResolvers.ts's
//      header comment warns about.
//   3. No fabricated `driver` field: TelematicsAlert has no stored
//      driver association, so this source must not join one in.
//   4. `status` is derived from `acknowledgedAt`, not hardcoded/omitted.
//   5. The new `getAlertsForTenant` repository method matches its six
//      siblings' tenant-only scoping shape for the KPI-engine legacy
//      fetch path (report-query.engine.ts's own pushdown path, which
//      DOES enforce org-unit scope, is covered separately by
//      tests/security/report-scope.spec.ts).

import * as fs from 'fs';
import * as path from 'path';
import { dataSourceRegistry } from '@/modules/reporting/registry/DataSourceRegistry';
import { bootstrapDataSources } from '@/modules/reporting/registry/bootstrap-data-sources';
import { REPORT_DATA_SOURCES } from '@/frontend/modules/reports/schemas/reportDefinition';
import { getFieldsForDataSource } from '@/frontend/modules/reports/utils/columnResolvers';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

beforeAll(() => {
  bootstrapDataSources();
});

describe('alerts data source: registered over the existing alert store, not a second one', () => {
  it('is registered with collectionName tbltelematics_alerts', () => {
    const source = dataSourceRegistry.getOrThrow('alerts');
    expect(source.collectionName).toBe('tbltelematics_alerts');
  });

  it('is tenant-scoped and excludes soft-deleted rows via baseFilter', () => {
    const source = dataSourceRegistry.getOrThrow('alerts');
    expect(source.baseFilter('tenant-x')).toEqual({ tenantId: 'tenant-x', isDeleted: { $ne: true } });
  });

  it('carries a legacy fetch fallback for the KPI engine, backed by the shared telematics repository', () => {
    const src = read('modules/reporting/registry/data-sources/alerts.data-source.ts');
    expect(src).toMatch(/telematicsRepository\.getAlertsForTenant\(tenantId\)/);
    // No second collection handle opened here.
    expect(src).not.toMatch(/db\.collection\(/);
  });
});

describe('alerts data source: honest fields only', () => {
  const fieldKeys = () => dataSourceRegistry.getOrThrow('alerts').fields.map((f) => f.key);

  it('exposes type/severity/status/message/value/threshold/timestamp/acknowledgedAt/license_plate + org-unit fields', () => {
    expect(fieldKeys().sort()).toEqual(
      [
        'type',
        'severity',
        'status',
        'message',
        'value',
        'threshold',
        'timestamp',
        'acknowledgedAt',
        'license_plate',
        'orgUnitId',
        'orgUnitName',
      ].sort()
    );
  });

  it('never registers a driver field -- TelematicsAlert has no stored driver association', () => {
    expect(fieldKeys()).not.toContain('driver');
    expect(fieldKeys()).not.toContain('driver_id');
    expect(fieldKeys()).not.toContain('driverId');
  });

  it('derives status from acknowledgedAt in Mongo, not a JS-side transform', () => {
    const src = read('modules/reporting/registry/data-sources/alerts.data-source.ts');
    expect(src).toMatch(/status:\s*\{\s*\$cond:\s*\[\{\s*\$ifNull:\s*\['\$acknowledgedAt', false\]\s*\},\s*'acknowledged',\s*'active'\]/);
  });

  it('resolves license_plate via a defensive $toString $lookup, mirroring orgUnitLookupStages', () => {
    const src = read('modules/reporting/registry/data-sources/alerts.data-source.ts');
    expect(src).toMatch(/from: 'tblvehicles'/);
    expect(src).toMatch(/\$eq: \[\{ \$toString: '\$_id' \}, \{ \$toString: '\$\$vId' \}\]/);
    expect(src).toMatch(/import \{ orgUnitLookupStages \} from '\.\.\/bootstrap-data-sources'/);
  });
});

describe('frontend/backend field catalog parity (the invariant columnResolvers.ts documents)', () => {
  it("REPORT_DATA_SOURCES includes 'alerts'", () => {
    expect(REPORT_DATA_SOURCES).toContain('alerts');
  });

  it('every backend alert field key has a byte-identical frontend counterpart, and vice versa', () => {
    const backendKeys = dataSourceRegistry.getOrThrow('alerts').fields.map((f) => f.key).sort();
    const frontendKeys = getFieldsForDataSource('alerts').map((f) => f.field).sort();
    expect(frontendKeys).toEqual(backendKeys);
  });

  it('groupable/aggregatable flags agree between backend and frontend for every field', () => {
    const backend = dataSourceRegistry.getOrThrow('alerts').fields;
    const frontend = getFieldsForDataSource('alerts');
    for (const b of backend) {
      const f = frontend.find((x) => x.field === b.key);
      expect(f).toBeDefined();
      expect(f!.groupable).toBe(b.groupable);
      expect(f!.aggregatable).toBe(b.aggregatable);
    }
  });
});

describe('getAlertsForTenant: matches the other six data sources’ legacy-fetch scoping shape exactly', () => {
  it('is tenant-only (matches getFilteredVehicles/getFilteredExpenses/getFilteredLogs/getFilteredReminders/getFilteredTrips), not a new/inconsistent restriction', () => {
    const src = read('modules/telematics/repositories/telematics.repository.ts');
    const methodStart = src.indexOf('async getAlertsForTenant');
    expect(methodStart).toBeGreaterThan(-1);
    const methodBody = src.slice(methodStart, methodStart + 700);
    expect(methodBody).toMatch(/tenantId,\s*isDeleted: \{ \$ne: true \}/);
    // Deliberately NOT filtered to unacknowledged-only, unlike
    // getActiveAlertsInScope/getAlertSummaryInScope -- a report needs
    // both active and acknowledged rows so status is a real column.
    expect(methodBody).not.toMatch(/acknowledgedAt: \{ \$exists: false \}/);
  });
});
