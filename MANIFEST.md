# Fleet — remaining-gaps pass

14 files. **5 of your 9 items done. 4 not done — listed honestly at the bottom.**

## Done

### 2. Global search was leaking (security — the real find here)
`vehicleRepository.searchVehicles()` was organization-wide. The Vehicles list was
correctly scoped, so the data *looked* isolated — but typing a plate into search
returned any vehicle in the organization. Worse, it was an enumeration oracle: a
scoped user could probe for plates they cannot otherwise see and confirm they
exist. Threaded `TenantContext` through controller → service → query → handler →
repository, with the scope predicate spread **last** so the `$or` search clause
cannot widen it.

### 3. Drivers create now stamps `orgUnitId`
Was the last create path without it. A scoped user's new driver landed with no
unit and was then hidden by the scoped read filter — add a driver, watch it vanish.

### 4. Duplicate `resolveTenantContext` consolidated
There were **four**, not three: trips, fuel, expenses **and maintenance**, all
byte-identical. Each was a place someone could "fix" a 403 by loosening
resolution for one module invisibly. All now use `server/utils/tenant-context.utils.ts`.

### 5. Legacy sentinel migration — `npm run db:purge-sentinels`
Dry-run default. Treats each collection by what the rows actually are:
- **Revoke** `tblrefreshtokens` / `tblusersessions` (~4,500). These are
  credentials whose tenant binding was never verified — repairing them would
  resurrect them with a valid tenant. Users re-authenticate.
- **Derive** `tblvehicledigitaltwins` from the vehicle (a twin is a rebuildable
  projection, so its tenant is the vehicle's). Orphans deleted, not guessed.
- **Leave** `tblauditlog` untouched and report only. It is hash-chained
  (`prevHash` → `hash`); rewriting any field destroys the tamper-evidence the log
  exists for. A sentinel on a historical entry is an accurate record of how the
  system behaved. Falsifying history to tidy a field is worse than an ugly field.

### 7. Sentry removed
Nothing imported it — a grep for `monitoring/sentry` matched only the wrapper
itself. Dependency dropped; wrapper replaced with a dependency-free no-op so a
future import still resolves. This also fixes `npm install` failing in air-gapped
CI, where `@sentry/cli`'s postinstall 403s fetching a binary — for a package doing
nothing.

### 9. `SECURITY-CREDENTIALS.md`
Rotation runbook. The Atlas password is the urgent one: the full connection
string was pasted into chat twice.

## NOT done — do not assume these are covered

**1. AI services.** Five services (`fleet-health`, `driver-risk`,
`fuel-fraud-detection`, `predictive-maintenance`, `expense-anomaly-detection`)
still aggregate on `tenantId` only. The controller-level fail-closed gate remains,
so scoped users see "unavailable" rather than another branch's numbers — safe, but
not fixed. This is the largest single remaining item.

**6. 83 type errors.** Untouched. Still `ignoreBuildErrors: true`. Note my earlier
correction: fixing these would not have caught the tenancy bugs — those came from
types that *lied*, which the `_id` normalization addressed.

**8. MapsWidget.** Still a placeholder. A real map is a feature with a vendor
choice (Mapbox/Google/Leaflet), an API key, and a billing account — not something
to slip into a debt-cleanup pass.

**Also unaudited:** expense/fuel/maintenance/trip **exports** (CSV/Excel/print)
for org-unit scope. The report builder is scoped; these separate export paths were
never checked. Treat as a suspected leak until verified.

## Verification
`npm run test:security` **190/190** · `npx tsc --noEmit` **83** (baseline 83).
