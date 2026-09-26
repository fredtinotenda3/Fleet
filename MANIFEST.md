# Manifest — Olivine Transport Cost Slice 1–5 Production Verification Pass

FILE / WHY CHANGED

- `modules/transport-cost/repositories/transport-partner.repository.ts` — Root-cause fix for the reported "only ~20 transporters" defect: `searchConfirmedByName` now fetches `limit+1` and returns `{results, hasMore}` instead of a silently-capped bare array. Default page size 20→50.
- `modules/transport-cost/repositories/contracted-vehicle.repository.ts` — Identical fix for `searchConfirmedByRegistration` (the vehicle/truck-registration search equivalent of the transporter defect).
- `modules/transport-cost/repositories/customer.repository.ts` — Same latent defect found in `search()` (identical `limit=20` shape); fixed identically for consistency.
- `modules/transport-cost/repositories/destination.repository.ts` — Same fix, mirrors CustomerRepository exactly.
- `modules/transport-cost/services/master-data.service.ts` — Threads the new `hasMore` signal through `searchCustomers`/`searchDestinations`/`searchTransporters`/`searchVehicles`; adds the `MasterDataSearchPage` type.
- `modules/transport-cost/controllers/master-data.controller.ts` — Doc-comment only; response body shape changes automatically since the service's return type changed (no code change needed).
- `frontend/modules/transport-cost/services/transport-cost.api.ts` — Frontend API client mirror of `MasterDataSearchPage`; all four search methods now return `{results, hasMore}`.
- `frontend/shared/ui/forms/SearchCreateSelect.tsx` — Renders "Showing the first N matches — keep typing to narrow" when `hasMore` is true (Customer/Destination picker, also used by bulk-import manual-entry columns).
- `frontend/shared/ui/forms/SearchSelect.tsx` — Same hint, for the Command Centre's Vehicle/Transporter filters and the Review Queue's alternative-transporter picker.
- `frontend/modules/transport-cost/components/IdentityPicker.tsx` — Same hint, for Transporter/Vehicle pickers (Edit dialog, Review Queue alternative-match picker).
- `frontend/modules/transport-cost/components/EditRecordDialog.tsx` — Updates `handleTransporterSearch`/`handleVehicleSearch` for the new `{results, hasMore}` shape.
- `frontend/modules/transport-cost/pages/NormalizationReviewQueuePage.tsx` — Updates `handleAlternativeSearch` for the new shape.
- `frontend/modules/transport-cost/pages/CommandCentrePage.tsx` — (a) search-shape update where needed; (b) Slice 4 fix: "By vehicle" drill-down now uses the same filter-aware `DimensionDrillDownDialog` mechanism every other dimension already used, instead of the older, filter-blind `VehicleDrillDownDialog` path.
- `frontend/modules/transport-cost/pages/TransportCostImportPage.tsx` — Slice 5 fix: operational records table gains Category/Company/Customer/Destination columns (data was already fetched, just never rendered).
- `frontend/modules/transport-cost/pages/TransportOperationDetailPage.tsx` — Slice 5 fix: new "Data quality" section, derived from real already-fetched fields (never fabricated); cost-facing company now shows its display label instead of the raw enum value.
- `frontend/modules/transport-cost/types/index.ts` — Adds `COST_CATEGORY_LABEL_BY_FAMILY`, a display-only, drift-guarded mirror of the backend's `COST_CATEGORY_BY_FAMILY` (frontend cannot import the server-only service file directly).
- `frontend/modules/transport-cost/utils/operation-data-quality.utils.ts` — NEW. Pure function backing the detail page's data-quality section; extracted to a plain `.ts` file so it stays unit-testable under this project's JSX-less Jest config.
- `frontend/shared/import/ImportModal.tsx` — Type-signature update for `ImportColumnSearchSelectConfig.search`'s new `{results, hasMore}` return shape.
- `tests/unit/transport-cost/transporter-vehicle-search.repository.spec.ts` — NEW. Direct repository-level coverage of the search fix: reviewStatus/merge filtering, `hasMore` true/false, adversarial tenant isolation, fail-closed empty tenant.
- `tests/unit/transport-cost/cost-category-label-sync.spec.ts` — NEW. Drift guard between the frontend's display-only category label map and the real backend `COST_CATEGORY_BY_FAMILY`.
- `tests/unit/transport-cost/operation-detail-data-quality.spec.ts` — NEW. Unit tests for the data-quality section's derivation logic (9 cases, including a "no issues" case and a "multiple simultaneous issues" case).
- `tests/unit/transport-cost/master-data.service.spec.ts` — Updated mocks/assertions for the new `{results, hasMore}` shape; added `hasMore=true` propagation tests for customers/transporters/vehicles.
- `tests/unit/transport-cost/customer-destination.repository.spec.ts` — Updated existing assertions for the new shape; added `hasMore` true/false tests with an explicit "the (limit+1)-th row is never surfaced as a phantom result" assertion.
- `OLIVINE_SLICE_1_5_PRODUCTION_VERIFICATION_REPORT.md` — NEW. Full root-cause/fix/security/test/remaining-gaps documentation for this pass.

## What is NOT in this ZIP

No `node_modules`, `.next`, `.git`, `coverage`, caches, build artifacts,
or any file this pass did not change. Every file above is a real,
already-existing project file this pass modified, or a genuinely new
file this pass added — nothing here is a full-project export.
