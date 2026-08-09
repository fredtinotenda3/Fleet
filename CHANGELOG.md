# Changelog — Fleet Platform (this session)

Verification at the end of every step: `npx tsc --noEmit` → **0 errors**,
full suite → **237/237 passing** (233 pre-existing + 4 new ESG scope tests).

## 0. Recovered missing files (blocking everything else)

Two files referenced elsewhere in the codebase were reported done in a prior
session but were absent from the zip. A third missing file (`import-trips.command.ts`)
was found while running `tsc --noEmit` and fixed as well, since it blocked compilation.

- **`modules/ai/types/needs-attention.types.ts`** (new) — `NeedsAttentionSource`,
  `NeedsAttentionUrgency`, `NeedsAttentionItem` (severity/urgency/cost/priorityScore/
  dueDate/entity refs), `NeedsAttentionFeed` (items/total/bySource/bySeverity/
  unavailableSources/generatedAt).
- **`modules/ai/services/needs-attention.service.ts`** (new) — aggregates all 5 AI
  services + compliance + maintenance reminders into one priority-ranked feed.
  Threads the caller's `TenantContext` into every source unchanged (adds no new
  reads of its own). Each source is read behind its own try/catch so one failing
  source doesn't blank the feed — it's recorded in `unavailableSources` instead.
  Priority score = severity weight + urgency weight + a diminishing (sqrt) cost
  factor, so a critical item always outranks a low one regardless of cost.
- **`app/api/ai/needs-attention/route.ts`** (new) — wires `GET /api/ai/needs-attention`
  through `withAuth`/`Permission.ANALYTICS_VIEW`. (The controller method already
  existed from the prior session; only the route file was missing.)
- **`modules/trips/commands/import-trips.command.ts`** (new) — `ImportTripsCommand`
  + `ImportTripRow`, matching what `import-trips.handler.ts`, `trip-command.service.ts`,
  and `cqrs.register.ts` already expected. Mirrors the shape of the existing
  `import-expenses.command.ts`.
- Covered by the pre-existing `tests/security/needs-attention-scope.spec.ts` (5 tests,
  now passing) — context threading, org-wide vs. scoped compliance reads, failure
  isolation, priority ranking, and `limit` behavior.

## 1. Design-token pass — finished

Converted every remaining hardcoded status-color Tailwind class (`text-red-500`,
`bg-green-50`, `text-amber-600`, `text-blue-600`, etc.) to the semantic tokens in
`tailwind.config.js` (`success` / `warning` / `danger` / `info`, each with
`DEFAULT` / `foreground` / `bg` / `border` variants), across 21 files:

- **Auth** — `SessionsList`, `ForgotPasswordForm`, `ChangePasswordForm`,
  `MfaEnrollment`, `ResetPasswordForm`, `MfaVerificationForm`, `ResetPasswordPage`,
  `BackupCodesPage`, `AccountSecurityPage`.
- **Fuel** — `FuelImportModal`'s succeeded/duplicates/failed stat tiles; dropped
  manual `dark:` overrides since the CSS vars already handle theming.
- **Maintenance** — `STATUS_BADGE_CLASSES` / `PRIORITY_BADGE_CLASSES` (the central
  badge-color maps consumed by `MaintenanceTable`, `ServiceCalendar`,
  `MaintenanceDetailPage`, `OverdueMaintenancePage`, `UpcomingMaintenancePage`) now
  map to `info`/`success`/`danger`/`muted`/`warning`; `high` priority is
  distinguished from `medium` via a `border-warning/50` accent rather than a new
  hue. Plus icon-color fixes in `MaintenanceStatsCards`,
  `VehicleMaintenanceInsightsCards`, `MaintenanceDashboardPage`.
- **Reports** — `exportFormatters.ts` status-color map, `AnalyticsOverview`
  priority pills, `FleetHealthGauge` score coloring, `AIReports` score coloring,
  `ExportCenter` confirmation message.
- **Shared UI** — `NotificationCenter` (unread badge → `bg-danger`/
  `text-danger-foreground`, unread dot → `bg-info`), `StatisticCards` trend
  indicator.
- **`app/layout.tsx`** — `bg-gray-100 dark:bg-gray-950` → `bg-background`.

**Deliberately left unconverted** (decorative, not status, per "don't repurpose
semantic color for decorative use"): `ReportList.tsx`'s favorite-star yellow fill,
`Search.tsx`'s neutral `hover:border-slate-300`.

A repo-wide scan after the pass shows zero remaining hardcoded status colors
outside those two intentional exceptions.

## 2. Insurance/ESG data-sharing module — new

Standardised export (JSON or PDF) of fleet health, driver risk, and compliance
data for insurers and ESG reporting, at `GET /api/esg/export?format=json|pdf`.

- **`modules/esg/types/esg-export.types.ts`** (new) — `EsgExportData` (organization,
  scope, `fleetHealth`, `driverRisk`, `compliance`, `compositeScore` sections) and
  `EsgExportOptions`.
- **`modules/esg/services/esg-export.service.ts`** (new) — builds the export by
  reading `fleetHealthService`, `driverRiskService`, and `complianceService`, all
  already org-unit-scoped; the caller's `TenantContext` is forwarded unchanged,
  the service performs no reads of its own. Computes a disclosed 0–100 composite
  score (40% fleet health + 30% compliance rate + 30% driver safety) with its
  methodology string included in every export.
  - **Data minimization**: named per-driver risk rows (`driverRisk.highRiskDrivers`)
    are omitted by default and only included when the caller explicitly passes
    `includeDriverNames=true` — an aggregate risk distribution is always present,
    but personal data requires an explicit opt-in.
- **`modules/esg/generators/esg-pdf.generator.ts`** (new) — renders the export as a
  multi-section PDF via `pdfkit` (already a project dependency).
- **`modules/esg/controllers/esg.controller.ts`** (new) — resolves a full
  `TenantContext` via the shared `resolveTenantContext(req)` helper (the same one
  every other export controller uses), validates `format`, and returns either a
  JSON body or a downloaded PDF file.
- **`app/api/esg/export/route.ts`** (new) — wires the route through `withAuth`/
  `Permission.ANALYTICS_EXPORT`.
- **`tests/security/esg-export-scope.spec.ts`** (new, 4 tests) — behavioural:
  `TenantContext` is threaded into every source and a scoped caller never falls
  back to the unscoped `complianceService.list()`; the driver-name opt-in default;
  the composite score's presence/bounds. Structural: the controller calls
  `resolveTenantContext(req)`, mirroring `export-scope-conformance.spec.ts`'s
  check on the five original export paths.
- **`tests/security/module-scope-conformance.spec.ts`** (modified) — added `esg`
  to the list of cross-cutting modules that own no MongoDB collection of their
  own (same treatment as the existing `ai`/`analytics`/`tenancy` exclusions),
  since the ESG module is a pure read-aggregator over already-scoped services.

## Verification log

- `npx tsc --noEmit` → 0 errors (after every step above)
- `npm run test:security` (`jest tests/security`) → 17/17 suites, 237/237 tests
- `npx jest --ci --runInBand` (full suite) → 17/17 suites, 237/237 tests
- Multi-tenancy scoping preserved throughout — no repository/service in this
  session accepts a bare `tenantId` where the rest of the codebase requires a
  `TenantContext`.
