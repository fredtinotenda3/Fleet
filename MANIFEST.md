# Fuel price correction script -- September 2026 Diesel/Petrol

## What it does

Recomputes `cost = fuel_volume * price-for-that-fuel-type-and-date` for
every `tblfuellogs` row matching the schedule your accounting team
confirmed:

| Fuel type | 1 Sep - 16 Sep 2026 | 17 Sep 2026 onward |
|---|---|---|
| Diesel | $1.95 / litre | $2.08 / litre |
| Petrol | $1.96 / litre | $2.06 / litre |

Nothing else on a row changes -- not `fuel_volume`, not `fuel_type`,
not `driver_id`, not `license_plate`.

## Scope decision I made

"All the records" in your message, read next to the two specific
periods you gave, means every September row -- not every fuel log ever
entered. There's no confirmed rate for August or earlier, so the script
only touches Diesel/Petrol rows dated 1 September 2026 onward. If
another price change needs correcting later, it's a one-line addition
to the `PRICE_SCHEDULE` table at the top of the file, not a new script.

## Run it

```
# 1. Dry run first -- always. Prints exactly what would change, writes nothing.
npx tsx scripts/correct-fuel-prices.ts --tenant willsgrove-farm-enterprises-9e80ed

# 2. Once the preview looks right, apply it:
npx tsx scripts/correct-fuel-prices.ts --tenant willsgrove-farm-enterprises-9e80ed --confirm
```

`willsgrove-farm-enterprises-9e80ed` is Willsgrove Farm Enterprises'
actual tenant slug, read directly from `tblorganizations` in the repo
copy you sent me -- pass it exactly as shown. `--tenant` is required and
is never guessed or defaulted, same as every other maintenance script in
your `scripts/` folder.

Run it from the repo root, with `MONGODB_URI` set in your `.env`
(pointed at your real database) -- same setup every other script in that
folder already expects.

## Safety built in

- **Dry run by default.** You only get a preview -- fuel-type/period
  totals, a sample of individual changes, and a written JSON report --
  until you add `--confirm`.
- **Currency is never assumed.** If the matched rows carry more than one
  currency value, the script lists the breakdown and stops, asking you
  to re-run with `--currency <value>`. If they all share one value it
  proceeds automatically and tells you which value that was.
- **Unit is verified, not assumed.** Each row's unit is checked against
  `tblunits`; only rows on a recognized litre unit are corrected. Your
  fleet's unit catalogue only defines km and litre as far as I can see
  in the repo, so this is expected to exclude nothing -- it's a guard
  against a future/foreign unit, not a currently-anticipated case.
- **fuel_type matches case- and whitespace-insensitively** ("diesel",
  "Diesel", " DIESEL " all match), so it doesn't depend on the earlier
  fuel-type-normalization backfill having been run first.
- **Safe to re-run.** A row that's already correct is a no-op --
  detected, not written, not counted as "updated."
- **Full audit trail.** Every run -- dry or confirmed -- writes an
  itemized before/after list (per fuel log: old cost, new cost, delta)
  both to `tbltenant_repair_audit` in the database and to a JSON file
  under `reports/fuel-price-correction/`. A confirmed run prints a
  **run ID** you can use to undo it:
  ```
  npx tsx scripts/correct-fuel-prices.ts --tenant willsgrove-farm-enterprises-9e80ed --rollback <runId> --confirm
  ```

## One real consequence you should know about before running this

I checked how your allocation ledger works before writing this, because
it matters here: **`tblallocationledger` is append-only** -- your own
codebase's repository layer refuses updates to it outright ("postings
cannot be updated once written. Post a reversing entry instead"), and a
fuel log only posts to it once, at creation.

That means: correcting a fuel log's cost here will change "Operational
fuel total (from fuel logs)" in the Monthly Fuel & Fleet Intelligence
Report (it's computed live from `tblfuellogs`), but if that fuel log had
already posted to the allocation ledger, the ledger's copy was posted at
the *old*, wrong cost and won't update itself. Your Financial
Reconciliation section's variance will shift as a result of running
this script -- possibly closer to reconciled, possibly further away,
depending on how the old vs. new totals compare to what's already in the
ledger. It was already showing "NOT reconciled" with a large variance
before this correction (that's a separate, pre-existing issue, not
something this script caused or is meant to fix).

I deliberately did **not** try to also fix the ledger in this same
script -- that collection is your system of record for financial
reporting, touching it needs its own reversing-entry logic through
`AllocationPostingService` (not a raw update), and bundling it into a
"fix the fuel log prices" request felt like exactly the kind of
consequential decision that shouldn't happen silently inside a script
you didn't ask for. Run this, look at how the reconciliation number
moves, and let me know if you want the ledger brought back in line too
-- that's a well-scoped follow-up I can build once you've seen the
actual before/after.

## Verification

| Check | Result |
|---|---|
| TypeScript type-check (`npx tsc --noEmit`, whole repo) | **PASS** |
| Lint (`npx eslint scripts/correct-fuel-prices.ts`) | **PASS** -- zero errors |
| Pricing/rounding logic (date-boundary matching for both fuel types across the Sep 16/17 boundary, and float-safe rounding, including the classic 1.005 case) | **PASS** -- verified against 11 explicit cases |
| End-to-end run against a real/in-memory MongoDB | **Not possible from this environment** -- see below |

**Being direct about that last line, since you asked for a script that
touches real financial data:** I don't have network access to your
production database from here, and this sandbox can't download a local
MongoDB binary to stand up an in-memory one either (blocked at the
network level, same as your own integration test harness already notes
for this kind of environment). So the Mongo-facing parts of this script
-- the query, the update, the audit write -- are not exercised
end-to-end by me; they follow the exact same query/update shape as
`scripts/backfill-fuel-type-normalization.ts`, which already runs
successfully in your environment. What I could and did fully verify is
the part most likely to be wrong in a script like this: the date-range
and rounding math that decides which price applies to which row and
what the corrected number comes out to.

**Given that, please run the dry run first (no writes happen) and read
its output carefully -- the per-row sample, the fuel-type/period totals,
and the excluded-rows lists -- before adding `--confirm`.** If anything
in that preview looks off (a count that doesn't match what you expect,
a currency or unit exclusion you didn't anticipate), stop and send me
the output rather than confirming.
