# Fleet — scope assignment repair

5 files.

## SECURITY: rotate your database password
A working Atlas connection string with credentials was pasted into the chat.
Treat it as compromised and rotate it. I did not use it.

## Run order
```
npm run tenancy:repair-scopes                  # dry run — shows every decision
npm run tenancy:repair-scopes -- --confirm
npm run tenancy:sync-members                   # verify
```
Optional, after reviewing the dry run:
- `--delete-unfixable`  removes accounts with no unit recorded anywhere
- `--distribute`        spreads vehicles across fleets/workshops (see below)

## Corrections to your task list

**`workshop.manager@` and `mechanic@` already HAVE assignments.** The trace shows
both resolving to `Harare Central Workshop (+1 descendants)`. They see zero rows
because no data lives in that unit — not because the assignment is missing.
Inserting a second one would have created duplicates.

**13 accounts lack assignments, not 21.** From the trace: `harare.dispatcher`,
`harare.accountant`, `harare.mechanic`, `harare.driver`, `harare.auditor`,
`bulawayo.dispatcher`, `bulawayo.mechanic`, `bulawayo.viewer`, `fleetmanager`,
plus the four you asked to leave fail-closed.

**Your task 3 cannot succeed as written.** You asked that every repaired account
show non-zero vehicles. The trace proves all 76 vehicles, 1409 fuel logs, 282
expenses, 1 trip and 5 reminders sit on **one** unit (Harare Heavy Fleet), and all
77 drivers on **Logistics Department**. So `harare.mechanic` → Main Workshop and
`bulawayo.mechanic` → Regional Workshop will correctly resolve and still show 0.
That is right, not broken. Use `--distribute` if you want the demo to show
differentiated data.

## Design note
The repair derives each unit from `tblorganizations.members[].orgUnitId`, which the
earlier seed already wrote correctly — not from a hardcoded email→ObjectId table.
A hardcoded table would bake today's ObjectIds into source, go stale on the next
re-seed, and write wrong assignments rather than failing.

`stanley@gmail.com` and `aryes@gmail.com` point at the legacy `HARARE` branch, which
has no children listing it in their `path`, so it expands to +0 and matches nothing.
Both are remapped onto the real Harare Branch.

## Provisioning fix
`tenancy-provision.ts` pushed member records without `orgUnitId`. The two scope
stores each had a mirror-image bug: the earlier seed wrote `members[].orgUnitId`
with no assignment (users saw nothing), provisioning wrote the assignment with no
roster entry (roster showed them unassigned). Both stores are now written.

## Verification
`npm run test:security` **169/169** (5 new, pinning store consistency) ·
`npx tsc --noEmit` **83** (baseline 83, zero introduced).
