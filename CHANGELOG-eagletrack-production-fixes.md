# CHANGELOG — Eagle Track production fixes (2026-08-19)

Two changes, both forced by production testing against the live
`eaglegps.gtrack.co` deployment. Cartrack is untouched.

---

## 1. Authentication — token moves to the query string

**File:** `modules/telematics/adapters/eagletrack/eagletrack-api.client.ts`

The client sent the token as a `token` HTTP header. That form is not
authenticated: api2 treats a header-only request as anonymous and
redirects it to its HTML login page. The token now goes in the query
string, and the header is gone.

- Token appended as `?token=…` on **every** request (`/api2/last`,
  `/api2/trackers`, the `verifyCredentials` probe).
- Written **last** in `buildUrl`, and a caller-supplied param named
  `token` is skipped outright. Two guards for the same thing:
  `searchParams.set` would otherwise let a `params` key of that name
  overwrite the credential, and the request would authenticate as
  whatever the caller passed. No caller does this today; the guard exists
  so none can start. Same "the security-critical key is owned by this
  layer, so this layer writes it last" discipline as
  `orgUnitPredicate` in the report engine.
- `Accept: application/json` is still sent. No `token` header, no
  `Authorization` header.

### Containing the leak surface this opens

Putting a credential in a URL is how secrets reach access logs, error
trackers and support tickets, so the compensating controls are part of
the change rather than a follow-up:

- **Never the URL, always the endpoint.** Every log field and every error
  message carries `endpoint` — origin + path, no query string. The one
  and only use of `url.toString()` in the file is the `fetch` call
  itself.
- **`redactToken()`** replaces the live token wherever it appears in
  anything vendor-originated before that text is attached to an error.
  `split`/`join`, not a RegExp — the token is opaque vendor text and
  could contain metacharacters.
- **Transport errors carry a code, not a message.** Node's `fetch`
  reports `TypeError: fetch failed` and hangs the detail off `.cause`,
  where a full URL can appear. Only an errno-shaped code matching
  `/^[A-Z][A-Z0-9_]{1,39}$/` is interpolated.
- **Retained vendor text is bounded** to 200 chars on the error's
  `cause`, redacted, so a 50 KB login page cannot end up in a
  dead-letter record.

Why this matters concretely: `structured-logger` records `message` and
`stack`; `workers/telemetry.worker.ts` logs
`result.errors.join('; ')`; `handleTelematicsError` returns an `Error`'s
message to the HTTP client. A token in a message is a token in three
places at once.

### Two further defects the same testing exposed, fixed here

**Content-Type is meaningless on this platform.** Your successful
`/api2/trackers` response came back as `Content-Type: text/html;
charset=UTF-8` with a JSON body. An unauthenticated request returns an
HTML login page under the *same* status and *same* Content-Type. So the
client now reads the body as text and parses it itself, and **nothing
branches on Content-Type** — a Content-Type check would have broken the
working case. The test mock's `headers` is a throwing getter to keep it
that way.

**An invalid token would have been reported as a platform outage.** The
login page arrives as HTTP 200, so `response.json()` threw a bare
`TypeError`, which carried no `statusCode` and no `vendorErrorCode` —
`isVendorRejection` was `false`, so `verifyCredentials()` **rethrew**.
"Test connection" would have reported an outage for the one condition it
exists to detect. A non-JSON body is now classified via a new
`nonJsonBody` flag, and 3xx counts as a rejection too.

> Trade-off, stated because it is real: an HTML error page from something
> in front of the API (captive portal, proxy) returning 2xx will also be
> reported as bad credentials. Anything failing with a normal 5xx still
> classifies correctly, and the message names the observed condition. The
> reverse default sends an operator to debug a healthy network instead of
> rotating a dead credential.

**Not done, deliberately:** `redirect: 'manual'`. It would surface the
login redirect directly and stop the token being carried onward, but it
breaks any tenant whose deployment does an `http`→`https` redirect —
`shared/validations/eagletrack.schema.ts` accepts `http`. The followed
login page is already caught by `nonJsonBody`.

---

## 2. Vehicle matching — ordered candidates, exact matches only

**File:** `modules/telematics/adapters/eagletrack/eagletrack.adapter.ts`

The adapter matched exclusively on `__platenumber`, which **does not
exist** on your roster. `plate` exists but is `""` on every row. The
plate is in `name` (`ADY2531`, `AFU0078`, `ADL5345`). Result: three
unmatched trackers and a sync that looked like "this tenant has no
vehicles".

`plateFromTracker` → **`plateCandidatesFromTracker`**, returning ordered
`{ value, source }` candidates:

| Order | Field | On your deployment |
|---|---|---|
| 1 | `plate` | present, empty on every row |
| 2 | `__platenumber` | absent entirely |
| 3 | `name` | **the plate lives here** |

Blank, whitespace-only and non-string values are skipped without a
database round trip. Duplicates are collapsed case-insensitively, so two
fields carrying the same plate cost one lookup.

`matchVehicle` walks them in order and returns the **first** candidate
that resolves via `vehicleRepository.findByLicensePlate(value, tenantId)`
— tenant-scoped, exact equality. No candidate resolves → the tracker
lands in `unmatchedTrackers`, never dropped, never auto-created as a
vehicle.

### Matching on `name` is not fuzzy matching

This is the whole safety argument, so it is worth being explicit. There
is no similarity scoring, no substring search, no plate-shaped regex. The
only normalisation is trimming plus the upper-casing
`findByLicensePlate` already applies (this codebase stores
`license_plate` upper-cased, so case folding is canonicalisation, not
guessing). `"PT201B abc long long title name"` does **not** match a
vehicle plated `PT201B` — it is not equal to it. **The authority on what
counts as a plate is your vehicle table, never a heuristic in this
file** — a regex there would have to encode the plate format of every
jurisdiction you sell into, and would silently drop the ones it got
wrong.

### First-match-wins, not first-field-wins

The brief's "then… then…" admits both readings. I implemented
fall-through: a stale or junk `plate` would otherwise permanently mask a
perfectly good `name`, and the vendor's plate-ish fields are documented
junk carriers. It cannot widen what matches — every candidate still has
to equal a real plate in the tenant — and it costs at most two extra
indexed lookups per tracker per poll.

### Reporting

- `EagleTrackSyncResult.matchedBy: Record<'plate'|'platenumber'|'name',
  number>` — how the trackers that *did* resolve were matched. Sums to
  `matched + skippedNoFix` (a tracker whose fix was unusable was still
  matched to a vehicle). This is the number that answers "is matching
  standing on the fragile field?" — on your deployment a healthy sync
  reports everything under `name`; a shift between buckets means the
  vendor-side data changed under you.
- The registered device's metadata records `matchedBy`. If a tracker
  turns out to be attached to the wrong vehicle this is the first thing
  anyone needs, and it cannot be re-derived later from a payload nobody
  stored. Same discipline as the existing `odometerSourceCode`.

Both are additions beyond the literal brief, kept minimal.

### Residual ambiguity — flagged, not silently resolved

If `plate` and `name` hold the plates of two **different** vehicles, the
order resolves it deterministically to `plate` and nothing flags the
conflict. `matchedBy` makes the reliance visible but is not a fix. The
correct fix has not changed: an explicit admin-managed uin ↔ vehicle
mapping table, a small settings screen listing unmatched uins next to a
vehicle picker. `unmatchedTrackers` is exactly its input.

### One security guard worth naming

The `typeof raw !== 'string'` check in `plateCandidatesFromTracker` is
load-bearing for security, not just types. The declared field types are a
transcription of a vendor document, not a contract the wire honours. A
non-string reaching `findByLicensePlate` hits `.toUpperCase()` and throws
mid-sync; an **object** would be spread into a Mongo filter, and
`{ license_plate: { $ne: null } }` matches the first vehicle in the
tenant — precisely the silent misattribution these rules exist to
prevent. Covered by two tests.

---

## Verification

Run in this order on a clean install.

| Command | Result |
|---|---|
| `npx tsc --noEmit` | **0 errors** (baseline was also 0 — none introduced) |
| `npm run test:security` | **491 passed / 0 failed**, 38 suites |
| `npx jest` (full) | **620 passed / 0 failed**, 44 suites |
| `npm run build` | compiles clean; see the two notes below |

Test counts: security 469 → 491 (+22, the new token-leak suite). Eagle
Track unit suites: api-client 29 (rewritten), adapter 37 → 48 (+11
end-to-end matching-order tests).

### Build: read this before trusting a green or a red

`npm run build` **fails in an air-gapped or sandboxed environment**, and
it fails at `next/font` fetching Geist from Google in `app/layout.tsx` —
i.e. *before compiling any application code*. A red build there is
therefore **no evidence either way** about these changes.

To get actual evidence I built a throwaway copy with the two `next/font`
calls stubbed to plain objects. That build completed: types checked, all
62 routes generated, no errors. The only warning is
`Critical dependency: the request of a dependency is an expression` from
`@opentelemetry/sdk-node` — **confirmed pre-existing** by building your
unmodified tree the same way. The probe copy was discarded and is not in
this ZIP.

### Baseline was already red — one pre-existing failure, and it is not mine

`npm run test:security` on the tree you uploaded: **467 passed, 2
failed**. `tests/security/predictive-maintenance-consolidation.spec.ts`
asserts that `modules/intelligence/services/predictive-maintenance.service.ts`
has been deleted, and it is still physically present. Your repo root
already carries a `DELETED_FILES.txt` from a previous round instructing
that deletion; it was not applied.

Nothing references that file except the test checking it is gone. A ZIP
cannot represent a deletion, so it is recorded in `DELETED_FILES.txt` in
this delivery. **Apply that deletion or `test:security` stays red at 2
failures.** The 491/0 above is with it applied; without it, 489/2 — the
2 being the same pre-existing pair.

---

## Also found, NOT fixed here

**`npm ci` fails on the tree you uploaded.** `package.json` and
`package-lock.json` are out of sync — `@testing-library/dom` and 8
transitive deps (`aria-query`, `dom-accessibility-api`, `lz-string`,
`pretty-format`, `dequal`, `ansi-styles`, `react-is`, `@types/aria-query`)
are missing from the lock. Any CI job using `npm ci` cannot install at
all. I used `npm install` to proceed.

I have **deliberately not shipped a regenerated lockfile.** It would be
an ~800 KB file produced by this sandbox's npm/Node rather than your
toolchain, which is exactly the kind of change that should be made and
committed locally. Fix:

```
npm install && git add package-lock.json && git commit -m "chore: resync lockfile"
```

Then confirm `npm ci` succeeds before relying on CI.

**`http://` is still accepted for the Eagle Track domain.** The token is
now part of the request line, so the exposure is worse than the old
comment claimed — on `http` it is readable on the path, and on either
scheme it is written to the vendor's own access log. I updated the
comments and the inline UI warning to say so accurately, but did **not**
tighten the schema to https-only: that would break any tenant already
running a working `http` deployment, at the moment it deploys. Flagged
for your decision rather than taken unilaterally inside a bug fix.

**The vendor logs your token.** Their nginx writes the full request line,
token included, to its access log. That is a property of their API
design, not something this client can close. Treat the token as
rotatable.

---

## ROTATE THE TOKEN

`1c44f7jet12nhb4rb6ilnides3` was pasted into a chat transcript and, with
query-parameter auth, is also in `eaglegps.gtrack.co`'s access log.
Rotate it in the Eagle Track UI and re-save it via Organization Settings
→ Integrations before anything else.

---

## Files in this ZIP

**Modified**

- `modules/telematics/adapters/eagletrack/eagletrack-api.client.ts` —
  query-param auth, redaction, endpoint-only logging, non-JSON
  classification
- `modules/telematics/adapters/eagletrack/eagletrack.adapter.ts` —
  ordered candidate matching, `matchVehicle`, `matchedBy` accounting
- `modules/telematics/adapters/eagletrack/eagletrack.types.ts` — `plate`
  field, `EagleTrackMatchSource`, `matchedBy` on the sync result,
  header corrected against the live response
- `shared/validations/eagletrack.schema.ts` — **comments only**; the old
  text claimed the token travels in a header
- `frontend/modules/telematics/components/EagleTrackConfigSection.tsx` —
  operator-facing text only. It told operators matching used
  `__platenumber`, a field absent from their deployment; and the http
  warning now reflects that the credential is in the URL
- `tests/unit/telematics/eagletrack-adapter.spec.ts` — candidate tests
  rewritten, 11 end-to-end matching-order tests added, stubs serve the
  body via `text()`
- `tests/unit/telematics/eagletrack-api-client.spec.ts` — rewritten. The
  old "sends the token as a header and never in the URL" assertions are
  **inverted**; that inversion is the change

**New**

- `tests/security/telematics-eagletrack-token-leak.spec.ts` — 22 tests.
  Query-param auth asserted behaviourally *and* structurally: a
  well-meaning future edit "restoring the documented header form" would
  break production while every query-param-only behavioural test still
  passed
- `DELETED_FILES.txt` — the deletion above
- `CHANGELOG-eagletrack-production-fixes.md` — this file
