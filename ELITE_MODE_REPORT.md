# Elite Mode — Delivery Report

114 files changed or added, verified by applying the delivered zip onto a
fresh unzip of the uploaded tree.

---

## Verification

```
npx tsc --noEmit                 →  0 errors
npm test          (TZ=Harare)    →  118 suites / 2209 passed, 0 failed
npm test          (TZ=UTC)       →  118 suites / 2209 passed, 0 failed
npm run test:security            →  1267 passed, 0 failed
npm run test:e2e                 →  14 passed
npm run test:performance         →  13 passed
npm run test:integration         →  21 skipped (needs a live Mongo)
npm run build                    →  ✓ 228/228 static pages, 102 kB shared
npm run lint                     →  24 findings, the SAME 24 as baseline
```

Baseline was 107 suites / 1932 tests. **+11 suites, +277 tests.** Both
timezones run deliberately — an earlier round shipped a day-boundary bug
that was green under UTC and red on a UTC+2 deployment.

`npm run build` runs on a throwaway copy with `next/font` stubbed: it
fetches Geist from Google at build time and this sandbox has no egress to
fonts.googleapis.com. The stub is **not** in the delivered change set.

---

## Phase 1 — the flaky performance test

**Your premise was slightly off, and it matters.** The `< 5000` budget
appears once in that file, in the **backup-writer streaming** test — not
the odometer resolver (that one is `< 2000`).

Measured 73 ms here, 8,568 ms on your machine: a **117× spread** for
identical code. That is `for await` overhead — 50,000 async iterations
are 50,000 microtask ticks, and a throttled VM or an on-access scanner
multiplies the per-tick cost in a way a CPU loop never shows. No absolute
millisecond budget survives that.

The property the test existed to defend was **laziness** — that
`ndjsonLines` had not gone back to building a `string[]`. Wall-clock time
was a proxy, and a bad one. It is now asserted directly: a buffering
implementation must exhaust its source before yielding, so consuming
**one** line from a 50,000-document source must not have pulled 50,000
documents. Deterministic, machine-independent.

Proved by re-injecting the `string[]` regression: the structural
assertion caught it (`50000` vs `<= 10`) **while the timing test still
passed** — which is exactly why the old check was weak.

Every other budget in the file had only 30–46× headroom and would have
failed next on your machine. All are now calibrated against the machine's
own measured speed (`tests/helpers/perf-calibration.ts`).

No production code was slowed.

---

## Phase 2 — telemetry → trip generation

- `trip-detection.ts` — **pure**. Ignition authoritative when reported;
  movement fallback; stop and signal-gap detection; odometer-preferred
  distance with GPS-path fallback; noise rejection.
- `trip-generation.service.ts` — the I/O shell.
- `trip-detection-state.repository.ts` — per-vehicle watermark.
- Scheduled every 10 minutes (`generate-trips`).

**Idempotent in three independent layers**: the watermark, a
deterministic `generation_key`, and a **partial** unique index (partial
so manual and imported trips, which have no key, may still share a start
time). `$setOnInsert` throughout, so a re-run can never mutate a trip
already posted to the ledger.

Tenant-safe and org-unit-safe: reads and writes filtered by tenant,
`orgUnitId` inherited from the vehicle.

### A bug in my own first cut, worth stating

I set `signalGapMinutes: 30`. Thirty minutes is an **ordinary tracker
cadence**, so the rule fired on normal operation: every journey split
into single-fix stubs, each stub failed the minimum-trip test and was
discarded, and **a full day of driving produced zero trips**. Silence,
not a wrong answer — the worst failure mode this platform has.

Caught by my own fixture. Fixed to 60 with a strict `>`, and pinned by a
regression test. Documented in `ADMIN_GUIDE.md` for deployments with
slower trackers.

---

## Phase 4 — the ledger was receiving expenses only

The posting infrastructure was fully built, subscribed, and keyed on
names that do not exist:

| mapped | reality |
|---|---|
| `ExpenseCreated` | real |
| `FuelLogCreated` | **not an event** — it is `FuelLogged` |
| `MaintenanceCompleted` | **not an event** — it is `ReminderCompleted` |
| `WorkOrderCompleted` | real, but filed as `sourceCollection: 'tblreminders'` |

**Fuel — the largest operating cost in any fleet — never posted.** Nor
did maintenance. `getCostPerKm` divided real distance by a total missing
most of its numerator.

Two further defects in the same handler:

- **Every posting was dated `new Date()`**, because no event carried a
  date. A backdated fuel log posted into the wrong accounting period —
  uncorrectable on an append-only ledger. Events now carry their record's
  date, and a source with no date is **refused** rather than dated to
  now.
- **Work orders posted a single lump.** Parts and labour are different
  costs to a finance team; they now post separately, with the total used
  only when neither component exists (posting both would double-count).

Also: `tblworkorders` added to the source-collection union, so a
`sourceId` documented as a reminder id no longer holds a work-order id.

### The test suite was pinning the bug

`expect(code).toContain('FuelLogCreated')`. Fixing the handler turned
that test red, which is the only reason I noticed. Corrected, with a note
that the **assertion shape** was the real problem: checking that source
text contains a literal proves the literal is present, not that it means
anything.

---

## Phase 5 — platform endpoints

`GET /api/platform/users`, `/api-keys`, `/roles`, and
`GET /api/telematics/alerts/summary`.

Guarded twice: `withAuth(PLATFORM_VIEW)` **and** the literal
`Role.SUPER_ADMIN` — `AuthContext.isSuperAdmin` is also true for
`organization_owner`.

**Redaction by allow-list, never `delete row.secret`.** `Password` and
`keyHash` are never projected; custom roles return a permission *count*.
An allow-list omits a field added tomorrow by default; a deny-list
includes it.

The alert summary is org-unit scoped with the predicate spread **last**
and requires the same permission as the rows it counts — aggregates are
where leaks come back, and that has happened twice in this codebase.

**Not built, with the reason:** platform-scoped org-unit management.
`/api/tenancy/org-units` resolves `organizationId` from the *caller's
session* on both GET and POST, so rendering it for another organization
would show a platform admin their **own** branches under someone else's
name — every request returning 200. Needs a new
`/api/platform/organizations/:id/org-units`.

---

## Phase 3 — route playback (backend + helpers)

`GET /api/trips/:id/playback`. The route is **reconstructed, not stored**
— a stored polyline would duplicate the largest collection in the
database and go stale when the provider backfills.

Scope: the trip is loaded under the caller's context **before** any
telemetry read; out-of-scope is reported as **not found**; the vehicle
comes from the trip record, never the request.

Honesty: long tracks are evenly sampled (always keeping first and last —
dropping the tail would render a trip as ending where the vehicle never
stopped), `speed`/`heading` are omitted when unreported, and an empty
track says **why**.

**The playback UI is not built.** The endpoint, the sampling and the
scope rules are; the scrubber, play/pause and timeline are not.

---

## Phase 7 — live-map markers

- `vehicle-glyph.ts` — free-text `vehicle_type` → silhouette (truck,
  trailer, forklift, tractor, generator, light vehicle, bus, motorcycle),
  tolerant of the padding and casing in your real data, generic truck as
  fallback. Inline SVG paths using `currentColor`, so they re-theme
  without JavaScript.
- `marker-interpolation.ts` — markers **glide** between polls instead of
  teleporting. One `requestAnimationFrame` loop for the whole fleet, not
  a timer per marker.

**It never extrapolates.** A marker eases to the last *known* fix and
stops. Dead reckoning would draw a vehicle somewhere the platform has no
evidence it has been — an invented position rendered identically to a
measured one. Implausible jumps snap; sub-2 m jitter is ignored so a
parked fleet does not shimmer.

Heading, status colours, alerts, geofences, tooltips, click-to-detail and
scoping are unchanged.

---

## Phase 9 — business-data reset

`npm run db:reset-business-data`

All the risk is in the **classification**, so it is data with a reason
per entry, and 54 tests assert it. Every collection must appear in
CLEAR, PRESERVE or IGNORE — an unclassified collection is a **hard
failure**, because defaulting either way is dangerous.

Dry-run default; `--confirm` to apply; refuses a multi-tenant database
without `--tenant`; **never drops a collection**; prints a full manifest
with counts first; writes an audit record.

Preserves the **audit log** — clearing it as part of a data reset would
destroy the record of the reset itself.

Clears `tbltrip_detection_state` alongside `tbltrips`: otherwise every
watermark sits in the future, the sweep skips all telemetry, and **no
trips ever regenerate**, silently.

Also fixed a real registry bug found by these tests: `module-scope.registry.ts`
declared `tblwebhooks`, which does not exist (`tblwebhooksubscriptions`
does). The registry drives the backfill and audit tooling, so that
collection was covered by none of it.

---

## Phase 8 — documentation

`USER_GUIDE.md`, `ADMIN_GUIDE.md`, `DATA_STRUCTURE_REFERENCE.md`,
`DEPLOYMENT_AND_OPERATIONS.md`, `API_REFERENCE.md`, `SECURITY_MODEL.md`,
`VALUE_LEDGER_AND_FINANCE_EXPLAINER.md`, and an updated
`DATA_ENTRY_GUIDE.md`.

Written from the code and from your live schema export, including the
failure modes each control exists to prevent — not generic descriptions.

---

## Phase 6 — NOT delivered

Notification centre, global search, bulk actions, saved views, dashboard
customization, dark-mode toggle, mobile manager experience, advanced
benchmarks, undo.

I did not start these. Each is a multi-day feature with its own backend
requirements, and half-building nine of them would have produced nine
things that look finished and none that are. The correctness and
connectivity work was the higher-value use of the session, and I would
rather tell you they are untouched than hand you a partial notification
centre.

Also not delivered: the playback **UI** (endpoint is ready), and
platform-scoped org-unit management (blocked, reason above).

---

## Manual steps

1. **`npm run db:dedupe-telemetry`** (dry run), then
2. **`npm run db:indexes`** — creates the partial unique index that is
   the real idempotency guarantee for generated trips.
3. **`npm run tenancy:backfill`** (dry run, then `--confirm`) — rows
   written before the scope fixes are still invisible to narrowed users.
4. **Verify as a branch manager, not an admin.** An org-wide account sees
   everything and proves nothing.
5. **Rotate** the three credentials from earlier archives.
6. If your trackers report less often than hourly, lower
   `signalGapMinutes`.

---

## Remaining risks

| Risk | Status |
|---|---|
| Historical costs do not re-post to the ledger | periods before the fix understate cost; backfill is a finance decision |
| `loadInScope*` fail open on rows with no `orgUnitId` | one line per file; **backfill first** or you lock out legacy rows |
| Fleet Health uses hard-coded benchmarks | 10 km/L, $200/expense, `averageDowntime: 5` is a literal placeholder — a product decision, not a bug |
| `BaseRepository` `_id` type lie | ~20 `updateOne({_id})` sites would no-op if "fixed" in one pass |
| Allocation ledger has two period semantics | list vs totals; standardise in its own commit |
| `next/font` fetches at build time | breaks air-gapped CI |
| Sentry non-functional | v6 vs Next 15 |
| 24 pre-existing lint errors | unchanged |
| Trip detection defaults are untuned | sensible starting points, not measured against your fleet |

---

## What would still make me hesitate

The same thing as last round, and it is now the only structural one left:
**this codebase has a habit of shipping handlers that are correctly
written, correctly subscribed, and keyed on names nothing publishes.**
Three instances found so far — the AI trigger, the allocation posting
map, and (in a different form) the scope-mismatch class. Each was
invisible: nothing throws, nothing logs, the number is merely too low or
the screen merely empty.

The structural guards added this round and last (`ai-trigger-wiring`,
`allocation-posting-wiring`, `write-scope-conformance`,
`org-unit-write-roundtrip`) close the specific instances and the general
shape. But I would spend the next session sweeping for the remaining
members of that family rather than adding features: every event handler,
every scheduled job, every metric — does its trigger exist, does its
input exist, and what does it render when it cannot compute?

A buyer forgives a missing notification centre. They do not forgive a
dashboard that was confidently wrong about their own trucks.
