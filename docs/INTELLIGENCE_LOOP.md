# The Intelligence Loop

```
detection ──► AttentionItem ──► dispatch ──► RuleActionRegistry ──► work order /
   (AI)         (+evidence)      (idempotent)                        maintenance /
                                                                     workflow
                                                                         │
transaction ──► event ──► AllocationPostingHandler ──► ledger            │
  (expense/fuel)          (idempotent, fail-closed FX)   │               │
                                                          ▼              ▼
                                                    cost-per-km    human resolves
                                                                         │
                                                                    ValueLedgerEntry
                                                                  (modelled vs realised)
```

---

## 1. Attention items dispatch actions

**Was:** `attention-resolution.service.ts` wrote a `ValueLedgerEntry` on
human resolution and nothing else. No attention item created a work
order, raised a purchase request, scheduled maintenance, or started a
workflow. The platform could say a vehicle needed attention and record
what fixing it was worth — the doing was a human retyping it into
another screen.

**Now:** `attention-dispatch.service.ts` decides which action an item
warrants and hands it to **`RuleActionRegistry`**. It executes nothing
itself — the registry is already the platform's action seam, and the
audit was explicit that no third engine may be added. The registry's own
doc comment anticipated this ("lets Phase 5 grow new action types later,
e.g. `create_work_order`").

| Source | Action | Why |
|---|---|---|
| `predictive_maintenance` | `schedule_maintenance` | A predicted service is a task |
| `maintenance` | `create_work_order` | An overdue service is a job |
| `compliance` | `start_workflow` | Gates operation; needs a documented approval trail |
| `fuel_fraud`, `expense_anomaly` | `start_workflow` | Money needs investigation and sign-off first |
| `fleet_health` | **none** | Multi-vehicle recommendation, no single owning entity |
| `driver_risk` | **none** | See below |

`driver_risk` is deliberately excluded. A risk score about a **person**
is not a maintenance job, and auto-raising anything against an employee
on a model's say-so is a decision that needs a human at the *front* of
it, not the end.

### It never approves anything

Dispatch creates work and starts approval chains. It never approves,
rejects or completes. An intelligence system that could auto-approve its
own recommendations is one where a scoring bug becomes a spend — and the
value ledger's whole premise (modelled vs **realised**, confirmed by a
person) depends on a person being in the loop.

### Idempotency

`sha256(tenantId ␀ attentionItemKey ␀ actionType ␀ targetEntityId)`,
backed by a unique index.

Attention items are re-upserted on every refresh cycle. Without a key,
one flagged vehicle accumulates a new work order **every cycle** — a
queue of duplicate jobs that looks like a far bigger problem than the one
actually detected.

**The record is written BEFORE the action executes.** Deliberate: if the
action ran first and the record failed, a redelivery would run the action
again — a second work order. This way the worst case is a dispatch record
with no action behind it, which is visible and repairable.

An unregistered action type is **refused before recording**, so a
dispatch record can never claim work was created when nothing was.

---

## 2. Transactions auto-post into the allocation ledger

**Was:** the ledger was complete, correct, indexed, append-only and
tested — and read an empty collection. A repo-wide grep found no caller
from fuel, expenses, maintenance or work orders. `getCostPerKm` divided a
real distance by a total of zero and returned a number that looked like
an answer.

**Now:** `AllocationPostingHandler` subscribes to `ExpenseCreated`,
`FuelLogCreated`, `MaintenanceCompleted` and `WorkOrderCompleted`, and
`allocation-posting.service.ts` posts them.

### Why a subscriber, not a call inside each service

1. **It must not fail the write.** An expense that saves but does not
   post is a recoverable accounting gap. An expense that *fails to save*
   because the ledger rejected it is lost operational data.
2. **Phase 3 already gives it durability.** Under outbox mode the event
   is persisted before dispatch, so a failed posting is retried with
   backoff and dead-lettered — exactly the guarantee a financial posting
   needs, and exactly what an inline call would not have.
3. **It keeps finance out of the operational modules.** Expenses should
   not import the ledger.

Which events move money is an **explicit map**, not a naming convention —
a convention would silently start posting the moment somebody named a new
event `SomethingCreated`.

### Idempotency

`sha256(tenantId ␀ sourceCollection ␀ sourceId ␀ costCategory)`, backed
by a **partial** unique index (manual postings carry no key and may
legitimately repeat).

`costCategory` is in the key because one source record can produce
several postings — a work order carrying parts **and** labour is two
costs, and without it they would collapse into each other and half the
money would vanish.

This matters more than elsewhere: the ledger is **append-only**, so a
double posting cannot be edited away. The only remedy is a reversing
posting, which requires a human to first notice a number that looks
plausible.

### Refusals are structured, not thrown

A bad record returns `{status: 'refused'}`; a Mongo outage rethrows. A
validation failure will fail identically on every retry, so throwing
would send it round the outbox retry loop to the dead-letter queue for a
reason retrying cannot fix.

---

## 3. Multi-currency is real

**Was:** `AllocationPosting` modelled `currency`, `fxRate`, `fxRateDate`,
`fxSource` and `reportingAmount` correctly, and the ledger already
refused to total across currencies. But the **transactions feeding it
carried no currency**, so every posting was implicitly the reporting
currency — a ZWL expense and a USD expense of the same magnitude became
the same cost.

**Now:** `Expense` gains `currency?` (`FuelLog` already had it), and the
posting service resolves it.

### Fail closed

`fx-conversion.utils.ts` already returned `null` rather than guessing a
rate — good code that was already there. The posting service propagates
that as a **refusal**:

```
No exchange rate available for ZWL -> USD. Supply an fxRate on the source
record or set one manually; the platform has no live FX feed and will not
assume parity.
```

A 1:1 fallback is not an approximation. It silently asserts that 400 ZWL
and 400 USD are the same cost, in a number an operator acts on.

**Absent currency means the tenant's reporting currency.** That is the
only safe default: it is what every pre-Phase-6 record implicitly is, so
assuming anything else would retroactively misstate the entire history.

No live FX provider was added — none exists, and the brief said not to
add one. Rates are supplied on the source record or set manually.

---

## 4. Shared confidence and evidence

### What the audit said, and what is actually true

The audit recorded that `AIPrediction` used a confidence **enum** while
`AIResult` used a number. **That is no longer the case** —
`AIConfidence` is already `type AIConfidence = number` (0–1) and
`AIResult.confidence` is already `number`. They agree, and did before
this phase.

Recorded rather than "fixed" with a no-op change: a phase that claims to
have unified something already unified is a phase whose report cannot be
trusted on the things it *did* do. There is a test asserting the current
state so a future reader does not re-open a closed finding.

### What was genuinely missing: evidence

Every AI service produced a confidence number and none recorded what the
number rested on. A bare `confidence: 0.83` is unfalsifiable — an
operator cannot check it, a reviewer cannot audit it, and a scorer bug is
indistinguishable from a genuine finding until somebody acts on it.

That matters *now* because Phase 6 connects intelligence to actions.
"Why did the platform raise this work order?" stops being a debugging
nicety and becomes the first question after any disputed spend.

```ts
buildConfidence({
  confidence: 0.83,
  evidence: [
    { source: 'tblexpenses', reference: 'exp-1', value: 400 },
    { source: 'telemetry-rollup', reference: '2026-08-20' },
  ],
  explanation: 'Spend is 4x the 90-day median for this vehicle.',
  what: 'expense anomaly',
});
```

- **`reference` points at stored data**, not prose. A reader must be able
  to fetch it; a sentence cannot be re-checked after the fact.
- **`explanation` is separate**, so the two are never conflated.
- **Empty evidence throws.** A low confidence *with* evidence is fine —
  "we are not confident" is a legitimate output. "We are confident, for
  reasons we did not record" is not.
- Out-of-range confidence is **clamped** (a rounding artefact should not
  kill a batch); a **NaN is refused** (that means the computation failed).

This generalises the rule `ValueLedgerEntry` already enforced with its
required `evidenceRefs`.

---

## 5. The value ledger loop

`LedgerEligibleSource` widened from `{fuel_fraud, expense_anomaly}` to
include `maintenance` and `predictive_maintenance` — because Phase 6 lets
those items dispatch an action, and a **completed work order carries a
real, sourced cost**. That is a monetary outcome.

Still excluded, and why:

| Source | Why not |
|---|---|
| `fleet_health` | No single owning entity, no attributable amount |
| `driver_risk` | No honest way to price "this driver became less risky" |
| `compliance` | A fine avoided is a **counterfactual**, not a measurement |

**Never fabricate a zero.** A source with no determinable amount produces
**no entry**, rather than one claiming savings of nothing — which would
be indistinguishable from a genuine break-even in every aggregate
downstream.

Evidence remains required and non-empty. Phase 6 widened *which* sources
qualify; it did not relax *what* qualifies.

---

## Migration

`npm run db:indexes` creates:

| Index | Purpose |
|---|---|
| `uniq_allocationledger_tenant_idempotency` (**partial unique**) | Stops double-posting under at-least-once delivery |
| `uniq_attention_dispatch_tenant_idempotency` (**unique**) | Stops duplicate work orders per refresh cycle |
| `idx_attention_dispatch_tenant_item` | "What has this item already caused?" |
| `idx_attention_dispatch_tenant_unit` | Org-unit scoped listing |

**No backfill.** Existing ledger postings carry no `idempotencyKey` and
are exempted by the partial index. Historical transactions are **not**
retro-posted: doing so would require deciding an FX rate for every past
foreign-currency record, and guessing one is exactly what this phase
refuses to do. Auto-posting applies from deployment forward; use the
existing manual posting path for anything historical that matters.
