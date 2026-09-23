# What changed in this zip (this pass)

Twelve files touched/added across the last few passes, verified against your real `package.json`/lock file via a clean `npm install`. `npx tsc --noEmit`: clean across the whole repo. `npx eslint` on every touched/added file: zero errors. Full suite (previous pass): 174/175 suites, 3136/3137 tests green — same single pre-existing, unrelated failure as before (see "Found but not fixed").

## CRITICAL — real duplicate data found before it reached the ledger

Your posting run's own batch counts gave it away: **two** import batches each for Vansales (43+43=86 stored) and Swift (276+276=552 stored), but only **one** for 3rd Party (90). That means the real workbook got imported twice, and the existing duplicate check only caught it for 3rd Party.

Why: `findLikelyDuplicate` requires both a registration AND a date to mean anything (its own doc comment says so explicitly). Vansales rows always have `date === null` (it's a fixed retainer, not a dated shipment). Swift rows always have `registration === null` (the source has no such column at all). So every Vansales and Swift re-import sailed straight past the duplicate check and inserted a second, real copy of every row. If this had been posted as-is, Olivine's Vansales and Swift numbers on the report page would have been exactly double the real figures — with nothing in the app flagging it.

Caught before any posting happened (your posting run showed 0 posted everywhere, since the review items weren't confirmed yet — good timing). **`scripts/dedupe-transport-cost-reimports.ts`** finds and removes it: identifies the same (file, row number) appearing more than once — which can only mean a re-import, independent of the broken date/registration check — cross-checks the raw cell content is byte-identical between copies as a second confirmation before touching anything, keeps the earliest copy, and soft-deletes the rest (recoverable, not a hard delete). Report-only by default; `--execute` is required to actually remove anything.

**Run this before posting.** See my reply for the exact commands and order.

## Resolved — the "0 succeeded, 102 duplicates" mystery (good news, not a bug)

Your diagnostic run showed 90 real 3rd Party records already stored, with `importedAt` timestamps *earlier* than the run you pasted me. That means an earlier successful run had already imported them — the "0 succeeded / 102 duplicates" output was a second run correctly recognizing an already-imported file and refusing to create a second copy. No data loss, no bug: the duplicate check did exactly its job.

## New — two scripts to get from "imported" to "visible on the report page"

Source records existing (Phase O1) isn't the same as Olivine seeing numbers: the report page reads only the Allocation Ledger (Phase O3), and getting there needs every new transporter/vehicle confirmed (Phase O2) and then explicitly posted — neither step has a UI yet.

- **`scripts/bulk-confirm-new-review-items.ts`** — your 117 pending review items are all "no candidate found" (the matcher itself already concluded each is genuinely new — I checked). This automates confirming exactly those, in the required order (transporters first, since a vehicle can't be created without its transporter's real id — confirmed from `ConfirmReviewNewHandler`'s own validation). It cross-references each vehicle's source row back to its transporter automatically. Anything with a real candidate suggestion is left alone and printed separately — that's a genuine "is this the same company, misspelled" judgment call I'm not making for you.
- **`scripts/post-transport-cost-batch.ts`** — Phase O3 posting. No frontend button exists for this (only a raw API route, `POST /api/transport-cost/postings/batch`). This calls the same service that route does. It needs a real `TenantContext`, not the O1 import's `systemWriteScope` shortcut — built via `tenantContextService.resolveContext(...)` (the exact function every controller uses) with your real `tbladmin.Role` mapped through the exact same `resolveRole` function a real login uses. That function was module-private; I exported it (`lib/authOptions.ts`, one-word change, doc comment explains why, zero behavior change to login) rather than write a second copy of the legacy-role mapping table that could drift from the real one. Safe to re-run — posting is idempotent and a still-pending row just comes back `skipped` with a reason, never an error.

Both scripts' full import chains were smoke-tested (all modules resolve, `bootstrapCqrs`/`resolveRole`/`tenantContextService` all reachable) against a deliberately unreachable database, since this sandbox has no real MongoDB — they fail at the connection step exactly as expected, past every other bug class already found and fixed. `tsc --noEmit` and `eslint` both clean.

## New — read-only diagnostic for the 3rd Party import's "0 succeeded, 102 duplicates" result

Your real 3rd Party import reported 0 succeeded / 102 duplicates / 7 failed out of 109 rows. I independently re-parsed your real uploaded workbook outside the app and found 85 of those 109 rows have a genuinely unique (registration, date, amount) combination within the sheet itself — so a first-ever import against an empty collection should have produced roughly 85-90 succeeded, not 0. That gap needs a real answer before this is shown to Olivine as "the data's in." **`scripts/diagnose-transport-cost-duplicates.ts`** — strictly read-only (count + sample reads through the same repository every other read in this codebase uses, no writes) — answers it directly: how many 3rd Party source records actually exist for this tenant right now, and when/how they got there. See my reply for what to run and why.

## Real bug found and fixed while you were actually running this — command bus never bootstrapped in a standalone script

You ran the import script for real and it failed on every sheet: `[CommandBus] No handler registered for command "ImportTransportCostCommand"`. Root cause, confirmed by direct testing, not guessed: `commandBus`/`queryBus` (the in-process CQRS router every write and the review queue's reads go through) start with zero handlers registered. Registration only happens via `bootstrapCqrs()`, which normally runs once, automatically, from `instrumentation.ts` when the Next.js server boots. A standalone `npx tsx some-script.ts` process never goes through `instrumentation.ts`, so it never runs — this codebase already hit and documented this exact failure mode once before, for the separate worker process (`workers/bootstrap.ts`'s own header comment explains it and fixes it the same way I did here).

Two files needed the same one-line fix — both call `bootstrapCqrs()` explicitly, right after `connectToDatabase()` and before any command/query dispatch:

- **`scripts/import-transport-cost-source-file.ts`** (new this pass, see below) — fixed before you ever saw it work, since your run surfaced it live.
- **`scripts/review-normalization-queue.ts`** (pre-existing script, already in your repo, not written by me) — has the **identical** gap: `list`, `confirm-match`, `confirm-new`, and `reject` all dispatch through the same unbootstrapped bus, so every subcommand would have failed the exact same way the moment you tried to work the review queue this import creates. Found by inspection once the first script's failure pointed at the real cause, confirmed the script has zero `bootstrapCqrs` import anywhere. Fixed the same way, so your very next step (working the review queue) isn't blocked by a second copy of the same bug.

Verified, not just type-checked: I isolated `bootstrapCqrs()` in a standalone script and confirmed it registers `ImportTransportCostCommand` with zero database or Redis connection required (it only needs your two JWT secrets to be set — which your real `.env` already has, since your app runs). Then re-ran the real import script against your actual uploaded workbook; it got past the command-bus error entirely and failed only at `connectToDatabase()` against a deliberately unreachable database I pointed it at for this test — the correct, expected failure in a sandbox with no real MongoDB. `tsc --noEmit` and `eslint` both clean on both files after the fix.

**Re-run the exact same command you already ran** — nothing about the command line changes, only the script's own internals:

```
npx tsx scripts/import-transport-cost-source-file.ts --org olivine-group-b606e3 --file "..\TRANSPORT COST JANUARY 2026.xlsx" --user-email owner@olivine.test
```

## New this pass — real import script for your actual January 2026 workbook

You uploaded the real `TRANSPORT COST JANUARY 2026.xlsx` and asked how to import it. Full detail, including an important scope caveat about what this workbook actually contains, is in **`OLIVINE_JANUARY_2026_IMPORT.md`** — read that before running anything. Summary:

- **`scripts/import-transport-cost-source-file.ts`** — new CLI script, `--org`/`--file`/`--user-email`/`--dry-run` flags, same conventions as the existing `scripts/review-normalization-queue.ts`. Parses the three January sheets that exist in the real file (`JAN-26 3rd Party`, `JAN-26 Vansales`, `JAN-26 Swift` — no January Depot STO sheet exists) using column positions I verified directly against your uploaded file with SheetJS (the same library the app's own upload path uses), then calls the real `transportCostCommandService.importTransportCost()` against a live database — not a fake/in-memory one. A dry run against your actual uploaded file (parse-only, no writes) reported 109/46/281 rows respectively; see the new guide for the full verification table.
- Uses `systemWriteScope(tenantId, reason)` rather than fabricating a fake logged-in user's `TenantContext` — this is the codebase's own documented path for a script/bulk-import write with no real session behind it (`server/tenancy/write-scope.ts`'s own header comment names "a bulk import" as the exact case this exists for). `--user-email` still resolves a real `tbladmin` account so the row-level audit trail points at a real person, independent of write-scope kind.
- Imports **Phase O1 only** (source records) — does not touch the normalization-review queue and does not post to the Allocation Ledger, same boundary every other import path in this codebase respects.
- Deliberately does **not** cover February–August or the Olivine/Hypery stream split the same workbook also contains — those months' column layouts haven't been individually verified, and `DEPOT_STO_DECISION.md` already documents that this workbook's own column layouts drift by month. Extending this script to another month is a "verify its real columns first" job, not a "assume it matches January" one.

## Carried over from the previous pass (already confirmed working against your real database)

- `frontend/shared/ui/navigation/nav.config.ts` — the Transport Cost sidebar entry (Cost & Finance → Transport Cost → Import Data).
- `infrastructure/database/indexes.ts` — wired `TRANSPORT_COST_INDEXES` into the merged `INDEXES` export; `ensureIndexes()` now actually creates the five transport-cost collections' indexes, including the per-row duplicate-check index.

## New this pass — manual (no-Excel) data entry

You asked whether Olivine can enter data directly without a spreadsheet. There was no such path: every write endpoint under `/api/transport-cost/import/*` required a `rows` array, and the only UI was file upload. Built the missing piece, reusing the existing pipeline rather than adding a new one:

- **`frontend/shared/import/ImportModal.tsx`** — one-line change: exported the existing `coerceValue` helper (was module-private) so the new manual-entry form parses a typed-in value with the exact same rules a parsed spreadsheet cell gets. No behavior change to the existing file-upload flow.
- **`frontend/shared/import/ManualEntryModal.tsx`** — new, generic component: renders a form from the same `ImportColumnDef[]` arrays the import modals already define (so the two paths can never drift out of sync on what fields exist), and on submit calls the *same* `onImport(records, fileName)` contract as a one-row batch. This was a deliberate design choice, not the easy option: I verified the backend controller (`TransportCostController.handleImport`) rejects `rows.length === 0` but not `rows.length === 1`, and the handler's row loop has zero assumptions about batch size — so a manually typed row goes through the identical validation, the identical duplicate check, and the identical Phase O2 normalization-review queue a spreadsheet row would. It is not possible to use this form to create a transporter or contracted vehicle directly, bypassing review — that's the one architectural rule this codebase is explicit about (`OLIVINE_DATA_IMPORT_GUIDE.md` §0), and this feature does not cross it. Net result: **zero new backend code, zero new API surface** — this is purely the missing frontend affordance.
- **`frontend/modules/transport-cost/pages/TransportCostImportPage.tsx`** — added an "Enter manually" button beside each of the four family import buttons, wired to the existing `handleThirdPartyImport`/`handleVansalesImport`/`handleSwiftImport`/`handleDepotStoImport` handlers already on this page (unchanged) and the existing `handleImportComplete` (unchanged, so the duplicate-count toast and table refresh behave identically to a file import). Vansales manual entry is gated on the same period-month picker as Vansales file import, for the same reason (Option A periodization — never inferred).

**Not covered by this codebase's own test suite, honestly**: this project's jest runs `testEnvironment: 'node'` with no jsdom (see `nav.config.ts`'s own header comment — "nothing that renders can be covered"), so no page/component here has a rendering test, matching every other frontend page in this codebase. Verified by `tsc --noEmit` (type-correctness, including the new component's props against `ImportModal`'s exported types) and `eslint` (zero new violations) instead — the same verification bar this codebase's own frontend files are held to elsewhere.

## Found but not fixed — a separate, pre-existing gap (unchanged from last pass)

`tests/security/finance-indexes.spec.ts` still has its one pre-existing failure: `tblallocationledger` is missing a `{tenantId, costCategory, periodStart}` index a Command Centre aggregation needs. That aggregation is tracked as "Not started" in your `COMMAND_CENTRE_PROGRESS.md`, so still deliberately not touched.

## Resolved, confirmed by you, not something I could check myself

`OLIVINE_STATUS_AND_LOGIN_FIX.md`'s tenantId bug — you confirmed `owner@olivine.test` logs in scoped to `olivine-group-b606e3`. The `no-committed-secrets.spec.ts` failure on your machine was a false positive (the test walks the raw filesystem rather than `git ls-files`, so it fails for anyone with a working local `.env` — confirmed not tracked/committed via `git ls-files`/`git log --all -- .env`, both empty). Its filesystem-walk-vs-git-tracking gap is still there if you want it fixed; said I wouldn't touch a security test's semantics without your sign-off, and that offer stands.
