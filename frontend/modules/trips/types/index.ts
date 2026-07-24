// frontend/modules/trips/types/index.ts

import type {
  Trip,
  TripFilters,
  TripStats,
  TripCreateDTO,
  TripUpdateDTO,
  TripKpis,
  TripExceptionRow,
  TripStatus,
  TripType,
  TripMonthlyTrendPoint,
  VehicleUtilizationRow,
  DriverUtilizationRow,
  TripDistanceDistributionBucket,
  TripHeatmapCell,
  TripCostAnalyticsRow,
  TripCostSummary,
} from '@/shared/types/trip.types';
import type { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';

export type {
  Trip,
  TripFilters,
  TripStats,
  TripCreateDTO,
  TripUpdateDTO,
  TripKpis,
  TripExceptionRow,
  TripStatus,
  TripType,
  PaginationParams,
  PaginatedResponse,
  // PHASE 2
  TripMonthlyTrendPoint,
  VehicleUtilizationRow,
  DriverUtilizationRow,
  TripDistanceDistributionBucket,
  TripHeatmapCell,
  // PHASE 3
  TripCostAnalyticsRow,
  TripCostSummary,
};

export type TripMode = 'distance' | 'odometer';

export const TRIP_MODES: TripMode[] = ['distance', 'odometer'];

export const TRIP_STATUS_OPTIONS: TripStatus[] = ['planned', 'ongoing', 'completed', 'cancelled'];
export const TRIP_TYPE_OPTIONS: TripType[] = ['delivery', 'pickup', 'transfer', 'service_call', 'other'];

/** PHASE 2: shared sort dimension for the utilization ranking charts. */
export type TripUtilizationSort = 'trips' | 'distance';

export interface TripTableFilters extends TripFilters {
  /** Free-text search, currently routed to the license_plate filter. */
  search?: string;
}

export interface TripColumnVisibility {
  mode: boolean;
  date: boolean;
  distance: boolean;
  driver: boolean;
  start_location: boolean;
  end_location: boolean;
  notes: boolean;
  status: boolean;
}

export const DEFAULT_TRIP_COLUMN_VISIBILITY: TripColumnVisibility = {
  mode: true,
  date: true,
  distance: true,
  driver: true,
  start_location: false,
  end_location: false,
  notes: false,
  status: true,
};

export interface DistanceUnitOption {
  unit_id: string;
  name: string;
  symbol: string;
  type: string;
}