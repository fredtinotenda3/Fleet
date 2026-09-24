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
} from '@/modules/transport-cost/services/transport-cost-report.service';
import type { AllocationPosting } from '@/modules/finance/types/allocation.types';

export type {
  TransportCostAllocationReport,
  StreamGroupTotal,
  CompanyGroupTotal,
  VehicleGroupTotal,
  PostingDrillDown,
  DataQualityExceptionRow,
  DataQualityExceptionsReport,
  AllocationPosting,
};
export type { CostFacingCompany, CostFacingCompanyOption } from '@/shared/types/cost-facing-company.types';
export { COST_FACING_COMPANIES } from '@/shared/types/cost-facing-company.types';
