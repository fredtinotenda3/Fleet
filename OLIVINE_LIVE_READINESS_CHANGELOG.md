# Changelog — Olivine live readiness & October 1, 2026 cutover pass

## Fixed

- **Transporter / Truck registration "+ Add New" now shows consistently**
  on every manual-entry form (3rd Party, Vansales, Depot STO), matching
  Customer/Destination on the same forms. Previously always absent (not
  flaky) — `onCreateNew` was left permanently unwired for these two
  fields. Now wired to the existing review-gated request-new flow, never
  a synchronous confirmed create.
  (`transporter-vehicle-search-select.utils.ts`, `TransportCostImportPage.tsx`,
  `SearchCreateSelect.tsx`, `ImportModal.tsx`, `ManualEntryModal.tsx`)
- **Primary "Transport Cost" navigation link now goes to the Command
  Centre**, not the old standalone O4 report page. The old page/route are
  kept as a redirect (reversible), not deleted.
  (`nav.config.ts`, `app/(protected)/transport-cost/report/page.tsx`)
- **`reset-business-data.ts` now covers the transport-cost module.**
  Previously this script would hard-refuse to run at all against any
  database containing transport-cost data (8 unclassified collections).
  Now classified: 3 operational collections cleared, 5 master-data/config
  collections preserved.
- **`VANSALES_PERIODIZATION_DECISION.md`'s status line was stale** — it
  said Vansales posting was "not yet implemented." Verified against the
  actual code: it is implemented (Option A, `TOTAL` as posted amount).
  Corrected.
- Removed one genuinely unused variable (`CYAN`) and one stray dead
  eslint-disable target found in a file this pass touched anyway.

## Added

- Synthetic demo dataset (`demo-data/`): four import-ready single-family
  workbooks plus one human-readable overview workbook, covering all three
  companies, nine transporters, twelve vehicles, eight destinations, ten
  customers, spread across October 2026. See `OLIVINE_DEMO_DATA_README.md`.
- `tests/unit/transport-cost/demo-data-import-validation.spec.ts` — runs
  every demo-data row through the real `ImportTransportCostHandler`
  validation methods; fails on any future schema drift between the demo
  data and the real importer.
- `tests/unit/transport-cost/transporter-vehicle-search-select.utils.spec.ts`
  — 8 tests covering the new Add-New wiring, including the
  transporter-must-be-resolved-first guard and cross-family isolation.
- 8 new assertions in `tests/security/reset-business-data-classification.spec.ts`
  naming every transport-cost collection's classification explicitly.
- `OLIVINE_CUTOVER_PROCEDURE.md` — step-by-step reset/cutover runbook.
- `OLIVINE_DEMO_DATA_README.md` — demo dataset documentation and
  walkthrough.
- `OLIVINE_LIVE_READINESS_REPORT.md` — full verification report.

## Verified, not changed

- VanSale end-to-end (manual entry, import, validation, review, posting,
  Command Centre) — confirmed fully working.
- Slice 1–5 master-data search pagination (`hasMore` signal) — confirmed
  intact from the prior verification pass.
- No fabricated analytics anywhere in the Command Centre — confirmed.
