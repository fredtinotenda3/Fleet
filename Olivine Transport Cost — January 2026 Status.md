# Olivine Transport Cost — January 2026 Status

Sep 23, 2026 · @Someone

Three transport-cost families were imported from Olivine's January 2026 workbook. One (3rd Party) is live and posting to the report; two (Vansales and Swift) are imported but blocked from posting, each for a distinct and documented reason described below.

## Which screen to show Olivine

Open **Cost & Finance → Transport Cost**, filtered to **January 2026**. This screen reads only posted data — it never shows raw imported rows, so everything visible there has already passed identity confirmation and been posted to the ledger.

- Use the **Export exceptions** button on the report to hand Olivine a CSV of every source row that has not posted yet, with its reason — useful if they ask about the rest of January.
- Do not open the normalization review queue or any import/CLI output in the meeting — those are internal working tools, not something Olivine needs to see.

## What's live — 3rd Party

109 rows in Olivine's January sheet.

- 7 failed import validation (missing required fields) and were never imported.
- 90 imported successfully as source records (after removing duplicate re-imports — see "Data cleanup performed" below).
- Of those 90: **73 have posted** to the ledger and are visible on the report page now. **17 are still pending** — their amount field is blank in Olivine's own spreadsheet. Nothing is lost; they post automatically once Olivine fills in the missing figures and we re-run posting.

## What's outstanding — Vansales

46 rows in Olivine's January sheet; 3 failed import validation, 43 imported successfully (after dedup).

- **0 posted.** Every Vansales row is blocked for the same reason: pending amount.
- Why: a Vansales posting reads only the TOTAL figure Olivine enters per payer — never the weekly breakdown columns, which are informational only. In the real January sheet, only 1 of 46 TOTAL cells has a value, and that one row is itself a subtotal/footer line with no payer name, so it was correctly rejected on import.
- This is a gap in Olivine's own source data, not a system defect. **Action item for Olivine:** fill in the TOTAL column per payer for January. Once that's done, posting takes minutes on our side.

## What's outstanding — Swift

281 rows in Olivine's January sheet; 5 failed import validation, 276 imported successfully (after dedup).

- **0 posted, and none will post as the source data is structured today.** This is permanent, not a backlog item.
- Why: every ledger posting requires a vehicle. Swift's source sheet has no registration, vehicle, or transporter column at all — there is nothing in the data to resolve a vehicle identity from, for any row.
- This needs a **business decision from Olivine**, not more import work: either add a vehicle/transporter identifier to the Swift source data going forward, or decide how Swift costs should be attributed on the report without a per-vehicle link. Until one of those happens, Swift costs stay imported (visible to us for reconciliation) but off the report page.

## Data cleanup performed

Before this review, an earlier full re-import of the January file silently created a second copy of every Vansales and Swift row — duplicate detection only works when both a registration and a date are present, and neither family has both. 319 duplicate rows were identified, verified byte-for-byte against the originals, and safely removed (soft-deleted, fully recoverable) on 2026-09-23. The 3rd Party family was never affected — its duplicate check caught re-imports correctly from the start. The counts above already reflect this cleanup.

## Next steps

| Family | Status | Next action | Owner |
| --- | --- | --- | --- |
| 3rd Party | 73/90 posted | Fill in amounts for the 17 blank rows, then re-run posting | Olivine |
| Vansales | 0/43 posted | Fill in the TOTAL column per payer for January | Olivine |
| Swift | 0/276 posted | Decide how to attribute Swift costs without a vehicle identifier | Olivine (business decision) |

Once Olivine provides the above, posting is a single command on our side and takes minutes — no further import work is needed for January.
