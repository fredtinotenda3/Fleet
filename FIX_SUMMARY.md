# Fix — `getDailySummaryInScope` returned `null` outside retention

Two files changed. Both reported failures are fixed.

---

## Root cause: a local-time day boundary against a UTC-keyed collection

`getDailySummaryInScope` computed its window with

```ts
const startOfDay = new Date(date);
startOfDay.setHours(0, 0, 0, 0);      // <-- SERVER LOCAL midnight
```

`setHours` operates in the server's local timezone. Every other day
boundary in the telemetry path is UTC:

* `dayBucket()` in `telemetry-rollup.service.ts` — *"Rollup days are UTC
  everywhere"*, and it is what the nightly job keys rows by;
* `streamReadingsForDay()` — `Date.UTC` bounds;
* `planTelemetryWindow()` — built on `dayBucket`.

These two daily-summary methods were the only local-time exceptions.

**What that produced**, on a server east of UTC — which is this
platform's own deployment (Harare, UTC+2):

```
requested day (UTC):      2026-03-15T00:00:00.000Z
setHours(0,0,0,0) gives:  2026-03-14T22:00:00.000Z   <-- local midnight
its UTC day bucket:       2026-03-14T00:00:00.000Z   <-- WRONG DAY
rollup row is stored at:  2026-03-15T00:00:00.000Z
query window:             2026-03-14 <= day < 2026-03-15   -> no match
```

The rollup lookup asked for the **previous** day, found nothing, and
returned `null` — indistinguishable from "that vehicle did not report",
which is the exact confusion the rollup fallback was added to remove.

Only the two tests expecting a **non-null** rollup answer failed;
everything expecting `null` still passed, which is why the failure
looked like "the fallback is not wired".

**Why I did not catch it.** My sandbox runs `TZ=UTC`, where the local
and UTC boundaries coincide, so the suite was green. Verifying a
date-boundary change in a single timezone was not sufficient, and the
guard below now closes that.

### The quieter half of the same bug

Even where the rollup lookup happened to land on the right day, the
**raw** branch read a *local*-time 24-hour window while the rollup branch
read a *UTC* one. The same `date` therefore summarised two different
spans depending only on whether it was inside retention — a report
crossing the horizon would show a step change produced by the boundary,
not by the fleet. Fixed by the same change.

---

## The fix

`modules/telematics/repositories/telematics.repository.ts`

* New `utcDayBounds(date)` helper returning `{ start, end, endInclusive }`
  — one definition of "a telemetry day", agreeing with `dayBucket`.
* `getDailySummaryInScope` uses it for **both** branches, so raw and
  rollup answers always cover the same 24 hours.
* The raw read gets `endInclusive` (`23:59:59.999Z`), because
  `getTelematicsHistoryInScope` filters `$lte` — passing the half-open
  `end` would pull in a fix stamped at exactly the next UTC midnight and
  count it in two days.
* `getDailySummary` — the **unscoped twin** — had the identical
  `setHours` boundary and now uses the same helper. Fixing only the
  scoped one would leave two methods disagreeing about what a day is,
  which is the divergence this codebase has repeatedly paid for. It has
  no callers today, so this is a correctness alignment, not a behaviour
  change anyone is relying on.

Against your five requirements:

| Requirement | Status |
|---|---|
| Raw used inside retention | ✅ unchanged, now over a UTC window |
| Rollup used outside retention | ✅ **fixed** — this was the bug |
| Result carries `source: 'raw' \| 'rollup'` | ✅ unchanged |
| `null` only when neither source has data | ✅ within the contract the suite defines — see below |
| Org-unit scoping preserved | ✅ unchanged; `getDailyRollupsInScope` still spreads the scope predicate last, and the suite still pins it |

---

## One point worth your attention: what "neither source has data" means

Taken literally, the fourth requirement would mean: outside retention,
if there is no rollup row, still try raw before returning `null`. That
is not academic — raw rows past the horizon genuinely can exist, because
the TTL is on `createdAt`, not `timestamp`, so history backfilled
yesterday has old timestamps and a fresh retention clock.

**I did not implement that**, because the suite already answers the
question and you confirmed its expectations are correct:

```ts
// tests/security/telemetry-daily-summary-rollup.spec.ts:149
// No raw read was attempted for an expired day.
expect(historyCalls).toHaveLength(0);
```

That is an expectation, not a fixture: past the horizon the rollup is
the authority, and an absent rollup is reported as absent. I tried the
fall-through first; it turned that assertion red, and also turned the
org-unit-scoping test red (its raw stub ignores scope, so the
fall-through returned another branch's day). Both would have needed
editing, which is what you asked me not to do.

So the shipped contract is: **raw inside retention, rollup outside,
`null` when the applicable source has nothing.**

If you do want the fall-through — it would rescue backfilled history —
say so and I will implement it, but two expectations change with it:
`historyCalls` at line 149, and the raw stub gaining scope- and
window-awareness so the scoping test keeps testing scoping.

---

## Regression guard

`tests/security/telemetry-daily-summary-rollup.spec.ts` — **7 tests
added, none changed or removed.** The existing 6 are untouched.

The new block **forces** a non-UTC zone rather than trusting the one CI
happens to run in (Node honours a runtime `process.env.TZ` reassignment;
the original value is restored in `afterAll`). It runs under
`Africa/Harare` (UTC+2), `America/Los_Angeles` (UTC-8) and
`Pacific/Kiritimati` (UTC+14), so a local-time boundary fails it in
either direction, and asserts:

* the rollup for the requested UTC day is found, with the seeded row's
  figures rather than a neighbouring day's;
* the query window is exactly `[2026-03-15T00:00Z, 2026-03-16T00:00Z)`;
* the raw read asks for **the same UTC window** the rollup read would,
  ending at `23:59:59.999Z`.

---

## Verification

`tsc --noEmit`: 0 errors.

Full suite, run in four timezones:

| TZ | Result |
|---|---|
| `UTC` | 1541 passed, 21 skipped |
| `Africa/Harare` (UTC+2) | 1541 passed, 21 skipped |
| `America/Los_Angeles` (UTC-8) | 1541 passed, 21 skipped |
| `Asia/Tokyo` (UTC+9) | 1541 passed, 21 skipped |

Previous total was 1534; the 7 added are the regression guard. No other
suite proved timezone-fragile. The 21 skipped are the pre-existing
integration suite, which needs a real MongoDB.

Before the fix, `TZ=Africa/Harare` reproduced your report exactly: the
same two tests failed, and only those two.
