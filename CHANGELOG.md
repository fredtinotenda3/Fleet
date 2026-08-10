# Driver PWA (DVIR) — Changelog

30 files changed/added. `npx tsc --noEmit`: **0 errors**. Security suite: **382/382 passing**
(29 suites, up from 379 — the increase is `module-scope-conformance.spec.ts` picking up the
newly-registered `dvir` module, not a new gap being covered).

## New module: `modules/dvir/`

Driver Vehicle Inspection Report, following the same repository/service/controller/events
layout as `modules/workorders/`.

- **`types/dvir.types.ts`** — `DVIRInspection`, checklist item shape, create DTO. Includes
  `clientInspectionId`, a device-minted idempotency key for offline-queue resubmission.
- **`repositories/dvir.repository.ts`** — extends `TenantScopedRepository<DVIRInspection>`
  (same base class as `workorders`/`maintenance`). Adds `findByClientInspectionId` (the
  idempotency lookup) and `appendWorkOrderId`.
- **`services/dvir.service.ts`** — `DVIRService.submit()`:
  1. validates the checklist (every defect requires a description; max 50 items)
  2. resolves the vehicle and checks `tenantScopeService.canAccessOrgUnit()` — a driver can only
     inspect vehicles inside their own accessible org units (their branch/fleet), enforcing
     requirement 5
  3. idempotency check against `clientInspectionId` — a retried offline-queue submission
     returns the original result instead of duplicating the inspection/work orders
  4. uploads any defect photos via the existing `storageService`
  5. persists the inspection, inheriting the vehicle's `orgUnitId`
  6. creates **one work order per defect item** via `workOrderService.create()` (requirement 3)
  7. if `outOfService` is set, publishes a `DVIROutOfServiceEvent` and broadcasts a critical
     notification to the vehicle's workshop org unit (requirement 1's "Out of Service... notifies
     the workshop")
- **`controllers/dvir.controller.ts`** — `list`/`get`/`submit`, mirrors the workorders
  controller pattern. `submit` resolves the driver's identity from the authenticated user (see
  "Known limitation" below) rather than trusting a client-supplied id.
- **`events/dvir.events.ts`** — `DVIRSubmittedEvent`, `DVIROutOfServiceEvent`.

## New API routes

- **`app/api/dvir/route.ts`** — `GET` (list, `Permission.DVIR_VIEW`), `POST` (submit,
  `Permission.DVIR_CREATE`).
- **`app/api/dvir/[id]/route.ts`** — `GET` single inspection.

`GET /api/vehicles` (already existing, already org-unit scoped, already reachable by
`Role.DRIVER`) is reused for the vehicle picker — no new endpoint needed there.

## Permissions & tenancy registration

- **`server/permissions/roles.ts`** — new `Permission.DVIR_CREATE` / `Permission.DVIR_VIEW`.
  `DVIR_CREATE` + `DVIR_VIEW` → `Role.DRIVER`. `DVIR_VIEW` → `BRANCH_MANAGER`, `FLEET_MANAGER`,
  `WORKSHOP_MANAGER`, `MECHANIC`.
- **`server/tenancy/module-scope.registry.ts`** — registered `dvir` as `org-unit` scope,
  `orgUnitSource: 'vehicle'`, `confirmed: true`. Required — the module-scope conformance test
  fails closed on any unregistered module directory.
- **`server/events/event-names.ts`** — `DVIR_SUBMITTED`, `DVIR_OUT_OF_SERVICE`.

## Work order integration

- **`modules/workorders/types/workorder.dvir-addendum.ts`** (new) — additive module
  augmentation (same pattern as the existing `workorder.tenancy-addendum.ts`) adding
  `source` / `dvirInspectionId` / `driverId` / `photoUrl` to `WorkOrder` and
  `WorkOrderCreateDTO`, so a DVIR-raised work order carries the defect description, photo,
  vehicle id, and driver id back-reference (requirement 3).
- **`modules/workorders/repositories/workorder.repository.ts`** — imports the new addendum.
- **`modules/workorders/services/workorder.service.ts`** — imports the new addendum, persists
  the new fields, **and fixes a pre-existing bug**: the tenancy addendum's doc comment on
  `orgUnitId` promised "falls back to the vehicle's own orgUnitId when omitted," but
  `WorkOrderService.create()` never actually implemented that fallback — every work order was
  created with `orgUnitId` silently `undefined` regardless of caller input. This is invisible
  until an org-unit-scoped read (a workshop manager's queue, or the Needs Attention feed) comes
  back empty for no apparent reason. Fixed as part of wiring DVIR's work orders through, since
  DVIR depends on this to actually be visible to a scoped workshop manager.

## Needs Attention queue integration

- **`modules/ai/services/needs-attention.service.ts`** — `readMaintenance()` now also reads
  open work orders (`readOpenWorkOrders`, new private method) via `workOrderRepository`/
  `workOrderService`, surfaced under the existing `'maintenance'` source (no new
  `NeedsAttentionSource` value, so no changes needed to the frontend's source-icon map).
  DVIR-originated work orders are labeled "(reported by driver inspection)" in the description.
  Satisfies requirement 3's "appears in the Needs Attention queue immediately."
  - Wrapped in its **own** try/catch, separate from the outer `safeSource('maintenance', ...)`
    wrapper, so a failure reading work orders degrades to "no work-order items" rather than also
    discarding the existing overdue/upcoming maintenance-reminder items — verified against
    `tests/security/needs-attention-scope.spec.ts`'s failure-isolation test, which exercises this
    function without mocking work orders (confirmed passing: the real DB call throws fast with
    no `MONGODB_URI` set, caught, logged, empty array returned, reminder items unaffected).
  - `makeItem()`'s `extra` parameter type extended to accept `href` (was already a field on
    `NeedsAttentionItem`, just not exposed through the helper).

## Frontend: `frontend/modules/dvir/`

Client-safe module, deliberately dependency-free of anything under `server/`/`modules/` (a
separate copy of the shared type shapes, not an import of the server module) so nothing server-
only can leak into the client bundle.

- **`types.ts`** — client-side type mirror + `DVIR_CHECKLIST` (tyres, lights, brakes, body,
  fluids, other).
- **`lib/offline-db.ts`** — hand-rolled IndexedDB wrapper (no new dependency), one object store
  keyed by `clientInspectionId`.
- **`lib/sync.ts`** — the offline queue manager:
  - `queueInspection()` — persists to IndexedDB, attempts an immediate flush if online
  - `flushQueue()` — POSTs each queued item; on success removes it; on a 4xx (validation/scope
    rejection — not a connectivity problem) it is marked `permanentFailure` and **kept queued**,
    not deleted — silently dropping a safety-critical defect report on a bad-but-recoverable
    error would be worse than an extra visible queue entry. On 5xx/network failure it stays
    queued with an incremented attempt count for retry.
  - `initDVIRSync()` — flushes on mount, on the browser `online` event, and every 60s while the
    tab is open (works even in browsers without Background Sync API support, e.g. Safari/iOS).
  - `subscribePendingCount()` — the visible-queue-count subscription used by
    `OfflineQueueBadge`.
- **`lib/photo.ts`** — downscales/re-encodes a captured photo (max 1600px, JPEG 0.72) before it
  enters the offline queue, so several queued defect photos don't blow through IndexedDB storage
  quotas.
- **`components/ChecklistItem.tsx`** — one checklist row: large (56px height) OK/Defect Found
  tap targets, description textarea + photo capture (`capture="environment"` for the rear
  camera) shown only when Defect Found is selected.
- **`components/DVIRForm.tsx`** — the full inspection form: pre-trip/post-trip toggle, vehicle
  picker (fetches the driver's own scoped vehicles from `/api/vehicles`, with a manual
  license-plate fallback), odometer, the six checklist items, an Out of Service toggle, and a
  sticky submit button. Submission tries `POST /api/dvir` directly when online; falls back to
  `queueInspection()` when offline, on a 5xx, or on a network-level fetch failure.
- **`components/OfflineQueueBadge.tsx`** — visible pending-sync count (requirement 2), shown
  online (mid-sync) and offline.

## New routes

- **`app/(protected)/driver/page.tsx`** — the inspection page (requirement 4's dedicated
  `/driver` route), inside the existing `(protected)` layout (`DashboardLayout` → `Sidebar` +
  `TopBar`, already responsive).
- **`app/(protected)/driver/history/page.tsx`** — past inspections (`GET /api/dvir`) plus the
  offline queue, with a discard action for permanently-failed queued items.

## Sidebar navigation

- **`frontend/shared/ui/navigation/Sidebar.tsx`** — new "Driver" entry (`ClipboardCheck` icon,
  `/driver`), gated on `Permission.DVIR_CREATE` specifically (not `DVIR_VIEW`) so it only shows
  for roles that actually submit inspections; workshop/fleet managers already reach DVIR data via
  Work Orders and the Needs Attention queue.

## PWA layer

- **`public/manifest.json`** — `start_url: /driver`, `display: standalone`, SVG icons
  (regular + maskable).
- **`public/sw.js`** — install/activate/fetch handlers. Caches only the small `/driver` app
  shell (the page itself, manifest, icons, offline fallback) — **never** caches `/api/*`
  responses, since those are tenant/org-unit-scoped per signed-in user and stale or cross-user
  cached data would be a correctness/security problem, not just a UX one. Registers a `sync`
  event listener as a progressive enhancement for browsers with Background Sync API support,
  which just wakes any open tab to run the same `flushQueue()` the page already uses.
- **`public/offline.html`** — static fallback shown for other navigations that fail offline.
- **`public/icons/dvir-icon.svg`**, **`dvir-icon-maskable.svg`** — placeholder app icons.
- **`frontend/shared/pwa/ServiceWorkerRegister.tsx`** — registers `/sw.js`, relays
  `DVIR_FLUSH_QUEUE` postMessages from the service worker's `sync` handler into
  `flushQueue()`.
- **`app/layout.tsx`** — added `manifest`/`appleWebApp` metadata, `viewport.themeColor`, and
  mounted `<ServiceWorkerRegister />`.

## Data scoping (requirement 5)

Every inspection is created with the vehicle's `orgUnitId` (`DVIRService.submit`), and the
repository's `getFilteredInScope` applies `tenantScopeService.buildFilter(context, 'orgUnitId')`
— the identical mechanism `workorders`/`maintenance` already use. A driver whose accessible org
units don't include the vehicle's org unit gets a `ForbiddenError` at submit time
(`tenantScopeService.canAccessOrgUnit`), and a vehicle with no `orgUnitId` at all is rejected for
any non-org-wide caller rather than silently defaulting to "visible to everyone."

## Known limitation (flagged for product/eng follow-up)

There is currently no `tbldrivers` ↔ `tbladmin` (auth user) link field anywhere in this
codebase — `modules/drivers/repositories/driver.repository.ts` has a comment acknowledging this
gap exists elsewhere too. `DVIRController.submit()` therefore uses the authenticated user's own
id as the `driverId` on the inspection, with a display name looked up from `tbladmin` — it does
**not** attempt to resolve a separate `tbldrivers` record. This is safe (a driver still can only
act as themselves) but means a DVIR inspection's `driverId` is a `tbladmin` user id, not a
`tbldrivers` record id. If/when that link is built, `DVIRController.submit()` is the one place to
update.

## Not changed

No existing route, type, or test file was removed or had its existing behavior altered outside
of the two additive fixes noted above (`orgUnitId` fallback on work orders; `makeItem`'s `extra`
type gaining `href`). All 379 pre-existing security tests still pass, plus 3 new passing
assertions from `module-scope-conformance.spec.ts` picking up the registered `dvir` module.
