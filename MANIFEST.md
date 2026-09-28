# Manifest — Olivine Live Readiness & October 1, 2026 Cutover Pass

FILE / WHY CHANGED

## Fixes

- `frontend/modules/transport-cost/utils/transporter-vehicle-search-select.utils.ts` — NEW. Root-cause fix for "Transporter/Truck registration does not consistently show + Add New": a factory producing review-gated `onCreateNew` wiring for both fields, with cross-field transporter-id resolution for vehicle creation. Extracted to a plain `.ts` file so its branching is unit-testable under this project's JSX-less Jest config.
- `frontend/modules/transport-cost/pages/TransportCostImportPage.tsx` — Uses the new factory (one isolated instance per family: 3rd Party, Vansales, Depot STO) in place of the old always-search-only `TRANSPORTER_SEARCH_SELECT`/`VEHICLE_SEARCH_SELECT` constants.
- `frontend/shared/ui/forms/SearchCreateSelect.tsx` — Adds an optional `onResultSelected` callback, fired whenever an existing or newly-created result is committed. Additive; every existing caller (Customer/Destination) is unaffected.
- `frontend/shared/import/ImportModal.tsx` — Extends `ImportColumnSearchSelectConfig`'s type with the same optional `onResultSelected` field.
- `frontend/shared/import/ManualEntryModal.tsx` — Threads `onResultSelected` through to `SearchCreateSelect`.
- `frontend/shared/ui/navigation/nav.config.ts` — Primary "Transport Cost" nav link now points at the Command Centre instead of the old standalone O4 report page; removed the now-duplicate "Command Centre" child entry.
- `app/(protected)/transport-cost/report/page.tsx` — Now a redirect to the Command Centre, per the client's own "one clear transport-cost intelligence experience" instruction. Kept as a redirect, not deleted, for reversibility.
- `scripts/reset-business-data.ts` — Adds the transport-cost module's 8 collections to the classification (3 operational → `CLEAR`, 5 master-data/config → `PRESERVE`). Previously unclassified, which meant this script would refuse to run at all against a database containing transport-cost data. Also removed one genuinely unused variable (`CYAN`) found while editing this file.
- `VANSALES_PERIODIZATION_DECISION.md` — Corrected a stale status line: Vansales posting (Option A) is implemented, not "not yet implemented" as it previously read.

## Tests

- `tests/unit/transport-cost/transporter-vehicle-search-select.utils.spec.ts` — NEW. 8 tests for the Add-New fix, including the transporter-must-be-resolved-first guard, invalidation-on-edit, and cross-family isolation.
- `tests/unit/transport-cost/demo-data-import-validation.spec.ts` — NEW. Runs every row of the shipped demo workbooks through the real `ImportTransportCostHandler.validateAndBuildX` methods — hard evidence the demo data matches the actual current import schema, not a claim taken on faith.
- `tests/security/reset-business-data-classification.spec.ts` — 8 new assertions naming every transport-cost collection's classification explicitly.

## Demo dataset (all synthetic — see OLIVINE_DEMO_DATA_README.md)

- `demo-data/olivine_demo_3rd_party.xlsx` — 25 rows, import-ready.
- `demo-data/olivine_demo_swift.xlsx` — 16 rows, import-ready.
- `demo-data/olivine_demo_vansales.xlsx` — 10 rows, import-ready (set period-month to 2026-10).
- `demo-data/olivine_demo_depot_sto.xlsx` — 13 rows, import-ready.
- `demo-data/olivine_demo_transport_cost_overview.xlsx` — human-readable overview only, not for upload.

## Documentation

- `OLIVINE_DEMO_DATA_README.md` — NEW. Demo dataset contents, walkthrough, and removal instructions.
- `OLIVINE_CUTOVER_PROCEDURE.md` — NEW. Step-by-step database reset/cutover runbook.
- `OLIVINE_LIVE_READINESS_CHANGELOG.md` — NEW. What changed, in changelog form.
- `OLIVINE_LIVE_READINESS_REPORT.md` — NEW. Full 14-section verification report.

## What is NOT in this ZIP

No `node_modules`, `.next`, `.git`, `coverage`, caches, build artifacts,
or any file this pass did not change. Every file above is a real,
already-existing project file this pass modified, or a genuinely new
file this pass added — nothing here is a full-project export.
