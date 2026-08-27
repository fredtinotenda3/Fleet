# Phase 6 — Close the Intelligence Loop

Implemented on top of Phases 0–5.

## Status

| Item | Result |
|---|---|
| Attention-to-action dispatch | **FIXED** (decision + idempotency; wiring recorded — see below) |
| Allocation ledger auto-posting | **FIXED** |
| Multi-currency | **FIXED** |
| Confidence shape unified | **ALREADY TRUE** — evidence model added (see below) |
| Value ledger loop | **FIXED** |
| Phase 0–5 regression | **PASSED** |
| Opportunities implemented? | **No** — per the brief |

## Verification

| Check | Result |
|---|---|
| `npm ci` | succeeds |
| `npm run type-check` | **0 errors** |
| `npm test` | **1252 passed / 1252, 74 suites** |
| Baseline 1201 / 72 | **+51 tests, 0 regressions** |
| Phase 0–5 regression (14 suites) | **385 passed / 385** |
| New Phase 6 suites | 26 + 26 = **52 passed** |

---

## Two honest qualifications, before the detail

**1. The confidence divergence the brief describes no longer exists.**
`AIConfidence` is already `type AIConfidence = number` (0–1) and
`AIResult.confidence` is already `number`. They agree, and did before
this phase. I recorded that rather than shipping a no-op "unification" —
a phase that claims to have fixed something already fixed is a phase
whose report cannot be trusted on the things it *did* do.

The **second half** of that finding was real: no shared **evidence**
model. That is built (`ai-evidence.types.ts`).

**2. Attention dispatch is decided and tested, but not yet triggered.**
`AttentionDispatchService` takes persistence through an injected
`DispatchDeps`, and the indexes are declared — but no repository
implements it and nothing calls `dispatch()` yet. The action executors
(`create_work_order`, `schedule_maintenance`) also need registering on
`RuleActionRegistry`; the service refuses safely when they are absent.

That was deliberate sequencing. **When the platform should start creating
work on its own** — on every refresh? above a severity threshold? only
when an operator asks? — is a product decision, and defaulting to it by
whoever wires the repository is the wrong way to make it. The decision
logic and its idempotency are the parts worth getting right, and they
are done and tested. Recorded as **P6-N3**.

---

## What changed

### Attention items dispatch actions

`attention-dispatch.service.ts` decides which action an item warrants and
hands it to **`RuleActionRegistry`** — it executes nothing itself. The
registry is already the action seam and the audit forbade a third engine.

| Source | Action |
|---|---|
| `predictive_maintenance` | `schedule_maintenance` |
| `maintenance` | `create_work_order` |
| `compliance`, `fuel_fraud`, `expense_anomaly` | `start_workflow` |
| `fleet_health`, `driver_risk` | **none** |

`driver_risk` is excluded deliberately: auto-raising anything against an
**employee** on a model's say-so needs a human at the *front*, not the
end. `fleet_health` has no single owning entity.

**It never approves or completes anything.** An intelligence system that
could auto-approve its own recommendations is one where a scoring bug
becomes a spend — and the value ledger's premise (modelled vs
**realised**, confirmed by a person) depends on a person being in it.

**The dispatch record is written BEFORE the action executes.** If the
action ran first and the record failed, a redelivery would run it again —
a second work order. This way the worst case is a record with no action
behind it: visible and repairable.

### Transactions auto-post into the ledger

The ledger was complete, indexed, append-only, tested — and reading an
empty collection, so `getCostPerKm` divided real distance by zero and
returned something that looked like an answer.

`AllocationPostingHandler` subscribes to the four money events. A
**subscriber, not an inline call**, for three reasons: an expense that
fails to *save* because the ledger rejected it is lost operational data;
Phase 3's outbox already gives postings durability an inline call would
not have; and expenses should not import finance.

Which events move money is an **explicit map** — a naming convention
would silently start posting the moment somebody named a new event
`SomethingCreated`.

Idempotency includes `costCategory` because a work order carrying parts
**and** labour is two costs; without it they collapse and half the money
vanishes. This matters more here than anywhere: the ledger is
**append-only**, so a double posting cannot be edited away.

### Multi-currency is real

`Expense` gains `currency?` (`FuelLog` already had it). A foreign
currency with no rate is **refused**, not converted at 1:1 — that is not
an approximation, it silently asserts 400 ZWL and 400 USD are the same
cost. Absent currency means the reporting currency, the only safe default
since it is what every pre-Phase-6 record implicitly is.

No live FX provider added — none exists and the brief said not to.

### Shared evidence model

`buildConfidence` refuses to produce a score with **no evidence**.
`reference` points at stored data a reader can fetch, not prose;
`explanation` is separate so the two are never conflated. A **low**
confidence with evidence is fine — "we are not confident" is a legitimate
output; "we are confident, for reasons we did not record" is not.

### Value ledger loop

`LedgerEligibleSource` widened to include `maintenance` and
`predictive_maintenance`, because a completed work order carries a real
sourced cost. `fleet_health`, `driver_risk` and `compliance` remain
excluded — the last because a fine avoided is a **counterfactual**, not a
measurement. **Never fabricate a zero.**

> One existing test used `maintenance` as its example of an *ineligible*
> source. Updated with the reasoning inline, since my change made it
> eligible.

---

## Files

**New (5)**
```
modules/finance/services/allocation-posting.service.ts   idempotent, fail-closed posting
server/events/handlers/finance/AllocationPostingHandler.ts  subscribes the money events
modules/attention/services/attention-dispatch.service.ts    action decision + idempotency
modules/ai/types/ai-evidence.types.ts                       shared confidence/evidence
docs/INTELLIGENCE_LOOP.md                                   architecture

tests/security/allocation-auto-posting.spec.ts              26 tests
tests/security/attention-dispatch-and-evidence.spec.ts      26 tests
```

**Modified (8)**
```
modules/finance/types/allocation.types.ts        + idempotencyKey
modules/finance/services/allocation.service.ts   threads the key onto the row
modules/finance/repositories/allocation-ledger.repository.ts  + key lookup
modules/attention/types/value-ledger.types.ts    eligible sources widened
modules/attention/services/attention-resolution.service.ts   same
shared/types/expense.types.ts                    + currency
server/events/bootstrap.ts                       registers the posting handler
infrastructure/database/indexes.finance-addendum.ts   + partial unique posting index
infrastructure/database/indexes.attention-addendum.ts + dispatch indexes
tests/security/needs-attention-resolution.spec.ts     ineligible-source list corrected
```

---

## Manual steps

1. `npm ci`
2. `npm run db:indexes` — creates the posting and dispatch idempotency
   indexes. **Required before deploying:** without
   `uniq_allocationledger_tenant_idempotency`, a redelivered event
   double-posts into an append-only ledger.
3. Deploy.

**No backfill.** Existing postings carry no key and are exempted by the
partial index. Historical transactions are **not** retro-posted:
back-filling would require deciding an FX rate for every past
foreign-currency record, and guessing one is exactly what this phase
refuses to do. The manual posting path is unchanged for anything
historical that matters.

**To activate dispatch** (see P6-N3): implement a repository satisfying
`DispatchDeps`, register `create_work_order` / `schedule_maintenance`
executors on `RuleActionRegistry`, and choose the trigger point.

---

## Remaining

`PHASE_6_REMAINING_FINDINGS.md` has the full list. Named here:

- **P6-N2** — the seven existing AI services do not yet emit the evidence
  envelope. Retrofitting it means deciding, per service, which stored
  records its score rested on; doing that badly produces arrays that
  satisfy the guard while pointing at nothing, which is worse than none
  because it looks audited.
- **P6-N3** — dispatch wiring, above.
- **P6-N4** — the ledger's two period semantics. Confirmed it does *not*
  block auto-posting: every auto-posted row is `direct` with
  `periodStart === periodEnd`, so both semantics agree on it.
- **No test against a real MongoDB.** Both idempotency constraints are
  asserted structurally with consequences tested via a simulated 11000.
