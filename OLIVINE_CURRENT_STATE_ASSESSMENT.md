# Olivine current-state + next-implementation assessment

Produced by inspecting the actual source tree at `/home/claude/olivine-audit/fleet-src/Fleet-main` (not just the delivered zip, which was a changed-files subset — the working tree is the authoritative baseline). Every claim below is grounded in a specific file; line numbers are cited so they can be re-verified directly rather than taken on faith. Where the previous audit's description and the code disagree, the code wins, and the disagreement is called out.

No code changes ship in this pass. This is the audit-before-next-slice checkpoint your brief itself asks for ("before changing code, explain the current state and proposed next slice"). Section 8 proposes the next slice; two decisions your brief authorized (Vansales periodization, Swift cost category) are recorded as decided in Section 6 and in their own decision documents, ready to implement next.

---

## 1. What O2/O3/O4 actually delivered

The pipeline you described (source evidence → normalized data → Allocation Ledger → reporting) is real, not aspirational — it maps to actual services:

| Stage | Service / files | Status |
|---|---|---|
| Source evidence | `ImportTransportCostHandler` (`modules/transport-cost/commands/handlers/import-transport-cost.handler.ts`), `TransportCostSourceRecord` (`shared/types/transport-cost.types.ts`) | Shipped — 3rd Party and Vansales only |
| Normalization | `NormalizationMatcherService`, `NormalizationReviewRepository`, `ListNormalizationReviewQueueHandler` (`modules/transport-cost/{services,repositories,queries}`) | Shipped — fuzzy-match transporter/vehicle identity, suggest-only, human-confirmed |
| Posting | `TransportCostPostingService` (`modules/transport-cost/services/transport-cost-posting.service.ts`) | Shipped — 3rd Party only, `third-party-transport` category |
| Reporting | `TransportCostReportService` + `TransportCostReportPage` | Shipped — Business Stream → Vehicle/Transporter drill-down, January 2026 default, plus the data-quality exceptions export added this revision |

Swift, Depot STO, and Vansales posting are **not** part of what shipped — they are explicitly named as deferred in `shared/types/transport-cost.types.ts:27-29`: *"stable families are handled in Phase O1. Swift, PODs, and Depot STO [drift] month to month (Swift) or change meaning entirely partway through."* That comment predates this session and is still accurate today — grep across the whole codebase finds no Swift parser, no `StockTransferRecord` import path, and no Vansales posting logic (see Section 2, items L–N).

## 2. Current-state audit (A–X)

**A–C. O2/O3/O4 scope** — covered in Section 1's table; nothing to add.

**D. Change from the original Phase 1 architecture** — none structurally. `TransportCostPostingService` is a sibling of `AllocationService`, not a modification of it (see its header comment, `modules/transport-cost/services/transport-cost-posting.service.ts:25-130`, which documents invariant-by-invariant which of `AllocationService.postAllocation`'s rules it reuses, skips, or deliberately replaces). No existing finance, vehicle, or reporting file was rewritten; everything Olivine-specific is additive.

**E–G. Which source records exist / are normalized / are vehicle-linked** — 3rd Party and Vansales rows import as `TransportCostSourceRecord` (`shared/types/transport-cost.types.ts:61` onward, full provenance via `rawRow: Record<string, unknown>` at line 102). Normalization links a row's raw transporter/registration text to `tbltransportpartners`/`tblcontractedvehicles` via suggest-only fuzzy match. Vansales rows import and normalize identically to 3rd Party — the divergence starts only at posting.

**H. Which records post to the ledger** — only 3rd Party rows that have cleared normalization and validation. Vansales rows currently post nothing: `TransportCostPostingService` returns `status: 'skipped', reason: 'unsupported-sheet-family'` for them today (documented in that service's header, and in `VANSALES_PERIODIZATION_DECISION.md`).

**I. Cost categories in use** — `AllocationCostCategory` (`modules/finance/types/allocation.types.ts`) has three transport members: `third-party-transport` (live), `transport-retainer` (reserved for Vansales, unused until the posting logic ships), `stock-transfer` (reserved for Depot STO/O5, unused). No fourth category exists yet for Swift — see Section 6's decision.

**J. Idempotency** — `TransportCostPostingService` self-derives its idempotency key via the shared `buildPostingIdempotencyKey` utility (also used by `AllocationPostingService`) rather than accepting a caller-supplied key the way `AllocationService.postAllocation` optionally does, and handles the Mongo `11000` unique-index race explicitly (`transport-cost-posting.service.ts:409-451`). This is a deliberate, documented divergence, not an oversight — see that file's header, "invariants deliberately replaced."

**K. Reversals/corrections** — not reimplemented. `TransportCostPostingService` calls the real `allocationService.reversePosting()` directly for corrections (line ~398), so a corrected Olivine posting goes through the exact same reverse-and-repost, append-only path every other ledger posting uses. There is no code path anywhere in this module that mutates a posted `AllocationPosting` in place.

**L. Vansales periodization** — not implemented. Decision was escalated last revision; your brief now authorizes an autonomous choice. Recorded as decided in Section 6 below (Option A: declared-month periodization).

**M. Swift parsing** — not implemented at all. No file, type, or handler references a Swift-specific parser. Cost-category decision recorded in Section 6.

**N. Depot STO** — not implemented. No `StockTransferRecord` import path exists; the type and the reserved `stock-transfer` cost category exist only as forward-declared placeholders (`modules/finance/types/allocation.types.ts`, `modules/transport-cost/services/transport-cost-posting.service.ts`, `modules/transport-cost/services/transport-cost-report.service.ts`, `modules/transport-cost/commands/import-transport-cost.command.ts` — all four only *reference* the concept in comments/type unions, none implement it).

**O. Provenance** — every source record stores `rawRow: Record<string, unknown>` verbatim (`transport-cost.types.ts:91-102`, comment: *"Provenance: never mutated after import"*), and every import-time rejection/duplicate is separately persisted with its own raw row copy via `TransportCostImportExceptionRepository` (added this revision). Nothing derived is ever written back over the raw capture.

**P. Duplicate detection** — a soft, flagged match on `(sheetFamily, registration, date, amount)`, deliberately not a hard uniqueness constraint (header comment, `import-transport-cost.handler.ts:28-32`, explicitly modeled on the existing `ImportTripsHandler` duplicate guard rather than inventing a new pattern). Flagged rows are excluded from posting but never deleted or merged.

**Q. Org-unit attribution** — `resolveCreationOrgUnitId(command.scope.context, undefined)` (`import-transport-cost.handler.ts:47,131`) — the importing user's own scope, exactly the interim rule carried over from O1, and still marked provisional in that file's header comment (line 22-23: *"It never trusts the uploaded row for tenancy fields."*). No second attribution system was invented.

**R. Tenancy/permissions** — standard `TenantScopedRepository` base for every new collection; `TRANSPORT_COST_VIEW` permission gate on the new exceptions route, matching the existing controller's pattern for every other transport-cost endpoint.

**S–T. Reporting/UI** — `TransportCostReportService.getDataQualityExceptions` (new this revision) plus the existing Business Stream → Vehicle/Transporter drill-down; UI now hides the Business Stream card row when "Unattributed" is the only stream present, and has an "Export exceptions" button (CSV/JSON).

**U. Tests** — 178 transport-cost-relevant suites in `tests/unit/transport-cost/` and `tests/security/{transport-cost-indexes,module-scope-conformance}.spec.ts`; full-repo run is 177/178 suites, 3,120/3,141 tests passing (remainder are pre-existing, unrelated skips). Parity-tested against the real `AllocationService.postAllocation`, not just asserted by inspection.

**V–X. Gaps, provisional decisions, architectural consistency** — covered across Sections 4–7 below. No inconsistency was found between this module and the existing platform architecture; the one permanent, intentional divergence (vehicle resolution against `tblcontractedvehicles` instead of `tblvehicles`) is documented and justified in the posting service's own header rather than hidden.

## 3. What's production-ready

3rd Party import → normalization → posting → reporting, end-to-end, for real January 2026 data, with append-only ledger discipline, idempotent re-import, itemized rejection reporting, and a working drill-down screen. This is the one complete vertical slice and it has been reconciled against Olivine's own workbook total with the full $38,570 gap explained to the cent (see `DATA_QUALITY_REPORT_JANUARY_2026.md` and `PHASE_O2_O3_O4_SUMMARY.md`'s reconciliation table).

## 4. What's incomplete

Vansales posting (blocked only on the periodization decision, now made — see Section 6), Swift (no parser, no cost-category assignment until Section 6's decision is implemented), Depot STO/O5 (not started — new schema, new importer). None of these three touch what's already shipped; each is additive.

## 5. What's architecturally weak

Nothing found that needs correcting before proceeding. The one place worth watching, not fixing: `TransportCostPostingService` resolves vehicles against `tblcontractedvehicles` (organization-level) while `AllocationService` resolves against `tblvehicles` (org-unit-scoped) — a genuine, permanent divergence because contracted vehicles are a structurally different concept (Section "CRITICAL VEHICLE RULE" in your brief is exactly right about this), not a bug. It's documented rather than papered over.

## 6. Decisions authorized by your brief, now recorded

**Vansales periodization — DECIDED: Option A (declared-month posting).**
- *Decision:* one `AllocationPosting` per Vansales row per calendar month, with the month supplied explicitly at import time (a required `periodMonth` field, not inferred from the sheet-tab's free text), amount = the row's own `TOTAL` column.
- *Reason:* matches how a retainer is actually paid (a monthly commitment, not a per-shipment charge); reuses the existing posting machinery with no new `AllocationRule`; never fabricates a period the way a weekly decomposition would have to (the sheet's `WEEK1`–`WEEK4` cells are a known merged-cell artifact per the original audit).
- *Assumption:* the person running a Vansales import batch knows and states which month it covers — the same trust level `sourceFileName` already carries.
- *Reversibility:* a posting made with the wrong `periodMonth` reverses and re-posts through the existing `allocationService.reversePosting()` path, identical to any other correction; no schema-breaking change.
- Supersedes `VANSALES_PERIODIZATION_DECISION.md`'s "escalated, not decided" status — that document is updated alongside this one.

**Swift cost category — DECIDED: `third-party-transport`.**
- *Decision:* Swift rows post under the existing `third-party-transport` category, not a new fourth category.
- *Reason:* the original audit never describes Swift as economically different from 3rd Party — both are contracted-transporter delivery costs; the only difference is the source sheet's drifting column layout (your brief's own instruction: one tolerant parser, required-column subset). Inventing a category for a parsing difference rather than an economic difference would fragment reporting for no reason.
- *Assumption:* if Olivine's Swift data turns out to represent a genuinely different economic relationship (e.g., a different contract structure), this is wrong and should be revisited — flagged here so it isn't silently assumed forever.
- *Reversibility:* cheap — a category rename before any Swift posting ships is a type-union edit, not a ledger migration; after it ships, standard reverse-and-repost.

Depot STO's category (`stock-transfer`) was already decided and reserved in the type union before this session — no new decision needed there.

## 7. What should be corrected before proceeding

Nothing. tsc is clean, the full suite passes, and no shortcut was found that would need unwinding before Vansales/Swift/O5 work starts.

## 8. Recommended next slice

**Vansales periodization implementation** (Option A above) — the smallest of the three remaining pieces, fully speced already, and now unblocked by your decision. Scope: a required `periodMonth` input on the Vansales import path, `TransportCostPostingService` posting logic for the `transport-retainer` category (parallel to, not a copy of, the 3rd Party posting path — same pattern already established for that divergence), tests including a January 2026 Vansales reconciliation against the workbook's own Vansales total. Swift (tolerant parser + the category decision above) is the logical slice after that; Depot STO/O5 remains its own, larger phase given it needs a new schema and a new importer family entirely.

## 9–10. Analytics now supportable / still not

**Now supportable, once Vansales ships:** a combined 3rd Party + Vansales cost view per Business Stream/Vehicle/Transporter/period — still ledger-sourced, still no fabricated numbers.

**Still not supportable, and why:** fuel usage, litres, and any cost-per-km/km-per-litre figure for Olivine's transport-cost data. This isn't a gap to close — it's the data-truth rule working as designed. The original audit (restated in your own brief) found no fuel litres or reliable distance data anywhere in Olivine's workbook, and Olivine's registrations are contracted third-party vehicles (`tblcontractedvehicles`), not telematics-equipped owned vehicles (`tblvehicles`) — the platform's real `AllocationService.getCostPerKm` engine (`modules/finance/services/allocation.service.ts:335`) already exists and already returns `null` rather than a fabricated figure when distance is zero or unavailable, but it has no legitimate input to work from for Olivine's contracted fleet and should not be pointed at it. The 3.15 km/L benchmark from your brief is a general assumption, not a per-truck measurement Olivine's data can produce — using it to back-calculate litres or cost-per-km for Olivine would be exactly the fabrication the hard constraint rules out. This stays `unavailable` unless Olivine supplies real per-truck distance or fuel data, at which point it's a new, separate import family with its own decision document — not a formula applied to data that doesn't support it.

## 11–15. Risks and gaps

- **Data-quality:** the $33,906 unattached row-109 figure from January's rejection report remains the single highest-value open question — worth a direct check with Olivine before it's written off as noise.
- **Financial/ledger:** none found. Single source of financial truth is intact — reports read from `AllocationPosting`s only, never re-derive a competing total from source records.
- **Tenancy/security:** none found — every new collection is registered and CI-enforced (item 4 of the prior revision).
- **Performance/scalability:** not yet tested at Olivine's real full-year volume (~12,600 rows across 39 sheets) — January 2026 alone (155 rows) is not a meaningful load test. Worth a batch-import timing check before Swift/Depot STO roughly triple the row count.
- **UX/reporting:** the drill-down screen has no way to view Vansales-vs-3rd-Party split once Vansales ships — worth planning the stream-level breakdown UI alongside the posting work, not after.

## 16. Recommended phase order

1. Vansales periodization (this slice).
2. Swift tolerant parser + posting under `third-party-transport`.
3. Depot STO / O5 (new schema, new importer, own decision document for the sign-off-field provenance question your brief raises).
4. Combined-stream UI (3rd Party + Vansales + Swift on one drill-down) once at least two of the three post.
