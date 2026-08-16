# Fleet Platform — Chart Enhancement Changelog

**Result:** `npx tsc --noEmit` → **0 errors**. `npm run test:security` → **382/382 passing** (29 suites).
No backend files were touched; only frontend chart components, two new
frontend-only drill-down helpers (maintenance), and one shared UI
container. Multi-tenancy scoping is unaffected — every chart still reads
data exclusively through the existing tenant-scoped hooks/APIs, and every
new drawer query reuses the existing scoped list endpoints.

---

## 1. Fuel charts (`frontend/modules/fuel/components/`)

| Chart | Change |
|---|---|
| `FuelMonthlyTrendChart` | Click-to-drill-down (opens `FuelLogDrawer` scoped to that month), rich tooltip (cost, volume), `ChartExportButton`. |
| `FuelTopConsumersChart` | Click a vehicle row → drawer scoped to that vehicle; `ChartExportButton`. |
| `FuelCostByDriverChart` | Click a bar → drawer scoped to that driver + date range; rich tooltip; export. |
| `FuelFrequencyByVehicleChart` | Click a bar → drawer scoped to that vehicle; export. |
| `FuelActivityTrendChart` | Click a bar → drawer scoped to that period (exact for month/year granularity); export. |
| `AverageFuelPriceTrendChart` | Click a point → drawer scoped to that month; export. |
| `FuelCostDistributionChart` | Click a bucket → drawer scoped to the chart's date range (see note below); export. |
| `VehicleFuelActivityTimelineChart` | Click a point → drawer scoped to that exact day; export. |
| `FuelTypeDistributionChart` | Export added. **No drill-down** — the fuel list API has no `fuel_type` filter to scope a click to (see "Known limitations"). |
| `FuelEntryHeatmapChart` | Export added. **No drill-down** — cells are day-of-week/hour aggregates with no matching list filter. |

## 2. Expense charts (`frontend/modules/expenses/components/`)

Nine charts already had drill-down wired by the prior session; this pass
added `ChartExportButton` to all of them: `ExpenseCalendarHeatmapChart`,
`ExpenseCategoryChart`, `ExpenseCategoryOverTimeChart`, `ExpenseParetoChart`,
`ExpenseWaterfallChart`, `JobTripExpenseChart`, `TopExpenseTransactionsChart`,
`TopVehiclesByExpenseChart`, `VehicleExpenseBreakdownChart`.

Five charts were fully wired from scratch (drill-down + tooltip + export):

| Chart | Change |
|---|---|
| `ExpenseMonthlyTrendChart` | Click a point → `ExpenseTransactionDrawer` scoped to that month. |
| `RunningMonthlySpendChart` | New cumulative-spend area chart; click a point → that month's transactions. |
| `VehicleAverageCostChart` | Click a bar → that vehicle's transactions. |
| `ExpenseAmountDistributionChart` | Click a bucket → date-range-scoped drawer (no amount-range filter server-side). |
| `ExpenseHeatmapChart` | Click a category×month cell → drawer scoped to that category + month. |

## 3. Maintenance charts (`frontend/modules/maintenance/`)

**New shared infrastructure**, mirroring the existing `ExpenseTransactionDrawer`/`FuelLogDrawer` pattern:
- `hooks/useMaintenanceDrawer.ts` — open/filter state, same shape as the fuel/expense drawer hooks.
- `components/MaintenanceRecordDrawer.tsx` — lazy tenant-scoped query against `maintenanceApi.list()`, CSV/Excel export, print-to-PDF, "open full list" deep link.

Charts wired:

| Chart | Change |
|---|---|
| `MostExpensiveVehiclesChart` | Click a bar → records for that vehicle; tooltip; export. |
| `DowntimeEstimateChart` | Click a bar → completed records for that vehicle; tooltip explains this is a proxy metric (avg. days-past-due-to-completion — there's no dedicated downtime field yet); export. |
| `RepairFrequencyByVehicleChart` | Click a bar → completed records for that vehicle; tooltip; export. |
| `MaintenanceCostTrendChart` | Click a point → completed records for that month; tooltip; export. |
| `MaintenanceCharts.tsx` (`MaintenanceStatusChart`, `MaintenanceCategoryChart`) | Click a bar → records filtered by status/category respectively; tooltips; export. |

## 4. Trip charts (`frontend/modules/trips/`)

`VehicleUtilizationChart` and `DriverUtilizationChart` already had drill-down
via the existing `TripTransactionDrawer` — added `ChartExportButton` to both.

| Chart | Change |
|---|---|
| `TripDistanceDistributionChart` | Added optional `onDrillDown` → date-range-scoped drawer (no distance-range filter server-side); export. |
| `TripMonthlyTrendChart` | Added optional `onDrillDown` → that month's trips; rich tooltip (trips/distance/hours); export. |
| `TripCostAnalyticsChart` | Click a scatter point → navigates straight to that trip's detail page (each point already carries a `tripId`); rich tooltip; export. |
| `TripDayOfWeekHeatmapChart` | Export added. No drill-down (day/hour aggregate, no matching list filter). |
| `TripAnalyticsPage.tsx` | Wired the new `onDrillDown` props through to `openDrawer`. |

## 5. Dashboard / reports widgets

- `frontend/shared/ui/charts.tsx` — `ChartContainer` gained an optional `actions` slot (right-aligned in the header) so widget charts can host an export button without a bespoke header layout.
- `ExpenseBreakdownChart`, `FuelTrendChart`, `MaintenanceChart` (`frontend/modules/reports/components/charts/`) — export added to all three; each now navigates to the relevant module's filtered list/analytics page on click (category slice → Expenses list filtered by category, fuel trend point → Fuel Analytics for that month, status bar → Maintenance list filtered by status).
- `AnalyticsOverview.tsx` — the two inline charts ("Cost by Category", "Fuel Efficiency Trend") got the same export + click-through treatment.

## Known limitations / deliberate scope decisions

- **Charts with no matching server-side filter** (`FuelTypeDistributionChart`, `FuelEntryHeatmapChart`, `TripDayOfWeekHeatmapChart`) get export but not drill-down. Adding one would mean adding a new filter field to the corresponding list endpoint — a backend change I didn't make, to avoid touching API surface/security-test coverage in a chart-focused pass.
- **Bucketed charts without a matching range filter** (`FuelCostDistributionChart`, `ExpenseAmountDistributionChart`, `TripDistanceDistributionChart`) open the drawer scoped to the chart's date range/vehicle rather than the exact bucket — still one click from the underlying records, just not bucket-precise. Same reasoning as above.
- **New "fleet manager" charts requiring new data** (driver fuel-efficiency/safety-score comparison, vehicle idle-vs-driven hours) were **not added**. The backend has the beginnings of what's needed (`modules/ai/services/driver-risk.service.ts`, `modules/telematics` idle-time fields) but no list-all-drivers/vehicles aggregation endpoint to back a comparison chart — building one is backend work beyond this pass's scope, and I didn't want to bolt a chart onto a fabricated/insufficiently-scoped endpoint. Recommend as a follow-up with its own backend + security-test coverage.
- `frontend/modules/organizations/components/analytics/OrgAnalyticsCharts.tsx` and `frontend/modules/reports/components/charts/ReportChartView.tsx` (the dynamic report-builder renderer) were left untouched — the former is tenant/org admin analytics rather than fleet-operations charts, and the latter is a generic config-driven renderer where "drill down" doesn't have a fixed target per chart type.

## Verification performed

```
npx tsc --noEmit -p tsconfig.json        # 0 errors
npx jest tests/security --ci             # 29 suites, 382 tests, all passing
```
