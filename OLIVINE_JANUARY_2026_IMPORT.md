# Importing "TRANSPORT COST JANUARY 2026.xlsx"

You asked directly how to get this specific real workbook into the system. Short answer: a new script, `scripts/import-transport-cost-source-file.ts`, run once from your own machine (it needs your real `MONGODB_URI`, which only exists in your `.env`, not mine). Read the "important, before you run it" section below first — the file is not quite what its name suggests.

**If you already tried this and got `[CommandBus] No handler registered for command "ImportTransportCostCommand"`** — that was a real bug (a standalone script never runs the Next.js startup step that wires the command bus up), now fixed in both this script and `scripts/review-normalization-queue.ts`. Full explanation in `CHANGES_THIS_PASS.md`. Re-run the exact same command; nothing about the command line itself changes.

## Important, before you run it

I opened the actual file you uploaded. It is not a single month's workbook — it has **39 sheets** covering **January through August 2026**, across two business streams (Olivine and, from May onward, a separate "Hypery" stream), plus two large master "PODs" sheets (proof-of-delivery logs, 3220 and 1458 rows) that are not transport-cost data at all.

This pass deliberately covers **January only** — the three sheets that exist for that month: `JAN-26 3rd Party`, `JAN-26 Vansales`, `JAN-26 Swift`. (There is no January Depot STO sheet; that family starts in March.) Here's why I stopped there rather than guessing at the rest:

- I hand-verified January's three sheets' exact column positions against the real file with the same library the app uses (SheetJS) — header row, data start row, and every column, one by one (see "What was actually verified" below).
- February through August have **not** been individually checked the same way. Nothing guarantees their columns line up with January's — in fact `DEPOT_STO_DECISION.md` (already in this repo, from earlier verification work) documents that Depot STO's own layout changes shape four times across March–August alone. Assuming a later month matches January and importing it anyway risks silently misreading real financial data — wrong column, wrong number, no error.
- The Olivine/Hypery split from May onward is a second axis of drift I also haven't checked.

**I'm not doing that work speculatively.** Once January is imported and you've confirmed the numbers look right on the report page, tell me to move on to February (or whichever month), and I'll open that sheet, verify its actual columns the same way, extend the script, and prove it the same way before it touches real data — never assume-and-ship for money data.

## What was actually verified (not assumed)

For each of the three January sheets, I dumped the raw rows with SheetJS directly against your uploaded file and checked them by eye against the script's column mapping:

| Sheet | Header row | First data row | Columns confirmed |
|---|---|---|---|
| `JAN-26 3rd Party` | row 1 | row 2 | Date, Customer name, Transporter, Sales invoice no, *(OGP ref no — skipped, no matching field)*, Tonnage, Truck registration no, Destination Town, Amount |
| `JAN-26 Vansales` | row 2 (row 1 is a stray pre-header cell) | row 3 | PayerName, REG, TONNAGE, PRODUCT, TRUCK, Monthly cost before VAT, WEEK1–4, *(blank column — skipped)*, TOTAL |
| `JAN-26 Swift` | row 3 (rows 1–2 are a title and a blank row) | row 4 | Cons. date, Cons. Number, Shipper reference, Receivers Name, Destination location, Actual weight, Total(Excl), Tax amount, Total(Incl) |

A dry run of the actual script against your actual uploaded file (parses only, writes nothing) reported:

- **3rd Party: 109 rows parsed** (106 non-blank)
- **Vansales: 46 rows parsed** (44 non-blank)
- **Swift: 281 rows parsed** (277 non-blank, the rest are trailing footer/subtotal rows the import handler's own row validation will reject, not silently include — proven correct earlier against this exact sheet by the existing `scripts/verify-phase-o3-o4.ts`)

One honest note on the data itself, not a bug: Swift's "Cons. Number" and "Shipper reference" columns are stored in the source file with a leading apostrophe character (e.g. `'10000265943`) — that's how the workbook itself has these text-formatted numbers, and the script carries it through unchanged rather than silently stripping it, since I don't have a basis for deciding that's not meaningful.

## Why this couldn't just go through the "Import" button in the browser

Two real limitations in the existing upload UI, found while investigating this:

1. The browser upload path (`readExcelFile()`) only ever reads the **first sheet** of whatever file you drop in. Your workbook has "JAN-26 3rd Party" at position 1 but "JAN-26 Vansales" and "JAN-26 Swift" are elsewhere among 39 tabs.
2. The upload modal matches your spreadsheet's header row against internal field names (e.g. `registration`), not human-readable labels — so even a single correctly-positioned sheet with real-world headers like "Truck registration no" wouldn't auto-map.

Neither is something to silently work around by hand-editing your workbook before upload (renaming/reordering sheets on the one real source file is exactly the kind of manual step that introduces its own mistakes). The script reads the named sheet directly by name, at any position, so this doesn't matter to it.

## How to run it

From your own machine, in the repo root, with your real `.env` in place:

```
npx tsx scripts/import-transport-cost-source-file.ts --file "path\to\TRANSPORT COST JANUARY 2026.xlsx" --dry-run
```

Run the dry run first. It opens the file, parses all three January sheets, and prints row counts — **no database connection is opened, nothing is written**. Confirm the counts look like the table above before going further.

Then, for real:

```
npx tsx scripts/import-transport-cost-source-file.ts --org olivine-group-b606e3 --file "path\to\TRANSPORT COST JANUARY 2026.xlsx" --user-email owner@olivine.test
```

This imports all three sheets in one run (3rd Party, then Vansales with `periodMonth` automatically set to `2026-01`, then Swift), each through the exact same command handler, validation, and duplicate-detection the browser upload path uses. It prints a per-family summary (succeeded / duplicate / failed, with the reason for any failed row) and, at the end, the exact command for the next step.

## After it runs — work the review queue

Any transporter name or vehicle registration in the file that isn't already a confirmed record in your system lands in the normalization review queue, not created automatically (this is the one architectural rule that never bends — see `OLIVINE_DATA_IMPORT_GUIDE.md` §0, and this new script's own header comment explains why `systemWriteScope` doesn't change that). Work through it the same way as always:

```
npx tsx scripts/review-normalization-queue.ts list --org olivine-group-b606e3
```

then `confirm-match` / `confirm-new` / `reject` per item, exactly as documented in `OLIVINE_USING_THE_SYSTEM.md` §4.

## Then, check the report

Cost & Finance → Transport Cost, pick January 2026. Source records import (Phase O1) doesn't post to the ledger by itself — once review items are resolved, posting happens through the same pipeline `verify-phase-o3-o4.ts` already proved correct against this exact data (Phase O2 → O3). If the report page doesn't show what you expect after that, that's the point to come back and say so, rather than me guessing at posting behavior now.

## What this script deliberately does NOT do

- Does not touch February–August (see above).
- Does not touch either "PODs" sheet — those are proof-of-delivery records, a different kind of data with no clear owner in this codebase yet; said nothing about them until you tell me what they're for.
- Does not auto-confirm or auto-reject a single normalization review item — that stays a human decision, every time.
- Does not post to the Allocation Ledger — that's Phase O3, triggered by resolving review items, not by this import script.
