# Findings outside Phase 4

Recorded during Phase 4 and **deliberately not implemented**, per the
change-discipline rule.

---

## Found during Phase 4

### P4-N1 · Reports still read raw telemetry, not rollups
**Severity: MEDIUM · Deliberate, recorded**

Rollups were added *alongside* raw data. Every existing report still
queries `tbltelematics` directly and works unchanged inside the retention
window — but a query for a window older than `TELEMETRY_RETENTION_DAYS`
now returns empty rather than falling back to daily aggregates.

Not fixed because migrating reports onto rollups changes what those
reports *return* (aggregates in place of detail), which is a behavioural
change belonging in its own phase with its own verification. Doing it
inside a storage phase would have altered reporting behaviour under cover
of a retention change.

The alternative — silently serving aggregates where a report promised
detail — is worse than an empty result, because an empty result is
visible.

### P4-N2 · The geofence cache is per-process
**Severity: LOW · Documented, mitigated**

A 30-second in-process TTL cache means a geofence edit takes up to 30s to
be seen by *other* instances. Acceptable for this specific data:
geofences change on a human timescale, the window is short, and every
write path (create, update, delete, provider trigger sync) invalidates
the cache in the process that made the change.

A cross-process invalidation (Redis pub/sub) would close the window but
adds a Redis dependency to the hottest path in ingestion, which currently
degrades gracefully without one.

### P4-N3 · Rollups are not backfilled for historical days
**Severity: LOW · Deliberate**

Rollups accrue from the first nightly run forward. Days before that have
no rollup row.

A one-off backfill script would be easy, and deliberately not written:
for any window whose raw data has already aged out, it would produce
silently *incomplete* rollups indistinguishable from complete ones. An
absent rollup is honest; a rollup covering three of a day's twenty-four
hours is not.

If backfill is wanted, it should run only over days fully inside the
current retention window, and record its coverage.

### P4-N4 · Backup spools to local disk
**Severity: LOW · Trade-off, recorded**

Peak memory is now bounded, but the worker host needs free disk equal to
the *compressed* archive (typically 10–20× smaller than logical size for
JSON). True end-to-end streaming to S3 needs multipart upload
(`@aws-sdk/lib-storage`), which is not a dependency of this project.

Worth revisiting if the database grows past the worker's disk, or if that
package is added for another reason.

### P4-N5 · Retention cannot vary per tenant
**Severity: LOW · Mongo constraint**

`expireAfterSeconds` is a property of the index, not of a document, so
retention is platform-wide. A tenant with a longer regulatory requirement
cannot be given one without a scheduled deletion job replacing the TTL —
which trades Mongo's free background deletion for a job that must itself
be monitored.

Recorded rather than pre-emptively built.

---

## Audit findings Phase 4 does not address

| ID | Finding | Severity |
|---|---|---|
| F-8 | Rate limiting is an in-memory `Map`, per-instance, reset on cold start | HIGH |
| F-9 | Query cache is invalidate-only and keyed by tenant, not org unit | HIGH |
| F-10 | Multi-currency exists as type declarations only | HIGH |
| F-14 | Two action engines, both organization-scoped, neither idempotent | MEDIUM — Phase 5 |
| F-17 | Live map is a poll, presented as real-time | MEDIUM |
| F-25 | No error-monitoring backend | LOW — Phase 7 |
| S-1 | `middleware.ts` excludes non-versioned `/api/*`; every route is self-defending with no structural enforcement | **ARCHITECTURAL** |
| N-3 (Ph0) | `createAlert` writes no `orgUnitId` while the scoped read filters on it | MEDIUM |
| N-4 (Ph0) | `WORKFLOW_*` permissions are organization-level | MEDIUM — Phase 5 |
| P2-N1 (Ph2) | Historical/fuel ingestion still uses the vendor client directly | MEDIUM |
| P3-N1 (Ph3) | Three handlers are not idempotent under at-least-once delivery | MEDIUM |
| P3-N3 (Ph3) | Outbox has no operational surface (`countByStatus` exposed nowhere) | LOW — Phase 7 |

**F-17 is now partly self-inflicted in the opposite direction.** Phase 4
removed the inline sync from the read path, so the live map is
unambiguously a poll over a background-refreshed store. The UI now
receives `dataStale`, which makes honesty *possible* — but the frontend
does not yet render it. Surfacing it is a small frontend change, recorded
here rather than bundled into a backend phase.

**S-1 remains the highest-leverage remaining item.** Nothing structurally
prevents the next route from forgetting its auth wrapper.

---

## Testing gaps Phase 4 did not close

- **No test against a real MongoDB.** The TTL index, the `collMod`
  repair, the unique rollup key and cursor streaming are asserted
  structurally and against in-memory doubles. They prove the
  *declarations* and the *logic*; they do not prove Mongo's TTL monitor
  deletes on schedule or that `collMod` succeeds against a live index.
  Stated in the suite headers.
- **No load test.** The geofence claim ("~0 queries per ping away from a
  boundary") is proven by counting loader invocations in a unit test, not
  by measuring a 1,000-vehicle fleet.
- `test:e2e` and `test:performance` remain `echo` stubs.
