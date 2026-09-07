# UI/UX & Onboarding Overhaul

Frontend-only. **No backend file, API route, DTO, database model, permission,
authentication, authorization, tenancy rule, business rule, event or AI
behaviour was modified.** Where a UI requirement met a genuine backend
limitation it is recorded in [Backend gaps](#backend-gaps-discovered) rather
than worked around.

---

## Verification

Run against a clean copy of the uploaded tree with these changes applied.

| Command | Before | After |
|---|---|---|
| `npm run type-check` | 0 errors | **0 errors** |
| `npm test` | 105 suites / 1891 tests, 0 failures | **107 suites / 1931 tests, 0 failures** |
| `npm run build` | 224 static pages, exit 0 | **224 static pages, exit 0** |
| First Load JS shared by all | 102 kB | **102 kB** |

`npm run lint` is available and was run per changed file; it reports only
pre-existing findings (`no-explicit-any` in three reports pages, two
`react/no-unescaped-entities` in observability). No new lint errors.

**One caveat on `npm run build`, unchanged from previous rounds:** `next/font`
fetches Geist from Google at build time, so the build fails in a network-
restricted environment *before compiling any application code*. A red build
there is therefore no evidence about this change set. Compilation was proved by
building a throwaway copy with the fonts stubbed — 224 static pages, exit 0,
with the single pre-existing `@opentelemetry` "Critical dependency" warning.
Both the before and after builds were produced the same way, so the comparison
is like-for-like.

40 new tests were added across 2 new suites (`tests/unit/navigation`,
`tests/unit/onboarding`). No existing test was modified or deleted.

---

## The finding that explains most of the inconsistency

> **`tailwind.config.js` was never loaded. The entire typographic scale
> generated zero CSS in every build the product has ever shipped.**

This project builds with Tailwind **v4** (`@tailwindcss/postcss`,
`@import "tailwindcss"` in `app/globals.css`). Tailwind v4 ignores
`tailwind.config.js` completely unless the stylesheet carries an explicit
`@config` directive. This stylesheet never had one, and nothing in the repo
referenced the config file.

Everything that lived only in that JS file produced no CSS at all:

| Dead token family | Usages found in source |
|---|---|
| `text-display / h1 / h2 / h3 / section-title / body / body-sm / caption / label / table / table-num` | **410 occurrences across 132 files** |
| `primary-50 … primary-900` ramp | focus rings, selected rows, chart fills |
| `fleet-*` operational status colours | map pins, status dots |
| `xs:` and `3xl:` breakpoints | 5 files |
| `density-*` spacing, `shadow-focus-ring`, `max-w-auth-card / form-narrow / form-wide`, `animate-fade-in`, `animate-slide-up` | various |

Every heading, caption and label in the application therefore rendered at the
inherited body size of `0.875rem / 400`. `<h1 className="text-h1">` and
`<p className="text-caption">` were visually identical. That is the single
largest reason the product read as a set of unrelated pages, and it is not a
taste problem — the hierarchy did not exist at runtime.

**This was proved, not assumed.** A probe stylesheet was compiled with the
repo's own `tailwindcss` v4 binary and the output grepped for each class,
before and after the fix. The type scale is now confirmed present in the
production CSS bundle (`.next/static/css/*.css`) of the real build.

**Fix:** the config was ported to a v4-native `@theme inline` block in
`app/globals.css`, which is now the single source of design tokens.
`tailwind.config.js` is retained — reduced to a header explaining all of the
above — so the next engineer finds the explanation where they will look for the
tokens.

`@theme inline` (rather than plain `@theme`) is deliberate: utilities must
reference `var(--x)` at use time so the `.dark` overrides re-theme them without
regenerating utilities.

---

## Audit summary — what was kept, improved, replaced

The existing frontend is stronger than the brief implies. Most of this work is
consolidation, not replacement.

**Kept as-is (already correct):**

- The **design-token layer** in `app/globals.css` — a well-considered palette
  with light/dark, semantic status, and fleet-status tokens. It only needed the
  v4 port above.
- **Permission-driven navigation.** The sidebar was already gated on
  `Permission` values resolved through the same `permissionService` the server
  uses, with a documented history of why role-string lists were removed. That
  design was preserved exactly and extended.
- `RouteGuard` / `PermissionGuard`, `ErrorBoundary`, the CQRS-backed data
  hooks, `DashboardWidget`'s error/loading wrapper, `DashboardBuilder` and
  widget-layout persistence, and every widget's permission gate.
- The auth pages' distinct `AuthLayout` chrome (deliberately not converted).

**Improved in place (so existing call sites inherit the fix for free):**

| Component | Call sites | What changed |
|---|---|---|
| `shared/ui/feedback/EmptyState.tsx` | 61 | Added `tone` (a positive "all clear" state), `hints`, `secondaryAction`, and `action` accepting `href` as well as `onClick`. Every previously valid prop behaves identically. |
| `shared/ui/tables/DataTable.tsx` | 11 → 15 | Added `isError`/`errorMessage`/`onRetry` **checked before empty**, a full `empty` node, `renderMobileRow`, `rowClassName`, `caption`, and a working page-size selector. |
| `frontend/shared/layouts/PageHeader.tsx` | 37 → 62 | Added `meta` context chips, `backHref`, `hideBreadcrumbs`; actions now wrap instead of forcing horizontal scroll on a phone. |
| `frontend/shared/ui/navigation/Sidebar.tsx` | — | Regrouped, expandable sub-nav, portal tooltips when collapsed, active accent bar, collapsed-mode section dividers. |

**Consolidated (three implementations → one):**

`shared/ui/cards/StatsCard` (9 call sites) and
`frontend/shared/ui/data-display/StatisticCards` (17 call sites) were two
independently written stat cards with different type scales, different trend
colours and different loading behaviour, used side by side across seven
modules. Both are now thin adapters over a single `MetricCard`. **All 26 call
sites keep their existing props and needed no changes.**

**Replaced:**

- `StatsCard`'s hardcoded `from-blue-500 / from-green-500` gradient washes —
  raw Tailwind palette colours that appear nowhere in this product's palette
  and did not respond to dark mode.
- The hand-rolled `MaintenanceTable` and `WorkOrderTable` (their own `<Table>`,
  own pagination, no error branch) now use the shared `DataTable`.
- Hand-rolled error blocks in Drivers and Live Map, replaced by `ErrorState`.

**Left alone and recorded, not silently fixed** — see
[Known limitations](#known-limitations).

---

## Design system

New product-level layer at **`frontend/shared/ui/patterns/`**, sitting above
`primitives/` (thin Base UI wrappers) and below feature code. Import from
`@/frontend/shared/ui/patterns`.

> Note: the pre-existing barrel at `frontend/shared/ui/index.ts` has **zero
> importers** anywhere in the repo — every consumer deep-imports. The new
> `patterns/` barrel is the one path intended to be used, and is.

| File | Purpose |
|---|---|
| `tone.ts` | The single mapping from meaning → appearance. `Tone`, severity→tone, fleet-status→tone, and `deltaTone`. |
| `MetricCard.tsx` | `MetricCard` + `MetricCardGrid`. The one KPI card. |
| `ErrorState.tsx` | `error` / `permission` / `offline` variants; `inline`/`panel`/`page` sizes. |
| `DataState.tsx` | The loading→error→empty→content state machine, plus `describeQueryError` and `isPermissionError`. |
| `StatusBadge.tsx` | `StatusBadge`, `SeverityBadge`, `FleetStatusBadge`, `StatusDot`. |
| `SectionHeader.tsx` | `SectionHeader` + `SectionPanel` for in-page bands. |

### Two decisions worth knowing

**1. `deltaTone` requires `higherIsBetter`; it is not defaulted.**

The previous stat cards took `trend: { value, isPositive }` — a boolean that
conflates *"the number went up"* with *"this is good news"*. That is wrong for
most numbers on this platform: cost per km, fuel spend, overdue services,
incident counts and downtime are all metrics where a rise is bad. A 12% rise in
cost per km was rendered in green.

`MetricCard`'s `delta` takes a **signed** value plus a required
`higherIsBetter`, forcing the question to be answered at the call site by the
person who knows the metric. The two legacy adapters translate the old prop so
that **every existing screen keeps its current appearance exactly** rather than
being silently re-coloured; new code should state `higherIsBetter`.

**2. `DataState.isError` is required, not optional.**

Making it optional would let a call site omit it and reproduce the exact defect
the component exists to remove. The order — load → error → empty → content —
is not configurable, because the ordering *is* the correctness property.

### Accessibility

- Status is never conveyed by colour alone: `StatusBadge` carries a dot plus
  text; `StatusDot` carries a required visually-hidden label (WCAG 1.4.1).
- Delta direction is spelled out for assistive technology, not left to an arrow
  glyph and a colour.
- `DataTable` rows with `onRowClick` are now focusable and Enter/Space
  activatable — a click handler on a `<tr>` was previously mouse-only
  (WCAG 2.1.1).
- Tables carry an `sr-only` `<caption>`.
- Error states use `role="alert"`; the setup checklist's progress bar carries
  full `progressbar` semantics.
- All motion added is covered by the existing global
  `prefers-reduced-motion` rule.

---

## Navigation

The model moved to **`frontend/shared/ui/navigation/nav.config.ts`** as pure,
testable data. `Sidebar.tsx` is now presentation only.

**Security contract, stated at the top of that file:** navigation visibility is
a convenience, never an authorization boundary. Every route remains
independently guarded by `withAuth(...)` server-side and
`RouteGuard`/`PermissionGuard` client-side. What the file must get right is the
inverse — never showing a link the user's page or API will then refuse.

### New grouping

| Section | Items |
|---|---|
| **Overview** | Dashboard · Command Centre · My Inspections |
| **Operations** | Live Map · Vehicles · Drivers · Trips |
| **Maintenance** | Maintenance · Work Orders |
| **Cost & Finance** | Fuel · Expenses |
| **Intelligence** | Driver Scorecard · Leaderboard · Reports · Organization Analytics |
| **Automation** | Workflows |
| **Administration** | Organization · Members · Roles · Teams & Branches · Settings · API Keys · Audit Log |
| **Platform** | Platform Admin · Provider Health |

Ordered by the question the operator is asking, matching the product's own
stated loop. Two deliberate deviations from the brief's suggested grouping:

- **Reports sits under Intelligence, not Cost & Utilization.** Its data sources
  span vehicles, trips, maintenance, fuel and expenses; filing it under cost
  would misdescribe it and hide it from people using it for utilisation and
  compliance reporting. GL Reconciliation stays with it as a `FINANCE_VIEW`-
  gated child — that one genuinely is a finance surface, and is where its page
  already lives.
- **Driver Scorecard moved out of Drivers into Intelligence**, as asked, and is
  deliberately *not* listed in both places. A duplicated nav entry makes a
  sidebar harder to learn and produces two simultaneously-active rows.

**Zero routes were added, renamed or removed.** Every permission gate was
carried over verbatim, including the three that carry documented reasoning
(Command Centre on `ANALYTICS_VIEW`; Roles on `ORG_MANAGE` rather than
`CUSTOM_ROLE_VIEW`, because `FLEET_MANAGER` holds the latter; Leaderboard on
*any* of two permissions because the page degrades in halves).

### Interaction improvements

Expandable sub-navigation with a chevron, auto-expanded when the current route
is inside it and user-overridable. Expansion is persisted as an explicit
tri-state map (`navExpanded`) rather than a set of open keys — a set cannot
express "I closed this even though I'm inside it", so a user collapsing the
section they are standing in would see it spring open again.

Collapsed mode gets **portal-rendered tooltips** (label + hint) instead of the
browser's `title` attribute, which takes ~1s to appear and cannot show the
hint — making an icon rail guesswork. Section headings become hairline dividers
when collapsed, so the information architecture survives; previously the icons
ran together as one undifferentiated list.

The active row gains a left accent bar using `--sidebar-active`, a token that
had been defined in `globals.css` since the palette was written and referenced
by nothing.

### Regression guard — `tests/unit/navigation/nav-config.spec.ts` (16 tests)

- **Every href resolves to a page that exists on disk.** This is the test that
  would have caught the seven dead links (`/dispatch`, `/workshop`,
  `/inventory`, `/procurement`, `/vendors`, `/compliance`, `/sla`) at PR time
  instead of as production 404s.
- No entry may be gated on a non-existent `Permission` member.
- No duplicate keys, no duplicate destinations.
- **Exhaustive across every role in the table:** no role is ever shown a link
  it lacks the permission for.
- The Platform section is invisible to `ORGANIZATION_OWNER`, `ORGANIZATION_ADMIN`
  and `BRANCH_MANAGER`, and visible to `SUPER_ADMIN`.
- Children filter independently of parents (`FLEET_MANAGER` sees Reports but
  not GL Reconciliation; `ACCOUNTANT` sees both).
- **Fail-closed:** an account with no roles gets `['/dashboard']` and nothing
  else.
- Active-path resolution: `/fuel` must not claim `/fuel-cards`; `/dashboard`
  matches exactly; query strings are ignored.

---

## Onboarding

New module: **`frontend/modules/onboarding/`**. There was previously **no
onboarding of any kind** in the repo (confirmed by full-text search), and
`resolveLandingPath` takes no organization state as input — so a brand-new
customer with an empty database landed on a grid of zeroes with no indication
of what to do.

Rendered by `GetStartedPanel` on the dashboard, in one of two modes.

### Setup mode

A dependency-ordered checklist computed from the organization's **real counts**,
governed by three rules enforced in `utils/setup-checklist.ts`:

1. **A step is only shown to someone who holds the permission to complete it.**
   Each step carries the permission its own write endpoint enforces, verified
   against the routes rather than guessed — including `POST /api/drivers`
   requiring `VEHICLE_EDIT` (the documented stopgap, since no `Permission.DRIVER_*`
   exists in the model).
2. **A step must be verifiable.** Every `done` comes from a real count or config
   flag. Nothing is a checkbox the user ticks themselves.
3. **No step invents functionality.** Every `href` points at a page that exists,
   pinned by a test.

Steps, in dependency order: branches → vehicles → drivers → telematics →
members → first operating cost. Following the list top to bottom never produces
a step that cannot be completed yet.

**"Not known" is never rendered as "not done."** Each count is `number | null`,
where `null` means the query is pending, failed, or forbidden — distinguished
from a real `0`. An indeterminate step shows "status unavailable", and
`isComplete` stays false while *any* step is unknown, so a failed request can
never make the platform announce that setup is finished. This is the same
empty-vs-error distinction enforced everywhere else in this overhaul.

### A design flaw the tests caught

The first implementation gated each step only on its own permission. A **driver
holds `FUEL_CREATE`** — logging a refuel is their job — so a driver was handed a
panel headed *"Finish setting up your fleet"* containing the single item
*"Record your first operating cost"*, reframing their ordinary daily work as
unfinished configuration. An `ACCOUNTANT` got the same one-item checklist.

Worse: a driver does **not** hold `EXPENSE_VIEW`, so the query behind that step
would have 403'd and the item would have sat on "status unavailable"
permanently.

Fixed with an **anchor permission** set (`ORG_UNIT_MANAGE`, `VEHICLE_CREATE`,
`ORG_MEMBERS_MANAGE`, `ORG_SETTINGS`) — holding one is what makes someone a
person configuring the organization — plus a `readPermission` guard that omits
any step whose completion the user could never observe. Both are pinned by
tests.

### Orientation mode

For everyone else. A mechanic or driver arriving at a fully-configured fleet has
nothing to set up; what they need is a sentence saying what their copy of the
platform is *for* and the two or three places their work lives.
`describeWorkspace()` derives that from permissions rather than role strings —
including a plain, fail-closed sentence for an account with no scope assigned,
because an empty dashboard reads as a broken product.

### Cost control

The panel runs on the most-loaded page in the product, so:

- Every query **reuses the query key and `queryFn` an existing feature already
  uses**, so on the dashboard they are cache hits, not new requests. The member
  count comes from `useMyOrganizations`, which the TopBar's organization
  switcher already holds on every page.
- Every query is `enabled` only when the user holds the permission for the step
  it feeds. A driver triggers none of them.
- All queries are disabled outright once dismissed or complete — a mature tenant
  pays nothing.
- **`GET /api/ai/needs-attention` is deliberately not used.** It fans out over
  seven AI services, persists a snapshot, carries `maxDuration = 60`, and has
  already caused a production timeout incident.

Dismissal is per-user (keyed by user id, so two accounts sharing a depot
workstation do not inherit each other's) and stored client-side — persisting it
server-side would require a backend change this task must not make.

`tests/unit/onboarding/setup-checklist.spec.ts` — 24 tests.

---

## Command Centre

### The half that was never wired up

Two endpoints have shipped, are permission-gated and are covered by backend
tests, and **nothing in the frontend called either**:

```
POST /api/ai/needs-attention/{itemKey}/resolve    ANALYTICS_VIEW
POST /api/ai/needs-attention/{itemKey}/dispatch   WORKORDER_CREATE | MAINTENANCE_CREATE
```

Without them the Command Centre was a list of problems with no way to act on
one and no record that anyone had — precisely the *"what should be done / what
happened afterward"* half of the product's own stated loop. Wiring them is
frontend-only work against contracts that already exist.

Both actions render only when the user holds the permission the route enforces,
so neither can appear and then 403.

**Dispatch outcomes are read from the body, not from the status code.** Every
outcome — `dispatched`, `duplicate`, `no_action`, `refused`, `action_failed` —
arrives as HTTP 200, deliberately (the backend's own comment records that
mapping them onto HTTP errors would lose the reason). `action_failed` is shown
as an error because it means the dispatch *was* recorded and the downstream
write then broke — the operator must know the two halves disagree.

**Resolve is a dialog, not a one-click action.** Resolving posts to the value
ledger that the savings strip on the same page totals, which makes
`realisedAmount` a financial figure. Silently posting the *modelled estimate* as
though it were the confirmed outcome would put fabricated numbers into a ledger
someone reconciles. Leaving the field blank is a real and safe choice — the
backend falls back to the modelled cost, and the placeholder says so.

### Evidence is now rendered

`AIEvidence` — references to the stored records a finding was computed from
(an expense id, a telemetry reading, a rollup day), deliberately not prose so a
disputed finding can be re-checked against the same rows — has been on the API
response since the evidence work landed and **had never been rendered
anywhere**. Each item now has a "Why this was raised (*n* records)" disclosure.
This is what makes the screen an intelligence product rather than an alert list.

### Other Command Centre fixes

- **The error branch had no Retry.** A failed feed left a dead screen and a
  Refresh button in the header the operator had no reason to connect to it.
- **Empty-because-healthy and empty-because-filtered were the same message.**
  A healthy fleet was told "Nothing matches these filters", which reads as the
  user's own filters being wrong. They are now opposite messages, and the
  healthy one uses a positive tone — an operations console that shows a grey
  void when all is well trains people to distrust it.
- **A severity summary** (total / critical / high / cost at stake) sits above
  the queue. "Cost at stake" says *"at least this much"* when the feed is
  truncated, rather than presenting a partial sum as complete.
- **`unavailableSources` is surfaced.** When a source throws, its contribution
  is counted as zero everywhere — so a queue that looks calm may simply be
  missing a whole category. The operator is now told.
- The card is no longer itself a link; adding action buttons inside an anchor
  would nest interactive elements, which is invalid HTML and breaks keyboard
  and screen-reader navigation. The title is the link.

---

## Dashboard

`KPIsWidget` **never read `isError` on any of its four queries.** Every value
used `?? 0`, so a failed request rendered a confident, plausible, wrong number:

- Fleet size showed **`0`** — an operator's fleet reported as empty.
- Open maintenance showed **`0`** and, because the colour came from
  `maintenance.data && overdueCount > 0 ? 'red' : 'green'`, an undefined
  response painted the card **green**. A backend outage was displayed as
  *"nothing is overdue"*.
- Expenses and fuel spend both showed **`$0`**.

Alone on the most-viewed screen in the product, this is the most damaging defect
found: unlike a spinner or an error, nothing about a zero tells the reader not
to trust it. Each card now carries its query's error state, tone is derived only
from a value actually received, and every card links to its drill-down.

The dashboard also now renders `GetStartedPanel`, and its description is
role-derived rather than the same sentence for everyone.

---

## Page-by-page

### Empty vs error — the change applied across every list

Vehicles, Fuel, Expenses, Trips, Maintenance and Work Orders each had a loading
branch and **no error branch at all**. A failed fetch fell through to the
table's empty message, so an outage rendered as:

> *"No vehicles found. Try adjusting your filters or add a new vehicle."*

Telling an operator their fleet is empty when the platform is simply
unreachable is the single worst thing a fleet system can display. `DataTable`
now checks error **before** empty and the two are visually distinct.

Each list also now distinguishes **"no records at all"** — a first-run moment
that explains what the module unlocks and offers to start it — from **"no
records match your filters"**, which offers to clear them.

| Module | Error state | First-run empty state | Mobile cards | Notes |
|---|---|---|---|---|
| Vehicles | ✅ | ✅ + telematics secondary action | ✅ | |
| Fuel | ✅ | ✅ | ✅ | |
| Expenses | ✅ | ✅ | ✅ | respects `hideVehicleColumn` |
| Trips | ✅ | ✅ | ✅ | |
| Maintenance | ✅ | ✅ | ✅ | migrated off a hand-rolled table |
| Work Orders | ✅ | ✅ | ✅ | migrated off a hand-rolled table |
| Drivers | ✅ | ✅ | ✅ | hand-rolled `role="alert"` block replaced |

Detail and sub-pages that had a not-found branch but no error branch —
`MaintenanceDetailPage`, `WorkOrderDetailPage`, `OverdueMaintenancePage`,
`UpcomingMaintenancePage` — now order loading → error → not-found → content.

The Maintenance migration needed one additive `DataTable` prop,
`rowClassName`: the old table tinted an entire overdue row, and without it that
whole-row warning would have been silently dropped.

### Live Map

- Permission refusal now uses the shared `permission` variant, which does not
  offer a Retry button that could only fail again.
- Error copy explicitly says nothing on screen should be read as the fleet being
  stationary or offline.
- **New empty state.** A map with no pins is indistinguishable from a map that
  failed to draw.
- **Mobile:** the vehicle list stacked above the map at full height, so a
  40-vehicle fleet pushed the map entirely below the fold — on the one screen
  whose whole purpose is the map. The list is now capped and independently
  scrollable under `lg`.
- **Performance:** `vehicles` and `geofences` used `?? []`, allocating a new
  array every render, and both were dependencies of a `useEffect` and a
  `useMemo` — so every render invalidated both, on a page that repolls every 10
  seconds and re-renders a Leaflet map. Now memoised.

### Header consistency

25 pages hand-rolled their own header at three different title sizes
(`text-h1`, `text-2xl`, `text-xl`) with no breadcrumbs. All are converted to the
shared `PageHeader`, carrying every existing action button, handler and
permission gate verbatim. `grep "<h1"` across `frontend/modules/*/pages/` now
returns nothing outside `auth/`, which keeps its deliberately different chrome.

`PageHeader` adoption: **37 → 62 files.**

---

## Responsive

- `DataTable` gains `renderMobileRow`: below `lg`, a nine-column fleet table
  becomes one card per record carrying the fields that actually identify it.
  Wide tables scroll inside their own `overflow-x-auto` container rather than
  widening the page body.
- KPI grids use two columns on mobile rather than one — a fleet manager checking
  on a phone wants to compare figures, and a single-column stack pushes the
  fourth metric below the fold for no benefit.
- `PageHeader` actions wrap instead of forcing horizontal scroll.
- 3-column maintenance form rows, the 4-up fuel-import summary and the 5-tab
  AI Reports strip now collapse on small screens.
- The service calendar cannot collapse below seven columns and stay a calendar,
  so it keeps a readable minimum width and scrolls inside its own container.
- The `xs:` (480px) and `3xl:` (1920px) breakpoints now actually exist.

---

## Microinteractions

Kept deliberately few — this is an operations console. Chevron rotation on
sub-nav expansion, a width transition on sidebar collapse, hover states on
interactive cards, a 300ms progress-bar fill, spinners on in-flight actions, and
the existing toast system for action outcomes. Everything is covered by the
global `prefers-reduced-motion` rule. No glassmorphism, no gradients, no
decorative hero sections, no charts were added.

---

## Security and authorization

Nothing was weakened. Specifically:

- No route guard, tenant check or org-unit check was modified.
- No permission constant was added, removed or reassigned.
- No navigation item exposes a route the user cannot access; an exhaustive
  per-role test asserts this.
- The two newly-wired Command Centre actions render only under the permission
  their route enforces, and the routes remain authoritative.
- Onboarding steps are gated on the permission each step's **write** endpoint
  enforces, plus the permission needed to **read** its completion.
- Item ids are `encodeURIComponent`-encoded in action URLs — they are
  source-prefixed (`maintenance:reminder-1`) and the controller
  `decodeURIComponent`s the segment.
- Error detail is capped at 200 characters and never carries a stack, URL or
  response body — those can leak tenant identifiers and internal route structure
  in a multi-tenant product.
- The secret scan over the change set is clean; no `.env` or backend file is
  included.

---

## New shared components

| Path | Export |
|---|---|
| `frontend/shared/ui/patterns/tone.ts` | tone vocabulary, `deltaTone` |
| `frontend/shared/ui/patterns/MetricCard.tsx` | `MetricCard`, `MetricCardGrid` |
| `frontend/shared/ui/patterns/ErrorState.tsx` | `ErrorState` |
| `frontend/shared/ui/patterns/DataState.tsx` | `DataState`, `describeQueryError`, `isPermissionError` |
| `frontend/shared/ui/patterns/StatusBadge.tsx` | `StatusBadge`, `SeverityBadge`, `FleetStatusBadge`, `StatusDot` |
| `frontend/shared/ui/patterns/SectionHeader.tsx` | `SectionHeader`, `SectionPanel` |
| `frontend/shared/ui/navigation/nav.config.ts` | navigation model + pure helpers |
| `frontend/modules/onboarding/**` | `GetStartedPanel`, `useSetupProgress`, checklist + orientation logic |
| `frontend/modules/attention/hooks/useAttentionActions.ts` | resolve/dispatch mutations |
| `frontend/modules/attention/components/AttentionItemCard.tsx` | the intelligence card |
| `frontend/modules/attention/components/ResolveAttentionDialog.tsx` | outcome capture |

**Removed/replaced components:** none deleted. `StatsCard` and `StatisticCard`
became adapters; `PageHeader`, `EmptyState`, `DataTable`, `Sidebar`,
`AttentionQueueList` and `KPIsWidget` were rewritten in place. Every public prop
that existed before still exists and behaves the same.

---

## Backend gaps discovered

Documented as required; **none were implemented.**

### BG-1 — No cheap "count open attention items" endpoint

- **Missing:** a lightweight count of open attention items by severity.
- **Where needed:** a count badge on the Command Centre nav item, and any
  header-level "N things need you" indicator.
- **Why it matters:** "what needs attention" is the product's central question,
  and the answer is currently invisible until you navigate to the page.
- **Why not built:** the only endpoint that can answer it,
  `GET /api/ai/needs-attention`, fans out across seven AI services *and*
  persists a snapshot, carries `maxDuration = 60`, and has already caused a
  production timeout on Vercel. Calling it from the sidebar on every page load
  for every user would be a serious regression.
- **Eventual change:** a `GET /api/ai/needs-attention/count` reading persisted
  `attention_items` with an org-unit-scoped `countOpenBySeverityInScope`-style
  aggregate — the pattern already exists for anomalies — with no fan-out and no
  persist.

### BG-2 — Onboarding dismissal cannot be persisted server-side

- **Missing:** any per-user or per-organization UI-preference field, and a route
  to write one.
- **Where needed:** `GetStartedPanel` dismissal.
- **Why it matters:** dismissal does not follow the user to another browser or
  device.
- **Mitigation shipped:** stored client-side, keyed by user id; the panel also
  auto-hides once setup is genuinely complete, which limits the impact.
- **Eventual change:** a `uiPreferences` sub-document on the user record with a
  narrow `PATCH /api/users/me/preferences`.

### BG-3 — No `GET` handler for organization members

- **Missing:** `/api/organizations/[id]/members` implements only `POST` and
  `DELETE`.
- **Where needed:** the onboarding "Invite your team" step, and any member count.
- **Mitigation shipped:** `GET /api/organizations` returns each organization
  with its `members` array, and the TopBar already holds that query on every
  page, so the count is free. This works but couples a roster size to a list
  endpoint that will not scale to a large organization.
- **Eventual change:** a paginated `GET` on that route returning
  `pagination.total`.

### BG-4 — No `Permission.DRIVER_*` in the permission model

- **Missing:** driver-specific permissions. The drivers API is gated on
  `VEHICLE_VIEW` / `VEHICLE_EDIT` as a documented stopgap.
- **Where needed:** the Drivers nav entry and the onboarding "Add your drivers"
  step both mirror the stopgap exactly rather than inventing a gate.
- **Why it matters:** a role that should manage drivers but not edit vehicles
  cannot be expressed. Conversely, granting `VEHICLE_EDIT` silently grants
  driver management.
- **Eventual change:** `DRIVER_VIEW` / `DRIVER_CREATE` / `DRIVER_EDIT` /
  `DRIVER_DELETE`, then update the routes, the nav entry and the checklist step
  together.

### BG-5 — Platform Admin cannot manage another organization's branches

Pre-existing and already documented in `PLATFORM_ADMIN_NOTES.md`;
`/api/tenancy/org-units` resolves `organizationId` from the caller's session on
both `GET` and `POST`. Unchanged by this work and re-flagged only because the
navigation regroup surfaces Platform Admin more prominently.

### BG-6 — `NeedsAttentionItem.entityId` is a license plate

The identity split recorded in the architecture assessment
(`entityId` = plate, `AllocationPosting.vehicleId` = Mongo `_id`) means an
attention item cannot be linked to its vehicle's detail page by id without a
scope-checked resolver. Items therefore rely on the `href` the backend supplies,
and the UI does not construct vehicle links from `entityId`.

---

## Known limitations

Recorded rather than silently fixed, because each is out of scope or carries
risk disproportionate to its benefit in a UI pass.

1. **`MapsWidget` renders a decorative dot grid.** It calls the real
   `/api/telematics/live-map` and shows real counts, but its visual is a
   hardcoded 10×16 grid of static SVG circles unrelated to vehicle positions.
   Its file header documents this as intentional. Replacing it with a real
   mini-map means mounting Leaflet inside a resizable dashboard widget — a
   meaningful piece of work, not a styling change.
2. **Four byte-identical duplicate component files** remain:
   `ui/button.tsx` ≡ `ui/primitives/button.tsx` (6 vs 149 importers), plus
   `tooltip`, `hover-card` and `dropdown-menu` at `ui/` root vs their subdirs.
   Deleting the root copies is a safe follow-up but touches ~7 import sites for
   no user-visible benefit in this pass.
3. **11 of 13 files in `frontend/shared/tables/` are 1-byte BOM stubs.** The
   real table is `shared/ui/tables/DataTable.tsx`; `frontend/shared/tables/`
   chains through to it. Dead weight, safe to remove separately.
4. **`frontend/shared/ui/index.ts` and its seven sub-barrels have zero
   importers.** Left in place; the new `patterns/` barrel is used directly.
5. **Two competing shared trees** (`shared/ui/**` and `frontend/shared/ui/**`).
   Consolidating them is a large mechanical migration with real merge-conflict
   cost and no user-visible benefit. New shared work went to
   `frontend/shared/ui/patterns/` per the brief; improvements to existing
   components were made where their 60+ consumers already import from.
6. **Empty module scaffolds** (`analytics`, `notifications`, `settings`,
   `billing`, `compliance`, `dispatch`, `inventory`) are `export {}` stubs with
   no pages. Left alone — building those is feature work, not a UI overhaul.
7. **Two dead pages inside a live module:**
   `reports/pages/AnalyticsOverview.tsx` and `reports/pages/ReportPreview.tsx`
   are exported but no route renders them. Converted for consistency rather
   than deleted, since deletion is a product decision.
8. **`DriversTable` has no pagination.** The drivers API returns an unpaginated
   array for the parameters the page sends; adding pagination would change what
   the page requests.
9. **Work Orders has no manual create flow**, so its empty state offers no
   create action. `canCreateWorkOrders` exists in utils but no page used it, and
   inventing a create route was out of scope.
10. **Page-size selectors are plumbed but not enabled** on the list pages: each
    uses a module-level `PAGE_SIZE` constant rather than state. `DataTable` only
    renders the control when a caller supplies `onPageSizeChange`, so the
    behaviour is unchanged until a page opts in.

---

## Recommended future improvements

**High value, low risk**

1. Build `GET /api/ai/needs-attention/count` (BG-1) and add the Command Centre
   badge. It is the highest-value remaining item for the product's identity.
2. Adopt `DataState` on the remaining pages that still hand-roll their branches
   (reports, organizations, observability). The component exists; this is now
   mechanical.
3. Delete the four duplicate components and the 11 BOM stubs.

**Medium**

4. Replace `MapsWidget`'s decorative grid with a real read-only mini-map.
5. Add `DRIVER_*` permissions (BG-4) and update the routes, nav entry and
   onboarding step together.
6. Give the report builder and scheduled reports the same first-run empty-state
   treatment the operational lists received.
7. Migrate the remaining `trend: { value, isPositive }` call sites to
   `MetricCard`'s `delta` with an explicit `higherIsBetter`, so cost metrics
   stop being coloured as though rising were good.

**Larger**

8. Consolidate `shared/ui/**` and `frontend/shared/ui/**` into one tree.
9. Add a component-rendering test setup. `jest` is `testEnvironment: 'node'`
   with no jsdom, so nothing that renders can be covered — which is why all
   decisions in this work were pushed into pure functions in `utils/` and
   `nav.config.ts`. Adding jsdom + RTL would let the states themselves be
   tested.
10. A route-auth conformance test (already flagged as item S-1 in the security
    backlog) would catch nav/API permission mismatches structurally rather than
    relying on the per-entry review this file documents.
