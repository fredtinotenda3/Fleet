# EagleTrack sync staleness guard fix

## Symptom

Manual sync reported `matched: 3, skippedStale: 3` on every poll. The live
map kept showing hours-old positions even though `GET /api2/last` was
returning fresh, changing GPS data (new `date`, `speed`, `odometer`,
`bearing` on every request).

## Root cause

`EagleTrackAdapter.ingestStatus`'s staleness guard compared the incoming
fix's **provider-reported** timestamp (`status.date`, parsed from Eagle
Track's payload) against `device.lastPingAt` — a field that
`telematicsRepository.updateDeviceLastPing` always stamps with the
**server's own wall-clock `new Date()`** at the moment of ingest.

Those are two different clocks with no fixed relationship to each other:

- `lastPingAt` records *when our server happened to save the previous
  fix* (real "now" at ingest time).
- The new fix's `date` records *when the provider says the vehicle was
  there* — always somewhat behind "now" by network/poll latency, and
  potentially further off due to the provider's unconfirmed timezone
  convention (see the existing `parseEagleTrackDate` doc comment).

Because the previous ingest's wall-clock save time is very often **later**
in absolute terms than the next poll's provider-reported fix time (the
provider timestamp always lags "now" by at least the polling interval),
the guard's `newFix.timestamp <= lastPingAt` check was true on essentially
every poll after the first, permanently marking fresh, changing fixes as
stale. This reproduces exactly the `matched: 3, skippedStale: 3` symptom
and the stuck live map.

## Fix

Introduced a clean separation between two concepts that had been
conflated on `lastPingAt`:

- **`TelematicsDevice.lastPingAt`** (unchanged meaning) — real wall-clock
  time of the last successful ingest, still used for offline/connectivity
  detection (`getOfflineDevices`). Still always set to `new Date()`.
- **`TelematicsDevice.lastFixAt`** (new field) — the **provider's own**
  timestamp for the last fix we ingested. This is the only correct
  baseline for "is this new fix newer than the one we hold", because both
  sides of that comparison now come from the same clock (the provider's).

### `modules/telematics/types/telematics.types.ts`
Added `lastFixAt?: Date` to `TelematicsDevice`, with a doc comment
explaining why it must never be conflated with `lastPingAt`.

### `modules/telematics/repositories/telematics.repository.ts`
`updateDeviceLastPing` now accepts an optional fourth argument,
`fix?: { fixTimestamp?: Date; metadataPatch?: Record<string, unknown> }`.
When supplied, it additionally `$set`s `lastFixAt` and merges
`metadataPatch` into the device's `metadata` (dot-notation per key).
`lastPingAt` is still always stamped with real `new Date()`, unchanged.
**Backward compatible**: CartrackAdapter's call site (no fourth argument)
is untouched and behaves exactly as before — Cartrack has no staleness
guard and was not touched anywhere in this change.

### `modules/telematics/adapters/eagletrack/eagletrack.adapter.ts`
- Added `EagleTrackFixSignature`, `buildEagleTrackFixSignature`, and
  `signaturesDiffer` — a small, explicit "did the telemetry change"
  comparison over `{ speed, lat, lng, bearing, odometer, offline, id }`.
- Rewrote the staleness guard in `ingestStatus` to compare
  `mapped.timestamp` (the new fix's provider date) against
  `existingDevice.lastFixAt` (the provider date of the last fix we
  ingested), never against `lastPingAt`:
  1. No `lastFixAt` on record (new device, or one that predates this
     guard) → **always ingest**.
  2. New fix strictly newer than `lastFixAt` → **always ingest**,
     unconditionally, satisfying "when the API returns a fix with a
     newer date, ALWAYS ingest it."
  3. New fix has the **same** timestamp as `lastFixAt` → ingest only if
     `signaturesDiffer` finds a change in speed, odometer, offline flag,
     lat/lng, bearing, or vendor id — otherwise skip as a true duplicate
     (idempotency preserved for identical fixes only, per requirement 6).
     A same-timestamp fix with **no prior signature on record** is
     treated as changed (ingest), since "identical" cannot be proven.
  4. New fix strictly older than `lastFixAt` → **stale**, never
     regresses the live map.
- On ingest, the fix's own timestamp and comparison signature are now
  persisted via the extended `updateDeviceLastPing` call
  (`fixTimestamp: mapped.timestamp`, `metadataPatch: { eagletrackLastFix:
  currentSignature }`), so the next poll has something correct to compare
  against.
- `parseEagleTrackDate`'s explicit-UTC parsing (already correct, already
  deterministic, already covered by tests) is unchanged — this was not
  where the bug lived.

Cartrack's adapter, matching logic, mapping logic, and every other
module were **not** touched.

## Tests

`tests/unit/telematics/eagletrack-adapter.spec.ts`:
- Updated the two existing staleness tests to mock `lastFixAt` (the
  correct field) instead of `lastPingAt`, and to include a matching
  `metadata.eagletrackLastFix` signature where the scenario calls for a
  true duplicate.
- Added:
  - a regression test that reproduces the exact reported bug shape — a
    newer provider fix must ingest even when the device's `lastPingAt`
    (wall-clock) is *later* than the new fix's own provider timestamp;
  - a same-timestamp-but-changed-telemetry test (must ingest);
  - a same-timestamp-with-no-prior-signature test (must ingest, can't
    prove it's a replay);
  - a first-fix-ever (`lastFixAt` entirely absent) test (must ingest);
  - a non-regression test: an older provider fix is stale even if its
    telemetry differs from what's on record.
- `updateDeviceLastPing` call-shape assertions now check the persisted
  `fixTimestamp` / `metadataPatch` on the newer/changed-fix ingestion
  paths.

## Validation

- `npx tsc --noEmit` → 0 errors
- `npm run test:security` → 38 suites / 499 tests passing
- `npx jest` → 45 suites / 679 tests passing (includes the
  `predictive-maintenance-consolidation` suite, which passed in this run)
- `npm run build` → fails only on the pre-existing sandbox issue (no
  network access to fetch Google Fonts `Geist`/`Geist Mono` at build
  time); no webpack/type errors from this change

## Files changed

- `modules/telematics/types/telematics.types.ts`
- `modules/telematics/repositories/telematics.repository.ts`
- `modules/telematics/adapters/eagletrack/eagletrack.adapter.ts`
- `tests/unit/telematics/eagletrack-adapter.spec.ts`
