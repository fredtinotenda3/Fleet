// tests/security/gap-closure-routes-reachable.spec.ts
//
// GAP-CLOSURE PASS, Objectives 1 and 5. Same discipline as
// normalization-review-reachable.spec.ts's own header ("a service
// method with no route is not a feature") applied to this pass's new
// routes: asserts each one exists, is wrapped in withAuth, calls the
// controller method its own header names, and is gated by the
// permission its own header documents -- TRANSPORT_COST_VIEW for reads,
// TRANSPORT_COST_NORMALIZE for the master-data writes (never a bare,
// ungated export; never the wrong permission level).
//
// Objective 3's alternative-identity-selection capability rides the
// EXISTING confirm-match route (already covered by
// normalization-review-reachable.spec.ts) -- no new route was needed
// for that objective, so nothing new to pin here for it beyond the
// audit-trail behaviour already proven in
// normalization-review-gap-closure.spec.ts.

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const readRaw = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const read = (rel: string) => stripComments(readRaw(rel));

describe('Objective 1: the operation detail page\'s audit history is reachable', () => {
  it('GET .../source-records/[id]/audit is gated by TRANSPORT_COST_VIEW, never AUDIT_LOG_VIEW or a manage-level permission', () => {
    const route = read('app/api/transport-cost/source-records/[id]/audit/route.ts');
    expect(route).toMatch(/export const GET = withAuth/);
    expect(route).toMatch(/transportCostController\.getSourceRecordAuditHistory\(req, id\)/);
    expect(route).toMatch(/permission:\s*Permission\.TRANSPORT_COST_VIEW/);
    expect(route).not.toContain('Permission.AUDIT_LOG_VIEW');
    expect(route).not.toContain('Permission.TRANSPORT_COST_MANAGE');
  });
});

describe('Objective 5: "add new master data" is reachable and correctly gated', () => {
  it('POST .../transporters/request-new is gated by TRANSPORT_COST_NORMALIZE, never bare VIEW', () => {
    const route = read('app/api/transport-cost/transporters/request-new/route.ts');
    expect(route).toMatch(/export const POST = withAuth/);
    expect(route).toMatch(/masterDataController\.requestNewTransporter\(req\)/);
    expect(route).toMatch(/permission:\s*Permission\.TRANSPORT_COST_NORMALIZE/);
  });

  it('POST .../vehicles/request-new is gated by TRANSPORT_COST_NORMALIZE', () => {
    const route = read('app/api/transport-cost/vehicles/request-new/route.ts');
    expect(route).toMatch(/export const POST = withAuth/);
    expect(route).toMatch(/masterDataController\.requestNewVehicle\(req\)/);
    expect(route).toMatch(/permission:\s*Permission\.TRANSPORT_COST_NORMALIZE/);
  });

  it('GET .../master-data/pending (the review UI\'s own data source) is gated by TRANSPORT_COST_VIEW, not NORMALIZE', () => {
    const route = read('app/api/transport-cost/master-data/pending/route.ts');
    expect(route).toMatch(/export const GET = withAuth/);
    expect(route).toMatch(/masterDataController\.listPendingMasterData\(req\)/);
    expect(route).toMatch(/permission:\s*Permission\.TRANSPORT_COST_VIEW/);
  });

  it('POST .../master-data/[kind]/[id]/confirm is gated by TRANSPORT_COST_NORMALIZE', () => {
    const route = read('app/api/transport-cost/master-data/[kind]/[id]/confirm/route.ts');
    expect(route).toMatch(/export const POST = withAuth/);
    expect(route).toMatch(/masterDataController\.confirmPendingMasterData\(req, kind, id\)/);
    expect(route).toMatch(/permission:\s*Permission\.TRANSPORT_COST_NORMALIZE/);
  });

  it('POST .../master-data/[kind]/[id]/reject is gated by TRANSPORT_COST_NORMALIZE', () => {
    const route = read('app/api/transport-cost/master-data/[kind]/[id]/reject/route.ts');
    expect(route).toMatch(/export const POST = withAuth/);
    expect(route).toMatch(/masterDataController\.rejectPendingMasterData\(req, kind, id\)/);
    expect(route).toMatch(/permission:\s*Permission\.TRANSPORT_COST_NORMALIZE/);
  });

  it('none of the five new routes are exported without withAuth (no accidentally-public write)', () => {
    const files = [
      'app/api/transport-cost/transporters/request-new/route.ts',
      'app/api/transport-cost/vehicles/request-new/route.ts',
      'app/api/transport-cost/master-data/pending/route.ts',
      'app/api/transport-cost/master-data/[kind]/[id]/confirm/route.ts',
      'app/api/transport-cost/master-data/[kind]/[id]/reject/route.ts',
    ];
    for (const file of files) {
      const source = read(file);
      // Every exported HTTP verb handler must be the withAuth(...) call itself.
      const verbExports = source.match(/export const (GET|POST|PUT|PATCH|DELETE) =/g) ?? [];
      expect(verbExports.length).toBeGreaterThan(0);
      for (const exportLine of verbExports) {
        const verb = exportLine.match(/export const (\w+)/)![1];
        expect(source).toMatch(new RegExp(`export const ${verb} = withAuth`));
      }
    }
  });
});
