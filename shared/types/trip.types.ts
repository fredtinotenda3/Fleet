// shared/types/trip.types.ts

import { BaseEntity, Mode } from './common.types';

/**
 * PHASE 1 (Trip-as-operational-hub): status lets Trip answer
 * "completed / ongoing / cancelled" KPIs, which is impossible on the
 * old schema. Optional and defaulted server-side so existing rows
 * (all of which predate this field) keep working -- see
 * CreateTripHandler / UpdateTripHandler and the migration note below.
 */
export type TripStatus = 'planned' | 'ongoing' | 'completed' | 'cancelled';
export const TRIP_STATUSES: TripStatus[] = ['planned', 'ongoing', 'completed', 'cancelled'];

/**
 * trip_type is a light operational classifier (not a hard FK) so
 * existing trips can be bucketed for "Trip Type Distribution" without
 * requiring a new lookup collection. Kept as a small closed enum
 * rather than free text so the distribution chart has stable buckets.
 */
export type TripType = 'delivery' | 'pickup' | 'transfer' | 'service_call' | 'other';
export const TRIP_TYPES: TripType[] = ['delivery', 'pickup', 'transfer', 'service_call', 'other'];

/**
 * created_from records provenance (manual entry vs. bulk import vs.
 * future dispatch/GPS auto-creation) without needing a separate audit
 * lookup -- mirrors how FuelLog distinguishes receipt-derived rows.
 */
export type TripCreatedFrom = 'manual' | 'import' | 'dispatch' | 'gps';

export interface Trip extends BaseEntity {
  license_plate: string;
  distance_calculated: number;
  mode: Mode;
  date: Date;
  notes?: string;
  unit_id: string;
  trip_distance?: number;
  start_odometer?: number;
  end_odometer?: number;
  start_location?: string;
  end_location?: string;
  driver_id?: string;
  /** Inherited from the referenced vehicle's orgUnitId at write time -- see
   *  CreateTripHandler/UpdateTripHandler. Not user-submitted. */
  orgUnitId?: string;

  // --- PHASE 1 additions (all optional / backward compatible) ---
  status?: TripStatus;
  start_time?: Date;
  end_time?: Date;
  /** Derived server-side from start_time/end_time when both are present;
   *  never trust a client-submitted value for this field. */
  duration_minutes?: number;
  /** Derived server-side: distance_calculated / (duration_minutes / 60),
   *  only computed when duration_minutes > 0. km/h. */
  average_speed?: number;
  trip_type?: TripType;
  created_from?: TripCreatedFrom;
  /** Optional FK -> a future Route entity. No Route module exists yet,
   *  so this is stored but not validated against a collection until
   *  Phase 3 introduces one; kept nullable/optional so it's a pure
   *  additive column today. */
  routeId?: string;

  // --- Phase 3 cross-module FKs (declared now, not yet enforced) ---
  /** Real FK replacement for Expense's free-text `jobTrip` field.
   *  Populated only once Fuel/Expense forms gain a "link to trip"
   *  selector (Phase 3); left here so the shape is stable across phases. */
  fuel_used?: number;
  estimated_cost?: number;
}

export interface TripCreateDTO {
  license_plate: string;
  mode: Mode;
  date: Date | string;
  unit_id: string;
  notes?: string;
  trip_distance?: number;
  start_odometer?: number;
  end_odometer?: number;
  start_location?: string;
  end_location?: string;
  driver_id?: string;
  status?: TripStatus;
  start_time?: Date | string;
  end_time?: Date | string;
  trip_type?: TripType;
  routeId?: string;
}

export interface TripUpdateDTO extends Partial<TripCreateDTO> {
  _id: string;
}

export interface TripFilters {
  license_plate?: string;
  startDate?: Date;
  endDate?: Date;
  mode?: Mode;
  driver_id?: string;
  status?: TripStatus;
  trip_type?: TripType;
  routeId?: string;
}

export interface TripStats {
  totalDistance: number;
  totalTrips: number;
  averageDistance: number;
  byVehicle: Record<string, number>;
  byDriver: Record<string, number>;
}

/**
 * PHASE 1: Executive KPI set for the Trip Analytics page, mirroring the
 * shape/naming convention of FuelKpis (get-fuel-kpis.query.ts) so the
 * frontend KPI card component can reuse the same StatisticCard layout.
 * Every field here is directly computable from the current schema plus
 * the new `status`/time fields -- nothing here depends on Phase 3
 * cross-module FKs.
 */
export interface TripKpis {
  totalTrips: number;
  completedTrips: number;
  ongoingTrips: number;
  cancelledTrips: number;
  totalDistance: number;
  averageDistance: number;
  totalDrivingHours: number;
  averageDurationMinutes: number;
  activeVehicles: number;
  activeDrivers: number;
  mostUtilizedVehicle: { license_plate: string; trips: number } | null;
  mostUtilizedDriver: { driver_id: string; trips: number } | null;
  longestTrip: { _id: string; license_plate: string; distance: number } | null;
  shortestTrip: { _id: string; license_plate: string; distance: number } | null;
  /** Trend vs. the immediately preceding period of equal length,
   *  matching FuelKpis' trend convention (positive = up). */
  distanceTrend: number;
  tripCountTrend: number;
}

/**
 * PHASE 1: Exception analytics, equivalent in spirit to
 * ExpenseOutliersWidget / get-expense-outliers, adapted to trip-shaped
 * problems (duration/distance outliers, odometer inconsistency,
 * duplicate trips) rather than amount z-scores.
 */
export type TripExceptionType =
  | 'unusually_long_duration'
  | 'unusually_short_duration'
  | 'unusually_long_distance'
  | 'odometer_inconsistent'
  | 'possible_duplicate'
  | 'missing_driver';

export interface TripExceptionRow {
  _id: string;
  license_plate: string;
  date: Date;
  type: TripExceptionType;
  detail: string;
  distance?: number;
  duration_minutes?: number;
}

/**
 * PHASE 2: Monthly Trip Trend -- trips + distance + driving hours per
 * calendar month. Mirrors FuelKpis' monthly consumption shape
 * (get-monthly-fuel-consumption) so the frontend can reuse the same
 * dual-axis trend chart component pattern.
 */
export interface TripMonthlyTrendPoint {
  month: string; // 'YYYY-MM'
  trips: number;
  distance: number;
  drivingHours: number;
}

/**
 * PHASE 2: Vehicle Utilization -- powers "Trips by Vehicle", "Distance
 * by Vehicle", "Vehicle Utilization", "Most/Least Utilized Vehicle".
 * One row per license plate, ranked by whichever field the caller sorts
 * on (trips or distance).
 */
export interface VehicleUtilizationRow {
  license_plate: string;
  trips: number;
  totalDistance: number;
  totalDrivingHours: number;
  averageDistance: number;
  lastTripDate: Date | string | null;
}

/**
 * PHASE 2: Driver Utilization -- powers "Trips by Driver", "Distance by
 * Driver", "Driver Utilization", "Most/Least Utilized Driver". Mirrors
 * DriverFuelConsumptionRow's null/empty-string driver_id normalization
 * (get-fuel-by-driver) so unassigned trips collapse into a single
 * "Unassigned" bucket instead of fragmenting.
 */
export interface DriverUtilizationRow {
  driver_id: string | null;
  driverName: string;
  trips: number;
  totalDistance: number;
  totalDrivingHours: number;
  averageDistance: number;
  vehicleCount: number;
}

/** PHASE 2: Distance Distribution histogram bucket (mirrors FuelCostDistributionBucket). */
export interface TripDistanceDistributionBucket {
  min: number;
  max: number;
  count: number;
}

/**
 * PHASE 2: Trip day-of-week x hour-of-day heatmap cell (mirrors
 * FuelHeatmapCell). dayOfWeek: 0=Sunday..6=Saturday.
 */
export interface TripHeatmapCell {
  dayOfWeek: number;
  hour: number;
  count: number;
  distance: number;
}