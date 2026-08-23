# EagleTrack fuel report — columnar format

11 files: 3 new, 8 modified. Backend, frontend, and tests.

---

## Verification

| | Baseline (uploaded tree) | After |
|---|---|---|
| `npx tsc --noEmit` | 0 errors | **0 errors** |
| `npx jest` | 719 passed / 48 suites | **767 passed / 50 suites** |
| `npm run test:security` | 512 passed / 39 suites | **521 passed / 40 suites** |
| `next build` | 214 static pages, 0 errors | **214 static pages, 0 errors** |

Zero failures at either end. +48 tests, +2 suites.

Build caveat, unchanged from previous rounds: `npm run build` on your tree
fails at `next/font` fetching Geist from Google **before compiling any app
code**, so a red build there is no evidence about this change. Verified by
building a throwaway copy with the two font imports stubbed. The only
warning is the pre-existing `@opentelemetry` *Critical dependency*, present
on your untouched tree too.

`npm ci` still fails on the pre-existing `package.json` / `package-lock.json`
desync. I did not ship a regenerated lockfile — sandbox npm/Node is not your
toolchain. Run `npm install` and commit the lockfile.

---

## The defect was worse than "columns aren't parsed"

`toKeyedRows` walked `data` with `Object.entries()` and kept entries that
were objects but not arrays. On the real payload:

- `column` — array → **dropped**
- `body` — array → **dropped**
- `global` — object → **kept**

So `/api2/reports/fuel` parsed as **exactly one row, attributed to a tracker
named `"global"`, carrying the fields `pageCount` and `recCount`.** Not an
empty result — a fabricated one. Pinned by a regression test.

---

## 1. Columnar payload support — `eagletrack-field-map.ts`

New `readColumnarPayload()` expands `{ column, body }` into keyed rows using
the header labels as object keys. That choice is what let everything else
stay: `"Fuel Used"` normalises straight onto the `fuelUsed` alias already in
the table, so `indexRow`, `describeUnmapped` and every reader keep working
unchanged. `toRows` and `toKeyedRows` now route through it; a payload that
isn't the table shape falls through untouched. The guard is strict — `column`
must be an array of strings **and** `body` an array — so a keyed payload that
happens to contain a `body` field is not reinterpreted as a table.

**Positional mapping is only as good as the widths.** Every cell is placed by
index, so a body row of a different length than the header is the one failure
mode that silently shifts an odometer into a distance column. The overlap is
still mapped (partial data is data), but mismatched rows are **counted** and
surfaced as a warning. Cells beyond the header get the synthetic key
`column[N]`, which no alias matches, so they appear in `unmappedFields`
rather than vanishing. Blank and duplicate headers are disambiguated the same
way — first occurrence wins for alias matching, the loser is reported.

Also consolidated `readCounter` here. The client had its own private copy,
and the fuel report nests `global` **inside** `data` rather than beside it in
the envelope — one reader now serves both, so a counter can't be trusted in
one path and dropped in the other.

## 2. Cell interpretation — `eagletrack-report-values.ts` *(new)*

The reports family doesn't return JSON values. It returns the rows of a
rendered table, so every cell is a **string**: `"7.14 km"`, `"34853.05 km"`,
`"-"`, and a whole semicolon-delimited sentence in the `Fuel` column.
`readNumber("7.14 km")` is `Number("7.14 km")` → `NaN` → `null`, which is why
a perfectly good distance read as "not reported" and looked identical to a
device that reports nothing.

**Four outcomes, not two** — collapsing these is what produces confidently
wrong operational conclusions:

| | meaning | how to fix |
|---|---|---|
| `absent` | no alias matched a key | check `unmappedFields` — may be the wrong name |
| `no-data` | provider explicitly said it has none (`"-"`) | nothing to fix; it's a fact |
| `unparsable` | a value arrived, unreadable | a unit/alias bug, not a data gap |
| `value` | a number, on a recognised unit | — |

A zero is never manufactured for any of the first three.

**Units are validated, never assumed.** An unrecognised unit makes the cell
`unparsable` rather than keeping the bare number. That rule comes straight
from your io-199 bug, where an "L/h" figure was written to a field the panel
renders as "L/100km" — the number survived, its meaning didn't. Concretely
refused, each with a test:

- `"5 gal"` — US and imperial differ by 20% and the cell doesn't say which
- `"34853 m"` — a bare `m` can't be told from a sloppy abbreviation for miles, and a 1000× odometer error is a maintenance schedule and a depreciation charge, not a rounding problem
- `"3.2 L/h"` where L/100km is expected — accepting one for the other is how a stationary idling truck reports excellent economy
- `"1,5"` — one-and-a-half across most of continental Europe, fifteen with a stray separator elsewhere. Strict thousands grouping (`"34,853.05"`) is accepted; anything else is refused rather than guessed

Miles **are** converted, exactly (1.609344), with the unit recorded.

**Currency is reported, never inferred.** A three-letter token becomes
`fuelCostCurrencyCode`; anything else is preserved verbatim as
`fuelCostCurrencySymbol` and left uninterpreted. `"$"` is shared by a dozen
currencies, and this platform sells into a market where the local one and USD
circulate side by side.

**The `Fuel` summary column** is split on `;` then on the *first* colon, and
labels are matched **exactly** after case/separator folding — never by prefix.
`"Fuel Filling Times"` and `"Fuel Filling"` differ only by a suffix, so prefix
matching would read the event count as litres. Unclaimed labels surface in a
separate `unmappedFuelSummaryLabels` list, kept distinct from unclaimed
*columns* because they're corrected in different tables.

## 3. Row mapping — `eagletrack-payload.parsers.ts`

`parseFuelReportRows(data, fallbackUin)` — **signature unchanged**, so all four
existing call sites and every existing test keep working. New
`parseFuelReportPayload(data, fallbackUin)` adds the table-level facts (header,
counters, width mismatches) that no individual row can carry; the service uses
that one.

Against your exact sample it produces `distanceKm: 7.14`, odometers
`34853.05` / `34860.19`, ISO-normalised period bounds, `refuelEventCount: 0`,
`drainEventCount: 0`, `consumptionPer100Km: 0`,
`noDataFields: ["fuelCost","fuelConsumedLitres"]`, and **`unmappedFields: []`**
— every one of the nine columns claimed.

Existing `refuelledLitres` / `drainedLitres` / `consumptionPer100Km` are filled
from the summary only when no dedicated column supplied them: a first-class
column is a more direct statement than a value extracted from rendered prose.

Period bounds keep the provider's **raw string** alongside the parsed ISO
instant. The vendor sends `"2026-08-20 00:04:07"` with no offset and
`parseEagleTrackDate` reads that as UTC — an assumption your own adapter
header documents as unconfirmed. Keeping both means a later timezone
correction re-derives from data still held. A date string that doesn't parse
is also kept, not discarded: an operator can read `"20/08/2026 00:04"` fine,
and throwing it away would hide the format that needs supporting.

### Cross-field self-checks

Not our arithmetic replacing the vendor's — **self-checks on a positionally
mapped table**, which is the cheapest way to detect a column shift. Each flag
travels alongside the values, never instead of them.

- `distance-odometer-mismatch` — reported distance vs end-minus-start beyond tolerance. Tolerance is deliberately loose (1 km or 5%); the two figures come from different sources and are rounded independently, and a flag that fires on normal noise trains an operator to ignore it. Your sample agrees to 7.14 vs 7.140000000000873 and stays quiet.
- `odometer-decreased` — device reset, replaced unit, or misaligned columns.
- `zero-consumption-rate-without-fuel-used` — see below.

**Note this does *not* derive distance from the odometers.** Same rule that
blocks initial-minus-final for `fuelConsumedLitres`.

## 4. Service — `eagletrack-fuel.service.ts`

### Attribution: two things your brief didn't ask about

**A report row carries no uin.** Its only identifier is the `Name` column.
Ordinarily the request is for one tracker so every row is ours — but if a
deployment ignores the `uin` filter and answers with the whole account's
report, stamping the requested uin onto every row writes other vehicles'
distance, fuel and spend into this one. **In a tenant where several branches
share one EagleTrack account, that crosses org units while every scope check
in the request passes.** Same class as your adapter's matching rules ("a wrong
match is worse than no match"), reached through the report endpoint instead of
the roster.

So `providerName` is kept strictly separate from `uin`, and attribution is
decided on evidence:

| the report names… | outcome |
|---|---|
| one tracker, matching our plate | keep everything, no warning |
| one tracker, differently named | **keep everything**, warn. Trackers are legitimately named things that aren't plates ("DashCam2"), and with nothing to confuse it with there's no misattribution risk — discarding real data here would be the wrong trade |
| several, some matching our plate | keep only ours, exclude the rest, **name them** in the warning |
| several, none matching | **keep nothing** and say why. An empty report with a stated reason is recoverable; a plausible report built from another vehicle's fuel is not |

Comparison is `trim().toUpperCase()` — exactly what `findByLicensePlate`
matches on. Canonicalisation, not a new heuristic: no substring search, no
similarity scoring. `AFU00781` does not match `AFU0078`, and there's a test.

**`recCount: "1318"` next to one body row.** Either the report is paginated
and any total is a slice, or `recCount` counts underlying position records
rather than report rows. One sample can't settle it and I won't guess — both
numbers are returned as `providerCounters` with a
`record-count-exceeds-returned-rows` warning. I did **not** add pagination:
silently paginating would multiply every request on a deployment where the
counter means the second thing.

> **Worth one curl before anyone trusts a multi-day total.** Re-run your fuel
> request with `&pageSize=100&pageIndex=0`, then `pageIndex=1`. If page 1
> returns different rows, the report is paginated and `getFuelReport` needs a
> page loop (the pattern is already in `getHistory`, where pagination is
> deliberately the caller's job). If page 1 is empty or identical, `recCount`
> is a scan counter and the warning can be dropped to informational.

### `Fuel Consumption: 0 /100km` is not a measurement here

Your sample has `Fuel Used: "-"`, `Fuel Cost: "-"`, and `0 /100km` inside the
summary. A vehicle doesn't cover 7.14 km on precisely zero litres *and* have
no fuel figure — that 0 is what the vendor renders when there's no fuel sensor
to report from.

The value **stays on the row**, with its flag next to it. What changed is that
`summariseCanonicalFuel` won't promote a flagged zero to the headline figure.
Otherwise the panel shows "0.0 L/100km" as this vehicle's economy — the most
flattering wrong number the dataset can produce, and the one a fuel-efficiency
review would act on.

### Fuel cost totals

Summed only when every contributing row agrees on the currency marking;
otherwise no total and a `mixed-fuel-cost-currencies` warning. Same refusal
your finance module makes with `mixedReportingCurrencies`. An unmarked amount
forms its own group rather than being assumed to match a marked one.

### Tenancy and idempotence — unchanged, now asserted

Still `assertVehicleInScope` before any vendor request (404 not 403,
fail-closed on an unassigned vehicle), still `Permission.FUEL_VIEW`, still
`resolveTenantContext`. The endpoint remains a **pure read** — no writes, no
ingest, no enqueue — so N identical calls leave the system exactly as one
does. That's now documented as a deliberate property rather than an accident,
with the note that the moment this posts to the fuel log or allocation ledger
it needs a deterministic `sourceId` first, the way your depreciation posting
does. `attributeRows` is tested for purity.

## 5. Frontend

`VehicleDetailPanel` gains Fuel cost, Odometer, Refuelling events and Fuel
loss events, and renders `providerWarnings`. **Odometer uses the last reading,
not a sum** — odometers are cumulative, and summing them across period rows
produces a six-figure number that looks entirely plausible and means nothing.

Warnings are rendered rather than swallowed: a total drawn from a partial or
partly-misattributed report isn't wrong enough to withhold and isn't right
enough to present bare, and the server returns these precisely so the UI
doesn't have to choose.

`Stat` already renders "No data" for null and needed no change — the fix was
upstream, giving it `undefined` instead of a fabricated 0.

---

## Correcting the alias tables

Unchanged workflow, now with three lists instead of one. Run one real request
and read:

- `unmappedFields` — a **column** no alias claimed → add the spelling to the front of the relevant array in `FUEL_ALIASES`
- `unmappedFuelSummaryLabels` — a **label inside the `Fuel` cell** → add it to `SUMMARY_ALIASES` in `eagletrack-report-values.ts`
- `unparsableFields` — a value we found and couldn't read → almost always a missing unit token in `DISTANCE_UNITS` / `VOLUME_UNITS` / `CONSUMPTION_PER_100KM_UNITS`

All three are one-line data edits. No service, repository or route changes.

---

## Not touched

Drivers and triggers, as instructed — they return empty arrays. They *do*
benefit incidentally: `readColumnarPayload` sits in the shared `toRows` /
`toKeyedRows` path, so if either turns out to be columnar too, it already
works. Also untouched: token query-param auth, the `user=` selector, tracker
matching, the staleness guard, Cartrack, and the manual sync route.

## Still open from previous rounds

- Token `REDACTED_ROTATE_THIS_TOKEN` **still needs rotating** — it's in a transcript and in the vendor's nginx access log
- `npm ci` fails on the lockfile desync
- Partial unique indexes recommended on `{tenantId,uin}` and `{tenantId,vehicleId,deviceId,timestamp}`
- `BaseRepository` `_id` type lie (20 `updateOne` call sites)
- Sentry broken (`@sentry/nextjs` v6 vs Next 15); `next/font` build-time fetch

---

## Files

**New (3)**
```
modules/telematics/adapters/eagletrack/eagletrack-report-values.ts
tests/unit/telematics/eagletrack-report-values.spec.ts
tests/security/telematics-eagletrack-fuel-attribution.spec.ts
```

**Modified (8)**
```
modules/telematics/adapters/eagletrack/eagletrack-field-map.ts
modules/telematics/adapters/eagletrack/eagletrack-payload.parsers.ts
modules/telematics/adapters/eagletrack/eagletrack.types.ts
modules/telematics/adapters/eagletrack/eagletrack-api.client.ts
modules/telematics/services/eagletrack-fuel.service.ts
frontend/modules/telematics/types/index.ts
frontend/modules/telematics/components/VehicleDetailPanel.tsx
tests/unit/telematics/eagletrack-payload-parsers.spec.ts
```

Drop in over your tree preserving paths, then `npx tsc --noEmit && npx jest`.
