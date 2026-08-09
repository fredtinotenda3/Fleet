# Cartrack Live Map — Missing Files & Barrel Export Fix

## Root cause

`LiveMapPage.tsx`, `DemoModeToggle.tsx`, and `MapsWidget.tsx` already imported real
named exports (`useLiveMap`, `useVehicleRouteHistory`, `useDemoStatus`,
`useSetDemoMode`, `canViewLiveMap`, `canToggleDemoMode`, `TELEMATICS_ROUTES`), but
the frontend telematics module's `hooks/`, `services/`, `utils/`, and `routes/`
directories only contained empty stub barrels (`export {}`) — the implementation
files themselves didn't exist yet. That's what produced the "has no exported
member" errors, plus the missing route page.

The sidebar (`frontend/shared/ui/navigation/Sidebar.tsx`) already had a correct
"Live Map" entry pointing at `/telematics/map`, gated on `Permission.VEHICLE_VIEW`
— no change needed there. `types/index.ts`, `store/index.ts`, and `schemas/index.ts`
were also already correct/unused for this feature and were left untouched.

## New files

- **`app/(protected)/telematics/map/page.tsx`** — the missing route entry;
  renders `LiveMapPage` from `@/frontend/modules/telematics/pages/LiveMapPage`.
- **`frontend/modules/telematics/services/telematics.api.ts`** — `telematicsApi`
  wrapping `GET /api/telematics/live-map`, `GET /api/telematics/live-map/history/[vehicleId]`,
  `GET /api/telematics/demo`, `POST /api/telematics/demo`, following the same
  `apiClient` pattern used in `frontend/modules/vehicles/services/vehicles.api.ts`.
- **`frontend/modules/telematics/hooks/useLiveMap.ts`** — `useLiveMap` (10s
  polling, matching the behavior documented in `LiveMapPage.tsx`'s header
  comment), `useVehicleRouteHistory`, and the `telematicsKeys` query-key factory.
- **`frontend/modules/telematics/hooks/useDemoMode.ts`** — `useDemoStatus`
  (read) and `useSetDemoMode` (mutate + toast + cache invalidation), mirroring
  `frontend/modules/vehicles/hooks/useVehicleMutations.ts`'s conventions.
- **`frontend/modules/telematics/utils/telematics-permissions.utils.ts`** —
  `canViewLiveMap` / `canToggleDemoMode`, resolved through the same
  `permissionService` + `Permission` enum the API routes use (`VEHICLE_VIEW` /
  `VEHICLE_EDIT`), matching `frontend/modules/drivers/utils/index.ts`'s pattern.
- **`frontend/modules/telematics/routes/telematics.routes.ts`** —
  `TELEMATICS_ROUTES.liveMap = '/telematics/map'`.

## Changed files (barrel exports only)

- `frontend/modules/telematics/hooks/index.ts` — now exports `useLiveMap`,
  `useVehicleRouteHistory`, `telematicsKeys`, `useDemoStatus`, `useSetDemoMode`.
- `frontend/modules/telematics/services/index.ts` — now re-exports `telematics.api`.
- `frontend/modules/telematics/utils/index.ts` — now exports `canViewLiveMap`,
  `canToggleDemoMode`.
- `frontend/modules/telematics/routes/index.ts` — now exports `TELEMATICS_ROUTES`.
- `frontend/modules/telematics/components/index.ts` — now exports `LiveMapSvg`,
  `LiveMapLegend`, `LiveMapVehicleList`, `DemoModeToggle` (all pre-existing
  components; only the barrel was a stub).
- `frontend/modules/telematics/pages/index.ts` — now exports `LiveMapPage`.

## Verification

- `npx tsc --noEmit` → **0 errors**.
- `npm run test:security` → **311/311 passed** (25 suites), unchanged count.
- `npm run lint` → same pre-existing warnings/errors elsewhere in the repo;
  no new issues in any changed/new file.
