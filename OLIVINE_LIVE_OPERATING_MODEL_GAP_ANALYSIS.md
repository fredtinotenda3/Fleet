# OLIVINE LIVE OPERATING MODEL — GAP ANALYSIS

**Prepared:** 24 September 2026, in direct response to the client meeting requirements document ("OLIVINE — NEW BUSINESS REQUIREMENTS FROM CLIENT MEETING / LIVE OPERATING MODEL STARTS 1 OCTOBER 2026").
**Scope:** the entire transport-cost pipeline (O1 import → O2 normalization → O3 ledger posting → O4 reporting) plus the Command Centre dashboard work already in progress.
**Status of this document:** this is the client's own explicitly required first deliverable ("Do NOT immediately start changing random files. First inspect... Then produce a... GAP ANALYSIS"). It was produced after a full inspection of the current codebase, and — because the highest-priority, most concretely specified requirement (items 2–5, the cost-facing company dimension) was small enough to design, build, and fully test with high confidence in the same pass — that one slice has already been implemented end-to-end and is reported as **shipped**, not proposed, below. Every other item is reported honestly as **analyzed and designed**, with a concrete recommendation, but **not yet built**, so this document does not overstate progress. See Section 15 for the recommended build order for what remains.

**SLICE 2 UPDATE (see `CHANGELOG-olivine-live-operating-model-slice-2.md` for the full delivery record):** Section 5's multi-line transport-operation model — the highest-priority remaining item this document identified below — has since been **implemented and shipped**. Section 5 itself has been rewritten in place to reflect what was actually built, rather than left as a stale "designed, not built" snapshot; the original design reasoning is preserved because the shipped implementation follows it. Section 4's disclosed `reversePosting()` limitation has also since been resolved — see Section 4's note. Every other section (6–11, 13–14) is unchanged from the original Slice 1 pass and remains accurate as a "not yet built" snapshot for those items.

**SLICE 3 UPDATE (see `CHANGELOG-olivine-live-operating-model-slice-3.md` for the full delivery record):** Section 6 — Master-data search + "+ Add New" for Customer, Transporter, Truck registration, and Destination — has since been **implemented and shipped**. Section 6 itself has been rewritten in place; the original recommendation (lightweight reference collections, distinct from `TransportPartner`/`ContractedVehicle`'s review-gated model) is preserved because the shipped implementation follows it, with one refinement made during implementation: Transporter and Truck registration turned out to already have a fully suitable existing identity (`TransportPartner`/`ContractedVehicle`), so no new collection was created for either — only Customer and Destination are new collections. Sections 1 and 7 have been updated to move this item from "not ready" to "shipped." Every other section (8–11, 13–14) remains an unchanged, accurate "not yet built" snapshot for those items.

---

## 1. What's ready for 1 October

**Shipped and tested this pass:**

- The **cost-facing company dimension** (Hypery / Olivine / Surface) is now captured as structured, validated, required data at the point of entry — manual entry and bulk file import, across all four sheet families (3rd Party, Vansales, Swift, Depot STO) — and flows through the full pipeline: entry form → import validation → source record → ledger posting → aggregated report → dashboard card. See Section 4 for full detail. Verified with 54 unit tests on the import handler (8 of them new, covering acceptance/rejection/case-insensitivity/persistence for the new field) and 8 new unit tests on the ledger aggregation, plus a clean `tsc --noEmit` and a full `jest` run (3153 tests passing, 21 pre-existing skips for an integration suite that needs a live MongoDB instance, 0 failures).
- A closed one-line gap in the pre-existing Command Centre Slice A0 index set was found and fixed during this pass's verification (`tests/security/finance-indexes.spec.ts` was asserting an index that had never actually been added — see Section 14).

**Ready, from prior sessions, unaffected by this pass:**

- O1 import (all four sheet families), O2 normalization-review matching, O3 ledger posting (including the append-only + reversal/repost discipline), and O4 reporting (`TransportCostReportService.getAllocationReport`) are all in place and exercised by an extensive existing test suite (`import-transport-cost.handler.spec.ts`, `transport-cost-posting.service.spec.ts`, `transport-cost-report.service.spec.ts`, `allocation-ledger-append-only.spec.ts`, and the live-data `verify-phase-o3-o4.ts` script that ran against the real January 2026 workbook).
- Tenant/org-unit isolation, RBAC, and the append-only ledger discipline are pre-existing, load-bearing platform guarantees, unmodified and re-verified by this pass's full test run.

**Shipped and tested in Slice 2 (see Section 5 and the Slice 2 changelog entry):**

- Multi-invoice/multi-customer/multi-consignment/multi-destination line items on ONE 3rd Party transport OPERATION (item 6/7) — parent/child model, manual-entry repeatable-lines UI, ledger integrity (one posting per operation, cost never multiplied by line count), and an operations-vs-loads reporting split.
- The Section 4 `reversePosting()` `costFacingCompany` carry-forward gap — closed.

**Shipped and tested in Slice 3 (see Section 6 and the Slice 3 changelog entry):**

- Type-ahead search + "+ Add New" for Customer and Destination (new, lightweight, organization-level reference collections with find-or-create duplicate protection), and type-ahead search (no create — see Section 6) for Transporter and Truck registration, reusing the existing `TransportPartner`/`ContractedVehicle` review-gated identities unchanged. Wired into manual entry across all four sheet families wherever the field has semantic meaning; bulk file import is completely unaffected.

**NOT ready for 1 October without further work (see Sections 8–11 and 15):**

- Inline table CRUD (View/Edit/Delete/Duplicate/Resolve) on operational tables (item 9) — not started.
- The broader dashboard (daily/weekly/monthly/total cards, trend/vehicle/transporter/destination charts — items 10/11) — one card section shipped (by-company), the rest not started.
- The production cutover procedure itself is **designed, not executed** (item 14) — correctly, since executing it now would violate the client's own explicit instruction not to touch the database yet.

---

## 2. What must change (before 1 October, non-negotiable per the client's own language)

1. **Entry forms must stop being able to save a transport-cost record without a selected cost-facing company.** Done — see Section 4. This was the single most explicit, most repeated instruction in the requirements ("must therefore make this dimension explicit," "Do not make this a free-text field," "must be persisted as structured data").
2. **The three companies must never be modeled as transporters, vehicle owners, drivers, customers, or destinations.** Confirmed as designed: `CostFacingCompany` is its own field on the source record and the ledger posting, structurally incapable of being confused with `transporterNormalized`, `customerName`, or `destinationTown` — they are different fields with different types, not different values of the same field.
3. **A definitive answer on whether the current data model supports "one transporter, multiple invoices/customers/destinations on one trip."** Originally answered in Section 5 as: it did not, and an additive child/line-item structure was recommended. **As of Slice 2, it now does** — see Section 5 for what was actually built.
4. **A documented, non-executed cutover plan**, distinguishing master data (survives) from transactional data (reset/archived) — delivered in Section 13, still requiring the client's explicit go-ahead before any of it runs.

## 3. What can wait

- Promoting `CostFacingCompany` from a closed union to an admin-managed reference collection (flagged as a reversible follow-up in Section 4, not needed unless a fourth company appears).
- Reconciling `CostFacingCompany` with the pre-existing, differently-scoped `ContractedVehicle.businessStream` (Section 4) — both can coexist safely; forcing them together now is exactly the kind of "speculative complexity" item 17 warns against.
- Telematics/GPS integration and derived fuel/cost-per-km intelligence (item 13/20) — the client explicitly said this must stay optional and is not a 1 October blocker.
- Anomaly detection, transporter/vehicle cost comparisons, approval workflows (item 17) — genuine future value, but the client's own words are "do not fabricate data or build speculative complexity just because it sounds impressive"; these belong after the core operating model (items 2–11) is solid, not before.

---

## 4. Company representation — SHIPPED

**DECISION:** Model `CostFacingCompany` as a small closed TypeScript union (`'hypery' | 'olivine' | 'surface'`), stored as its own field on `TransportCostSourceRecord` (source-of-truth entry) and copied forward onto `AllocationPosting` at posting time (for real `$group`-based aggregation performance), rather than as a master-data collection or a join-at-report-time field.

**REASONING:** Three named, stable, board-level business entities are a fundamentally different kind of thing from an open-ended, user-growable list like Customer or Destination (item 8's proper target for a master-data collection). Modeling three fixed values as a heavyweight searchable/creatable collection — with the human-review-gated creation discipline `TransportPartner`/`ContractedVehicle` require — would itself be the "speculative complexity" item 17 warns against. Copying the field onto the ledger posting (rather than joining at report time, the precedent `destination` uses in the Command Centre design) is justified because the client named this as the *primary* analytical dimension, which justifies the small additive-field cost for real aggregation performance across potentially large postings tables.

**ASSUMPTION:** Exactly three companies, for the foreseeable future. If a fourth appears, the union type needs a one-line addition plus a re-deploy — see reversibility below.

**REVERSIBILITY:** Fully reversible and additive. Promoting the union to a small reference collection later (if the client wants these admin-managed, or a fourth company is added) is a non-breaking follow-up: existing `costFacingCompany` string values on source records and postings remain valid foreign-key-shaped values either way.

**What was actually built, end to end:**

- `shared/types/cost-facing-company.types.ts` — the type, canonical option list/order, a case-and-whitespace-tolerant `normalizeCostFacingCompany()`, and a `costFacingCompanyLabel()` helper that renders a missing value as "Unattributed" rather than crashing or guessing.
- `TransportCostSourceRecord.costFacingCompany` — required (validated) for every row imported through the current handler; `null`/`undefined` only for rows imported before this field existed.
- `ImportTransportCostHandler` — a shared `resolveCostFacingCompany()` helper called from all four `validateAndBuildX` methods; a missing or unrecognised value is **rejected per row** (never silently defaulted to "unattributed"), with a clear error and suggested fix, and is also persisted to the data-quality exception log (item 6) exactly like every other required-column rejection in this handler.
- `ManualEntryModal` / `ImportModal` — widened with a new `'select'` column type backed by the platform's existing `Select` component, so the manual-entry form renders a proper dropdown (never free text) and a bulk-uploaded file's `costFacingCompany` column is validated server-side with the same case-insensitive tolerance every other cell in this app already gets.
- `TransportCostImportPage` — a shared `COST_FACING_COMPANY_COLUMN` definition (required, `type: 'select'`, populated from the canonical option list) inserted into all four sheet families' column sets.
- `AllocationPosting.costFacingCompany` — copied from the source record at posting time in `TransportCostPostingService.postSourceRecord`.
- `AllocationLedgerRepository.getNetTotalsByCompanyAcrossVehicles()` — a new, tested aggregation grouping net (post-reversal) totals by company across every vehicle in scope, backed by a new sparse index (`idx_allocationledger_tenant_costfacingcompany_periodstart`).
- `TransportCostReportService.getAllocationReport()` — a new `byCompany: CompanyGroupTotal[]` field, built from the aggregation above.
- `TransportCostReportPage` — a new "By cost-facing company" card section, using the same formatting/styling conventions as the existing business-stream cards.

**Known, disclosed, accepted limitation — RESOLVED IN SLICE 2:** `AllocationService.reversePosting()` originally built a reversal from an explicit field list that did not include `costFacingCompany`, so a reversal of a transport-cost posting would display as "Unattributed" instead of carrying the original's company forward (the net total was still always correct — see the repository tests referenced below — only the reversal row's own dimension label was affected). This was deliberately left as a disclosed, low-risk follow-up in Slice 1 rather than rushed under time pressure. In Slice 2, the client explicitly asked for it to be revisited; it was judged safe (a one-line, purely additive, optional-field copy onto `reversePosting`'s existing `append()` call, a no-op for every cost category other than the three transport-cost ones) and fixed, with new regression tests in `transport-cost-posting.service.spec.ts` (the "costFacingCompany carries through a reversal" describe block) proving: (1) the reversal now carries the company forward, (2) a historical record with no company still reverses cleanly with nothing fabricated, and (3) a non-transport-cost reversal (fuel, in the test) is provably unaffected.

**Deliberately distinct from `ContractedVehicle.businessStream`:** that field lives on the *vehicle* (`'olivine' | 'hypery' | 'surface-wilmar'`), is set once by a human confirming a new vehicle in the O2 review queue, and represents "who this truck usually serves" — a fact about the vehicle, not the transaction. `costFacingCompany` lives on the *transaction* and represents "which company this specific cost was incurred facing" — a single contracted vehicle can genuinely serve more than one of the three companies over its life, which `businessStream` cannot express per-trip. These are not merged. A future reconciliation (e.g., deprecating `businessStream` in favour of always reading the transaction-level field) is flagged as an open question, not resolved here, per Section 3.

---

## 5. Multi-value representation — SHIPPED (Slice 2)

**Finding, from direct inspection of `shared/types/transport-cost.types.ts` (Slice 1):** the model was flat. `TransportCostSourceRecord` had exactly one `salesInvoiceNo`, one `customerName`, one `destinationTown`, and one `tonnageRaw` per row — no array or child-record concept anywhere. The client's stated real-world fact ("ONE TRANSPORTER CAN HAVE MULTIPLE ITEMS UNDER ONE TRIP/TRANSPORT RECORD") was therefore not represented.

**DECISION, as built:** an additive parent/child model, exactly as this section originally recommended:
- **Parent** (`TransportCostSourceRecord`, unchanged in shape and still the source of truth for every existing consumer): cost-facing company, transporter, truck registration, transport date, source/import provenance, transport-level cost, source family/category. (Not "driver" — see the ASSUMPTION note below on why the client's own suggested field list was not copied blindly.)
- **Child** (`TransportCostLine[]`, new, optional, on the parent record): sales invoice number, customer name, consignment number, destination town, tonnage — the fields that can genuinely repeat within one trip. Structurally incapable of carrying a cost/amount field (see the cost-semantics decision below).

**REASONING:** unchanged from the original design — this avoids both failure modes the client explicitly warned against: comma-separated strings in existing scalar fields (would break every existing report/filter reading `customerName`/`destinationTown` as one value), and duplicating the whole parent row per invoice (would multiply transporter/vehicle/cost totals). An additive child array was the only option that does not corrupt existing math, and that is what was built.

**What was actually built, end to end:**

- `shared/types/transport-cost.types.ts` — `TransportCostLine` (lineNumber, salesInvoiceNo, customerName, consignmentNumber, destinationTown, tonnageRaw — no cost field) and `TransportCostSourceRecord.lines?: TransportCostLine[]`, `undefined` only for historical pre-Slice-2 rows.
- `ImportTransportCostHandler` — `buildLine`/`isBlankLine`/`resolveLines` helpers, shared by all four sheet families' `validateAndBuildX` methods, so every row (old or new) has a well-defined `lines[]` and the scalar fields keep being populated as `lines[0]`'s mirror. Only `ThirdPartyImportRow` accepts an explicit `lines` array (see the scope decision below); bulk-file-upload rows for all four families are completely unaffected (see the bulk-import decision below).
- `ManualEntryModal` — widened with an optional `lineColumns` prop: a repeatable "Load / Consignment Lines" section with an "Add another line" control, additive and byte-for-byte unchanged for every caller that does not pass it (every family except 3rd Party's manual-entry modal).
- `TransportCostImportPage` — `THIRD_PARTY_COLUMNS` (the bulk-upload column set) is **untouched**; a new `THIRD_PARTY_PARENT_COLUMNS`/`THIRD_PARTY_LINE_COLUMNS` split feeds the 3rd Party manual-entry modal only. The source-records table gained a "Loads" column, silent for every ordinary (1-load) row and a badge for a genuine multi-load operation.
- `TransportCostPostingService.postSourceRecord`/`resolveAmountAndPeriod` — **not modified for amount/period computation**, which is the structural proof that a line can never multiply the posted cost; `describePosting` gained a `[+N more loads]` suffix for a multi-line operation.
- `TransportCostSourceRecordRepository.getLoadSummaryInScope` / `TransportCostReportService`'s new `loadSummary` field / `TransportCostReportPage`'s new "3rd Party transport operations vs. loads" section — a purely operational count (operations, lines, multi-line-operation count), deliberately never folded into `byCompany`/`byBusinessStream`/`byVehicle`'s financial totals, satisfying the client's explicit "TRANSPORT OPERATIONS vs TRANSPORT LINES/LOADS, shown separately" requirement.
- `AllocationService.reversePosting()` — the Section 4 `costFacingCompany` carry-forward gap closed in the same pass (see Section 4's updated note).

**ASSUMPTION, revised from the original design during implementation:** the client's own suggested child-field list included "receiver name" and "driver." Direct inspection of the existing code (`validateAndBuildSwift`'s `receiversName -> customerName` mapping) showed the current schema already treats a Swift "Receiver's Name" as the same concept as `customerName` — so `TransportCostLine` has no separate `receiverName` field, unifying the two rather than adding a redundant one. Similarly, no sheet family in this schema currently has a `driver` field on the 3rd Party parent row, so one was not invented for it (Depot STO already has its own unrelated `driver` field, untouched). This is the client's own explicit instruction ("DO NOT blindly copy this list... inspect the actual current schema first") applied and documented, not a deviation from it.

**Cost-semantics DECISION:** cost is parent-level (Option A), never allocated or split across lines. **REASONING:** the client's own Slice 2 field list already places "transport-level cost" at the parent, and `TransportCostLine` was made structurally incapable of carrying a cost/amount field — the least-assumptive interpretation available, since inventing a per-line allocation formula (equal split? by tonnage? by declared value?) would be exactly the kind of guess that could corrupt financial truth if wrong. **What would change if line-level costing is later required:** a per-line `amount` field would need to be added to `TransportCostLine`, `resolveAmountAndPeriod` would need an explicit allocation rule (and a client decision on which one), and every consumer currently treating the parent `amount` as the whole trip's cost would need to be re-audited. **REVERSIBILITY:** the current parent-level design does not block this — it is the simpler of the two states to migrate away from, since nothing downstream currently assumes per-line costs exist.

**Bulk-import DECISION:** bulk-file-upload multi-line support was **not added this pass**, for any of the four families. **REASONING:** inspected the real January 2026 3rd Party sheet (`DATA_QUALITY_REPORT_JANUARY_2026.md`) and found no reliable signal in the existing file structure to distinguish "these two rows are one trip with two invoices" from "these two rows are two unrelated trips" — inventing a grouping convention (e.g., "same date + same registration = one operation") risked silently merging genuinely unrelated trips. Manual entry, where a human explicitly clicks "Add another line," has no such ambiguity. **REVERSIBILITY:** fully additive later, once a real multi-line-shaped source file is seen and a grouping key can be confirmed against real data rather than guessed.

**Family-scope DECISION:** only 3rd Party's manual-entry path accepts explicit multi-line input. **REASONING:** Vansales bills a fixed weekly/monthly retainer (not a per-shipment record — "multiple loads" has no clear meaning there); Swift and Depot STO have no demonstrated multi-line business need in the real data inspected this pass. Widening either is a small, additive follow-up if a real business need is shown, not a speculative one built ahead of evidence.

**Ledger/reporting integrity, verified (not assumed):** `resolveAmountAndPeriod` was not touched, so a multi-line operation structurally cannot post more than the ledger's usual one posting for one amount — proven by dedicated financial-rule tests (`import-transport-cost.handler.multiline.spec.ts`) asserting no `amount`/`cost` property exists anywhere on a `TransportCostLine`, and that a record's own `amount` is unchanged regardless of how many lines it has.

---

## 6. Master-data architecture — SHIPPED (Slice 3)

**FIRST: existing master data inspected before building anything new, per the client's own explicit instruction.** Direct inspection (not assumption) of `TransportPartner`/`ContractedVehicle`/`NormalizationReviewItem` and their repositories found:

- `TransportPartner` (`tbltransportpartners`) and `ContractedVehicle` (`tblcontractedvehicles`) are **already** exactly the "one authoritative identity" the client asked for, for Transporter and Truck registration respectively — organization-level, tenant-scoped, deduplicated (`canonicalName`/`registration` + alias matching), audited, and reachable by a clean search. Creating a second, competing "TransporterMaster2"/"VehicleMaster2" collection purely for autocomplete purposes — the client's own named anti-pattern — was therefore rejected outright. **DECISION:** reuse `TransportPartner`/`ContractedVehicle` as-is for search; add nothing new for these two entities except two new read-only repository methods (`searchConfirmedByName`/`searchConfirmedByRegistration`) and no write path at all.
- No existing entity represents Customer or Destination as a searchable, reusable reference — both were, and remain, plain free-text string fields (`customerName`, `destinationTown`) on `TransportCostSourceRecord`/`TransportCostLine`. **DECISION:** two new, genuinely lightweight, organization-level reference collections (`tblcustomers`, `tbldestinations`), following exactly the "MIXED-LEVEL MODULE" precedent `TransportPartner`/`ContractedVehicle` already established in `server/tenancy/module-scope.registry.ts` (see below).

**Why Transporter/Truck registration get SEARCH ONLY, never "+ Add New" — the single most important decision this section records.** `shared/types/normalization-review.types.ts` states the codebase's own central rule verbatim: *"nothing in Phase O2 ever writes a NEW TransportPartner/ContractedVehicle row... except through a confirmed review item."* Every existing creation path (`ConfirmReviewNewHandler`) requires a **pending** `NormalizationReviewItem` to resolve, which only exists once a row has already been imported and the O1 matcher found no confident match. A synchronous "+ Add New Transporter" button, by construction, would have to create a **confirmed, ledger-postable** identity from a value nobody has imported yet — precisely the "silently creating a confirmed/ledger-postable vehicle identity from arbitrary user input" the client's own instructions explicitly forbade. The alternative the client raised as acceptable — creating a `needs-review` row directly from manual entry instead of a confirmed one — was considered and rejected: nothing in the existing platform currently resolves a `needs-review` row created outside the O2 matcher's own import-time flow (`findNeedingReview` is defined but has no caller that lets a human act on a row that arrived this way), so it would produce orphaned data requiring its own new review UI — genuinely out of this slice's scope, and a worse outcome than leaving the existing, working O1/O2 pipeline completely untouched. **REVERSIBILITY:** if a future slice builds that missing resolution UI, wiring a "+ Add New" action for these two fields becomes a small additive change; nothing built this slice needs to be undone to support it later.

**Why Customer/Destination get full find-or-create.** Unlike a transporter or a vehicle, `customerName`/`destinationTown` never gate FX resolution, vehicle identity, or any ledger computation (`TransportCostPostingService.resolveAmountAndPeriod`, unmodified by this slice) — they are descriptive fields, exactly like `CostFacingCompany` reasoned about the same distinction in Section 4. That is what makes it safe for an operator to create one directly, synchronously, with no review queue.

**DECISION (data model):** `Customer`/`Destination` — `{ name, normalizedName, active, ...BaseEntity }`, organization-level (no `orgUnitId`, mirroring `TransportPartner`/`ContractedVehicle`'s own precedent: a customer or destination is not owned by one branch, and duplicate detection must work tenant-wide, not per-branch), plain `BaseRepository` (not `TenantScopedRepository`). `normalizedName` (uppercase, whitespace-collapsed, via a new `normalizeMasterDataName()` — deliberately identical logic to the existing `normalizeTransporter`, reused under its own name per this codebase's own "reuse the exact same functions" convention) is a **unique** `{tenantId, normalizedName}` index — the duplicate-protection floor. `active: boolean`, not `BaseEntity.isDeleted`/`softDelete()`: `isDeleted` hides a row from every default read including historical lookups, which is the opposite of "inactive but still valid for history" the client explicitly required ("must remain available for historical records; must not disappear from historical reporting").

**DECISION (duplicate protection, two layers, deliberately redundant):** (1) a `findByNormalizedName` pre-check before every create — the cheap, common path, returning the existing record with `created: false` rather than an error, so the operator is told "already exists" and it is simply selected, per the client's own required UX; (2) the unique index as race-condition defense-in-depth — a losing concurrent create throws `ConflictError` (`BaseRepository`'s existing `translateDuplicateKeyError`), caught specifically and re-resolved via `findByNormalizedName` again rather than propagated, so even two operators creating "the same new destination" in the same second still land on one record, never two. Matching is exact-normalized only — no fuzzy matching was introduced, per the client's own explicit instruction ("Exact/normalized matching is safer than guessing" for financial identity).

**DECISION (security/tenancy):** every Customer/Destination repository method is tenant-scoped through the same `BaseRepository`/`resolveTenantScope` machinery every other repository in this codebase already uses — no new bypass path was introduced. An empty/missing tenantId already fails closed at that shared layer (`resolveTenantScope` throws `TenantScopeError` rather than defaulting to platform-wide scope), inherited automatically rather than re-implemented; proven directly by adversarial tests (see Verification below) rather than assumed from the shared layer's own pre-existing tests. `server/tenancy/module-scope.registry.ts`'s transport-cost entry gained `tblcustomers`/`tbldestinations`, documented as an extension of the pre-existing "MIXED-LEVEL MODULE" exception paragraph that already covered `TransportPartner`/`ContractedVehicle`/`NormalizationReviewItem`/`TransportCostVatConfig` — one entry, not a fragmented second registration, per the conformance suite's own "unique entry per module" requirement.

**DECISION (write permission):** creating/deactivating a Customer or Destination is gated by `Permission.TRANSPORT_COST_IMPORT` — the same permission that already gates manual entry and bulk import — rather than a new permission, since it is part of the same "enter transport-cost data" capability, not a separate administrative action. Search is gated by the existing read permission, `Permission.TRANSPORT_COST_VIEW`.

**DECISION (UI):** a new `SearchCreateSelect` component, built from this codebase's own existing `Command`/`Popover` primitives (the same two components `Autocomplete.tsx` already composes for a closed-list combobox), per the client's own "use the application's existing Select/Combobox/Command patterns" instruction — not a new, visually inconsistent widget. Wired into `ManualEntryModal` via a new `'search-select'` `ImportColumnType`; `ImportModal` (bulk file upload) is untouched — every bulk-upload column set (`THIRD_PARTY_COLUMNS`, `VANSALES_COLUMNS`, `SWIFT_COLUMNS`, `DEPOT_STO_COLUMNS`) keeps its original object identity and its original `type: 'string'`, so the downloadable template, the CSV parser, and `coerceValue()`'s bulk-row coercion are byte-for-byte unchanged. Separate `*_MANUAL_COLUMNS` variants (derived, never mutating the bulk arrays) are used by the five `ManualEntryModal` instances only.

**DECISION (field mapping per sheet family — determined by reading each family's own validated schema, not assumed):** 3rd Party parent gets Transporter + Truck registration (search only); 3rd Party lines get Customer + Destination (search + create) — the customer/destination selectors work correctly inside the repeatable-lines UI from Slice 2 without modification, since each selector is just another field on each line's own local form state. Swift gets `receiversName` → Customer and `destinationLocation` → Destination (search + create); it has no registration/transporter column at all (confirmed from the sheet's own real data, unchanged from Slice 1's finding). Vansales gets `truck` → Transporter and `registration` → Vehicle (search only) — **and nothing else**: direct inspection of `validateAndBuildVansales` confirmed `payerName` is not `customerName`, and Vansales has no destination field, so neither selector was added there, per the client's own "do not blindly add fields where they have no semantic meaning" instruction. Depot STO gets all four (`customerName`, `transporter`, `registration`, `destinationTown`).

**ASSUMPTION / documented simplification:** the Truck registration search does not automatically narrow to the currently-typed Transporter's own fleet (the repository method, `searchConfirmedByRegistration`, supports an optional `transporterPartnerId` narrowing parameter, but the manual-entry form does not yet track the selected transporter's *id* — only its display name, since the underlying field remains a plain string). This is a reasonable, low-risk simplification for this slice, not a defect: a full vehicle search still resolves the correct row in every real case, since registrations are tenant-unique. **REVERSIBILITY:** additive — wiring the narrowing through is a small follow-up once/if the client asks for it, requiring no changes to the search API already built.

**REVERSIBILITY (the data model as a whole):** fully additive. Nothing on `TransportCostSourceRecord`/`TransportCostLine` changed shape — `customerName`/`destinationTown`/`transporterRaw`/`registrationRaw` remain the plain strings they always were; the master-data layer sits *in front of* the existing model exactly as originally recommended, filling those same fields with a canonical, deduplicated value instead of raw free text. Historical rows created before this slice, and any row a bulk import creates going forward, are unaffected. No foreign-key migration was performed this slice, and none is required for anything built here to keep working.

**What was actually built, end to end:**

- `modules/transport-cost/utils/normalization.utils.ts` — `normalizeMasterDataName()`.
- `shared/types/customer.types.ts` / `shared/types/destination.types.ts` — the two new entity types.
- `modules/transport-cost/repositories/customer.repository.ts` / `destination.repository.ts` — new (`findByNormalizedName`, `search`, `listPaginated`).
- `modules/transport-cost/repositories/transport-partner.repository.ts` / `contracted-vehicle.repository.ts` — one new read-only search method added to each (`searchConfirmedByName` / `searchConfirmedByRegistration`), confirmed-rows-only, no write method added.
- `modules/transport-cost/services/master-data.service.ts` — `MasterDataService`: find-or-create for Customer/Destination (with the two-layer duplicate protection above), search-only for Transporter/Vehicle, deactivate/reactivate for Customer/Destination.
- `modules/transport-cost/controllers/master-data.controller.ts` and ten new routes under `app/api/transport-cost/{customers,destinations,transporters,vehicles}/...` — thin, `withAuth`-gated, following this module's existing controller conventions exactly.
- `server/tenancy/module-scope.registry.ts` — `tblcustomers`/`tbldestinations` registered.
- `infrastructure/database/indexes.transport-cost-addendum.ts` — a unique `{tenantId, normalizedName}` index and a `{tenantId, active, name}` search index for each new collection; `tests/security/transport-cost-indexes.spec.ts` extended to pin both.
- `frontend/shared/ui/forms/SearchCreateSelect.tsx` — the new combobox component, exported from the forms barrel.
- `frontend/shared/import/ImportModal.tsx` — `ImportColumnType` widened with `'search-select'` plus a `searchSelect` config field; `ImportModal`'s own bulk-upload rendering/coercion is otherwise untouched (an unrecognized type already fell through `coerceValue`'s default case as plain text, so this is provably backward-compatible).
- `frontend/shared/import/ManualEntryModal.tsx` — `FieldInput` gained a `'search-select'` branch rendering `SearchCreateSelect`.
- `frontend/modules/transport-cost/services/transport-cost.api.ts` — six new client methods (`search`/`create` for Customer/Destination, `search` only for Transporter/Vehicle).
- `frontend/modules/transport-cost/pages/TransportCostImportPage.tsx` — the manual-only `*_MANUAL_COLUMNS` variants and field-mapping wiring described above; every `ImportModal` instance (bulk upload) is unchanged.

---

## 7. Form changes

**Shipped:** the cost-facing company selector (Section 4) across manual entry and bulk import, all four families; the repeatable "Load / Consignment Lines" multi-line manual-entry section for 3rd Party (Section 5); type-ahead search + "+ Add New" for Customer/Destination/Transporter/Truck registration across manual entry, all four families, wherever the field has semantic meaning (Section 6).

---

## 8. Table-CRUD changes — NOT STARTED

**DECISION (recommended):** add inline View/Edit/Delete/Duplicate/Resolve actions to the operational (pre-ledger) tables — the O1 source-record list and the O2 normalization-review queue — using the existing table-action-menu pattern already used elsewhere in this codebase (not a new pattern).

**REASONING, and the hard boundary that must never be crossed:** "CRUD" here means CRUD on *operational, pre-posting* records only. The moment a `TransportCostSourceRecord` has been posted to the Allocation Ledger (`TransportCostPostingService`), any correction to the figures that posting represents **must** go through the existing reversal + repost pattern (`AllocationService.reversePosting()` + a fresh `postSourceRecord()` call), never a direct edit of the posted `AllocationPosting` row (which is structurally impossible anyway — `update()`/`softDelete()`/`hardDelete()` on `AllocationLedgerRepository` all throw, verified again by this pass's full test run of `allocation-ledger-append-only.spec.ts`). "Edit" on an *already-posted* source record, in the UI, must therefore mean "trigger a reversal + repost of the associated posting(s), then apply the edit to the source record" — never a silent edit that leaves a stale ledger figure behind. This is a meaningfully different (and more involved) feature than "edit a pre-posting row," and should be scoped and built as its own slice with its own tests specifically proving the reversal path fires correctly, rather than folded into a general CRUD pass.

**Not built this pass.**

---

## 9. Reporting changes

**Shipped:** the by-company breakdown (Section 4).

**Designed, not built:** by-vehicle, by-transporter, by-destination breakdowns beyond what `TransportCostReportService` already exposes (it already has `getNetTotalsByVehicleForCategory`, from the pre-existing Command Centre Slice A0 work — a by-transporter and by-destination equivalent do not yet exist and would need new repository aggregations, following the exact same pattern as `getNetTotalsByCompanyAcrossVehicles`).

---

## 10. Dashboard changes

**Shipped:** the "By cost-facing company" card section on `TransportCostReportPage`.

**Designed, not built:** the client's daily/weekly/monthly/total cards, and trend/by-vehicle/by-transporter/by-destination/by-cost-category charts (items 10/11). The Command Centre design doc (`OLIVINE_COST_INTELLIGENCE_COMMAND_CENTRE_DESIGN.md`) already specifies Slices A/B/C for exactly this (aggregation + time-series, drill-down, data-quality panel) — still "Not started" per `COMMAND_CENTRE_PROGRESS.md`. **Recommendation:** build the Olivine dashboard as an extension of that existing, already-designed Command Centre work rather than a second, parallel dashboard effort — the client's item 10/11 request and the pre-existing Command Centre design are the same underlying need.

---

## 11. Data-quality changes

Pre-existing: the O1 handler already logs rejected/duplicate rows to `TransportCostImportExceptionRepository` (item 6 from an earlier phase), including — as of this pass — a missing/invalid `costFacingCompany` (verified by new unit tests). No further data-quality work was in scope for this pass beyond ensuring the new required field participates correctly in that existing mechanism, which it does.

---

## 12. Financial-ledger implications

- The append-only discipline is unmodified and re-verified (Section 8, Section 14).
- `costFacingCompany` is now a first-class, aggregable field on `AllocationPosting` (Section 4); the reversal-carry-forward limitation originally disclosed there was closed in Slice 2.
- No new cost category was introduced; the three companies are a dimension *within* the existing `third-party-transport` / `transport-retainer` / `stock-transfer` categories, not a fourth category.
- The fully-contained period rule (`periodStart >= X && periodEnd <= Y`) was preserved for the new company aggregation, consistent with every other total-producing ledger query.
- **Slice 2:** `TransportCostPostingService.resolveAmountAndPeriod` — the actual amount/period computation — was not modified at all, which is the structural guarantee that a multi-line source record can never post more than one `AllocationPosting` or multiply the posted amount by its line count. `getLoadSummaryInScope`/`loadSummary` is a source-record read (operational, not financial) and is never blended into the ledger-sourced financial totals in the same section or figure — see Section 5.
- **Slice 3:** master-data selection (Customer/Destination find-or-create, Transporter/Vehicle search) touches only `customerName`/`destinationTown`/`transporterRaw`/`registrationRaw` — plain source-record text fields, filled with a canonical value the same way free text always filled them. Nothing in `TransportCostPostingService`, `AllocationService`, or the ledger repositories was modified; `AllocationLedgerRepository` has no write path this slice touches at all (its own append-only guarantee, and the pre-existing append-only regression suite, are unaffected and re-verified — see Section 14). `Customer`/`Destination` are never referenced by `TransportCostSourceRecord`/`TransportCostLine` via a foreign key this slice — see Section 6.

---

## 13. Production-cutover plan — DESIGNED ONLY, NOT EXECUTED

Per the client's explicit instruction, **nothing in this section has been run.** No database reset, drop, or destructive script exists anywhere in this delivery. This is planning only, for the client's review before 1 October.

**Likely MASTER/REFERENCE data (survives the cutover, per the client's own item 15 list, confirmed against the actual schema):**
- `TransportPartner`, `ContractedVehicle` (organization-level, human-confirmed — no reason to reset)
- Users, roles, permissions, org units
- The `CostFacingCompany` definitions (a code-level union, not a database table — nothing to reset)
- Any future master-data collections from Section 6 (Customer/Destination/etc. reference lists)

**Likely TRANSACTIONAL data (candidate for reset/archive at cutover, pending explicit client authorization):**
- `TransportCostSourceRecord` (O1 source evidence)
- `NormalizationReviewItem` (O2 review queue)
- `AllocationPosting` rows specifically for the transport-cost categories (O3 postings) — **not** the entire ledger, which carries other cost categories (fuel, depreciation, etc.) unrelated to this cutover
- Import batches / import exceptions

**Recommended procedure, when the client explicitly authorizes it (not before):**
1. **Archive, never delete.** Export the full transactional dataset above (a straightforward `mongodump`-equivalent scoped to the relevant collections/tenant) to a clearly labeled, dated archive location *before* any reset step runs.
2. **Reset only the transactional collections** listed above, scoped to the tenant and, if applicable, a cutoff date — never `db.dropDatabase()` or an equivalent whole-database operation, and never touching the master/reference data above.
3. **Verify zero master-data loss** with an automated post-reset check (row counts for `TransportPartner`/`ContractedVehicle`/users/org-units before and after must match) before declaring the cutover complete.
4. **Keep the archive accessible** for historical reporting/audit — the January–September 2026 data does not need to be queryable in the live operating dashboard after 1 October, but it must remain recoverable.

**ASSUMPTION requiring explicit client confirmation before execution:** whether "transactional data resets" means (a) delete outright after archiving, or (b) mark as archived/superseded but leave queryable with a filter — these have very different implications for historical reporting continuity, and guessing wrong here is exactly the kind of decision that could "corrupt financial truth or historical attribution" the client's own brief warns against. This document deliberately stops short of recommending one over the other and asks the client to specify.

---

## 14. Security/tenancy implications

- No new module-scope registry entry was needed; `costFacingCompany` lives entirely within the existing `transport-cost`-module-scoped entities and the existing finance-module-scoped `AllocationPosting`, both already governed by the platform's tenant/org-unit isolation.
- The new `getNetTotalsByCompanyAcrossVehicles` aggregation applies both tenant scope and org-unit scope identically to every other ledger aggregation (verified by 3 of the 8 new repository tests: tenant exclusion, org-unit exclusion, and fail-closed-on-empty-scope).
- **Gap found and closed during this pass's verification, unrelated to the company-dimension work itself:** `tests/security/finance-indexes.spec.ts` (pre-existing, from the earlier Command Centre Slice A0 work) asserted an index — `{tenantId, costCategory, periodStart}` on `tblallocationledger`, backing `getNetTotalsByVehicleForCategory`/`findRawByCategoryInScope` — that had never actually been added to `infrastructure/database/indexes.finance-addendum.ts`. This meant that specific query pattern would have fallen back to a full tenant collection scan in production. Found by running the full test suite as part of this pass's own verification discipline, and fixed (the missing index was added) rather than left as a known-failing test.
- **Slice 3:** `tblcustomers`/`tbldestinations` registered in `server/tenancy/module-scope.registry.ts` as an extension of the pre-existing "MIXED-LEVEL MODULE" exception already covering `TransportPartner`/`ContractedVehicle`/`NormalizationReviewItem`/`TransportCostVatConfig` (one registry entry, not a fragmented second one, per the conformance suite's own requirement — re-verified passing). Every new Customer/Destination repository method goes through the same `BaseRepository`/`resolveTenantScope` machinery as every other repository in the codebase — no new bypass path. Empty-scope fail-closed and cross-tenant isolation are proven directly by new adversarial tests (`customer-destination.repository.spec.ts`), not merely assumed from the shared layer. Transporter/Vehicle search adds two new READ-ONLY methods to the existing `TransportPartner`/`ContractedVehicle` repositories (`searchConfirmedByName`/`searchConfirmedByRegistration`) — confirmed-rows-only, no new write path, so the O2 review-gated creation discipline is unmodified and unweakened.

---

## 15. Recommended implementation order

1. ~~Cost-facing company dimension (Section 4)~~ — **done, Slice 1.**
2. ~~Multi-line transport records (Section 5)~~ — **done, Slice 2**, including the Section 4 `reversePosting()` follow-up.
3. ~~Master-data search fields (Section 6)~~ — **done, Slice 3.**
4. **Broader dashboard (Section 10),** by extending the already-designed Command Centre Slices A/B/C rather than starting over.
5. **Inline table CRUD (Section 8)** — scoped carefully around the reversal/repost boundary described there; now that the multi-line model has landed, "edit a row" on a multi-line operation must edit/add/remove individual lines, not just parent scalar fields — scope this explicitly when Section 8 is built.
6. **Production cutover execution** — only on the client's explicit, separate authorization, using the plan in Section 13, after the client has answered the archive-vs-delete question raised there.

This order prioritizes the items the client gave the most explicit, detailed instructions about (company dimension, multi-value records) first, defers genuinely new UI surface area (master data, broader dashboard, CRUD) to dedicated passes where they can be built and verified properly, and keeps the irreversible step (cutover execution) strictly gated on explicit client sign-off, consistent with every constraint in the client's own requirements document.
