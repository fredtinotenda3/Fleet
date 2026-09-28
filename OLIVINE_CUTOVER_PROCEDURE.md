# Olivine October 1, 2026 cutover — reset procedure

This is the controlled, explicit, reproducible procedure for moving Olivine
from historical/development transport-cost data to a clean operating
database, ready for the live October 1, 2026 operating period. It does
**not** run automatically as part of any deploy, build, or other script in
this codebase — it is a deliberate, manually-invoked action.

## What this procedure does and does not do

**Does**: clears operational transport-cost data for one named tenant —
imported source rows (3rd Party/Swift/Vansales/Depot STO), import
exceptions, the normalization review queue, and that tenant's cost
allocation ledger postings — plus every other operational collection this
platform already classifies as "business data" (trips, fuel logs,
expenses, maintenance, telematics, etc. — see `scripts/reset-business-data.ts`'s
own `CLEAR` list for the full, reasoned inventory).

**Does not**: touch master data (customers, destinations, transporters,
contracted vehicles, VAT/currency configuration), users, login
credentials, roles/permissions, organization or org-unit configuration,
report/workflow/rule **definitions**, audit logs, or any MongoDB index.
Every collection in the database is explicitly classified as one or the
other — the script refuses to run at all if it finds an unclassified
collection, rather than guessing.

## Why the existing `reset-business-data.ts` script, not a new one

This platform already has a general-purpose, dry-run-by-default, fully
tested business-data reset script covering every module. Before this pass,
it did not know about the transport-cost module's 8 collections at all —
which meant it would have **hard-refused to run entirely** against any
database containing transport-cost data (its own reconciliation check
treats an unclassified collection as a fatal error, not a default). That
gap is now closed: the transport-cost module's 3 operational collections
were added to `CLEAR`, and its 5 master-data/config collections to
`PRESERVE`, following the exact same reasoning pattern already used for
every other module in the file. This is the correct fix — reusing and
completing the existing, already-reviewed tool, rather than introducing a
second reset script with its own, subtly different safety semantics.
`tests/security/reset-business-data-classification.spec.ts` asserts this
classification explicitly (62 tests, including 8 new ones naming every
transport-cost collection by name) and will fail if a future change moves
one of these collections into the wrong list.

## Step-by-step procedure

### 1. Verify environment and tenant, before touching anything

```
# Confirm you are pointed at the correct database.
echo $MONGODB_URI

# List known tenants (the dry run below also does this, but check first).
```

Identify Olivine's exact tenant slug (`tenantId`). This platform's
multi-tenant convention stores `tenantId` as the organization's **slug**,
not its Mongo `_id` — do not guess; look it up.

### 2. Dry run — review the manifest

```
npm run db:reset-business-data -- --tenant <olivine-tenant-slug>
```

This prints, for every operational collection: its name, the exact
document count that *would* be deleted, and the reason it's classified as
operational — followed by a `PRESERVED` section listing every
master-data/config collection and its (untouched) count, for reassurance.
**Nothing is deleted in this mode.** Review the manifest carefully before
proceeding — in particular confirm the counts under transport-cost's three
operational collections roughly match what you expect to be clearing
(historical/demo data, not anything Olivine already needs).

### 3. Apply

```
npm run db:reset-business-data -- --tenant <olivine-tenant-slug> --confirm
```

This deletes only the documents shown in step 2's manifest, via
`deleteMany` (never `drop` — indexes, validators, and collation all
survive untouched, so no re-creation step is needed afterward), and writes
a summary of exactly what was deleted to `tbltenant_repair_audit` — the
same audit collection every other repair/reset action in this platform
uses, so "what happened to this database and who did it" has one answer.

### 4. Load demo data (for the Olivine walkthrough, before October 1)

See `OLIVINE_DEMO_DATA_README.md` for the full walkthrough. In short:
upload the four `demo-data/olivine_demo_*.xlsx` files via **Transport Cost
→ Import Data**, post them, and use the Command Centre / manual-entry /
Add New / Review Queue steps described there.

### 5. Before October 1 — remove the demo data, load real October data

Repeat step 1–3 (dry run, then `--confirm`) against the same tenant. This
clears the demo rows exactly as it cleared the earlier historical/
development data — the procedure is identical and idempotent, by design.
Master data (transporters, vehicles, customers, destinations) created or
confirmed during the demo is **preserved** by this reset, which is
correct: those are real, reusable reference records regardless of whether
they were first typed during a demo or during real October operations, and
Olivine should not have to re-enter a transporter they already confirmed
exists.

If specific demo-created master-data records should NOT carry forward
(e.g. a transporter typed only as `DEMO NEW TRANSPORTER` to show the
Add New flow), remove or merge those individually via the normal
Transporter/Vehicle master-data screens — this reset intentionally does
not delete master data automatically, so a demo-only test record does not
get silently swept up alongside something Olivine genuinely needs kept.

Then import Olivine's real October 2026 operating data through the same
import pipeline used throughout this procedure.

## Rollback

There is no field-level undo for a `deleteMany` in this platform. The
manifest step (2) is the safeguard — review it before every `--confirm`
run. The `tbltenant_repair_audit` record written in step 3 documents
exactly what was deleted (collection names and counts) for any
post-incident review, but does not restore data. Restoring deleted data
requires your infrastructure's own database backup/point-in-time-recovery
mechanism (outside this application's scope) — confirm your backup policy
covers the window before running `--confirm` on a production database for
the first time.
