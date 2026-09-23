// tests/security/normalization-review-reachable.spec.ts
//
// ---------------------------------------------------------------------
// A SERVICE METHOD WITH NO ROUTE IS NOT A FEATURE
// ---------------------------------------------------------------------
// transportCostQueryService.listNormalizationReviewQueue and
// transportCostCommandService.confirmReviewMatch/confirmReviewNew/
// rejectReviewItem were implemented, tested, and doc-commented with the
// exact route paths they expected ("GET /api/transport-cost/
// normalization-review", "POST .../[id]/confirm-match", etc.) -- but no
// app/api/transport-cost/normalization-review/**/route.ts file was ever
// created. Found while onboarding Olivine's first real transport-cost
// data: an import can leave PENDING review items with genuinely no way
// to ever confirm one except a raw command invocation.
//
// This asserts the four routes exist, call the controller method their
// own doc comment names, and are gated by the permission
// server/permissions/roles.ts documents for this exact queue
// (TRANSPORT_COST_NORMALIZE for the three write actions;
// TRANSPORT_COST_VIEW, matching /source-records, for the read-only
// list) -- so a future refactor that silently drops a route file, or
// weakens its permission, fails a test instead of shipping unnoticed.

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const readRaw = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const read = (rel: string) => stripComments(readRaw(rel));

describe('the normalization review queue is reachable', () => {
  it('GET /api/transport-cost/normalization-review lists the queue, gated by TRANSPORT_COST_VIEW', () => {
    const route = read('app/api/transport-cost/normalization-review/route.ts');
    expect(route).toMatch(/export const GET = withAuth/);
    expect(route).toMatch(/transportCostController\.listNormalizationReviewQueue\(req\)/);
    expect(route).toMatch(/permission:\s*Permission\.TRANSPORT_COST_VIEW/);
  });

  it('POST .../[id]/confirm-match resolves a review item onto an existing entity, gated by TRANSPORT_COST_NORMALIZE', () => {
    const route = read('app/api/transport-cost/normalization-review/[id]/confirm-match/route.ts');
    expect(route).toMatch(/export const POST = withAuth/);
    expect(route).toMatch(/transportCostController\.confirmReviewMatch\(req, id\)/);
    expect(route).toMatch(/permission:\s*Permission\.TRANSPORT_COST_NORMALIZE/);
  });

  it('POST .../[id]/confirm-new creates a new TransportPartner/ContractedVehicle, gated by TRANSPORT_COST_NORMALIZE', () => {
    const route = read('app/api/transport-cost/normalization-review/[id]/confirm-new/route.ts');
    expect(route).toMatch(/export const POST = withAuth/);
    expect(route).toMatch(/transportCostController\.confirmReviewNew\(req, id\)/);
    expect(route).toMatch(/permission:\s*Permission\.TRANSPORT_COST_NORMALIZE/);
  });

  it('POST .../[id]/reject rejects a review item, gated by TRANSPORT_COST_NORMALIZE', () => {
    const route = read('app/api/transport-cost/normalization-review/[id]/reject/route.ts');
    expect(route).toMatch(/export const POST = withAuth/);
    expect(route).toMatch(/transportCostController\.rejectReviewItem\(req, id\)/);
    expect(route).toMatch(/permission:\s*Permission\.TRANSPORT_COST_NORMALIZE/);
  });

  it('the CLI review script calls the same service layer the routes do, not a parallel implementation', () => {
    const script = read('scripts/review-normalization-queue.ts');
    expect(script).toMatch(/transportCostQueryService\.listNormalizationReviewQueue/);
    expect(script).toMatch(/transportCostCommandService\.confirmReviewMatch/);
    expect(script).toMatch(/transportCostCommandService\.confirmReviewNew/);
    expect(script).toMatch(/transportCostCommandService\.rejectReviewItem/);
  });
});
