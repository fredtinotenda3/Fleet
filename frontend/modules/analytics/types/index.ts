// frontend/modules/analytics/types/index.ts
//
// PART 11 -- client-side mirror of
// modules/analytics/services/data-quality-coverage.service.ts's
// response shape. `generatedAt` is a STRING here (not `Date`) because
// NextResponse.json serializes it on the way out -- same caveat
// trips.api.ts's getPlayback() documents for its own timestamp fields.

export interface CoverageMetric {
  label: string;
  coveredCount: number;
  totalCount: number;
  percent: number;
  definition: string;
}

export interface DataQualityCoverageReport {
  totalVehicles: number;
  metrics: CoverageMetric[];
  generatedAt: string;
}
