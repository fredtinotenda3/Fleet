// frontend/modules/transport-cost/types/index.ts
//
// Phase O4 frontend types. Re-exports the backend report response
// shapes as-is rather than restating them -- the same technique
// frontend/modules/finance/types/index.ts and frontend/modules/
// attention/types/index.ts use. Restating a financial response shape
// client-side is how a field silently drifts from what the API
// actually returns.

import type {
  TransportCostAllocationReport,
  StreamGroupTotal,
  CompanyGroupTotal,
  VehicleGroupTotal,
  PostingDrillDown,
  DataQualityExceptionRow,
  DataQualityExceptionsReport,
  // OLIVINE LIVE OPERATING MODEL, SLICE 4 (Command Centre). Same
  // re-export-not-restate technique as every type above -- see
  // TransportCostReportService.getCommandCentreSummary's own header for
  // the single source of truth these mirror.
  CommandCentreGranularity,
  CommandCentreFilters,
  CommandCentreDimensionTotal,
  CommandCentreTimeSeriesBucket,
  CommandCentreDataQuality,
  CommandCentreSummary,
} from '@/modules/transport-cost/services/transport-cost-report.service';
import type { AllocationPosting } from '@/modules/finance/types/allocation.types';
// OLIVINE LIVE OPERATING MODEL, SLICE 2 (item 6/7). Same re-export-not-
// restate technique as the report types above, applied to the new
// child-line shape -- TransportCostSourceRecord.lines' own doc comment
// (shared/types/transport-cost.types.ts) is the single source of truth
// for what a line is; this file only re-exports it for frontend imports.
import type { TransportCostLine } from '@/shared/types/transport-cost.types';

export type {
  TransportCostAllocationReport,
  StreamGroupTotal,
  CompanyGroupTotal,
  VehicleGroupTotal,
  PostingDrillDown,
  DataQualityExceptionRow,
  DataQualityExceptionsReport,
  AllocationPosting,
  TransportCostLine,
  CommandCentreGranularity,
  CommandCentreFilters,
  CommandCentreDimensionTotal,
  CommandCentreTimeSeriesBucket,
  CommandCentreDataQuality,
  CommandCentreSummary,
};
export type { CostFacingCompany, CostFacingCompanyOption } from '@/shared/types/cost-facing-company.types';
export { COST_FACING_COMPANIES } from '@/shared/types/cost-facing-company.types';

/**
 * OLIVINE LIVE OPERATING MODEL, SLICE 4 (Command Centre). The Command
 * Centre's own cost-category filter is intentionally narrower than the
 * full `AllocationCostCategory` union (fuel/maintenance/expense/... are
 * not transport-cost categories) -- this is the frontend mirror of
 * TransportCostReportService.TRANSPORT_COST_CATEGORIES, restated (not
 * imported) because that constant lives in a server-only module; the
 * service itself validates every value against the same three tokens,
 * so a drift here would fail loudly rather than silently, unlike the
 * response-shape re-exports above.
 */
export const TRANSPORT_COST_CATEGORY_OPTIONS: Array<{ value: 'third-party-transport' | 'transport-retainer' | 'stock-transfer'; label: string }> = [
  { value: 'third-party-transport', label: 'Third-party transport' },
  { value: 'transport-retainer', label: 'Transport retainer' },
  { value: 'stock-transfer', label: 'Stock transfer' },
];
