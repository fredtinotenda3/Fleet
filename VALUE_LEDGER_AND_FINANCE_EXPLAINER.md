# Finance, the Allocation Ledger and the Value Ledger

What the numbers mean, where they come from, and what they still cannot
tell you.

---

## 1. Two ledgers, two questions

| Ledger | Question it answers |
|---|---|
| **Allocation ledger** (`tblallocationledger`) | *What did this vehicle cost?* |
| **Value ledger** (`tblvalueledger`) | *What did acting on a recommendation save?* |

Both are **append-only**. A wrong entry is corrected by a **reversing
entry**, never by an edit. That is not ceremony: it is what makes the
ledger reconcilable against a general ledger, and it is why posting
idempotency is enforced by a database constraint rather than by a
read-then-write.

---

## 2. The allocation ledger

### What posts into it, and when

| Event | Source | Cost category |
|---|---|---|
| `ExpenseCreated` | `tblexpenses` | `expense` |
| `FuelLogged` | `tblfuellogs` | `fuel` |
| `ReminderCompleted` | `tblreminders` | `maintenance` (estimate) |
| `WorkOrderCompleted` | `tblworkorders` | `maintenance` (parts) + `other` (labour) |

Posting happens on a **domain event**, not inline in the write path, for
three reasons: a ledger rejection must never fail the operational save;
the outbox gives the posting durable at-least-once retry; and expenses
should not import finance.

> **This was broken until recently.** The event map was keyed on
> `FuelLogCreated` and `MaintenanceCompleted` — **neither is an event**
> (the real names are `FuelLogged` and `ReminderCompleted`). So the
> ledger received **expenses only**. Fuel, the largest operating cost in
> almost any fleet, never posted. `getCostPerKm` divided a real distance
> by a total missing most of its numerator and returned a number that
> looked like an answer.
>
> If you have historical data from before this fix, **the ledger is
> incomplete for fuel and maintenance** and cost-per-km for those periods
> understates reality. Re-posting historical records is not automatic —
> see §7.

### Idempotency

```
idempotencyKey = sha256(tenantId ␀ sourceCollection ␀ sourceId ␀ costCategory)
```

Deterministic, so the same record computes the same key in every process
after any restart. Enforced by a **partial unique index** on
`idempotencyKey` — the read-before-write is the cheap common path, the
index is what makes it correct when two handlers race.

`costCategory` is in the key because one source record can legitimately
produce several postings. A completed work order is **two** costs —
parts (inventory consumption) and labour (time) — which finance accounts
for separately and which `totalCost` alone makes unrecoverable. The
handler posts the total **only** when neither component is present;
posting both would double-count, and on an append-only ledger that needs
a human reversal to undo.

### The period is the record's date

A posting's `periodStart`/`periodEnd` come from the **source record's own
date**, not from when the handler ran.

> This was also broken: the handler read `payload.date` and fell back to
> `new Date()`, and no event carried a date. So a fuel log entered today
> for last month's refuel posted into **this** month. On an append-only
> ledger a cost in the wrong period cannot be edited out. The events now
> carry their record's date, and a source with **no** date is **refused**
> rather than dated to now — a refusal is visible today; a
> misdated posting surfaces months later during reconciliation.

### Currency

- A source record's `currency` travels with the amount.
- Absent `currency` means the tenant's **reporting currency** — the only
  safe default, since that is what every pre-existing record implicitly
  is.
- A foreign currency with **no FX rate** is **refused**, never converted
  at 1:1. Treating ZWL as USD at parity does not produce a slightly wrong
  cost-per-km; it produces one wrong by three orders of magnitude, in a
  number someone will act on.
- Mixed reporting currencies **refuse to total** and return
  `mixedReportingCurrencies`.

### Org unit

Derived from the resolved **vehicle**, never from the request. The
handler has no field in which to express an org unit, which is
deliberate: a caller who could stamp their own scope onto a posting could
attribute another branch's spend to themselves.

---

## 3. Cost per km

```
costPerKm = allocated cost in reporting currency ÷ distance
```

**Distance comes from trips**, and only from trips where
`distance_km_known === true`. A trip whose distance could not be
established stores `distance_calculated: 0` with that flag set to false;
averaging it in would drag the figure toward zero.

`costPerKm` is **`null` at zero distance, never `0`**. Zero cost per
kilometre is a claim; "we cannot compute this" is not the same claim.

### What makes it right

1. Vehicles have org units (everything inherits from them).
2. Trips exist — entered, imported, **or generated from telemetry**.
3. Trips carry a real distance (odometer readings on fuel logs, or GPS).
4. Costs post into the ledger (§2).

Miss any one and the figure is either `null` or understated.

---

## 4. Depreciation

`tbldepreciationprofiles` holds per-vehicle **policy** — method,
currency, acquisition cost and date, salvage value. Profiles are mutable
policy, but material fields freeze once charges have posted against them.

Charges post with a deterministic `sourceId`, so a re-run is idempotent.
A **zero charge is not posted** (200, not 201) rather than writing a
zero-value row.

---

## 5. GL reconciliation

`tblglsubmissions` records what the customer's general ledger says for a
period. The report compares it against the platform's own totals:

- `totalVariance = totalPlatform − totalGL` (**not** the sum of line
  variances — those can cancel).
- `variancePct` is **`null`**, not `Infinity`, when the GL total is 0.
- An unsubmitted account is `matched: false` with `glTotal: null`, and is
  **never omitted** — a missing account silently dropped from a
  reconciliation is the failure this shape exists to prevent.
- GL figures must be in the **reporting** currency.

Both sides use *fully-contained* period semantics so they agree.

---

## 6. The value ledger

Where the allocation ledger records what things **cost**, the value
ledger records what acting on the platform's advice **saved**.

An attention item can be **resolved** with a stated outcome, and that
outcome posts to the value ledger. Two deliberate constraints:

- **Resolve is a dialog, not one-click.** Auto-posting the platform's
  *modelled estimate* as the confirmed outcome would put fabricated
  numbers into something someone reconciles.
- **Evidence is persisted on the attention item** — capped at 20
  references, deterministic order, and a row with no usable `_id`
  contributes nothing. "Why did the platform raise this?" must be
  answerable after the fact, not only from a live feed.

### ROI

ROI is `value ÷ cost` over the same period, in the reporting currency.
It is only as good as the outcomes a human confirmed. **There is no
revenue model in this platform** — nothing knows what a delivery earns —
so "profitability" is an extension point, not a computed figure.

---

## 7. Operator notes

### After deploying the posting fix

New fuel, maintenance and work-order records post automatically. **Historical
records do not re-post**, because replaying them would require re-emitting
their creation events, and the outbox is not a replay log.

If you need historical cost-per-km to be correct, the options are:

1. Accept that periods before the fix understate cost (and say so on the
   report), or
2. Write a one-off backfill that posts historical records through
   `allocationPostingService.postSource` — safe to run repeatedly, because
   the idempotency key means anything already posted is a no-op.

Option 2 is not shipped, deliberately: what counts as "historical" and
which periods are already closed in the customer's own GL is a finance
decision, not an engineering one.

### Checks before trusting a cost report

```bash
npm run tenancy:backfill            # dry run — are rows missing orgUnitId?
npm run db:indexes                  # the partial unique index must exist
```

Then confirm:

- trips exist for the period, and `distance_km_known` is true on them;
- fuel logs carry a real `odometer` (not `0`);
- the reporting currency is set on the organization;
- FX rates exist for any foreign-currency transactions.

### Reading a figure that looks wrong

| Symptom | Likely cause |
|---|---|
| cost/km is `null` | no trip distance in the period |
| cost/km looks too low | ledger missing fuel — check the posting fix is deployed |
| a cost is in the wrong month | pre-fix posting dated to run time |
| totals refuse to sum | mixed reporting currencies |
| a branch sees no costs | rows missing `orgUnitId` — run the backfill |
