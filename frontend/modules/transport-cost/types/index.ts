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
  // GAP-CLOSURE PASS, Objective 4. Same re-export-not-restate technique.
  CommandCentreDrillDownDimension,
  CommandCentreDrillDownRow,
  CommandCentreDrillDownResult,
  DataQualityIssueKind,
  DataQualityIssueEvidenceRow,
  DataQualityIssueEvidenceResult,
} from '@/modules/transport-cost/services/transport-cost-report.service';
import type { AllocationPosting } from '@/modules/finance/types/allocation.types';
// OLIVINE LIVE OPERATING MODEL, SLICE 2 (item 6/7). Same re-export-not-
// restate technique as the report types above, applied to the new
// child-line shape -- TransportCostSourceRecord.lines' own doc comment
// (shared/types/transport-cost.types.ts) is the single source of truth
// for what a line is; this file only re-exports it for frontend imports.
import type { TransportCostLine } from '@/shared/types/transport-cost.types';
// OLIVINE LIVE OPERATING MODEL, SLICE 5. Same re-export-not-restate
// technique -- these are the exact backend response/request shapes for
// the operational table, detail view, and O2 review-queue frontend;
// restating them here would let the frontend silently drift from what
// TransportCostRecordCommandService/the review-queue controller methods
// actually return.
import type {
  OperationalStatus,
  OperationalStatusResult,
} from '@/modules/transport-cost/services/transport-cost-lifecycle.service';
import type {
  OperationalRecordView,
  SourceRecordPatch,
} from '@/modules/transport-cost/services/transport-cost-record-command.service';
import type { PostSourceRecordOutcome } from '@/modules/transport-cost/services/transport-cost-posting.service';
import type { NormalizationReviewItem, NormalizationKind } from '@/shared/types/normalization-review.types';
import type { ConfirmReviewMatchResult } from '@/modules/transport-cost/commands/handlers/confirm-review-match.handler';
import type { ConfirmReviewNewResult } from '@/modules/transport-cost/commands/handlers/confirm-review-new.handler';
import type { BusinessStream } from '@/shared/types/contracted-vehicle.types';
// GAP-CLOSURE PASS, Objectives 1/3/5. Same re-export-not-restate technique.
import type { AuditLogEntry } from '@/modules/security/types/audit-log.types';
import type { TransportPartner, TransportPartnerReviewStatus } from '@/shared/types/transport-partner.types';
import type { ContractedVehicle, ContractedVehicleReviewStatus } from '@/shared/types/contracted-vehicle.types';
import type { RequestNewTransporterResult } from '@/modules/transport-cost/commands/handlers/request-new-transporter.handler';
import type { RequestNewVehicleResult } from '@/modules/transport-cost/commands/handlers/request-new-vehicle.handler';
import type { PendingMasterDataResult } from '@/modules/transport-cost/queries/handlers/list-pending-master-data.handler';

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
  CommandCentreDrillDownDimension,
  CommandCentreDrillDownRow,
  CommandCentreDrillDownResult,
  DataQualityIssueKind,
  DataQualityIssueEvidenceRow,
  DataQualityIssueEvidenceResult,
  OperationalStatus,
  OperationalStatusResult,
  OperationalRecordView,
  SourceRecordPatch,
  PostSourceRecordOutcome,
  NormalizationReviewItem,
  NormalizationKind,
  ConfirmReviewMatchResult,
  ConfirmReviewNewResult,
  BusinessStream,
  AuditLogEntry,
  TransportPartner,
  TransportPartnerReviewStatus,
  ContractedVehicle,
  ContractedVehicleReviewStatus,
  RequestNewTransporterResult,
  RequestNewVehicleResult,
  PendingMasterDataResult,
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
