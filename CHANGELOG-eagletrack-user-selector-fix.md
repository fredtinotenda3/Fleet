# EagleTrack fix: `__all_sub` is rejected on this deployment; poll `?user=<username>` instead

## Problem

Production testing (`curl` transcript against `eaglegps.gtrack.co`) showed:

- `GET /api2/last?uin=__all_sub&token=...` → HTTP 200, body `Access Denied:__all_sub`.
- `GET /api2/last?user=Willsgrove&token=...` → HTTP 200, the expected JSON envelope with all 3 trackers.

`EagleTrackApiClient.getLastForAll()` always sent `uin=__all_sub` (the vendor-documented
least-privilege fleet selector). On this deployment that selector is rejected outright, so
every sync failed to retrieve any live-status data even though the account, token, and roster
were all valid.

## Fix

- **`modules/telematics/adapters/eagletrack/eagletrack-api.client.ts`**
  - `getLastForAll()` now takes a required `username: string` and sends
    `?user=<username>` (via the new `EAGLETRACK_USER_QUERY_PARAM = 'user'` constant) instead of
    `uin=__all_sub`.
  - `EAGLETRACK_FLEET_SELECTOR` (`'__all_sub'`) is kept as a named, documented constant —
    unused by this client — solely so a future reader can see what was tried and abandoned, and
    why. It is not referenced anywhere in the request path anymore.
  - Added `getTrackersWithRefData()`, which returns `{ trackers, refData }` from
    `GET /api2/trackers`. `getTrackers()` is now a thin wrapper around it (`trackers` only), so
    every existing caller/test of `getTrackers()` is unaffected. `refData.users` is the fallback
    source for the account username (see below).

- **`modules/telematics/adapters/eagletrack/eagletrack.types.ts`**
  - Added `EagleTrackRefData` (`{ users?: Record<string, {...}> }`) and included it as the
    optional `refData` field on `EagleTrackTrackersResponse`. Previously `refData` was typed as
    absent/ignored; it is now a first-class (still mostly-ignored) part of the response shape.

- **`modules/telematics/adapters/eagletrack/eagletrack.adapter.ts`**
  - Added `deriveEagleTrackUsername(trackers, refData?): string | null`, exported and unit
    tested directly. Order, per the fix spec:
    1. The first roster row's `belong` field (trimmed, must be a non-blank string).
    2. The first key of `refData.users`.
    3. Otherwise `null` — **never** a hardcoded fallback. No tenant username appears as a
       literal anywhere in the sync path; every value in tests/comments (e.g. "Willsgrove") is
       sample/test data only, matching the account used for production testing.
  - `syncOrganization()`:
    - Fetches the roster via the new `client.getTrackersWithRefData()` instead of
      `client.getTrackers()`, so it has `refData` available for the fallback.
    - **If the roster is empty**, the `/api2/last` call is skipped entirely and the sync
      returns cleanly (`recordSyncResult(tenantId, 'success')`) — an account with zero trackers
      is not an error, and there is nothing to derive a username from or match against.
    - **If the roster is non-empty but no username can be derived**, the sync records an error
      (`recordSyncResult(tenantId, 'error', <message>)`) and returns without calling
      `/api2/last` — this is a real integration problem (the roster is unusable for polling) and
      is surfaced the same way a fetch failure is, not silently swallowed.
    - Otherwise calls `client.getLastForAll(username)` with the derived username.
  - Cartrack's adapter (`cartrack.adapter.ts` and everything under its own directory) is
    untouched.

## Why `belong` first, `refData.users` second

- `belong` is the vendor's own "owning userid" field, present on every tracker row returned by
  `GET /api2/trackers` on the deployment this was tested against, and is exactly the value
  `?user=` expects. It travels with the roster response the sync already fetches — no extra
  request, no extra failure mode.
- `refData.users` is vendor UI lookup metadata on the same response. It's the fallback for a
  roster that (for whatever reason) omits `belong` on every row but still carries a `refData`
  section with the account's username as a key.
- Neither source hits the network on its own; both come from the one `GET /api2/trackers` call
  `syncOrganization` already makes.

## What did NOT change

- The token still travels as the `token` query parameter, appended last, with the same
  caller-supplied-`token`-param guard and the same redaction/logging discipline documented at
  the top of `eagletrack-api.client.ts`. None of that logic was touched.
- Vehicle matching (`plate` → `__platenumber` → `name`, exact tenant-scoped equality only) is
  unchanged.
- Cartrack is unchanged.
- The response-parsing rules that already existed (envelope `error !== 0`, non-JSON body ==
  vendor rejection, Content-Type never trusted) are unchanged and are what correctly classifies
  a literal `Access Denied:__all_sub` body as a non-JSON vendor rejection rather than a crash —
  new test coverage added for that specific string, even though this client no longer sends the
  selector that provoked it.

## Known limitation carried forward

If a deployment's roster contains trackers from more than one vendor-side account (mixed
`belong` values), this sync polls `/api2/last` for only the first account found. Trackers under
a different account will show up in `trackersWithoutFix` (present in the roster, absent from the
`last` payload) rather than silently being dropped — same "report, never guess" discipline the
adapter already applies elsewhere — but they will not be polled. Multi-account-per-tenant
deployments are not something this pass adds support for; flagged here rather than hidden.

## Tests

- `tests/unit/telematics/eagletrack-api-client.spec.ts`
  - Updated every `getLastForAll()` call site to pass a username.
  - Replaced the `uin=__all_sub` assertion with an assertion that `?user=<username>` is sent and
    neither `__all_sub` nor `__all_sys_` appear in the URL.
  - Added `getTrackersWithRefData` coverage (refData present / absent).
  - Added regression coverage: a literal `Access Denied:__all_sub` body is classified as a
    non-JSON vendor rejection.
- `tests/unit/telematics/eagletrack-adapter.spec.ts`
  - Added a `deriveEagleTrackUsername` unit-test block (belong preferred, blank/non-string
    `belong` skipped, refData.users fallback, null when neither source has anything).
  - `stubApi()` now defaults `belong: 'Willsgrove'` onto roster fixtures that don't already set
    one, so every pre-existing `syncOrganization` test keeps exercising a realistic roster
    without hand-editing ~15 fixtures individually. Fixtures that already set `belong` (e.g.
    `LIVE_ROSTER`) are unaffected — the default only fills a gap.
  - Added: empty roster → `/api2/last` never called, sync returns cleanly.
  - Added: username correctly derived from `belong` and sent as `?user=`, not `?uin=`.
  - Added: no derivable username → error result, `/api2/last` never called.

## Verification

- `npx tsc --noEmit` → 0 errors.
- `npm run test:security` → passing (491 tests; the one pre-existing failure,
  `tests/security/predictive-maintenance-consolidation.spec.ts`, is unrelated to this change and
  fails identically on an unmodified checkout of the uploaded source — confirmed before making
  any edits).
- `npx jest` → passing (same pre-existing, unrelated failure as above; every eagletrack/telematics
  suite is green).
- `npm run build` → fails only on the pre-existing, environment-only issue: this sandbox has no
  network access to `fonts.googleapis.com` (Next.js `next/font` fetching Geist/Geist Mono). Not a
  code issue and not something this change touches.
