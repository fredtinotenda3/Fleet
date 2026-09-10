// tests/security/workshop-costing-reachable.spec.ts
//
// ---------------------------------------------------------------------
// A ROUTE WITH NO CALLER IS NOT A FEATURE
// ---------------------------------------------------------------------
// `POST /api/workorders/[id]/parts` and `.../labor` were live,
// permission-gated, tested on the server, and called by nothing.
// `workOrdersApi.consumeParts` and `.recordLabor` were implemented and
// called by nothing. Behind them, `WorkOrderService` moved real
// inventory and recalculated job cost.
//
// The customer-visible result was not a missing button. It was a work
// order detail page rendering a Costs card whose Parts, Labor and Total
// lines were permanently zero for every work order the product had ever
// created -- so a workshop manager could not answer "what did this
// repair cost", which is the question a work order exists to answer.
// And the Parts-used list rendered raw 24-character ObjectIds, because
// nothing in the frontend could resolve a part id to a part.
//
// This file asserts the chain is joined end to end, and that the two
// things most likely to be lost in a refactor -- the permission gate and
// the status gate -- match what the server actually enforces.

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const readRaw = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const read = (rel: string) => stripComments(readRaw(rel));

describe('the parts and labour chain is joined', () => {
  it('mutation hooks exist for both endpoints', () => {
    const hooks = read('frontend/modules/workorders/hooks/useWorkOrderMutations.ts');
    expect(hooks).toMatch(/export function useConsumeParts/);
    expect(hooks).toMatch(/export function useRecordLabor/);
    expect(hooks).toMatch(/workOrdersApi\.consumeParts/);
    expect(hooks).toMatch(/workOrdersApi\.recordLabor/);
  });

  it('the detail page calls both', () => {
    const page = read('frontend/modules/workorders/pages/WorkOrderDetailPage.tsx');
    expect(page).toMatch(/useConsumeParts\(id\)/);
    expect(page).toMatch(/useRecordLabor\(id\)/);
    expect(page).toMatch(/<ConsumePartsDialog/);
    expect(page).toMatch(/<RecordLaborDialog/);
  });

  it('consuming parts invalidates the parts catalogue it read from', () => {
    // Stock moved, so `quantityOnHand` on the consumed part is stale.
    // Without this the picker offers a count that is already wrong.
    const hooks = read('frontend/modules/workorders/hooks/useWorkOrderMutations.ts');
    const consume = hooks.slice(hooks.indexOf('export function useConsumeParts'));
    expect(consume.slice(0, consume.indexOf('export function useRecordLabor'))).toMatch(
      /queryKey: \['spare-parts'\]/
    );
  });
});

describe('the UI gates match what the server enforces', () => {
  it('the buttons require the permission the routes require', () => {
    /*
      Both routes are withAuth({permission: WORKORDER_MANAGE}). Gating
      the buttons on anything broader renders a control the API then
      refuses; gating on anything narrower hides a capability the user
      has.
    */
    for (const rel of [
      'app/api/workorders/[id]/parts/route.ts',
      'app/api/workorders/[id]/labor/route.ts',
    ]) {
      expect({ route: rel, permission: /Permission\.WORKORDER_MANAGE/.test(read(rel)) }).toEqual({
        route: rel,
        permission: true,
      });
    }

    const page = read('frontend/modules/workorders/pages/WorkOrderDetailPage.tsx');
    expect(page).toMatch(/canRecordCosts = canManageWorkOrders\(roles\)/);

    const utils = read('frontend/modules/workorders/utils/index.ts');
    expect(utils).toMatch(/canManageWorkOrders[\s\S]{0,200}Permission\.WORKORDER_MANAGE/);
  });

  it('the buttons appear only in the statuses the service accepts', () => {
    // `consumeParts` throws ConflictError outside assigned/in_progress.
    // A button that is always visible and sometimes throws is worse
    // than no button, because the failure looks like a platform fault.
    const service = read('modules/workorders/services/workorder.service.ts');
    expect(service).toMatch(/\['assigned', 'in_progress'\]\.includes\(existing\.status\)/);

    const page = read('frontend/modules/workorders/pages/WorkOrderDetailPage.tsx');
    expect(page).toMatch(/\['assigned', 'in_progress'\]\.includes\(workOrder\.status\)/);
  });
});

describe('the parts list shows parts, not ObjectIds', () => {
  it('the detail page resolves part ids to names', () => {
    const page = read('frontend/modules/workorders/pages/WorkOrderDetailPage.tsx');
    expect(page).toMatch(/usePartNames\(/);
    expect(page).toMatch(/nameFor\(part\.sparePartId\)/);
  });

  it('an unresolvable id falls back to the id, never to a guess', () => {
    // A part can be missing from the page that was read (deleted, or
    // beyond the limit). Showing the id is unhelpful; inventing a name
    // is worse, and the id is what someone would look the part up by.
    const page = read('frontend/modules/workorders/pages/WorkOrderDetailPage.tsx');
    expect(page).toMatch(/name \?\? part\.sparePartId/);

    const hooks = read('frontend/modules/inventory/hooks/index.ts');
    expect(hooks).toMatch(/nameFor:[\s\S]{0,120}\?\? null/);
  });
});

describe('the inventory client stays read-only', () => {
  it('exposes no write verb', () => {
    /*
      Stock is decremented through the WORK ORDER, which is the single
      writer of consumption movements and the only path that also
      recalculates the job's partsCost. A second way to move stock from
      the UI is a way to have the two disagree -- and reconciling a
      job's cost against inventory afterwards is not something a
      workshop manager can do by hand.
    */
    const api = read('frontend/modules/inventory/services/index.ts');
    expect(api).not.toMatch(/apiClient\.(post|put|patch|delete)/);
    expect(api).toMatch(/apiClient\.get/);
  });
});
