# Fleet Leaderboard — changed files

Verified against the supplied archive: **24 new files, 1 modified file,
0 backend files touched.**

```
npm run type-check   clean
npm run test:unit    98 suites, 1714 tests passing (85 new)
npx eslint <new files>  0 problems
```

## Constraints honoured

- No file under `app/api/**`, `modules/**`, `server/**` or `shared/**`
  was added or modified. No route, permission or response shape changed.
- No vehicle/driver assignment file touched.
- Everything reads three endpoints that already exist.

## New — `frontend/modules/leaderboard/`

| File | Purpose |
| --- | --- |
| `types/ai-dashboard.types.ts` | Wire shapes for `GET /api/ai/dashboard`, dates as ISO strings. Documents the three batches' incompatible `success` semantics. |
| `types/leaderboard.types.ts` | View models: `RankedRow`, driver/vehicle rows, the seven-category tile model. |
| `types/index.ts` | Barrel; re-exports the shared maintenance row shapes rather than copying them. |
| `services/leaderboard.api.ts` | Read-only wrappers over the three existing endpoints. Clamps `limit`. Sends no tenant/org id. |
| `services/index.ts` | Barrel. |
| `utils/leaderboard.utils.ts` | **Pure.** Ranking (standard competition, deterministic tie-break), batch-finding counting, per-vehicle aggregation, formatting. |
| `utils/alert-category.utils.ts` | **Pure.** The seven category definitions and the tile builder. Never emits `0` for an unknown. |
| `utils/index.ts` | Barrel. |
| `hooks/useFleetLeaderboard.ts` | TanStack Query hooks. Permission-gated `enabled`, no retry on 403, no polling of the expensive AI endpoint. |
| `hooks/index.ts` | Barrel. |
| `components/RankedBarChart.tsx` | Recharts horizontal ranked bars. Renders an already-ranked list; never re-sorts. |
| `components/MetricToggle.tsx` | WAI-ARIA radiogroup segmented control with roving tabindex. |
| `components/AlertCategoryTiles.tsx` | The seven tiles across four states (ready / loading / error / unsupported). |
| `components/DriverLeaderboardCard.tsx` | Driver board, metric toggle, Excel export, rows deep-link to the existing scorecard. |
| `components/VehicleLeaderboardCard.tsx` | Vehicle board over a discriminated union of the three metric shapes. |
| `components/index.ts` | Barrel. |
| `pages/FleetLeaderboardPage.tsx` | Composition. Degrades in halves across the two permissions. |
| `pages/index.ts` | Barrel. |
| `routes/index.ts` | `LEADERBOARD_ROUTES`. |
| `index.ts` | Module barrel. |

## New — elsewhere

| File | Purpose |
| --- | --- |
| `app/(protected)/leaderboard/page.tsx` | Route shim, matching the observability/scorecard pattern. |
| `tests/unit/leaderboard/leaderboard-utils.spec.ts` | 60 tests: ranking, ties, aggregation, guards, formatting. |
| `tests/unit/leaderboard/alert-category-utils.spec.ts` | 25 tests: the catalogue and every not-ready tile path. |
| `docs/leaderboard/BACKEND_AGGREGATION_GAPS.md` | The three gaps, what was searched, and the endpoint contracts that would close them. |

## Modified — 1 file, 2 additive hunks

`frontend/shared/ui/navigation/Sidebar.tsx`

- Added `Trophy` to the existing `lucide-react` import.
- Added one `NAV_SECTIONS` entry under **Insights**, gated on
  `[ANALYTICS_VIEW, MAINTENANCE_VIEW]` (the file's `permissions` array is
  ANY-of, matching how the page degrades).

Nothing else in the file changed. Its five pre-existing
`no-unused-vars` lint errors (icons kept for the commented-out
Operations section) are unchanged and were confirmed present in the
original archive.
