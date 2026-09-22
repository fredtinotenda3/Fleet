# Olivine transport-cost work — phase plan

Tracks the Olivine Group transport-cost integration (audit doc: "Olivine Group — Fleet Platform Fit-Gap & Architecture Assessment") phase by phase. Each phase is a small, independently reviewable slice — later phases never retrofit an earlier one's shape (see `TransportCostPostingService`'s own header for why it is parallel to, not a retrofit of, `AllocationService`).

| Phase | Scope | Status |
|---|---|---|
| **O1** | Import 3rd Party and Vansales rows as source evidence only (`tbltransportcostsourcerecords`), full provenance, no posting, no normalization. | Shipped. |
| **O2** | Normalization review: fuzzy-match transporter/vehicle identity, suggest-only, human-confirmed via `tblnormalizationreviewitems`. Never auto-merges. | Shipped. |
| **O3** | Post confirmed 3rd Party rows to the Allocation Ledger (`third-party-transport` cost category), reusing append-only/idempotency/reversal machinery. | Shipped. |
| **O4** | Business Stream → Vehicle/Transporter → time range report, sourced only from Allocation Ledger postings. Minimal slice: one screen, January 2026 default. | Shipped. |
| **Vansales posting** | Post Vansales retainer rows (`transport-retainer` cost category, reserved) to the ledger. | **Blocked on a client decision** — see `VANSALES_PERIODIZATION_DECISION.md`. Not a phase number of its own; it is the remaining scope inside O3/O4 for the second of Section R2's three cost streams, deliberately not folded into "O3 shipped" above since 3rd Party and Vansales are genuinely separate decisions with separate risk. |
| **O5** | Depot STO (May–August `StockTransferRecord`) import + posting (`stock-transfer` cost category, reserved). Its own schema and sourceCollection do not exist yet — this is a new import family, not an extension of the 3rd Party/Vansales importer, since Depot STO's schema is structurally different (a stock movement, not a delivery or retainer) and the audit found its column layout drifts month to month. | **Deferred, not started.** Named here so "what happens to Depot STO" has an answer in this document rather than only in code comments. |
| **Swift / PODs** | Explicitly out of scope for the entire O-series. The audit's Section D found ~0 shared join keys between Sales invoice no. / Shipper reference / POD No. across these families — no hard join is safe, and none is attempted anywhere in O1–O5. | Not planned. Revisit only if Olivine supplies a real, verified join key. |

## Why Vansales posting and Depot STO are tracked separately

Section R2 of the audit named three transport cost streams to reconcile against the ledger: 3rd Party (delivered, O3), Vansales retainer (blocked on the periodization decision above), and Depot STO (deferred to O5). They were never one undifferentiated "remaining work" bucket — each has its own blocker (a business decision for Vansales; an entire missing import pipeline for Depot STO) and its own risk profile, so tracking them as one line would have hidden that difference. The `AllocationCostCategory` union already reserves distinct categories for both (`transport-retainer`, `stock-transfer`) so that whichever ships first does not have to retrofit the other's shape or invent a category under time pressure later — see `modules/finance/types/allocation.types.ts`'s doc comments on those two members.

## Updating this document

When Vansales posting or O5 (Depot STO) ships, move its row's Status to "Shipped" and add a one-line pointer to the delivery summary that shipped it (following `PHASE_O2_O3_O4_SUMMARY.md`'s own pattern), rather than opening a new phase-plan document.
