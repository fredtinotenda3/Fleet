# Olivine demo transport-cost dataset — README

**All data in this dataset is SYNTHETIC.** It was generated for the Olivine
live-readiness demonstration and is not Olivine's real historical or
live operating data.

> **Revision note (2026-09-28):** this dataset was originally dated across
> October 2026. That made every row invisible under the Command Centre's
> default date filters (Today/Yesterday/This Week/This Month/Previous
> Month), because those filters are correctly relative to the **real**
> current date, not to the data — future-dated rows only show up under a
> manual Custom Range covering October. Since this dataset exists for a
> walk-up, no-manual-setup demonstration, all date-bearing rows were
> regenerated to fall between **1 August 2026 and 28 September 2026 (today)**,
> with explicit rows forced onto **today (28 Sep 2026)** and **yesterday
> (27 Sep 2026)** in every family that has a date field. Row counts, entity
> names, business content, and the import schema are unchanged in kind from
> the original — only the dates moved (a few anchor rows were added, so
> exact per-file counts below differ slightly from the very first version).
> If this file is regenerated again after today, `build_demo_workbooks.py`'s
> `TODAY`/`YESTERDAY`/month-window constants must be moved forward to match
> whatever day the demo actually happens on — they are not computed from
> the system clock, by design (a committed dataset must stay reproducible,
> not silently drift on every re-run).

## Files

| File | Purpose |
|---|---|
| `demo-data/olivine_demo_3rd_party.xlsx` | Upload via **Transport Cost → Import Data → 3rd Party** |
| `demo-data/olivine_demo_swift.xlsx` | Upload via **Transport Cost → Import Data → Swift** |
| `demo-data/olivine_demo_vansales.xlsx` | Upload via **Transport Cost → Import Data → Vansales** (set the period-month picker to **2026-09** first) |
| `demo-data/olivine_demo_depot_sto.xlsx` | Upload via **Transport Cost → Import Data → Depot STO** |
| `demo-data/olivine_demo_transport_cost_overview.xlsx` | Human-readable overview only — **do not upload this one**. See its own README tab. |

Why five files and not one: the app's real importer
(`shared/utils/excel-parser.utils.ts`) only ever reads the **first sheet**
of an uploaded workbook — confirmed against the actual parser code, not
assumed. A single multi-tab workbook would work for the first family
uploaded and silently produce validation errors for the other three. Each
single-family file is therefore its own workbook with the required columns
on its one sheet, in the exact header names
(`ImportColumnDef.key`, e.g. `costFacingCompany`, `registration`) the real
import handler expects — verified by running every row in every file
through the actual `ImportTransportCostHandler.validateAndBuildX` methods
in an automated test
(`tests/unit/transport-cost/demo-data-import-validation.spec.ts`), not
just by eye.

## What the dataset covers

- **Companies**: Hypery, Olivine, and Surface all appear across every
  family.
- **Transporters**: 9 distinct names (Africa Logistics, Zee Trucking,
  Iron City, Northland, Sightscore, Prinorth, Amaras, Willand, Panoptic).
- **Vehicles**: 12 distinct truck registrations.
- **Destinations**: Harare, Bulawayo, Mutare, Gweru, Masvingo, Kwekwe,
  Chitungwiza, Marondera.
- **Customers**: 10 distinct customer/payer names.
- **Dates**: spread across 1 August – 28 September 2026 (today), with
  explicit rows forced onto today (28 Sep) and yesterday (27 Sep) in every
  date-bearing family (3rd Party, Swift, Depot STO), so Today / Yesterday /
  This Week / This Month / Previous Month / Custom Range all produce
  visibly different, and immediately non-empty, Command Centre results
  without any manual date setup. Vansales has no per-row date field — its
  cost is periodized to a single calendar month via the period-month
  picker at import time (see below).
- **Row counts**: 3rd Party 28, Swift 19, Vansales 10, Depot STO 15 (72
  operational rows total) — enough variation for every Command Centre
  breakdown (by company, category, transporter, vehicle, destination,
  customer) to show real movement, not a flat line.
- **An intentionally incomplete row**: one 3rd Party row (Iron City /
  AEZ3117 / Supernova) has a **blank Amount**. This is deliberate — it
  demonstrates the app's honest "Cost not recorded" / "Unavailable"
  handling (a blank cost is never displayed or summed as $0) rather than
  hiding the gap.

## What this dataset does NOT include, and why

- **No master-data reference sheet.** The real importer never reads one —
  Customer/Destination/Transporter/Vehicle identity is always resolved
  separately, after import, via the master-data search/normalization
  pipeline. A reference tab would simply be ignored.
- **No multi-load rows in the bulk files.** The real bulk-file importer
  has no signal to group rows into one multi-load operation — that
  capability (Slice 2) only exists on the **"Enter Manually"** form. See
  the walkthrough below for how to demonstrate it live instead.
- **No fabricated distance/cost-per-km/ROI/margin figures anywhere.** The
  app itself refuses to compute these without real supporting data, and
  the demo data does not try to work around that — see
  `OLIVINE_LIVE_READINESS_REPORT.md` §12 for exactly which charts are
  genuinely populated versus honestly marked "Unavailable."

## Demo walkthrough

1. **Import the four files** (Transport Cost → Import Data → the four
   buttons), in any order. For Vansales, set the period-month picker to
   `2026-09` before uploading.
2. **Post the imported rows** through the normal review/post flow.
   (Vansales posts under cost category `transport-retainer`, per
   `VANSALES_PERIODIZATION_DECISION.md` — Option A, `TOTAL` as the posted
   amount, one posting per row per calendar month.)
3. **Command Centre**: filter by company (Olivine/Hypery/Surface),
   transporter, vehicle, destination, customer, and date range (Today /
   This Week / This Month / Previous Month / Custom) to show each
   producing visibly different results. Open the charts: cost trend, cost
   by company, cost by category, cost by transporter, cost by vehicle,
   cost by destination, cost by customer.
4. **Multi-load demo** (Slice 2 — cannot be shown via bulk upload, see
   above): go to **3rd Party → Enter Manually** and enter one operation
   with two loads, exactly matching the brief's own worked example (use
   today's date, or any date in the imported range, so it shows up
   immediately alongside the imported rows):
   - Truck `ABC1234`, Transporter `AFRICA LOGISTICS`, Date `28 Sep 2026`
   - Load 1: Invoice `INV-001`, Customer `Customer A`, Consignment
     `CONS-001`, Destination `Mutare`, Tonnage `12`
   - Load 2: Invoice `INV-002`, Customer `Customer B`, Consignment
     `CONS-002`, Destination `Mutare`, Tonnage `8`
   - Save, then open the operation detail page and show the two loads
     under one operation, and the ledger showing **one** posting, not two.
5. **Master-data / Add New demo**: on any manual-entry form (3rd Party,
   Vansales, or Depot STO):
   - Search `AFRICA LOGISTICS` in the Transporter field → shows the
     existing record → select it.
   - Type `DEMO NEW TRANSPORTER` → shows **+ Add New Transporter** → click
     it → the field fills in with the new (pending-review) transporter.
   - Type `DEMO9999` in Truck registration → shows **+ Add New Truck**
     (this only works once a transporter has been picked or added on the
     same row — see `OLIVINE_LIVE_READINESS_REPORT.md` §3 for why that
     order matters) → click it → the field fills in with the new
     (pending-review) vehicle.
   - Repeat for Customer/Destination fields, which create confirmed
     records immediately (no review queue — see the report for why
     Customer/Destination and Transporter/Vehicle are handled
     differently).
6. **Review Queue**: show the pending Transporter/Vehicle items created
   above, and confirm or merge one.
7. **Operational records / audit**: open an operation's detail page, show
   its loads, financial history, and audit trail.

## Removing the demo data before real live data

The demo data is imported through the app's normal import pipeline, so it
carries no special marker beyond what every import already gets — a
distinct `importBatchId` per upload. To wipe it (and any other historical/
development transport-cost data) before Olivine's live operating period
begins, use the extended, already-safety-reviewed reset script:

```
npm run db:reset-business-data -- --tenant <olivine-tenant-slug>              # dry run — review the manifest first
npm run db:reset-business-data -- --tenant <olivine-tenant-slug> --confirm    # apply
```

This clears operational transport-cost data (imported source rows, import
exceptions, the normalization review queue, and this tenant's ledger
postings) while **preserving** master data (customers, destinations,
transporters, contracted vehicles, VAT/currency configuration), users,
roles/permissions, organization/org-unit configuration, and all indexes.
See `OLIVINE_CUTOVER_PROCEDURE.md` for the full, step-by-step cutover
runbook and why this script — rather than a new one — was extended for
this purpose.
