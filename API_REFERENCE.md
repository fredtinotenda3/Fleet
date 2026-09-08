# API Reference

Every route lives under `/api`. This documents the contract and the
**scope rules**, which are the part that surprises people.

---

## 1. Conventions

### Auth

Session cookie (NextAuth) or `Authorization: Bearer <access token>`.
API keys authenticate integrations and carry their own permission set.

Every route is wrapped in `withAuth(handler, { permission })`. A route
with no permission gate fails `tests/security/route-auth-conformance.spec.ts`.

### Envelopes

```jsonc
// single
{ "success": true, "data": { } }

// paginated
{ "success": true, "data": [ ],
  "pagination": { "page": 1, "limit": 50, "total": 120,
                  "totalPages": 3, "hasNext": true, "hasPrev": false } }

// error
{ "success": false, "error": { "message": "...", "code": "VEHICLE_NOT_FOUND" } }
```

### Scope, and why 404 not 403

Reads are filtered by tenant **and** org unit. A record outside your
scope returns **404, not 403** — deliberately. A distinguishable "exists
but hidden" response lets a narrowed caller enumerate another branch's
records one id at a time.

### Pagination

Most list endpoints return a bare array when `page` is omitted (picker
mode) and a paginated envelope when it is present. Both are scoped —
an unscoped picker leaks exactly the same roster as an unscoped table.

### Common error codes

| Code | Status | Meaning |
|---|---|---|
| `VEHICLE_NOT_FOUND` | 400 | no such vehicle **or** outside your scope |
| `VEHICLE_PLATE_AMBIGUOUS` | 409 | two active vehicles share the plate |
| `TRIP_VEHICLE_MISMATCH` | 400 | the trip belongs to a different vehicle |
| `FUEL_CARD_INACTIVE` | 400 | |
| `VALIDATION_ERROR` | 400 | field errors in `details` |
| `INTERNAL_ERROR` | 500 | |

---

## 2. Fleet

| Method | Path | Permission |
|---|---|---|
| GET / POST | `/api/vehicles` | `VEHICLE_VIEW` / `VEHICLE_CREATE` |
| GET / PUT / DELETE | `/api/vehicles/:id` | `VEHICLE_*` |
| GET | `/api/vehicles/:id/driver` | `VEHICLE_VIEW` |
| GET / POST | `/api/drivers` | `VEHICLE_VIEW` / `VEHICLE_EDIT` * |
| GET / PUT / DELETE | `/api/drivers/:id` | as above |

\* No `Permission.DRIVER_*` exists yet; drivers are gated on the closest
vehicle permissions as a documented stopgap.

**Creating a driver** files it under **your** org unit (a driver has no
vehicle to inherit from). A narrowed caller naming another unit is
refused; a caller with **no** assignment is refused, because there would
be no correct unit and the record would be invisible to everyone.

---

## 3. Operations

| Method | Path | Permission |
|---|---|---|
| GET / POST | `/api/fuel` | `FUEL_VIEW` / `FUEL_CREATE` |
| PUT / DELETE | `/api/fuel/:id` | `FUEL_EDIT` / `FUEL_DELETE` |
| POST | `/api/fuel/import` | `FUEL_CREATE` |
| GET / POST | `/api/expenses` | `EXPENSE_*` |
| POST | `/api/expenses/import` | `EXPENSE_CREATE` |
| GET / POST | `/api/trips` | `TRIP_VIEW` / `TRIP_CREATE` |
| GET | `/api/trips/:id` | `TRIP_VIEW` |
| **GET** | **`/api/trips/:id/playback`** | `TRIP_VIEW` |
| GET / POST | `/api/reminders` | `MAINTENANCE_*` |
| GET / POST | `/api/workorders` | `WORKORDER_*` |

### Writing against a vehicle

`license_plate` is resolved through one scope-aware resolver. It is
tenant-scoped, refuses an ambiguous plate (409), and reports
out-of-scope identically to not-found (400). **The record inherits the
vehicle's org unit, not yours.**

Imports are **user writes** and are scoped the same way — a spreadsheet
is the easiest place to file rows against another branch at volume.

### `GET /api/trips/:id/playback`

```jsonc
{
  "tripId": "...", "licensePlate": "AFK5777", "vehicleId": "...",
  "startTime": "2026-09-01T06:00:00.000Z",
  "endTime":   "2026-09-01T06:30:00.000Z",
  "durationMs": 1800000,
  "points": [
    { "offsetMs": 0, "timestamp": "...", "lat": -17.82, "lng": 31.05,
      "speed": 48, "heading": 271 }
  ],
  "downsampled": false,
  "sourceReadingCount": 342,
  "emptyReason": null   // or "no-time-window" | "no-vehicle-reference" | "no-readings"
}
```

- `offsetMs` is milliseconds from the trip start — what a scrubber seeks
  on.
- `speed` and `heading` are **omitted when unreported**, never defaulted
  (`heading: 0` is due north, not "unknown").
- Tracks above 1,500 points are **evenly sampled**, always keeping the
  first and last, with `downsampled: true`.
- The vehicle comes from the **trip record**, never from the request.

---

## 4. Telematics

| Method | Path | Permission |
|---|---|---|
| POST | `/api/telematics/ingest` | `TELEMATICS_INGEST` |
| GET | `/api/telematics/live-map` | `VEHICLE_VIEW` |
| GET | `/api/telematics/vehicles/:id` | `VEHICLE_VIEW` |
| GET | `/api/telematics/vehicles/:id/alerts` | `VEHICLE_VIEW` |
| **GET** | **`/api/telematics/alerts/summary`** | `VEHICLE_VIEW` |
| POST | `/api/telematics/alerts/:id/acknowledge` | `VEHICLE_EDIT` |

### `GET /api/telematics/alerts/summary?sinceHours=24`

```jsonc
{
  "total": 42,
  "byType":     [{ "type": "speeding", "count": 21 }],
  "bySeverity": [{ "severity": "high", "count": 9 }],
  "topVehicles":[{ "vehicleId": "...", "count": 7 }],
  "topVehiclesTruncated": false,
  "since": "2026-09-06T12:00:00.000Z"
}
```

Tenant **and org-unit** scoped, with the predicate spread last. An
aggregate must never span more than the rows it counts — that mistake has
been made twice in this codebase.

---

## 5. Intelligence

| Method | Path | Permission |
|---|---|---|
| GET | `/api/ai/dashboard` | `ANALYTICS_VIEW` |
| GET | `/api/ai/needs-attention` | `ANALYTICS_VIEW` |
| POST | `/api/ai/needs-attention/:id/resolve` | `ANALYTICS_VIEW` |
| POST | `/api/ai/needs-attention/:id/dispatch` | `WORKORDER_CREATE` or `MAINTENANCE_CREATE` |
| GET | `/api/ai/fleet-health` | `ANALYTICS_VIEW` |
| GET | `/api/ai/driver-risk` | `ANALYTICS_VIEW` |

`/api/ai/needs-attention` fans out over seven services and persists —
`maxDuration` is 60 and it has caused a serverless timeout before. Do not
call it for a nav badge.

> **Dispatch returns HTTP 200 for all five outcomes by design.** Read the
> status from the body, not the status code.

Metrics that cannot be computed are `null`, not `0`. `fuelEfficiencyAverage`
is null when no trip distance exists for the period.

---

## 6. Finance

| Method | Path | Permission |
|---|---|---|
| GET | `/api/finance/allocations` | `FINANCE_VIEW` |
| POST | `/api/finance/allocations` | `FINANCE_MANAGE` |
| POST | `/api/finance/allocations/:id/reverse` | `FINANCE_MANAGE` |
| GET | `/api/finance/cost-per-km` | `FINANCE_VIEW` |
| GET / POST | `/api/finance/depreciation-profiles` | `FINANCE_VIEW` / `FINANCE_MANAGE` |
| GET / POST | `/api/finance/gl-submissions` | `FINANCE_VIEW` / `FINANCE_MANAGE` |

The ledger is **append-only**: correct a posting with a reversal
(reason ≥ 10 characters), never an edit. `orgUnitId` is **never accepted
from a request body** — it is derived from a scope-checked vehicle
lookup. `costPerKm` is `null` at zero distance. Mixed reporting
currencies return `mixedReportingCurrencies` rather than a total.

---

## 7. Platform (super admin only)

| Method | Path |
|---|---|
| GET | `/api/platform/organizations` |
| GET | `/api/platform/organizations/:id` |
| PUT | `/api/platform/organizations/:id/status` |
| GET | `/api/platform/stats` |
| **GET** | **`/api/platform/users`** |
| **GET** | **`/api/platform/api-keys`** |
| **GET** | **`/api/platform/roles`** |

All require `PLATFORM_VIEW` **and** the literal `Role.SUPER_ADMIN` —
`AuthContext.isSuperAdmin` is also true for `organization_owner`, who
must never read across tenants.

Query: `?page`, `?limit`, `?search` (users), `?tenantId` /
`?organizationId`, `?status`.

**Redaction is by allow-list.** `tbladmin.Password` and
`tblapikeys.keyHash` are never projected; custom roles return a
permission **count**, not the grant list.

### Not available

There is no platform-scoped org-unit endpoint.
`/api/tenancy/org-units` resolves `organizationId` from the **caller's
session** on both GET and POST, so rendering it for another organization
would show a platform admin their **own** branches under someone else's
name, and "Add unit" would create it in their own tenant — every request
returning 200. Closing it needs
`/api/platform/organizations/:id/org-units`. Recorded in
`PLATFORM_ADMIN_NOTES.md`.

---

## 8. Reporting

| Method | Path | Permission |
|---|---|---|
| GET / POST | `/api/reports/definitions` | `REPORT_VIEW` / `REPORT_CREATE` |
| POST | `/api/reports/execute` | `REPORT_VIEW` |
| GET | `/api/reports/templates` | `REPORT_VIEW` |

The report engine applies the org-unit predicate **inside execution**,
spread last — `orgUnitId` is an exposed filterable field, so scope must
own the key. Without that, any scoped user could author a report over
vehicles or expenses and export the whole organization.

---

## 9. Rate limits

Per authenticated principal. During a Redis outage the limiter falls
back to in-memory, so the effective limit becomes *limit × instance
count* — failing closed would turn a cache outage into a total outage.
