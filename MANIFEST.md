# Fleet — tenancy rebuild (run this, then you're done)

4 files.

## SECURITY — do this first
Your Atlas connection string with credentials has now been pasted into a chat log
twice. Rotate that password. I have never used it.

## Run
```
npm run tenancy:rebuild                # dry run — prints the whole plan
npm run tenancy:rebuild -- --confirm   # apply
npm run tenancy:sync-members           # verify
```
Windows note: use plain `--`. A pasted em-dash (`—`) makes npm reject the argument.

## You did not fail. Here is what was actually left.

The repair scripts worked — every account now resolves to the right org unit. Your
last trace proves that. What it also proves is that **the data has nothing to
isolate**: all 76 vehicles, 1409 fuel logs, 282 expenses and 5 reminders sit on ONE
unit (Harare Heavy Fleet) and all 77 drivers on ONE other (Logistics Department).

So `fleet.manager` — your narrowest scope — saw 76/76 vehicles, identical to
`harare.manager`. Bulawayo and the workshops correctly saw nothing. Isolation was
enforced perfectly and was impossible to observe. No further controller wiring
would have changed that.

Separately: three seed runs left 17 org units, including a duplicate `HARARE`
branch alongside `Harare Branch`, with `path` arrays that omitted ancestors — the
root cause of branches expanding to +0 descendants.

## What the rebuild does (idempotent, dry-run default)

1. **Tree** — canonical hierarchy with correct `parentId` / `path` / `depth`.
   Adopts existing units by name; repairs their paths instead of duplicating.
2. **Prune** — soft-deletes the 6 stray units, first migrating any rows or
   assignments pointing at them to Harare Branch so nothing is orphaned.
3. **Data** — spreads vehicles and drivers across leaf units by weight, with fuel,
   expense, trip and reminder rows following their vehicle by plate. Deterministic,
   so a re-run reproduces the same layout.
4. **Access** — rebuilds assignments AND the members roster from one table, so the
   two stores can no longer disagree (each previous seed wrote only one of them).

## Resulting demo — 76 vehicles

| Account | Scope | Vehicles |
|---|---|---|
| `owner@` / `admin@` | organization | **76** |
| `accountant@` / `auditor@` | both branches | **76** |
| `harare.manager@` | Harare Branch | **56** |
| `logistics.manager@` | Logistics Dept | **50** |
| `fleet.manager@` / `driver@` | Harare Heavy Fleet | **30** |
| `harare.driver@` / `fleetmanager@` | Harare Light Fleet | **20** |
| `bulawayo.manager@` | Bulawayo Branch | **20** |
| `workshop.manager@` / `mechanic@` | Harare Central Workshop | **6** |
| `bulawayo.mechanic@` | Bulawayo Workshop | **4** |
| `unassigned@` | none | **0** — fail-closed control |

76 → 56 → 50 → 30 → 6 is the hierarchy made visible. Harare and Bulawayo are
disjoint. That is a demo of isolation rather than an assertion of it.

Password for all `@willsgrove.test` accounts: whatever you last set via
`npm run auth:doctor -- --reset-all --password '...' --confirm`.

## Verification
`npm run test:security` **169/169** · `npx tsc --noEmit` **83** (baseline 83).

## Still open (unchanged)
AI services contained not scoped; exports / report builder / global search
unaudited; drivers create doesn't stamp `orgUnitId`.
