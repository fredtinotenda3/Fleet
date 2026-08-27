# Findings outside Phase 6

Recorded during Phase 6 and **deliberately not implemented**.

---

## Found during Phase 6

### P6-N1 · The AI confidence divergence in the audit no longer exists
**Severity: N/A · Already resolved before this phase**

The audit recorded that `AIPrediction` used a confidence **enum** while
`AIResult` used a number, and that the two were incompatible.

`AIConfidence` in `ai.types.ts` is already `type AIConfidence = number`
(0–1), and `AIResult.confidence` is already `number`. They agree, and did
before Phase 6 started.

Recorded rather than "fixed" with a no-op change. A phase that claims to
have unified something already unified is a phase whose report cannot be
trusted on the things it *did* do. A test now asserts the current state
so a future reader does not re-open a closed finding.

The **second half** of that finding — no shared evidence model — was real
and is fixed (`ai-evidence.types.ts`).

### P6-N2 · Existing AI services do not yet emit the evidence envelope
**Severity: MEDIUM · Not fixed**

`ai-evidence.types.ts` defines the shared shape and `buildConfidence`
enforces non-empty evidence, but the seven existing AI services still
return their own outputs without it.

Not fixed because retrofitting evidence into each service means deciding,
per service, *which* stored records its score actually rested on — and
several compute across an aggregation where the answer is genuinely
"these 400 readings". That is a modelling decision per service, not a
mechanical change, and doing it badly would produce evidence arrays that
technically satisfy the guard while pointing at nothing useful — which is
worse than none, because it looks audited.

The envelope is in place so each service can adopt it deliberately.

### P6-N3 · Dispatch has no persistence wiring
**Severity: MEDIUM · Partially complete**

`AttentionDispatchService` takes its persistence through an injected
`DispatchDeps` (find/record), and the indexes for
`tblattention_dispatches` are declared — but no repository implementing
`DispatchDeps` is wired, and nothing calls `dispatch()` yet.

This was deliberate sequencing, not an oversight: the dispatch *decision*
logic and its idempotency are the parts worth getting right and testing,
and they are done. Wiring a repository and choosing the trigger point
(on attention refresh? on a severity threshold? operator-initiated?) is a
product decision about **when the platform should start creating work on
its own**, and it should be made explicitly rather than defaulted to by
whoever wires the repository.

The action executors themselves (`create_work_order`,
`schedule_maintenance`) also need registering on `RuleActionRegistry` —
the service refuses safely when they are absent, which is the correct
behaviour, but it means dispatch is inert until they exist.

### P6-N4 · The allocation ledger's two period semantics
**Severity: MEDIUM · Recorded, not standardised**

Noted in the original audit and re-confirmed here.
`AllocationLedgerRepository.buildFilter` (the LIST endpoint) is
*starts-within-window*; `getNetTotalsBy*` (the MONEY paths) are
*fully-contained*. A posting spanning a period boundary appears in the
drill-down list but not the header total.

The brief said to standardise only if it blocked safe auto-posting. It
does not: every auto-posted row is a `direct` posting with
`periodStart === periodEnd`, so it cannot span a boundary and both
semantics agree on it. The discrepancy is confined to multi-period
allocations, which only the manual path creates today.

Standardising on fully-contained is still the right fix, in its own
commit, before anything creates multi-period postings automatically.

### P6-N5 · Historical transactions are not retro-posted
**Severity: LOW · Deliberate**

Auto-posting applies from deployment forward. Back-filling every
historical expense and fuel log would require deciding an FX rate for
every past foreign-currency record — and guessing one is precisely what
this phase refuses to do.

The manual posting path is unchanged for anything historical that
matters.

---

## Explicitly not implemented, per the brief

- **Opportunities module.** The brief said not to, and nothing in closing
  this loop required a minimal model.
- **Live FX provider.** None exists; the brief said not to add one. Rates
  are supplied on the source record or set manually.

---

## Audit findings Phase 6 does not address

| ID | Finding | Severity |
|---|---|---|
| F-8 | Rate limiting is an in-memory `Map`, per-instance | HIGH |
| F-9 | Query cache is invalidate-only and keyed by tenant, not org unit | HIGH |
| F-17 | Live map is a poll, presented as real-time | MEDIUM |
| F-25 | No error-monitoring backend | LOW — Phase 7 |
| S-1 | `middleware.ts` excludes non-versioned `/api/*` | **ARCHITECTURAL** |
| N-3 (Ph0) | `createAlert` writes no `orgUnitId` while the scoped read filters on it | MEDIUM |
| P3-N1 (Ph3) | `NotificationHandler` / `WebhookDispatchHandler` non-idempotent | MEDIUM |
| P4-N1 (Ph4) | Reports read raw telemetry, not rollups | MEDIUM |

**S-1 remains the highest-leverage remaining item.**

---

## Testing gaps

- **No test against a real MongoDB.** Both new idempotency constraints
  are asserted structurally (shape, uniqueness, partial filter) with
  their consequences tested via a simulated 11000. Proving two genuinely
  concurrent posts produce one row needs a real database; the in-memory
  doubles serialise everything.
- **No end-to-end test through the outbox.** The posting handler is
  registered and idempotent, both tested — but nothing exercises
  publish → processor → redelivery → single posting in one run.
