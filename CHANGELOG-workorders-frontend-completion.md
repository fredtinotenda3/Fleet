# Work Orders Frontend — Completion Pass

Picks up where the previous session left off after the
`WorkOrderFilters` → `WorkOrderFilterBar` rename (done to avoid a name
collision with the backend `WorkOrderFilters` type). That rename was
left half-finished and the module's `types/index.ts` had never been
created, so `tsc --noEmit` failed with 23 errors, all inside
`frontend/modules/workorders/**`. No backend code, permissions,
module-scope registry, or org-unit scoping was touched.

## New files

- **`frontend/modules/workorders/types/index.ts`**
  Didn't exist. Every other file in the module already imported from
  `../types`. Re-exports the backend's `WorkOrder`, `WorkOrderCreateDTO`,
  `WorkOrderFilters`, `WorkOrderStatus`, `WorkOrderPartUsage` (via
  `@/modules/workorders/types/workorder.types`, plus its tenancy and
  DVIR module augmentations — the same "import the backend module's
  types directly" pattern `bays.api.ts` already uses for workshop
  types, since there's no separate `shared/types/workorder.types.ts`
  client mirror). Adds the frontend-only pieces the components need:
  `WorkOrderListParams`, `AssignMechanicPayload`,
  `ChangeWorkOrderStatusPayload`, `WORK_ORDER_STATUSES`,
  `WORK_ORDER_STATUS_LABELS`, and `WORK_ORDER_VALID_TRANSITIONS` (a
  client-side mirror of `VALID_TRANSITIONS` in
  `modules/workorders/services/workorder.service.ts` — kept in sync by
  hand, not imported, since the service file isn't client-safe).

- **`frontend/modules/workorders/components/index.ts`**
  Components barrel, following the pattern used by
  `frontend/modules/organizations/components/index.ts` /
  `frontend/modules/drivers/components/index.ts`. Exports all six
  components: `WorkOrderStatusBadge`, `WorkOrderStatusActions`,
  `WorkOrderFilterBar`, `WorkOrderTable`, `AssignMechanicForm`,
  `AssignMechanicDialog`.

- **`frontend/modules/workorders/pages/index.ts`**
  Pages barrel. Exports `WorkOrderListPage`, `WorkOrderDetailPage`.

- **`frontend/modules/workorders/index.ts`**
  Top-level module barrel — didn't exist, even though both
  `app/(protected)/workorders/page.tsx` and
  `app/(protected)/workorders/[id]/page.tsx` already imported from
  `@/frontend/modules/workorders`. Follows the `frontend/modules/drivers/index.ts`
  pattern (`export type * from './types'` plus direct exports of the
  service/hook files, `./components`, `./pages`, `./routes`, `./utils`).

## Modified

- **`frontend/modules/workorders/pages/WorkOrderListPage.tsx`**
  Was still importing and rendering the old `WorkOrderFilters`
  component. Updated to import and render `WorkOrderFilterBar` from
  `../components/WorkOrderFilterBar`, matching the rename.

## Deleted

- **`frontend/modules/workorders/components/WorkOrderFilters.tsx`**
  Leftover pre-rename duplicate of `WorkOrderFilterBar.tsx` (identical
  apart from the name) that was never removed when the rename happened.
  No remaining references to it anywhere in the tree.

## Verification

- `npx tsc --noEmit` — 0 errors (was 23, all in this module).
- `npm run test:security` — 382/382 tests passed, 29/29 suites,
  including `module-scope-conformance.spec.ts`, `tenant-scope.spec.ts`,
  and `org-unit-descendants.spec.ts`, confirming tenancy/org-unit
  scoping is unaffected.
