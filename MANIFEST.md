# Fleet — per-page stats scoping + CRUD buttons (final)

22 files. Drop over repo root, preserving structure.

## Login first (if credentials still fail)
```
npm run auth:doctor -- --unlock-all
npm run auth:doctor -- --reset-all --password 'Willsgrove#2026' --confirm
```

## Files

**Scope plumbing**
- `server/utils/tenant-context.utils.ts` — adds `resolveCreationOrgUnitId()`.

**Aggregate leaks closed**
- `modules/expenses/repositories/expense.repository.ts` — `getExpenseStats` had a **dead `context` parameter**.
- `modules/vehicles/repositories/vehicle.repository.ts` — `getVehicleStats` gains scope.
- `modules/maintenance/repositories/maintenance.repository.ts` — `getUpcomingReminders` gains scope.
- `modules/vehicles/queries/get-vehicle-stats.query.ts`, `.../handlers/get-vehicle-stats.handler.ts`,
  `modules/vehicles/services/vehicle-query.service.ts` — CQRS path now carries `TenantContext`.
- `modules/analytics/services/fleet-analytics.service.ts`, `modules/analytics/controllers/analytics.controller.ts`
- `modules/organizations/services/organization.service.ts`, `.../controllers/organization.controller.ts`
- `modules/ai/controllers/ai.controller.ts` — 6 endpoints fail closed for scoped users.

**Controllers**
- `modules/vehicles/controllers/vehicle.controller.ts` — scoped stats + scope-aware create.
- `modules/expenses|fuel|maintenance/controllers/*.controller.ts` — scope-aware create.

**Buttons**
- `frontend/modules/vehicles|expenses|fuel|trips/utils/index.ts` — hardcoded role
  allowlists replaced with `permissionService`.

## Root causes

1. **Dead parameter (expenses).** `getExpenseStats` already accepted `context?: TenantContext`,
   the query service already forwarded it, the controller already resolved it — the body never
   read it. The chain read as scoped end-to-end and TypeScript is silent on unused parameters.
   Drove Total / Average / Categories used / Top category.
2. **CQRS drop (vehicles).** `GetVehicleStatsQuery` carried only a `tenantId`, so the query bus
   had no way to express org-unit scope. Drove the Vehicles summary cards and the fleet-size /
   live-map counts — org-wide numbers above a correctly scoped table.
3. **Missing context parameter.** `getVehicleStats` and `getUpcomingReminders` had none.
4. **Organisation page.** Vehicle and expense figures counted the whole org. Now scoped.
   Member counts deliberately left org-level — the roster is organization data, not a leak.
5. **Buttons.** Four modules hardcoded role allowlists that all omitted `branch_manager`,
   `department_manager`, `workshop_manager` and `organization_admin`, though `roles.ts` grants
   them `VEHICLE_CREATE`, `EXPENSE_CREATE`, `FUEL_CREATE`, `TRIP_CREATE`. Now delegated to the
   same permission table the endpoints use.
6. **Creation trap.** Scoped reads alone meant a branch manager's new record got no `orgUnitId`
   and was then hidden by the read filter — add a vehicle, watch it vanish. Creation now files
   into the caller's own unit; a scoped user naming another unit is refused (write-side
   escalation); a user with no assignment is refused with an actionable message.

## Verify

| Account | Vehicles | Add button |
|---|---|---|
| `owner@` / `admin@` | 76 | yes |
| `harare.manager@` | 76, Harare charts | yes |
| `bulawayo.manager@` | 0 → add one → exactly 1 | yes |
| `workshop.manager@` / `mechanic@` | 0 | per permission |
| `unassigned@` (viewer) | 0 | none |

`npm run test:security` 156/156 · `npx tsc --noEmit` 83 (baseline 83, zero introduced).

## Still not done
- **AI services** — contained, not scoped. `modules/ai/services/*` still aggregate on `tenantId`;
  the controller blocks scoped users rather than leaking.
- **Exports / report builder / global search** — not audited.
- **Drivers create** — no `orgUnitId` stamping added (driver form path not traced).
- No run-time verification was possible from here; all claims above are static + test-based.
