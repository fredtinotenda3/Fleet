# CHANGELOG — Olivine Live Operating Model, Slice 3 (Master Data Search + "+ Add New")

**Date:** 24 September 2026
**Trigger:** client's explicit Slice 3 specification ("OLIVINE LIVE OPERATING MODEL — SLICE 3: MASTER DATA SEARCH + '+ ADD NEW'"), accepting Slices 1–2's delivery and building on it without redesigning or resetting it.
**Full analysis:** see `OLIVINE_LIVE_OPERATING_MODEL_GAP_ANALYSIS.md` Section 6 (rewritten in place for this slice) for the complete design record — what existing master data was found and reused, what was newly created and why, every DECISION/REASONING/ASSUMPTION/REVERSIBILITY note. See `CHANGELOG-olivine-live-operating-model-slice-2.md` for Slice 2, `CHANGELOG-olivine-live-operating-model.md` for Slice 1.

## Summary

Users can now search existing Customer, Transporter, Truck registration, and Destination values while filling in a manual-entry transport-cost form, select an existing record, or — for Customer and Destination only — create a new one on the spot via "+ Add New", which is then immediately selected. This replaces uncontrolled free-text retyping ("Olivine Harare Depot" fifty different ways) with a real search-and-select experience, using this codebase's own existing Command/Popover UI primitives.

**Existing master data was inspected first, and reused wherever it already fit — no duplicate identity systems were created.** `TransportPartner` and `ContractedVehicle` already are the one authoritative identity for Transporter and Truck registration; this slice adds only a read-only search method to each and changes nothing else about them. Customer and Destination had no existing reusable entity — free text only — so two new, genuinely lightweight, organization-level reference collections (`tblcustomers`, `tbldestinations`) were added, structured exactly like the "MIXED-LEVEL MODULE" precedent `TransportPartner`/`ContractedVehicle` already established.

**The single most important decision in this delivery: Transporter and Truck registration get search only — never "+ Add New."** The codebase's own stated rule is that nothing outside a confirmed `NormalizationReviewItem` may ever create a `TransportPartner`/`ContractedVehicle` row. A synchronous "+ Add New Transporter" button would have to violate that rule by construction (a confirmed, ledger-postable identity from unreviewed input). Genuinely new transporters/vehicles continue to be created exactly as before — through the unmodified O1 import / O2 normalization-review queue. Customer and Destination are different: they never gate FX resolution, vehicle identity, or ledger computation, so full find-or-create is safe for them, with duplicate protection (an exact-normalized-name pre-check plus a unique index as race-condition defense-in-depth — never fuzzy matching, per the client's own "exact/normalized matching is safer than guessing" instruction for financial identity).

**Bulk file import is completely unaffected.** Every `ImportModal` (bulk-upload) instance keeps its original column-definition objects, unchanged; only the five `ManualEntryModal` instances were given search-enabled variants. Nothing on `TransportCostSourceRecord`/`TransportCostLine` changed shape — `customerName`/`destinationTown`/`transporterRaw`/`registrationRaw` remain the plain strings they always were, now filled with a canonical, deduplicated value instead of raw free text.

**No destructive database operation of any kind was performed or written. No historical data was touched, migrated, or deleted. No foreign-key migration was performed. This is a pure additive change**, following the same discipline as Slices 1–2.

## New files

**Backend — data model:**
- `shared/types/customer.types.ts` / `shared/types/destination.types.ts` — the two new entity types (`{ name, normalizedName, active, ...BaseEntity }`).
- `modules/transport-cost/repositories/customer.repository.ts` / `destination.repository.ts` — `findByNormalizedName`, `search` (active-only, case-insensitive contains match, sorted by name), `listPaginated`.
- `modules/transport-cost/services/master-data.service.ts` — `MasterDataService`: find-or-create (with two-layer duplicate protection) for Customer/Destination; search-only for Transporter/Vehicle; deactivate/reactivate for Customer/Destination.
- `modules/transport-cost/controllers/master-data.controller.ts` — thin HTTP boundary, following `transport-cost.controller.ts`'s own conventions exactly.

**Backend — routes:**
- `app/api/transport-cost/customers/route.ts` (GET list, POST create), `.../customers/search/route.ts` (GET), `.../customers/[id]/deactivate/route.ts`, `.../customers/[id]/reactivate/route.ts`.
- `app/api/transport-cost/destinations/route.ts`, `.../destinations/search/route.ts`, `.../destinations/[id]/deactivate/route.ts`, `.../destinations/[id]/reactivate/route.ts`.
- `app/api/transport-cost/transporters/search/route.ts`, `app/api/transport-cost/vehicles/search/route.ts` — search only, no create route exists for either.

**Frontend:**
- `frontend/shared/ui/forms/SearchCreateSelect.tsx` — the new combobox: debounced type-ahead search, an "+ Add New" action when the field supports creation, keyboard-navigable via this codebase's existing `Command`/`Popover` primitives (the same two components `Autocomplete.tsx` already composes). Exported from `frontend/shared/ui/forms/index.ts`.

**Tests:**
- `tests/unit/transport-cost/customer-destination.repository.spec.ts` — 22 tests, run against both `CustomerRepository` and `DestinationRepository` (structurally identical, so one parameterized suite covers both): normalized-name lookup (including resolving an inactive record for historical continuity), active-only search with case-insensitive contains matching, empty-query behavior, paginated listing, and — adversarially — cross-tenant isolation on search and lookup, and empty-tenantId fail-closed on every read and on create.
- `tests/unit/transport-cost/master-data.service.spec.ts` — 14 tests: find-or-create for a genuinely new record, duplicate-prevention (existing record returned, no write attempted), the race-condition `ConflictError` recovery path, input validation (blank/oversized names), search result mapping for all four fields (including the vehicle search's transporter-name join and its graceful fallback), and deactivate/reactivate (including `NotFoundError` for an unknown id).
- `CHANGELOG-olivine-live-operating-model-slice-3.md` — this file.

## Changed files

**Backend — data model and search:**
- `modules/transport-cost/utils/normalization.utils.ts` — new `normalizeMasterDataName()` (uppercase, whitespace-collapsed — deliberately identical logic to the existing `normalizeTransporter`, reused under its own name).
- `modules/transport-cost/repositories/transport-partner.repository.ts` — new `searchConfirmedByName()`: confirmed rows only, canonicalName contains-match. No write method added.
- `modules/transport-cost/repositories/contracted-vehicle.repository.ts` — new `searchConfirmedByRegistration()`: confirmed rows only, optional `transporterPartnerId` narrowing. No write method added.

**Backend — tenancy/security:**
- `server/tenancy/module-scope.registry.ts` — `tblcustomers`/`tbldestinations` added to the transport-cost module's existing entry, as an extension of the pre-existing "MIXED-LEVEL MODULE" exception paragraph (one entry, not a fragmented second registration).
- `infrastructure/database/indexes.transport-cost-addendum.ts` — a unique `{tenantId, normalizedName}` index (the duplicate-protection floor) and a `{tenantId, active, name}` search index for each of `tblcustomers`/`tbldestinations`.
- `tests/security/transport-cost-indexes.spec.ts` — extended with the two new collections and dedicated uniqueness/search-index assertions for both.

**Frontend:**
- `frontend/shared/import/ImportModal.tsx` — `ImportColumnType` widened with `'search-select'`, plus a new `ImportColumnSearchSelectConfig`/`searchSelect` field on `ImportColumnDef`. `ImportModal`'s own bulk-upload rendering and `coerceValue()` are otherwise unchanged — an unrecognized column type already fell through `coerceValue`'s default (plain-text) branch, so this is provably backward-compatible even though no `ImportModal` instance is ever given a `'search-select'` column.
- `frontend/shared/import/ManualEntryModal.tsx` — `FieldInput` gained a `'search-select'` branch rendering `SearchCreateSelect`, wired to the column's `searchSelect` config. Falls back to the plain text input if `searchSelect` is ever omitted by mistake, rather than crashing mid-form.
- `frontend/modules/transport-cost/services/transport-cost.api.ts` — six new client methods: `searchCustomers`/`createCustomer`, `searchDestinations`/`createDestination`, `searchTransporters`, `searchVehicles`.
- `frontend/modules/transport-cost/pages/TransportCostImportPage.tsx` — new manual-entry-only `*_MANUAL_COLUMNS` variants (`THIRD_PARTY_PARENT_MANUAL_COLUMNS`, `THIRD_PARTY_LINE_MANUAL_COLUMNS`, `VANSALES_MANUAL_COLUMNS`, `SWIFT_MANUAL_COLUMNS`, `DEPOT_STO_MANUAL_COLUMNS`), derived from (never mutating) the original bulk-upload column sets. Only the five `ManualEntryModal` instances were switched to these variants; every `ImportModal` instance keeps its original columns unchanged.

**Documentation:**
- `OLIVINE_LIVE_OPERATING_MODEL_GAP_ANALYSIS.md` — Section 6 rewritten from "ANALYZED, DESIGNED, NOT YET BUILT" to "SHIPPED", recording what existing master data was found/reused, what was newly created, and every DECISION/REASONING/ASSUMPTION/REVERSIBILITY note, including the field-mapping decision per sheet family and the documented Truck-registration/Transporter-narrowing simplification. Sections 1, 7, 12, 14, 15 updated to reflect Slice 3's completion.

## Backward compatibility

- `customerName`, `destinationTown`, `transporterRaw`/`transporterNormalized`, `registrationRaw`/`registration` remain exactly the plain-string fields they always were on `TransportCostSourceRecord`/`TransportCostLine` — no consumer reading those fields directly needs to change, and none was changed. No foreign key to `Customer`/`Destination`/`TransportPartner`/`ContractedVehicle` was added to either type.
- Bulk file import (`ImportModal`) is unchanged in every respect (columns, downloadable template, validation, coercion, behavior) for all four sheet families — verified both by code inspection (every `ImportModal` instance still receives the original, untouched column arrays) and by the full regression suite below.
- A record created or edited before this slice, with plain free text in these fields, is completely unaffected and requires no migration.
- No comma-separated fields were introduced anywhere.

## Security/tenancy guarantee (structural, not just tested)

Every new Customer/Destination repository method extends `BaseRepository` and goes through the exact same `getTenantFilter`/`resolveTenantScope` machinery every other repository in this codebase already uses — no new bypass path was written. An empty or missing tenantId fails closed at that shared layer (throws `TenantScopeError`) rather than defaulting to platform-wide scope, inherited automatically. This is proven directly, not assumed: `customer-destination.repository.spec.ts` includes adversarial tests for cross-tenant search/lookup leakage and empty-scope-fails-closed on every read and on create, for both new collections. The two new Transporter/Vehicle search methods are read-only additions to the existing, already-tenant-scoped `TransportPartner`/`ContractedVehicle` repositories and query confirmed rows only — the O2 human-review creation discipline for those two entities is completely unmodified.

## Verification performed

- `npx tsc --noEmit` — clean, no errors, across the whole project (confirmed repeatedly through the build-out: after the backend, again after the frontend wiring, and again after the final test files).
- `npx jest tests/security tests/unit` — **176 test suites, 3170 tests, 0 failed** (includes the 36 new Slice 3 tests plus every pre-existing suite, including the full Slice 1/2 regression surface: `import-transport-cost.handler.spec.ts`, `import-transport-cost.handler.multiline.spec.ts`, `transport-cost-posting.service.spec.ts`, `transport-cost-report.service.spec.ts`, and the full `tests/security` directory proving tenancy/RBAC/append-only-ledger guarantees are unaffected).
- `npm test -- --runInBand` (the client's own exact requested command, which also sweeps `tests/e2e` and `tests/performance`) — **180 test suites, 3215 tests, 0 failed.**
- `npx eslint` on all touched/new production files — **zero violations.** The pre-existing `@typescript-eslint/no-explicit-any` findings in new test files (and one untouched line in `transport-partner.repository.ts`'s pre-existing `addAlias` method) match this codebase's established, pervasive test-file convention exactly — reconfirmed this pass by lint-checking untouched pre-existing spec files in the same directories, which show the identical pattern (not a regression this pass introduced).
- One pre-existing bug in this codebase's own shared test helper (`tests/helpers/fake-collection.ts`) was found and fixed during this pass's verification: `.sort()` on the in-memory fake silently ignored its argument, and `$regex`/`$options` filters (the shape `containsMatch`/`prefixMatch` emit, used by every master-data and normalization search method) were entirely unsupported and threw. Both were extended — sort now genuinely sorts (deferred to `toArray()`, applied in the correct filter → sort → skip → limit order regardless of call order, matching real MongoDB), and `$regex`/`$options` are now matched as one unit. The full `tests/security tests/unit` suite (176 suites, 3170 tests) was re-run after this fix with zero regressions, confirming no other spec was silently depending on the old no-op sort behavior.
- `npx next build` (production build) — **blocked by this environment's lack of network access to Google Fonts** (`next/font` cannot fetch Geist/Geist Mono from fonts.googleapis.com), identical to the Slice 1/2 finding and unrelated to any code in this delivery. Reported honestly per the client's explicit instruction not to claim build success if the environment blocks it; `tsc --noEmit` and the full `jest` suite are the verification available in this environment.
- Multi-line 3rd Party Customer/Destination selection (item 13 of the client's test list) was verified by direct code inspection and full type-checking rather than an automated rendering test: this repository's Jest configuration (`jest.config.js`) discovers tests only under `tests/`, runs with `testEnvironment: 'node'`, and has no jsdom/React-Testing-Library rendering harness for frontend components — a pre-existing infrastructure limitation, not something this slice could safely add without its own separate verification pass. `SearchCreateSelect` is a plain, independently-controlled `value`/`onChange` field like any other `FieldInput` branch, so it composes with the existing repeatable-lines state in `ManualEntryModal` exactly the same way the plain-text `Input` branch already did (each line's own local object holds its own field values, keyed by `col.key`) — confirmed by reading `ManualEntryModal.tsx`'s `updateLine`/line-rendering code path, and by `tsc`'s clean pass across the full prop chain.

## What this delivery does NOT include

- "+ Add New" for Transporter or Truck registration — deliberately not built; would require bypassing the O2 human-review creation discipline, which the client's own instructions explicitly forbade. See the gap analysis, Section 6, for the full reasoning and the rejected alternative (a directly-created `needs-review` row).
- Truck-registration search narrowing to the currently-selected Transporter's own fleet — the repository method supports it (`transporterPartnerId` parameter), but the manual-entry form does not yet track the selected transporter's id, only its display name. Documented as a low-risk simplification, not a defect (registrations are tenant-unique, so a full-fleet search still resolves the correct row) — see the gap analysis, Section 6.
- Master-data search/"+ Add New" for bulk file import — deliberately not built; this remains a manual-entry-only capability, per the client's own "Master-data selection is primarily a manual-entry UX capability... do not silently create master records for every spelling variation encountered in an import" instruction.
- A management/administration surface for browsing, editing, or bulk-deactivating Customer/Destination records beyond the `list`/`deactivate`/`reactivate` API endpoints already built (no UI page consumes them yet) — the client's own instruction was to prioritize the operational search/"+ Add New" experience first and document this as the next increment if it would materially expand scope, which building a full admin UI this pass would have.
- Everything else the Slice 1/2 gap analysis already listed as not yet built (inline table CRUD, the broader dashboard/chart set, production cutover execution) — unchanged by this slice; see `OLIVINE_LIVE_OPERATING_MODEL_GAP_ANALYSIS.md` Sections 8–11 and 13.

**NO DATABASE RESET OR DESTRUCTIVE OPERATION OCCURRED.**
