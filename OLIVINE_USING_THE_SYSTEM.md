# Using the system as Olivine

Covers everything as of this pass: logging in, the sidebar, importing by file, the new manual-entry option, working the review queue, and reading the report. Confirmed working end-to-end against your real database (your own `npm run dev` run: `owner@olivine.test` logged in scoped to `olivine-group-b606e3`, `/transport-cost/report` and `/transport-cost/import` both returned 200).

## 1. Log in

`https://<your-deployed-url>/auth/login` (or `http://localhost:3000/auth/login` locally) with the Olivine owner account. The tenant-scoping bug documented in `OLIVINE_STATUS_AND_LOGIN_FIX.md` is confirmed fixed — the account resolves to `olivine-group-b606e3`, not the `'default'` tenant.

## 2. Find the pages

Sidebar → **Cost & Finance → Transport Cost**. This opens the O4 report (Business Stream → Vehicle/Transporter, by month). A child link, **Import Data**, goes to the import page. Visible to owner, admin, fleet manager, and accountant roles; branch manager sees the report only, not import (view vs. import are separate permissions — `TRANSPORT_COST_VIEW` vs `TRANSPORT_COST_IMPORT`).

## 3. Get data in — two ways now

Both ways land in the exact same place: a source record, validated the same way, checked for duplicates the same way, and — if it names a transporter or vehicle registration that isn't already confirmed — placed in the same normalization review queue. Neither one ever creates a transporter or vehicle directly; that only happens when a human confirms a review item (§4). This is deliberate, not a limitation: it's what stops a spreadsheet typo ("PRINORTH" vs "PRI NORTH") from silently becoming two different companies.

### 3a. Upload a spreadsheet (unchanged)

On the Import page, pick a family — **3rd Party**, **Vansales**, **Swift**, or **Depot STO** — click **Import**, drag in the CSV or XLSX file, preview, confirm. Vansales additionally requires picking the calendar month the batch covers (the month picker next to its button) before the import button enables.

Required columns per family:

| Family | Required | Notes |
|---|---|---|
| 3rd Party | date, registration | Optional: customerName, transporter, salesInvoiceNo, tonnage, destinationTown, amount |
| Vansales | payerName, truck (transporter name) | Plus the batch-level period month. Optional: registration, tonnage, product, monthlyCostBeforeVat, week1–4, total |
| Swift | consDate, consNumber | No registration/transporter column — the real source data has none |
| Depot STO | date | Everything else optional; the parser tolerates the column layout drifting month to month |

### 3b. Type in one record — new this pass

Next to each family's **Import** button is an **Enter manually** button. This opens a form with the same fields as that family's spreadsheet columns (required ones marked). Fill it in, **Save record**. Useful for a one-off delivery, a correction, or when there's no spreadsheet to upload at all — no Excel or CSV required.

Under the hood this is not a separate feature: it submits the one row through the identical API call the file-upload path uses, so it gets the identical validation, the identical duplicate check ("looks like a duplicate of an existing record" if you re-enter the same registration/date/amount), and the identical normalization-review behavior. There is no shortcut here that skips review — typing in a new transporter name still queues it for confirmation exactly like an imported one would.

## 4. Work the normalization review queue (still command-line — see below)

Still runs via the script, not yet a page in the app:

```
npx tsx scripts/review-normalization-queue.ts list --org olivine-group-b606e3

npx tsx scripts/review-normalization-queue.ts confirm-match --org olivine-group-b606e3 --id <reviewItemId> --use-candidate --user-email owner@olivine.test

npx tsx scripts/review-normalization-queue.ts confirm-new --org olivine-group-b606e3 --id <reviewItemId> --user-email owner@olivine.test

npx tsx scripts/review-normalization-queue.ts reject --org olivine-group-b606e3 --id <reviewItemId> --user-email owner@olivine.test --reason "..."
```

The corresponding API routes exist (`/api/transport-cost/normalization-review`) if a page gets built on top of them later — say the word and I'll build that page next; it's the one piece of the Olivine workflow still CLI-only rather than in-app, by design from the earlier pass (a working script now over a speculative UI page nobody had confirmed the shape of yet).

## 5. Read the numbers

Cost & Finance → Transport Cost (the report page) — pick a month, see Business Stream → Vehicle/Transporter totals, click a vehicle for its individual postings. A banner shows when rows in that period still have no Amount (source data legitimately blank, never zero-filled) or when a period mixes currencies (never summed together). **Export exceptions** downloads the rejected/duplicate/date-typo rows for that period as CSV.

## 6. What's genuinely not built yet, so you don't go looking for it

A page for the review queue (§4 is CLI-only). Bulk import for `tblvehicles` (owned fleet) or drivers — not needed unless Olivine runs owned vehicles alongside the contracted fleet; the single-record `POST /api/vehicles`/`POST /api/drivers` endpoints exist if you need one at a time. The Command Centre's cross-vehicle cost aggregation (tracked separately, not started). Ask for any of these and they get built the same way everything above was: a real route, real tests, no stub.
