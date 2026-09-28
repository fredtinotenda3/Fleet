# Olivine demo transport-cost dataset — README

**All data in this dataset is SYNTHETIC.** It was generated for the Olivine
live-readiness demonstration and is not Olivine's real historical or
October 2026 operating data.

## Files

| File | Purpose |
|---|---|
| `demo-data/olivine_demo_3rd_party.xlsx` | Upload via **Transport Cost → Import Data → 3rd Party** |
| `demo-data/olivine_demo_swift.xlsx` | Upload via **Transport Cost → Import Data → Swift** |
| `demo-data/olivine_demo_vansales.xlsx` | Upload via **Transport Cost → Import Data → Vansales** (set the period-month picker to **2026-10** first) |
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
- **Dates**: spread across 1–24 October 2026, so Today / Yesterday / This
  Week / This Month / Previous Month / Custom Range all produce visibly
  different Command Centre results.
- **Row counts**: 3rd Party 25, Swift 16, Vansales 10, Depot STO 13 (64
  operational rows total) — enough variation for every Command Centre
  breakdown (by company, category, transporter, vehicle, destination,
  customer) to show real movement, not a flat line.
- **An intentionally incomplete row**: one 3rd Party row (Iron City /
  AEZ3117 / Supernova, 12 Oct) has a **blank Amount**. This is deliberate
  — it demonstrates the app's honest "Cost not recorded" / "Unavailable"
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
   `2026-10` before uploading.
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
   with two loads, exactly matching the brief's own worked example:
   - Truck `ABC1234`, Transporter `AFRICA LOGISTICS`, Date `1 Oct 2026`
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

## Removing the demo data before real October data

The demo data is imported through the app's normal import pipeline, so it
carries no special marker beyond what every import already gets — a
distinct `importBatchId` per upload. To wipe it (and any other historical/
development transport-cost data) before Olivine's live October 1
operating period begins, use the extended, already-safety-reviewed reset
script:

```
npm run db:reset-business-data -- --tenant <olivine-tenant-slug>              # dry run — review the manifest first
npm run db:reset-business-data -- --tenant <olivine-tenant-slug> --confirm    # apply
```
npm run db:reset-business-data -- --tenant <olivine-tenant-slug>      

This clears operational transport-cost data (imported source rows, import
exceptions, the normalization review queue, and this tenant's ledger
postings) while **preserving** master data (customers, destinations,
transporters, contracted vehicles, VAT/currency configuration), users,
roles/permissions, organization/org-unit configuration, and all indexes.
See `OLIVINE_CUTOVER_PROCEDURE.md` for the full, step-by-step cutover
runbook and why this script — rather than a new one — was extended for
this purpose.
