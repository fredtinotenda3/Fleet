# Step 4 — Command Centre UI: Changelog

Frontend-only. No backend service, controller, repository, or test file was touched.
`npx tsc --noEmit` → 0 errors. `npx jest tests/security` → 291/291 passing.

## New files

- **`frontend/modules/attention/`** — new frontend module for the Command Centre:
  - `types/index.ts` — re-exports `NeedsAttentionFeed`/`Item` (already in the dashboard module) and `LedgerExportData`; adds local `SeverityFilterValue`/`SourceFilterValue` view-state types.
  - `services/attention.api.ts` — calls `GET /api/attention/ledger/export?format=json`, scoped to month-to-date. The queue itself is fetched by reusing the existing `dashboardApi.getNeedsAttention`, not duplicated.
  - `hooks/useAttentionQueue.ts` — `useAttentionQueue(limit)` (wraps the existing `GET /api/ai/needs-attention` call at a page-sized limit) and `useMonthToDateSavings()`.
  - `components/SeverityFilterBar.tsx` — severity + source toggle filters, counts sourced from the feed's own `bySeverity`/`bySource`.
  - `components/AttentionQueueList.tsx` — ranked queue rows; reuses the same source icons/severity→token mapping as the existing `NeedsAttentionWidget`, adds urgency and rank.
  - `components/SavingsStrip.tsx` — month-to-date modelled vs. realised savings strip, reads the ledger export's own `summary` (never recomputes totals from `entries`, which can be capped/truncated).
  - `pages/CommandCentrePage.tsx` — assembles the above into the full-screen queue + bottom strip. Takes an `embedded` prop so the same component powers both the standalone page and the Dashboard's primary tab.
  - `index.ts` — module barrel export.
- **`app/(protected)/needs-attention/page.tsx`** — renders `CommandCentrePage`. This route didn't exist before; the existing `NeedsAttentionWidget`'s "View full queue" link already pointed at `/needs-attention`, so this fixes what was a dead link.

## Modified files

- **`frontend/modules/dashboard/pages/FleetDashboardPage.tsx`** — added a `Tabs` header: **"Command Centre"** (the new full queue + savings strip, embedded) is now the default/primary tab; **"Widgets"** holds the original `DashboardBuilder` + `DashboardGrid` KPI wall, unchanged. No widget, permission gate, or layout-persistence logic was modified — the existing grid moved behind a second tab, it wasn't rebuilt.
- **`frontend/shared/ui/navigation/Sidebar.tsx`** — added a "Command Centre" nav entry under **Overview**, linking to `/needs-attention`, gated on `Permission.ANALYTICS_VIEW` (the same permission that already gates the `needsAttention` widget and the `GET /api/ai/needs-attention` route). Only a new `AlertOctagon` import and one new `NavItem` entry were added; nothing else in the file changed.

## Design tokens / patterns reused (no new tokens introduced)

- Severity → color: `text-danger`/`bg-danger-bg`/`border-danger-border` (critical), `text-warning`/`bg-warning-bg`/`border-warning-border` (high/medium), `text-muted-foreground` (low) — same mapping as `NeedsAttentionWidget`.
- Variance → color: `text-success` (ahead of model), `text-danger` (behind model).
- `surface-card`, `PageHeader`, `DashboardWidget`-style refresh button, `Badge`, `Button`, `EmptyState`, `LoadingState`, `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`, `formatCurrency`, `formatDate`/`formatRelativeDate`, `apiClient` — all pre-existing shared components/utilities, none modified.

## Multi-tenancy scoping

No new scoping logic was added on the frontend. Both endpoints already resolve a full tenant context server-side (`resolveTenantContext` for the ledger export; the equivalent context resolution already backing `GET /api/ai/needs-attention`) and return only the caller's org-unit-scoped data — the same guarantee the existing `NeedsAttentionWidget` already relies on. `SavingsStrip` degrades gracefully (its own error state, doesn't block the queue) for roles that hold `ANALYTICS_VIEW` but not `ANALYTICS_EXPORT`, since the ledger export route requires the latter.

## Explicitly out of scope (per Step 4 rules)

- No resolve/annotate workflow for attention items (the `POST /api/ai/needs-attention/:id/resolve` and ledger-resolution schema exist but aren't wired into this UI).
- No backend, controller, repository, or test changes.
