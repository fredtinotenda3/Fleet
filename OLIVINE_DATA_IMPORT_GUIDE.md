# Getting real data into Olivine Group

Login works, the org and role ladder exist, but the tenant is empty — zero vehicles, zero drivers, zero transport-cost records. This is the guide for filling it, split cleanly into what's already automated, what I built to close a real gap, and what only you can do (because it requires either your real source files or a human judgment call about your own business).

## 0. Olivine's actual data model — read this first

Per the original fit-gap audit, Olivine's trucks are **contracted vehicles** (`tblcontractedvehicles`) run by third-party transporters, not an owned, telematics-equipped fleet (`tblvehicles`). That distinction decides which import path you actually need:

- **`tblvehicles` bulk import** (`POST /api/vehicles/import`) is for an owned fleet with odometers, service intervals, VINs. Unless Olivine also runs some owned vehicles, you probably don't need this one at all. It exists, it's raw-API-only (JSON POST, no upload page — see §3 if you do need it), and it's unrelated to the transport-cost pipeline.
- **`tblcontractedvehicles`** and **`tbltransportpartners`** (the transporter companies) are Olivine's real fleet and vendor master data. These are **never created directly** — the only way a row lands in either collection is a human confirming a normalization-review item (§2 below). This is deliberate: it's the system refusing to silently invent "PRINORTH" and "PRI NORTH" as two different companies from a spreadsheet typo.

So the real sequence for Olivine is: **import your source spreadsheets → work the review queue → contracted vehicles and transporters get created from confirmed decisions → those postings become the numbers the O4 report and the future Command Centre show.**

## 1. Import your source spreadsheets (already built, ready to use)

A working upload page already exists at **`/transport-cost/import`** — pick a sheet family, drag in your file (CSV or XLSX), preview, import. No new code needed here; this was already shipped. Four families, each with its own required columns:

| Family | Required columns | Notes |
|---|---|---|
| **3rd Party** | `date` (`DD.MM.YY`, `DD.MM.YYYY`, or `YYYY-MM-DD`), `registration` | Optional: customerName, transporter, salesInvoiceNo, tonnage, destinationTown, amount. A blank amount stays blank (never becomes 0). |
| **Vansales** | `payerName`, `truck` (this is the transporter name field, not a vehicle id) | Also requires a batch-level **period month** (`YYYY-MM`) picked once for the whole file, not per row. Optional: registration, tonnage, product, monthlyCostBeforeVat, week1–4, total. |
| **Swift** | `consDate`, `consNumber` | Optional: shipperReference, receiversName, destinationLocation, actualWeight, totalExcl, taxAmount, totalIncl. Swift's real data has no registration/transporter column — none is invented for it. |
| **Depot STO** | `date` only | Everything else optional; the parser tolerates the column layout drifting month to month (e.g. "Truck registration no" vs "REG", "Amount" vs "COSTS" vs "COST" — it already knows every variant seen in your workbook through August). |

A value like `VAT EXCL` / `N/A` / `TOTAL` in a transporter column is rejected rather than imported as if it were a real company — that's existing, tested behavior, not something to work around.

**This step is on you**, and it's the one piece I genuinely cannot do from here: I don't have your real spreadsheets, and I'm not going to fabricate transport-cost data and present it as Olivine's. If you attach the actual files to our conversation, I can review them against these exact column requirements and tell you precisely what will and won't import cleanly before you upload anything — that part I can automate.

## 2. Work the review queue (this was broken — now fixed)

Here's the real gap I found while working through this: importing a spreadsheet doesn't finish the job. Every transporter name or registration that isn't an exact match against something already confirmed lands in a **normalization review queue** — a fuzzy-match suggestion, or a flag that it looks like a brand-new transporter/vehicle. A human has to look at each one and decide.

The code to do that already existed — fully implemented, tested, and doc-commented with the route paths it expected — but **the API routes were never created**, and no page in the app calls it either. So an import could pile up review items with no way to ever act on them except a raw command. That's now fixed:

- **Four new API routes** (`/api/transport-cost/normalization-review` + `/[id]/confirm-match`, `/confirm-new`, `/reject`), wired to the exact existing, already-tested service methods — no new business logic, just the missing wiring, permission-gated with the `TRANSPORT_COST_NORMALIZE` permission the codebase had already defined and granted to Fleet Manager/Accountant roles but never used.
- **A command-line tool** (`scripts/review-normalization-queue.ts`) so you can work the queue today without waiting on a full review-queue UI page:

```
npx tsx scripts/review-normalization-queue.ts list --org olivine-group-b606e3
```

This prints every pending item — the raw value, how many source rows are waiting on it, and (when one exists) the suggested match with its similarity score — plus the exact next command to run for each one:

```
# accept the suggested match
npx tsx scripts/review-normalization-queue.ts confirm-match --org olivine-group-b606e3 --id <reviewItemId> --use-candidate --user-email owner@olivine.test

# confirm it's genuinely a new transporter/vehicle
npx tsx scripts/review-normalization-queue.ts confirm-new --org olivine-group-b606e3 --id <reviewItemId> --user-email owner@olivine.test

# reject a bad value (e.g. something the import blocklist missed)
npx tsx scripts/review-normalization-queue.ts reject --org olivine-group-b606e3 --id <reviewItemId> --user-email owner@olivine.test --reason "..."
```

**This is the one piece that has to stay a human decision, on principle, not because I ran out of time to automate it**: whether "PRINORTH" and "PRI NORTH" are the same company is a fact about your real business relationships that no fuzzy-match score can decide on its own — the matcher only ever suggests, per its own "suggest only, never auto-merge" rule. I'm not going to auto-accept every suggestion to save you clicks; a wrong merge here corrupts vendor identity for every future report. What I automated is everything mechanical around that decision — listing, showing the candidate, applying your decision, updating every waiting record — so the only thing left is the judgment call itself.

A backing regression test (`tests/security/normalization-review-reachable.spec.ts`) now guards these four routes so a future refactor can't silently drop them again the way this one was silently never built.

## 3. If Olivine does have owned vehicles/drivers to enter

- **Vehicles**: `POST /api/vehicles/import`, JSON body `{ "records": [...] }`, up to 2000/batch. Required per record: `license_plate`, `make`, `model`, `year`, `vehicle_type`, `purchase_date` (`YYYY-MM-DD`), `fuel_type`. No upload page exists for this one — if you want it, tell me and I'll build a small CLI wrapper (read a CSV, POST it) rather than you hand-writing JSON.
- **Drivers**: there's genuinely no bulk-import path yet — only one-at-a-time via `POST /api/drivers`. I didn't build this in this pass since Olivine's model is contracted vehicles, not an owned/driver fleet, and didn't want to guess at scope you may not need. Say the word if you do need it and I'll add it the same way as the review-queue fix — real route, real tests, not a stub.

## 4. Verifying anything actually landed

Once you've imported and worked through the queue:

```
GET /api/transport-cost/source-records          # raw imported rows
GET /api/transport-cost/normalization-review     # what's still pending
```

or the O4 report screen in the app once postings exist. `npm run db:forensics` (the read-only tenant-isolation checker you already ran) is also worth a re-run after a real import, purely as a sanity check that everything landed under `olivine-group-b606e3` and nowhere else.

## Summary of what's in the attached zip

| File | What it is |
|---|---|
| `app/api/transport-cost/normalization-review/route.ts` | New — lists the review queue |
| `app/api/transport-cost/normalization-review/[id]/confirm-match/route.ts` | New — accept a suggested match |
| `app/api/transport-cost/normalization-review/[id]/confirm-new/route.ts` | New — confirm a new transporter/vehicle |
| `app/api/transport-cost/normalization-review/[id]/reject/route.ts` | New — reject a bad value |
| `scripts/review-normalization-queue.ts` | New — CLI to work the queue without waiting on a UI page |
| `tests/security/normalization-review-reachable.spec.ts` | New — regression guard for all four routes |
| `OLIVINE_DATA_IMPORT_GUIDE.md` | This file |

All `tsc --noEmit` clean, full suite green (179/180 suites — same one pre-existing skip as before this change — 3168/3189 tests, +5 net from the new reachability spec, 0 failures).
