// tests/unit/vehicles/vehicle-attention-wiring.spec.ts
//
// WAVE 1 PART 2, item 7: source-text conformance for the frontend half
// of the vehicle-scoped Needs-Attention integration -- the same
// approach as tests/unit/vehicles/fuel-reconciliation-panel-wiring.spec.ts
// and tests/security/trip-history-vehicle-scope.spec.ts's frontend half,
// for the same reason: jest here runs `testEnvironment: 'node'` with no
// jsdom, and these components call React Query hooks that cannot be
// invoked outside a real React render.
//
// What this suite pins, specifically: the UI reaches the vehicle-scoped
// endpoint via a DEDICATED query param, never the fleet-wide feed
// filtered client-side -- the exact anti-pattern the item's brief rules
// out ("do NOT solve vehicle filtering by fetching a fleet-wide/
// truncated Attention feed and filtering it in the browser").

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('useVehicleNeedsAttention: calls the dedicated vehicle-scoped endpoint, not the fleet-wide feed', () => {
  const src = () => read('frontend/modules/vehicles/hooks/useVehicleAttention.ts');

  it('calls dashboardApi.getNeedsAttentionForVehicle, not getNeedsAttention', () => {
    const s = src();
    expect(s).toMatch(/dashboardApi\.getNeedsAttentionForVehicle\(vehicleId/);
    expect(s).not.toMatch(/dashboardApi\.getNeedsAttention\(/); // would match the fleet-wide method
  });

  it('is disabled until a vehicleId is known, so it can never fire an unscoped request', () => {
    expect(src()).toMatch(/enabled: Boolean\(vehicleId\)/);
  });
});

describe('dashboardApi.getNeedsAttentionForVehicle: a dedicated endpoint call, not a client-side filter', () => {
  const src = () => read('frontend/modules/dashboard/services/dashboard.api.ts');

  it('passes vehicleId as a query param to the server, and does not filter a fetched list', () => {
    const s = src();
    expect(s).toMatch(
      /getNeedsAttentionForVehicle\(vehicleId: string, limit = 50\)[\s\S]*?params: \{ vehicleId, limit \}/
    );
    // No local `.filter(` anywhere near this method would indicate a
    // client-side narrowing step -- the narrowing must happen server-side.
    const methodBody = s.slice(s.indexOf('getNeedsAttentionForVehicle'), s.indexOf('getNeedsAttentionForVehicle') + 400);
    expect(methodBody).not.toMatch(/\.filter\(/);
  });
});

describe('VehicleAttentionPanel: renders items from the vehicle-scoped hook only', () => {
  const src = () => read('frontend/modules/vehicles/components/operations/VehicleAttentionPanel.tsx');

  it('uses useVehicleNeedsAttention(vehicleId), not the fleet-wide useAttentionQueue', () => {
    const s = src();
    expect(s).toMatch(/useVehicleNeedsAttention\(vehicleId\)/);
    expect(s).not.toMatch(/useAttentionQueue/);
  });

  it('reuses the existing AttentionItemCard/ResolveAttentionDialog/useAttentionActions rather than a parallel action implementation', () => {
    const s = src();
    expect(s).toMatch(/from '@\/frontend\/modules\/attention\/components\/AttentionItemCard'/);
    expect(s).toMatch(/from '@\/frontend\/modules\/attention\/components\/ResolveAttentionDialog'/);
    expect(s).toMatch(/from '@\/frontend\/modules\/attention\/hooks\/useAttentionActions'/);
  });

  it('does not fetch-then-filter: no client-side entityId/vehicleId comparison against a broader list', () => {
    const s = src();
    expect(s).not.toMatch(/entityId\s*===\s*vehicleId/);
    expect(s).not.toMatch(/\.filter\(\s*\(?item/);
  });
});

describe('VehicleDetailPage: wires VehicleAttentionPanel with the authorized vehicle id', () => {
  it('passes vehicle._id, not a client-supplied/derived plate, and only when the vehicle record has resolved', () => {
    const s = read('frontend/modules/vehicles/pages/VehicleDetailPage.tsx');
    expect(s).toMatch(/from '\.\.\/components\/operations\/VehicleAttentionPanel'/);
    expect(s).toMatch(/vehicle\._id &&[\s\S]*?<VehicleAttentionPanel vehicleId=\{vehicle\._id\} \/>/);
  });
});

describe('aiController.getNeedsAttention: an optional ?vehicleId= branches to the vehicle-scoped service method', () => {
  const src = () => read('modules/ai/controllers/ai.controller.ts');

  it('routes to needsAttentionService.getFeedForVehicle only when vehicleId is present, otherwise the fleet-wide getFeed', () => {
    const s = src();
    expect(s).toMatch(/const vehicleId = req\.nextUrl\.searchParams\.get\('vehicleId'\)/);
    expect(s).toMatch(
      /vehicleId\s*\n?\s*\?\s*await needsAttentionService\.getFeedForVehicle\(tenantId, vehicleId, aiContext, limit\)\s*\n?\s*:\s*await needsAttentionService\.getFeed\(tenantId, aiContext, limit\)/
    );
  });

  it('does not read a separate licensePlate query param -- the endpoint has exactly one vehicle identifier', () => {
    const s = src();
    const getNeedsAttentionBody = s.slice(s.indexOf('async getNeedsAttention'), s.indexOf('async getNeedsAttention') + 800);
    expect(getNeedsAttentionBody).not.toMatch(/licensePlate/);
  });
});
