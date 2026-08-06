# fleet-tenancy-controllers-final — MANIFEST

## Modified / new files

| # | Path | Change |
|---|---|---|
| 1 | `server/utils/tenant-context.utils.ts` | NEW — shared `resolveTenantContext(req)` / `resolveTenantContextWithUser(req)` |
| 2 | `modules/digital-twin/controllers/digital-twin.controller.ts` | wired |
| 3 | `modules/digital-twin/services/digital-twin.service.ts` | added `getTwinInScope`, `listTwinsInScope`, `getFleetSummaryInScope` |
| 4 | `modules/fuel-cards/controllers/fuel-card.controller.ts` | wired |
| 5 | `modules/fuel-cards/services/fuel-card.service.ts` | added `listInScope`, `getByIdInScope` |
| 6 | `modules/procurement/controllers/procurement.controller.ts` | wired |
| 7 | `modules/procurement/services/procurement.service.ts` | added `listRequestsInScope`, `getRequestInScope`, `listOrdersInScope`, `getOrderInScope` |
| 8 | `modules/compliance/controllers/compliance.controller.ts` | wired (records only) |
| 9 | `modules/compliance/services/compliance.service.ts` | added `listInScope`, `getInScope` |
| 10 | `modules/intelligence/controllers/anomaly.controller.ts` | wired |
| 11 | `modules/intelligence/repositories/anomaly.repository.ts` | added `countOpenBySeverityInScope` |

## Verification

- `npm run test:security` — 156/156 pass.
- `npx tsc --noEmit` — 83 errors, unchanged. Diffed on file/line/col/code against baseline: 0 introduced. (Two pre-existing `fuel-card.service.ts` errors moved from L59–60 to L89–90 due to inserted lines above them.)

## Deviations from the brief — brief's premises did not match the codebase

- `server/controllers/` does not exist. Controllers live in `modules/*/controllers/`; those are what was read and wired.
- `findAllInScopeAggregated` does not exist anywhere in the repo. Scoped aggregates used instead: `getFleetSummaryInScope` (digital-twin), `countOpenBySeverityInScope` (intelligence, added here).
- `InScope` methods take a `TenantContext`, not an `orgUnitId` string. `TenantContext` has no `orgUnitId` field — it exposes `accessibleOrgUnitIds`, `activeOrgUnitId`, `assignedOrgUnitIds`. Wiring to `context.orgUnitId` would have passed `undefined` into every filter.
- NOT strict single-unit isolation. Scoping uses `accessibleOrgUnitIds`, the expanded closure of assigned units plus descendants. Strict single-unit would hide every department/workshop/fleet row beneath a branch manager's own branch, breaking the hierarchy this phase exists to enforce.
- Controllers call services, not repositories directly; scoped service methods were added as the wiring layer.
- Not wired, by design: `compliance.listRules` / `createRule` (rules are org-wide policy — a per-branch rule means the same vehicle is compliant in one branch and not another); all `create*` paths (stamp `orgUnitId` at write time, nothing to narrow); `complianceService.recalculateStatuses` (org-wide batch job).
- Write paths (`approve`/`reject`/`send`/`receive`/`cancel`/`update`/`remove`/`rebuild`/`acknowledge`) gated by a scoped read before mutating. Procurement approve/reject is the material one: `BRANCH_MANAGER` holds `PROCUREMENT_APPROVE` and the lookup was organization-wide, so any branch manager could approve any other branch's spend.
- Out-of-scope single-record reads return 404, not 403 — a 403 confirms the id exists.
