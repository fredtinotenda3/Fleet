
========================================
FILE: TRIP.ts
========================================
FILE NOT FOUND: TRIP.ts

========================================
FILE: TRIP_MODULE_AUDIT.md
========================================
FILE NOT FOUND: TRIP_MODULE_AUDIT.md

========================================
FILE: shared/types/trip.types.ts
========================================
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

========================================
FILE: shared/types/fuel.types.ts
========================================
// shared/types/fuel.types.ts

import { BaseEntity } from './common.types';

export type FuelPaymentMethod = 'cash' | 'fuel_card' | 'credit_card' | 'company_account' | 'other';

export const FUEL_PAYMENT_METHODS: FuelPaymentMethod[] = [
  'cash',
  'fuel_card',
  'credit_card',
  'company_account',
  'other',
];

export interface FuelLog extends BaseEntity {
  license_plate: string;
  date: Date;
  fuel_volume: number;
  unit_id: string;
  driver_id?: string;
  cost: number;
  odometer?: number;
  station_name?: string;
  fuel_station_id?: string;
  fuel_type?: string;
  notes?: string;
  currency?: string;
  is_full_tank?: boolean;
  receipt_url?: string;
  payment_method?: FuelPaymentMethod;
  fuel_card_id?: string;
  /** Inherited from the referenced vehicle's orgUnitId at write time -- see
   *  CreateFuelLogHandler/UpdateFuelLogHandler. Not user-submitted. */
  orgUnitId?: string;
  unit?: {
    name: string;
    symbol: string;
    unit_id: string;
  };
  fuel_station?: {
    _id: string;
    name: string;
    brand?: string;
  };
  fuel_card?: {
    _id: string;
    card_last4: string;
    provider: string;
  };
  driver?: {
    _id?: string;
    name: string;
  };
}

export interface FuelLogCreateDTO {
  license_plate: string;
  date: Date | string;
  fuel_volume: number;
  unit_id: string;
  cost: number;
  odometer?: number;
  station_name?: string;
  fuel_station_id?: string;
  fuel_type?: string;
  notes?: string;
  currency?: string;
  is_full_tank?: boolean;
  receipt_url?: string;
  payment_method?: FuelPaymentMethod;
  fuel_card_id?: string;
}

export interface FuelLogUpdateDTO extends Partial<FuelLogCreateDTO> {
  _id: string;
}

export interface FuelFilters {
  license_plate?: string;
  unit_id?: string;
  driver_id?: string;
  startDate?: Date;
  endDate?: Date;
  payment_method?: FuelPaymentMethod;
  fuel_station_id?: string;
  fuel_card_id?: string;
}

export interface FuelPaymentBreakdown {
  method: FuelPaymentMethod;
  totalCost: number;
  totalVolume: number;
  count: number;
}

export interface FuelStats {
  totalFuel: number;
  totalCost: number;
  averageCostPerUnit: number;
  logCount: number;
  efficiency: number | null;
  paymentBreakdown: FuelPaymentBreakdown[];
}

export interface FuelKpis {
  averageFuelEfficiency: number;
  totalDistance: number;
  efficiencyTrend: number;
  costPerKm: number;
  costTrend: number;
  vehiclesTracked: number;
  abnormalConsumptionCount: number;
  abnormalConsumptionPercentage: number;
  daysSinceLastFill: number;
  mostRecentVehicle?: string;
  mostRecentPlate?: string;
  fallbackVehicleCount: number;
  fallbackPlates: string[];
}

export interface AbnormalFuelConsumptionRow {
  _id: string;
  license_plate: string;
  volume: number;
  station_name?: string;
  date: Date | string;
  anomalyScore: number;
  threshold: number;
}

export interface DriverFuelConsumptionRow {
  driver_id: string | null;
  driverName: string;
  totalFuel: number;
  totalCost: number;
  logCount: number;
  vehicleCount: number;
  averageCostPerUnit: number;
}

/** Fuel analytics granularity shared by trend-style charts. */
export type FuelTrendGranularity = 'week' | 'month' | 'quarter' | 'year';

/** #1 Vehicle Fuel Activity Timeline */
export interface VehicleFuelTimelinePoint {
   date: string;
   count: number;
   volume: number;
   cost: number;
}

/** #4 Fuel Spend by Station / #8 Top Fuel Stations (same source, sorted differently) */
export interface FuelByStationRow {
  station_id: string | null;
  stationName: string;
  totalSpend: number;
  totalLitres: number;
  visits: number;
}

/** #3 Fuel Activity Trend (combined bar + line) */
export interface FuelActivityTrendPoint {
  period: string;
  entries: number;
  volume: number;
  cost: number;
  avgCostPerLitre: number;
}

/** #5 Average Fuel Price Trend */
export interface FuelPriceTrendPoint {
  period: string;
  avgCostPerLitre: number;
}

/** #6 Fuel Type Distribution */
export interface FuelTypeDistributionRow {
  fuelType: string;
  litres: number;
  cost: number;
  percentage: number;
}

/** #7 Fueling Frequency by Vehicle */
export interface FuelFrequencyByVehicleRow {
  license_plate: string;
  count: number;
  totalVolume: number;
  totalCost: number;
}

/** #9 Fuel Cost Distribution (histogram) */
export interface FuelCostDistributionBucket {
  min: number;
  max: number;
  count: number;
}

/** #10 Fuel Entry Heatmap. dayOfWeek: 0=Sunday..6=Saturday */
export interface FuelHeatmapCell {
  dayOfWeek: number;
  hour: number;
  count: number;
}

========================================
FILE: shared/types/expense.types.ts
========================================
// shared/types/expense.types.ts

import { BaseEntity } from './common.types';

export interface ExpenseType extends BaseEntity {
  name: string;
  category: string;
  description?: string;
  isDefault?: boolean;
}

export interface Expense extends BaseEntity {
  license_plate: string;
  amount: number;
  date: Date;
  description?: string;
  jobTrip?: string;
  notes?: string;
  expense_type_id?: string;
  expense_type?: ExpenseType;
  /** Inherited from the referenced vehicle's orgUnitId at write time -- see
   *  CreateExpenseHandler/UpdateExpenseHandler. Not user-submitted. */
  orgUnitId?: string;
}

export interface ExpenseCreateDTO {
  license_plate: string;
  amount: number;
  date: Date | string;
  expense_type_id?: string | null;
  description?: string;
  jobTrip?: string;
  notes?: string;
}

export interface ExpenseUpdateDTO extends Partial<ExpenseCreateDTO> {
  _id: string;
}

export interface ExpenseFilters {
  license_plate?: string;
  type?: string;
  jobTrip?: string;
  startDate?: Date;
  endDate?: Date;
  minAmount?: number;
  maxAmount?: number;
}

export interface ExpenseStats {
  total: number;
  average: number;
  byType: Record<string, number>;
  byMonth: Record<string, number>;
  topCategories: Array<{ name: string; amount: number }>;
}

/** Powers the stacked category-over-time chart AND the category x month heatmap. */
export interface ExpenseCategoryOverTimePoint {
  category: string;
  month: string;
  amount: number;
  count: number;
}

/**
 * Rich per-category stats -- powers hover tooltips on the category chart
 * and the top-categories chart without any additional round trip: this
 * is fetched once per dashboard load, not per hover.
 */
export interface CategorySummary {
  category: string;
  total: number;
  count: number;
  average: number;
  min: number;
  max: number;
  latestDate: string | null;
  topVehicle: string | null;
  percentageOfTotal: number;
  /** null when no comparable prior period is available (no date range set). */
  momChangePercent: number | null;
}

/** Rich per-vehicle stats -- powers hover tooltips on vehicle charts. */
export interface TopVehicleExpenseRow {
  license_plate: string;
  totalAmount: number;
  expenseCount: number;
  topCategory: string;
  average: number;
  min: number;
  max: number;
  latestDate: string | null;
  momChangePercent: number | null;
}

export interface VehicleExpenseBreakdownRow {
  license_plate: string;
  category: string;
  amount: number;
  count: number;
}

export interface ExpenseAmountDistributionBucket {
  min: number;
  max: number;
  count: number;
}

export interface JobTripExpenseRow {
  jobTrip: string;
  category: string;
  amount: number;
  count: number;
}

/** Top N single transactions by amount -- flattened for direct chart/table use. */
export interface TopExpenseTransactionRow {
  _id: string;
  license_plate: string;
  category: string;
  amount: number;
  date: string;
  jobTrip: string | null;
  description: string | null;
}

/** Powers the calendar heatmap. */
export interface DailyExpenseTotal {
  date: string; // YYYY-MM-DD
  amount: number;
  count: number;
}

/** Statistical outliers -- amount more than `threshold` std-devs from that category's mean. */
export interface ExpenseOutlierRow {
  _id: string;
  license_plate: string;
  category: string;
  amount: number;
  date: string;
  categoryMean: number;
  categoryStdDev: number;
  zScore: number;
}

========================================
FILE: shared/types/vehicle.types.ts
========================================
// shared/types/vehicle.types.ts

import { BaseEntity, Status } from './common.types';

export interface Vehicle extends BaseEntity {
  license_plate: string;
  make: string;
  model: string;
  year: number;
  vehicle_type: string;
  purchase_date: string;
  fuel_type: string;
  color?: string;
  vin?: string;
  status: Status;
  registration_expiry?: string;
  insurance_provider?: string;
  last_service_date?: string;
  last_service_odometer?: number;
  service_interval?: number;
  odometer?: number;
  image_url?: string;
  notes?: string;
  orgUnitId?: string;
}

export interface VehicleCreateDTO {
  license_plate: string;
  make: string;
  model: string;
  year: number;
  vehicle_type: string;
  purchase_date: string;
  fuel_type: string;
  color?: string;
  vin?: string;
  status?: Status;
  registration_expiry?: string;
  insurance_provider?: string;
  service_interval?: number;
  odometer?: number;
  orgUnitId?: string;
}

export interface VehicleUpdateDTO extends Partial<VehicleCreateDTO> {
  _id: string;
}

export interface VehicleFilters {
  license_plate?: string;
  make?: string;
  model?: string;
  status?: Status;
  year?: number;
  vehicle_type?: string;
}

export interface VehicleStats {
  total: number;
  active: number;
  inactive: number;
  maintenance: number;
}

========================================
FILE: shared/types/driver.types.ts
========================================
// shared/types/driver.types.ts

import { BaseEntity } from './common.types';

export type DriverStatus = 'active' | 'inactive' | 'suspended';

export interface Driver extends BaseEntity {
  name: string;
  email?: string;
  phone?: string;
  /** Short internal code (badge #, staff ID) -- optional alt lookup key for CSV import. */
  driver_code?: string;
  license_number?: string;
  license_expiry?: Date;
  status: DriverStatus;
  notes?: string;
}

export interface DriverCreateDTO {
  name: string;
  email?: string;
  phone?: string;
  driver_code?: string;
  license_number?: string;
  license_expiry?: Date | string;
  status?: DriverStatus;
  notes?: string;
}

export interface DriverUpdateDTO extends Partial<DriverCreateDTO> {
  _id: string;
}

export interface DriverFilters {
  search?: string;
  status?: DriverStatus;
}

/**
 * Minimal embeddable reference shape. Used by FuelLog.driver (see
 * shared/types/fuel.types.ts) and anywhere else a full Driver record
 * would be overkill -- e.g. a fuel log only needs the name to render,
 * not the driver's license/contact details.
 */
export interface DriverRef {
  _id: string;
  name: string;
  driver_code?: string;
}

========================================
FILE: shared/types/common.types.ts
========================================
// shared/types/common.types.ts

export type ID = string;
export type TenantId = string;
export type UserId = string;
export type Timestamp = Date | string;

export interface BaseEntity {
  _id?: ID;
  tenantId: TenantId;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  createdBy?: UserId;
  updatedBy?: UserId;
  isDeleted?: boolean;
  deletedAt?: Timestamp | null;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
    version?: string;
  };
  pagination?: PaginatedResponse<never>['pagination'];
}

export type Status = 'active' | 'inactive' | 'maintenance' | 'archived';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type Mode = 'distance' | 'odometer';

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface FilterParams {
  search?: string;
  status?: string;
  dateRange?: DateRange;
  ids?: ID[];
}

========================================
FILE: shared/types/api.types.ts
========================================
// shared/types/api.types.ts

import { PaginationParams, ApiResponse } from './common.types';

export interface ApiRequestOptions extends PaginationParams {
  filters?: Record<string, unknown>;
  include?: string[];
  fields?: string[];
}

export interface ApiError {
  code: string;
  message: string;
  status: number;
  details?: Record<string, unknown>;
}

export type ApiHandler<T = unknown> = (
  req: Request,
  params?: Record<string, string>
) => Promise<ApiResponse<T>>;

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
}

export interface RequestContext {
  tenantId: string;
  userId: string;
  userRoles: string[];
  sessionId: string;
  requestId: string;
}

========================================
FILE: shared/validations/trip.schema.ts
========================================
// shared/validations/trip.schema.ts

import { z } from 'zod';
import { TRIP_STATUSES, TRIP_TYPES } from '@/shared/types/trip.types';

const modeSchema = z.enum(['distance', 'odometer']);
const statusSchema = z.enum(TRIP_STATUSES as [string, ...string[]]);
const tripTypeSchema = z.enum(TRIP_TYPES as [string, ...string[]]);

/**
 * PHASE 1: configurable tolerance for the trip_distance vs.
 * (end_odometer - start_odometer) cross-check requested in the brief.
 * Both fields are still only required per-mode (unchanged from
 * before), but when BOTH happen to be present -- e.g. a bulk import
 * row that supplies odometer readings while the trip is nominally in
 * "distance" mode -- we now verify they roughly agree instead of
 * silently trusting whichever one the mode picked. Expressed as a
 * percentage of the odometer-derived distance so it scales sensibly
 * for both short in-town trips and long-haul runs.
 */
export const TRIP_DISTANCE_TOLERANCE_PCT = 0.1; // 10%
export const TRIP_DISTANCE_TOLERANCE_MIN_KM = 2; // floor, for very short trips

const modeSchemaEnum = modeSchema;

export const tripBaseSchema = z.object({
  license_plate: z
    .string()
    .min(1, 'License plate is required')
    .transform((val) => val.toUpperCase()),
  date: z
    .union([z.date(), z.string().min(1, 'Date is required')])
    .transform((val) => new Date(val)),
  unit_id: z.string().min(1, 'Unit is required'),
  notes: z.string().max(500).optional().nullable(),
  start_location: z.string().max(200).optional().nullable(),
  end_location: z.string().max(200).optional().nullable(),
  driver_id: z.string().optional().nullable(),
  mode: modeSchemaEnum,
  trip_distance: z.number().positive().optional().nullable(),
  start_odometer: z.number().nonnegative().optional().nullable(),
  end_odometer: z.number().nonnegative().optional().nullable(),

  // --- PHASE 1 additions ---
  status: statusSchema.optional().nullable(),
  start_time: z.union([z.date(), z.string()]).optional().nullable(),
  end_time: z.union([z.date(), z.string()]).optional().nullable(),
  trip_type: tripTypeSchema.optional().nullable(),
  routeId: z.string().optional().nullable(),
});

function applySharedRefinements(data: z.infer<typeof tripBaseSchema>, ctx: z.RefinementCtx) {
  if (data.mode === 'distance') {
    if (!data.trip_distance || data.trip_distance <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Trip distance is required and must be positive for distance mode',
        path: ['trip_distance'],
      });
    }
  }
  if (data.mode === 'odometer') {
    if (data.start_odometer == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Start odometer is required for odometer mode',
        path: ['start_odometer'],
      });
    }
    if (data.end_odometer == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End odometer is required for odometer mode',
        path: ['end_odometer'],
      });
    }
    if (
      data.start_odometer != null &&
      data.end_odometer != null &&
      data.end_odometer < data.start_odometer
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End odometer cannot be less than start odometer',
        path: ['end_odometer'],
      });
    }
  }

  // Cross-check: when both a declared trip_distance AND an odometer
  // pair are present (regardless of mode), they must roughly agree.
  if (
    data.trip_distance != null &&
    data.start_odometer != null &&
    data.end_odometer != null &&
    data.end_odometer >= data.start_odometer
  ) {
    const odometerDistance = data.end_odometer - data.start_odometer;
    const tolerance = Math.max(
      TRIP_DISTANCE_TOLERANCE_MIN_KM,
      odometerDistance * TRIP_DISTANCE_TOLERANCE_PCT
    );
    if (Math.abs(data.trip_distance - odometerDistance) > tolerance) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Declared trip distance (${data.trip_distance}) does not match odometer-derived distance (${odometerDistance}) within tolerance (\u00B1${tolerance.toFixed(1)})`,
        path: ['trip_distance'],
      });
    }
  }

  // Time ordering, when both provided.
  if (data.start_time && data.end_time) {
    const start = new Date(data.start_time as string);
    const end = new Date(data.end_time as string);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end < start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End time cannot be before start time',
        path: ['end_time'],
      });
    }
  }
}

export const tripCreateSchema = tripBaseSchema.superRefine(applySharedRefinements);

export const tripUpdateSchema = tripBaseSchema.partial().extend({
  _id: z.string().min(1, 'Trip ID is required'),
});

export const tripFiltersSchema = z.object({
  license_plate: z.string().optional(),
  mode: modeSchema.optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  driver_id: z.string().optional(),
  status: statusSchema.optional(),
  trip_type: tripTypeSchema.optional(),
  routeId: z.string().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(50),
});

export type TripCreateInput = z.infer<typeof tripBaseSchema>;
export type TripUpdateInput = z.infer<typeof tripUpdateSchema>;

========================================
FILE: shared/validations/fuel.schema.ts
========================================
// shared/validations/fuel.schema.ts

import { z } from 'zod';

const fuelLogBaseSchema = z.object({
  license_plate: z
    .string()
    .min(1, 'License plate is required')
    .transform((val) => val.toUpperCase()),
  date: z
    .union([z.date(), z.string().min(1, 'Date is required')])
    .transform((val) => new Date(val)),
  fuel_volume: z
    .number({ error: 'Fuel volume must be a number' })
    .positive('Fuel volume must be positive')
    .max(10_000, 'Fuel volume exceeds maximum'),
  unit_id: z.string().optional(),
  cost: z
    .number({ error: 'Cost must be a number' })
    .nonnegative('Cost cannot be negative')
    .max(999_999.99, 'Cost exceeds maximum'),
  odometer: z.number().nonnegative('Odometer cannot be negative').optional().nullable(),
  station_name: z.string().max(100).optional().nullable(),
  fuel_station_id: z.string().optional().nullable(),
  fuel_type: z.string().max(30).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  currency: z.string().max(3).optional().nullable(),
  is_full_tank: z.boolean().optional().nullable(),
  receipt_url: z.string().url('Invalid receipt URL').max(500).optional().nullable(),
  payment_method: z
    .enum(['cash', 'fuel_card', 'credit_card', 'company_account', 'other'])
    .default('cash'),
  fuel_card_id: z.string().optional().nullable(),
});

export const fuelLogCreateSchema = fuelLogBaseSchema.refine(
  (data) => data.payment_method !== 'fuel_card' || Boolean(data.fuel_card_id),
  { message: 'Select a fuel card for card payments', path: ['fuel_card_id'] }
);

export const fuelLogUpdateSchema = fuelLogBaseSchema.partial().extend({
  _id: z.string().min(1, 'Fuel log ID is required'),
});

export const fuelFiltersSchema = z.object({
  license_plate: z.string().optional(),
  unit_id: z.string().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  payment_method: z.enum(['cash', 'fuel_card', 'credit_card', 'company_account', 'other']).optional(),
  fuel_station_id: z.string().optional(),
  fuel_card_id: z.string().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(50),
});

export type FuelLogInput = z.infer<typeof fuelLogBaseSchema>;
export type FuelLogCreateInput = z.infer<typeof fuelLogCreateSchema>;

========================================
FILE: shared/validations/expense.schema.ts
========================================
// shared/validations/expense.schema.ts

import { z } from 'zod';

export const expenseSchema = z.object({
  license_plate: z
    .string()
    .min(1, 'License plate is required')
    .transform((val) => val.toUpperCase()),
  amount: z
    .number({ error: 'Amount must be a number' })
    .positive('Amount must be positive')
    .max(9_999_999.99, 'Amount exceeds maximum allowed'),
  date: z
    .union([z.date(), z.string().min(1, 'Date is required')])
    .transform((val) => new Date(val)),
  expense_type_id: z.string().optional().nullable(),
  description: z.string().max(500, 'Description too long').optional(),
  jobTrip: z.string().max(100, 'Job/Trip reference too long').optional(),
  notes: z.string().max(1000, 'Notes too long').optional(),
});

export const expenseCreateSchema = expenseSchema;

export const expenseUpdateSchema = expenseSchema.partial().extend({
  _id: z.string().min(1, 'Expense ID is required'),
});

export const expenseFiltersSchema = z.object({
  license_plate: z.string().optional(),
  type: z.string().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  minAmount: z.number().positive().optional(),
  maxAmount: z.number().positive().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(50),
});

export const expenseTypeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  category: z.string().min(1, 'Category is required').max(50),
  description: z.string().max(200).optional(),
});

export type ExpenseInput = z.infer<typeof expenseSchema>;
export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;
export type ExpenseFiltersInput = z.infer<typeof expenseFiltersSchema>;

========================================
FILE: shared/validations/vehicle.schema.ts
========================================
// shared/validations/vehicle.schema.ts

import { z } from 'zod';

const currentYear = new Date().getFullYear();

const vehicleStatusSchema = z.enum(['active', 'inactive', 'maintenance']);

export const vehicleSchema = z.object({
  license_plate: z
    .string()
    .min(1, 'License plate is required')
    .max(20, 'License plate must be at most 20 characters')
    .transform((val) => val.toUpperCase().replace(/\s/g, '')),
  make: z.string().min(1, 'Make is required').max(50, 'Make too long'),
  model: z.string().min(1, 'Model is required').max(50, 'Model too long'),
    year: z
    .number({ message: 'Year must be a number' })
    .int('Year must be an integer')
    .min(1900, 'Year must be 1900 or later')
    .max(currentYear + 2, `Year cannot exceed ${currentYear + 2}`),
  vehicle_type: z.string().min(1, 'Vehicle type is required').max(50),
  purchase_date: z
    .string()
    .min(1, 'Purchase date is required')
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  fuel_type: z.string().min(1, 'Fuel type is required').max(30),
  color: z.string().optional().nullable().default('#3b82f6'),
  vin: z.string().max(17).optional().nullable(),
  status: vehicleStatusSchema.default('active'),
  registration_expiry: z.string().optional().nullable(),
  insurance_provider: z.string().max(100).optional().nullable(),
  service_interval: z.number().positive().optional().nullable(),
  odometer: z.number().nonnegative().optional().nullable(),
  orgUnitId: z.string().optional().nullable(),
});

export const vehicleCreateSchema = vehicleSchema;

export const vehicleUpdateSchema = vehicleSchema.partial().extend({
  _id: z.string().min(1, 'Vehicle ID is required'),
});

export const vehicleFiltersSchema = z.object({
  license_plate: z.string().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  status: vehicleStatusSchema.optional(),
  year: z.number().int().min(1900).optional(),
  vehicle_type: z.string().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
  sortBy: z.string().default('license_plate'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export type VehicleInput = z.infer<typeof vehicleSchema>;
export type VehicleCreateInput = z.infer<typeof vehicleCreateSchema>;
export type VehicleUpdateInput = z.infer<typeof vehicleUpdateSchema>;
export type VehicleFiltersInput = z.infer<typeof vehicleFiltersSchema>;

========================================
FILE: shared/validations/driver.schema.ts
========================================
// shared/validations/driver.schema.ts

import { z } from 'zod';

export const driverSchema = z.object({
  name: z.string().min(1, 'Driver name is required').max(150),
  email: z.string().email('Invalid email').max(150).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  driver_code: z.string().max(30).optional().nullable(),
  license_number: z.string().max(50).optional().nullable(),
  license_expiry: z.union([z.date(), z.string()]).optional().nullable(),
  status: z.enum(['active', 'inactive', 'suspended']).default('active'),
  notes: z.string().max(500).optional().nullable(),
});

export const driverCreateSchema = driverSchema;

export const driverUpdateSchema = driverSchema.partial().extend({
  _id: z.string().min(1, 'Driver ID is required'),
});

export type DriverInput = z.infer<typeof driverSchema>;

========================================
FILE: shared/export/csv-exporter.ts
========================================
// shared/export/csv-exporter.ts
//
// Server-side CSV file generation for the Enterprise Export Framework.
//
// Deliberately reuses generateCSV from shared/utils/csv.utils.ts (the
// same quoting/escaping logic already used by every module's
// client-side CSV export) instead of re-implementing CSV formatting --
// that function is pure string building with no DOM dependency, so
// it's already safe to call from a Next.js route handler.

import { generateCSV } from '@/shared/utils/csv.utils';
import type { ExportColumn } from './export.types';

/**
 * Builds a CSV file buffer for the given rows/columns.
 *
 * A UTF-8 BOM is prepended so Excel (which the Excel-format export
 * exists specifically to avoid, but users will still sometimes double
 * click a .csv file) renders non-ASCII characters correctly instead of
 * mojibake -- this only affects how spreadsheet apps *display* the
 * file, the underlying bytes are still valid UTF-8 CSV.
 */
export function buildCsvBuffer<T>(data: T[], columns: ExportColumn<T>[]): Buffer {
  const csv = generateCSV(data, columns);
  return Buffer.from(`\uFEFF${csv}`, 'utf-8');
}

========================================
FILE: shared/export/excel-exporter.ts
========================================
// shared/export/excel-exporter.ts
//
// Server-side .xlsx file generation for the Enterprise Export
// Framework. Uses the `xlsx` package that is already a project
// dependency (the same one every module's client-side
// exportXToExcel() dynamically imports) -- no new dependency
// introduced, per Phase 2 requirement 4.

import * as XLSX from 'xlsx';
import type { ExportColumn } from './export.types';

/**
 * Builds an .xlsx file buffer for the given rows/columns.
 *
 * Column headers are taken from `columns[].header`, and cell values
 * from each column's `accessor`, so a single column definition drives
 * both the CSV and Excel outputs -- there is no separate Excel-only
 * formatting path to fall out of sync (the pre-Phase-2 Fuel module
 * exporter fell back to CSV for its "Excel" export specifically
 * because it had no shared column model to drive a real xlsx writer;
 * this removes that gap).
 */
export function buildXlsxBuffer<T>(
  data: T[],
  columns: ExportColumn<T>[],
  sheetName: string = 'Export'
): Buffer {
  const headerRow = columns.map((column) => column.header);

  const rows = data.map((item) => {
    const row: Record<string, string | number> = {};
    for (const column of columns) {
      const value = column.accessor(item);
      row[column.header] = value == null ? '' : value;
    }
    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headerRow });
  const workbook = XLSX.utils.book_new();
  const safeSheetName = sheetName.slice(0, 31); // Excel sheet-name length limit
  XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName);

  const arrayBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return arrayBuffer;
}

========================================
FILE: shared/export/export-response.utils.ts
========================================
// shared/export/export-response.utils.ts
//
// Turns an ExportFile + ExportMeta into the actual NextResponse every
// export route returns. Centralizing this means every module's export
// endpoint sends identical headers (Content-Disposition, truncation
// metadata, security headers) -- a module controller never constructs
// a NextResponse for a file download by hand.

import { NextResponse } from 'next/server';
import { applySecurityHeaders } from '@/infrastructure/security/security-headers';
import type { ExportFile, ExportMeta } from './export.types';

/**
 * FUTURE READINESS: the X-Export-* headers below are the extension
 * point background export jobs / export history (Phase 3+) will read
 * from -- a job runner can persist these fields per export instead of
 * only surfacing them on the synchronous response, without changing
 * this function's contract.
 */
export function fileDownloadResponse(file: ExportFile, meta: ExportMeta): NextResponse {
  const response = new NextResponse(file.buffer, {
    status: 200,
    headers: {
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Content-Length': String(file.buffer.length),
      'X-Export-Total-Matched': String(meta.totalMatched),
      'X-Export-Rows-Exported': String(meta.rowsExported),
      'X-Export-Truncated': String(meta.truncated),
      'X-Export-Cap': String(meta.exportCap),
      'Cache-Control': 'no-store',
    },
  });

  return applySecurityHeaders(response) as NextResponse;
}

========================================
FILE: shared/export/export.constants.ts
========================================
// shared/export/export.constants.ts

/**
 * Hard ceiling on the number of rows a single synchronous export
 * request will return.
 *
 * Every module's list controller already has a precedent for this: the
 * "no page param" legacy dashboard path on TripController.getTrips /
 * FuelController.getFuelLogs / ExpenseController.getExpenses /
 * MaintenanceController.getReminders fetches up to 10,000 unpaginated
 * rows for chart/dashboard consumers. Exports are an explicit,
 * infrequent user action (not a page-load-time dashboard query) so
 * they get a higher ceiling, but the principle is the same: never run
 * an unbounded query against Mongo from a synchronous HTTP request.
 *
 * When the actual match count exceeds this cap, the export response
 * is still returned (with the first EXPORT_ROW_CAP rows, sorted newest
 * first) but flagged via the `truncated` field / `X-Export-Truncated`
 * header so the caller can warn the user to narrow their filters.
 *
 * FUTURE READINESS: this is the exact extension point Phase 3+
 * background export jobs are meant to remove -- a queued job can
 * stream/page through the full result set server-side with no
 * request-lifetime constraint, instead of capping. Nothing in this
 * file assumes the cap is permanent.
 */
export const EXPORT_ROW_CAP = 50_000;

/** Formats accepted by `format=` on every export endpoint. */
export const SUPPORTED_EXPORT_FORMATS = ['csv', 'xlsx'] as const;

========================================
FILE: shared/export/export.service.ts
========================================
// shared/export/export.service.ts
//
// Single orchestration point for turning (rows, columns, format) into
// a downloadable file. Every module's controller export method calls
// `exportService.generate(...)` -- this is the "Modules provide data
// source/query + column definitions; shared infrastructure handles
// file generation/formatting" split called for in the Phase 2 spec.

import { buildCsvBuffer } from './csv-exporter';
import { buildXlsxBuffer } from './excel-exporter';
import type { ExportColumn, ExportFile, ExportFormat } from './export.types';
import { isExportFormat } from './export.types';

const CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export class ExportService {
  /**
   * Resolves a raw `?format=` query value to a supported ExportFormat,
   * defaulting to 'csv' for anything missing or unrecognized rather
   * than erroring -- an export link should never 400 just because a
   * format param was omitted.
   */
  parseFormat(value: string | null | undefined): ExportFormat {
    return isExportFormat(value) ? value : 'csv';
  }

  /**
   * Generates the export file. `baseFilename` should be a short,
   * URL/filesystem-safe slug (e.g. "vehicles", "fuel-logs") -- the
   * date and extension are appended here so every module's filenames
   * follow the same convention automatically.
   */
  generate<T>(
    data: T[],
    columns: ExportColumn<T>[],
    format: ExportFormat,
    baseFilename: string,
    sheetName?: string
  ): ExportFile {
    const datePart = new Date().toISOString().slice(0, 10);
    const filename = `${baseFilename}-${datePart}.${format}`;

    const buffer =
      format === 'xlsx'
        ? buildXlsxBuffer(data, columns, sheetName ?? baseFilename)
        : buildCsvBuffer(data, columns);

    return {
      buffer,
      contentType: CONTENT_TYPES[format],
      filename,
    };
  }
}

export const exportService = new ExportService();

========================================
FILE: shared/export/export.types.ts
========================================
// shared/export/export.types.ts
//
// Enterprise Export Framework -- shared type contracts.
//
// Re-exports ExportColumn from shared/utils/csv.utils instead of
// redefining it: that type already existed (used by the Vehicles/
// Trips/Expenses client-side exporters) and duplicating it here would
// violate the "no duplicate utilities" rule. Everything else in this
// file is new, framework-level vocabulary shared by every module's
// export controller method.

export type { ExportColumn } from '@/shared/utils/csv.utils';

/** The two formats Phase 2 supports. Extending this is the extension
 *  point for a future format (e.g. 'pdf') without touching callers --
 *  they all switch on this union via ExportService. */
export type ExportFormat = 'csv' | 'xlsx';

export function isExportFormat(value: unknown): value is ExportFormat {
  return value === 'csv' || value === 'xlsx';
}

/** What a repository's `getFiltered*ForExport` method returns: the
 *  capped row set actually fetched, plus enough metadata for the
 *  controller/frontend to tell the caller whether the export is
 *  complete or was truncated by the row cap. */
export interface ExportDataset<T> {
  rows: T[];
  /** Total documents matching the filter/scope query, independent of the cap. */
  totalMatched: number;
  /** true when totalMatched > rows.length, i.e. the export does NOT contain every matching record. */
  truncated: boolean;
  /** The row cap that was applied (EXPORT_ROW_CAP unless the caller overrode it). */
  exportCap: number;
}

/** A generated export file, ready to be written into an HTTP response. */
export interface ExportFile {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

/** Metadata surfaced to the client via response headers so the UI can
 *  warn the user when an export was truncated by the row cap, without
 *  needing to parse the file itself. */
export interface ExportMeta {
  totalMatched: number;
  rowsExported: number;
  truncated: boolean;
  exportCap: number;
}

========================================
FILE: shared/export/index.ts
========================================
// shared/export/index.ts

export * from './export.types';
export * from './export.constants';
export * from './csv-exporter';
export * from './excel-exporter';
export * from './export.service';
export * from './export-response.utils';

========================================
FILE: shared/utils/csv-parser.utils.ts
========================================
// shared/utils/csv-parser.utils.ts
//
// Small, dependency-free RFC 4180-style CSV parser/generator used by the
// enterprise import platform (frontend/shared/import/ImportModal.tsx) and
// by CSV export/error-report generation. Kept separate from
// shared/utils/csv.utils.ts (which only handles export/download of
// already-in-memory objects) because parsing untrusted uploaded text is a
// distinct concern with its own edge cases (quoted fields, embedded
// commas/newlines, CRLF).

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * Parses raw CSV text into a header row + array of string-keyed records.
 * Handles quoted fields (including embedded commas, newlines, and escaped
 * `""` quotes) and both CRLF and LF line endings. Every cell value is
 * returned as a trimmed string; callers are responsible for type
 * coercion (numbers, booleans, dates) since that's entity-specific.
 */
export function parseCsvText(text: string): ParsedCsv {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += char;
    }
  }

  // Flush the final field/record if the file doesn't end with a newline.
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const nonEmptyRecords = records.filter((r) => r.some((cell) => cell.trim().length > 0));
  if (nonEmptyRecords.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = nonEmptyRecords[0].map((h) => h.trim());
  const rows = nonEmptyRecords.slice(1).map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] ?? '').trim();
    });
    return row;
  });

  return { headers, rows };
}

/** Reads a browser File (from a drag-drop zone or <input type="file">) and parses it as CSV. */
export function readCsvFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(parseCsvText(String(reader.result ?? '')));
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Failed to parse CSV file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read the selected file'));
    reader.readAsText(file);
  });
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Builds CSV text from a header list and an array of records keyed by header name. */
export function buildCsvText(headers: string[], rows: Array<Record<string, unknown>>): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const lines = rows.map((row) => headers.map((h) => escapeCsvCell(row[h])).join(','));
  return [headerLine, ...lines].join('\n');
}

/** Triggers a browser download of the given CSV text. */
export function downloadCsvText(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

========================================
FILE: shared/utils/csv.utils.ts
========================================
// shared/utils/csv.utils.ts

export interface ExportColumn<T> {
  header: string;
  accessor: (item: T) => string | number | null | undefined;
}

export function generateCSV<T>(
  data: T[],
  columns: ExportColumn<T>[]
): string {
  const headers = columns.map((c) => `"${c.header}"`).join(',');

  const rows = data.map((item) =>
    columns
      .map((col) => {
        const value = col.accessor(item);
        if (value == null) return '""';
        const str = String(value).replace(/"/g, '""');
        return `"${str}"`;
      })
      .join(',')
  );

  return [headers, ...rows].join('\n');
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToCSV<T>(
  data: T[],
  columns: ExportColumn<T>[],
  filename: string
): void {
  const csv = generateCSV(data, columns);
  downloadCSV(csv, filename);
}

========================================
FILE: shared/utils/excel-parser.utils.ts
========================================
// shared/utils/excel-parser.utils.ts
//
// Excel (.xlsx / .xls) counterpart to shared/utils/csv-parser.utils.ts.
// Kept as its own module (rather than folded into csv-parser.utils.ts)
// because parsing a binary workbook is a different concern from parsing
// CSV text, but it deliberately returns the exact same `ParsedCsv` shape
// (`{ headers, rows }`, every cell already coerced to a trimmed string)
// so callers -- e.g. FuelImportModal.tsx -- can treat a CSV upload and an
// Excel upload identically once parsing is done, and pass either result
// into the same downstream validation / coerceRow / import pipeline.
//
// Uses the `xlsx` (SheetJS) package, which is already a project
// dependency (see lib/import-export.ts for the other place it's used).

import * as XLSX from 'xlsx';
import type { ParsedCsv } from './csv-parser.utils';

const EXCEL_EXTENSIONS = ['.xlsx', '.xls'];
const CSV_EXTENSIONS = ['.csv'];

const EXCEL_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
];

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}

/** True if the file looks like an Excel workbook, by extension or MIME type. */
export function isExcelFile(file: File): boolean {
  return EXCEL_EXTENSIONS.includes(getExtension(file.name)) || EXCEL_MIME_TYPES.includes(file.type);
}

/** True if the file looks like a CSV file, by extension or MIME type. */
export function isCsvFile(file: File): boolean {
  return CSV_EXTENSIONS.includes(getExtension(file.name)) || file.type === 'text/csv';
}

/** Accept string for a file input that takes either CSV or Excel. */
export const IMPORT_FILE_ACCEPT =
  '.csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';

/**
 * Turns a single Excel cell value into the same kind of trimmed string
 * that parseCsvText produces for a CSV cell, so downstream code (which
 * expects Record<string, string> and does its own Number()/boolean
 * coercion) doesn't need to know which file format the row came from.
 *
 * Date cells are formatted as YYYY-MM-DD using the *local* calendar date
 * shown in Excel, not `toISOString()` (which would shift a date-only
 * cell to the previous day for any timezone behind UTC).
 */
function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  return String(value).trim();
}

/**
 * Reads a browser File as an Excel workbook and parses the first sheet
 * into a header row + array of string-keyed records, matching
 * parseCsvText's output shape exactly.
 */
export function readExcelFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          resolve({ headers: [], rows: [] });
          return;
        }
        const sheet = workbook.Sheets[sheetName];
        // header: 1 -> array of arrays (raw cell values), so we control
        // the string coercion ourselves instead of sheet_to_json's
        // object-per-row default (which drops empty/duplicate headers
        // silently and can't distinguish "0" from "").
        const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          raw: true,
          defval: '',
        });

        const nonEmptyGrid = grid.filter((row) =>
          Array.isArray(row) && row.some((cell) => stringifyCell(cell).length > 0)
        );

        if (nonEmptyGrid.length === 0) {
          resolve({ headers: [], rows: [] });
          return;
        }

        const headers = nonEmptyGrid[0].map((cell) => stringifyCell(cell));
        const rows = nonEmptyGrid.slice(1).map((cells) => {
          const row: Record<string, string> = {};
          headers.forEach((header, index) => {
            row[header] = stringifyCell(cells[index]);
          });
          return row;
        });

        resolve({ headers, rows });
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Failed to parse Excel file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read the selected file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Reads a browser File as either CSV or Excel, dispatching on file
 * extension/MIME type. This is the single entry point import UIs
 * should call; it throws for anything else so the caller can show a
 * clear "unsupported file type" message.
 */
export async function readTabularFile(file: File): Promise<ParsedCsv> {
  if (isExcelFile(file)) return readExcelFile(file);
  if (isCsvFile(file)) {
    const { readCsvFile } = await import('./csv-parser.utils');
    return readCsvFile(file);
  }
  throw new Error('Unsupported file type. Please upload a .csv, .xlsx, or .xls file.');
}

/**
 * Builds and downloads an .xlsx workbook from a header list and an
 * array of records keyed by header name -- the Excel equivalent of
 * csv-parser.utils.ts's buildCsvText + downloadCsvText, for import
 * templates and error reports that a user may prefer to open in Excel
 * rather than as a CSV.
 */
export function downloadXlsxTemplate(
  headers: string[],
  rows: Array<Record<string, unknown>>,
  filename: string,
  sheetName = 'Sheet1'
): void {
  const aoa = [headers, ...rows.map((row) => headers.map((h) => row[h] ?? ''))];
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename);
}

========================================
FILE: shared/utils/distance.utils.ts
========================================
// shared/utils/distance.utils.ts

export const DISTANCE_CONFIG = {
  defaultUnit: 'km',
  units: {
    km: { symbol: 'km', factor: 1 },
    mi: { symbol: 'mi', factor: 1.60934 },
    m: { symbol: 'm', factor: 0.001 },
  },
} as const;

export function formatDistance(
  distance: number,
  unit: string = DISTANCE_CONFIG.defaultUnit,
  decimals: number = 1
): string {
  if (!distance || distance === 0) return `0 ${unit}`;
  const formatted = distance.toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  });
  return `${formatted} ${unit}`;
}

export function formatDistanceCompact(distance: number): string {
  if (distance >= 10_000) {
    return `${(distance / 1_000).toFixed(0)}k km`;
  }
  return formatDistance(distance);
}

export function calculateEfficiency(
  distance: number,
  fuelVolume: number
): number | null {
  if (fuelVolume <= 0 || distance <= 0) return null;
  return distance / fuelVolume;
}

export function formatEfficiency(efficiency: number | null): string {
  if (efficiency === null) return 'N/A';
  return `${efficiency.toFixed(2)} km/L`;
}

export function convertDistance(
  value: number,
  fromUnit: string,
  toUnit: string
): number {
  const fromFactor =
    DISTANCE_CONFIG.units[fromUnit as keyof typeof DISTANCE_CONFIG.units]
      ?.factor || 1;
  const toFactor =
    DISTANCE_CONFIG.units[toUnit as keyof typeof DISTANCE_CONFIG.units]
      ?.factor || 1;
  const inKm = value * fromFactor;
  return inKm / toFactor;
}

export function calculateTotalDistanceFromLogs(
  logs: Array<{ odometer: number; date: Date }>
): number {
  if (logs.length < 2) return 0;
  const sorted = [...logs].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
  const first = sorted[0].odometer;
  const last = sorted[sorted.length - 1].odometer;
  return Math.max(0, last - first);
}

========================================
FILE: shared/utils/chart.utils.ts
========================================
// shared/utils/chart.utils.ts

import { formatDate, DATE_FORMATS } from './date.utils';

export interface ChartDataPoint {
  date: string;
  value: number;
}

export interface CategoryData {
  name: string;
  value: number;
  percentage?: number;
}

export function transformToTimeSeries<T extends { date: Date; amount: number }>(
  data: T[],
  dateFormat: string = DATE_FORMATS.DISPLAY_SHORT
): ChartDataPoint[] {
  const grouped = new Map<string, number>();

  data.forEach((item) => {
    const key = formatDate(item.date, dateFormat);
    grouped.set(key, (grouped.get(key) || 0) + item.amount);
  });

  return Array.from(grouped.entries())
    .map(([date, value]) => ({ date, value }))
    .sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
}

export function transformToCategoryData<T extends { name: string; value: number }>(
  data: T[],
  topN: number = 5
): CategoryData[] {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, topN);
  const total = top.reduce((sum, item) => sum + item.value, 0);

  return top.map((item) => ({
    ...item,
    percentage: total > 0 ? (item.value / total) * 100 : 0,
  }));
}

export const CHART_COLORS = {
  primary: '#3b82f6',
  secondary: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  info: '#8b5cf6',
  gray: '#6b7280',
  palette: [
    '#3b82f6',
    '#10b981',
    '#ef4444',
    '#f59e0b',
    '#8b5cf6',
    '#06b6d4',
    '#ec4899',
    '#f97316',
  ],
} as const;

export function getChartColor(index: number): string {
  return CHART_COLORS.palette[index % CHART_COLORS.palette.length];
}

========================================
FILE: shared/utils/validation.utils.ts
========================================
// shared/utils/validation.utils.ts

import { ZodSchema, ZodError } from 'zod';

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: Record<string, string[]>;
}

export async function validateWithZod<T>(
  schema: ZodSchema<T>,
  data: unknown
): Promise<ValidationResult<T>> {
  try {
    const validData = await schema.parseAsync(data);
    return { success: true, data: validData };
  } catch (error) {
    if (error instanceof ZodError) {
      const errors: Record<string, string[]> = {};
      // Zod v4 renamed `ZodError.errors` to `ZodError.issues`.
      error.issues.forEach((err) => {
        const path = err.path.length > 0 ? err.path.join('.') : '_global';
        if (!errors[path]) errors[path] = [];
        errors[path].push(err.message);
      });
      return { success: false, errors };
    }
    return { success: false, errors: { _global: ['Validation failed'] } };
  }
}

export function sanitizeString(input: string): string {
  return input
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 1000);
}

export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const sanitized = { ...obj };
  for (const key in sanitized) {
    if (typeof sanitized[key] === 'string') {
      sanitized[key] = sanitizeString(sanitized[key] as string) as T[Extract<keyof T, string>];
    }
  }
  return sanitized;
}

export function isValidLicensePlate(plate: string): boolean {
  const regex = /^[A-Z0-9\-]{1,20}$/i;
  return regex.test(plate);
}

export function isValidVIN(vin: string): boolean {
  const regex = /^[A-HJ-NPR-Z0-9]{17}$/i;
  return regex.test(vin);
}

========================================
FILE: shared/utils/status.utils.ts
========================================
// shared/utils/status.utils.ts

import { Status, Priority } from '../types/common.types';

export const STATUS_CONFIG = {
  active: {
    label: 'Active',
    color: 'bg-green-100 text-green-800',
    variant: 'default',
  },
  inactive: {
    label: 'Inactive',
    color: 'bg-gray-100 text-gray-800',
    variant: 'secondary',
  },
  maintenance: {
    label: 'Maintenance',
    color: 'bg-yellow-100 text-yellow-800',
    variant: 'destructive',
  },
  archived: {
    label: 'Archived',
    color: 'bg-red-100 text-red-800',
    variant: 'destructive',
  },
} as const;

export const PRIORITY_CONFIG = {
  low: { label: 'Low', color: 'bg-blue-100 text-blue-800', order: 0 },
  medium: {
    label: 'Medium',
    color: 'bg-yellow-100 text-yellow-800',
    order: 1,
  },
  high: {
    label: 'High',
    color: 'bg-orange-100 text-orange-800',
    order: 2,
  },
  critical: { label: 'Critical', color: 'bg-red-100 text-red-800', order: 3 },
} as const;

export const REMINDER_STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800' },
  overdue: { label: 'Overdue', color: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-800' },
} as const;

export function getStatusConfig(status: Status) {
  return STATUS_CONFIG[status] || STATUS_CONFIG.inactive;
}

export function getPriorityConfig(priority: Priority) {
  return PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium;
}

export function getReminderStatusConfig(
  status: keyof typeof REMINDER_STATUS_CONFIG
) {
  return (
    REMINDER_STATUS_CONFIG[status] || REMINDER_STATUS_CONFIG.pending
  );
}

export function getStatusBadgeClasses(status: string): string {
  const config = STATUS_CONFIG[status as Status];
  return config?.color || 'bg-gray-100 text-gray-800';
}

export function sortByPriority(a: Priority, b: Priority): number {
  return PRIORITY_CONFIG[a].order - PRIORITY_CONFIG[b].order;
}

========================================
FILE: lib/import-export.ts
========================================
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export interface ImportedRecord {
  date: Date;
  reference: string;
  details: string;
  account: string;
  amount: number;
  costCentre: string;
  vehiclePlate?: string;
  category?: string;
}

export interface ProcessedRecord {
  date: Date;
  reference: string;
  details: string;
  account: string;
  totalAmount: number;
  costCentre: string;
  items: string[];
  references: string[];
  vehiclePlate?: string;
  category?: string;
}

/**
 * Parse Excel file to JSON
 */
export async function parseExcelFile(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet);
      resolve(jsonData);
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Parse CSV file to JSON
 */
export async function parseCSVFile(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      complete: (results) => {
        resolve(results.data);
      },
      error: reject,
    });
  });
}

/**
 * Extract vehicle license plate from details - ENHANCED VERSION
 */
export function extractVehiclePlate(details: string): string | undefined {
  if (!details) return undefined;
  
  // More comprehensive patterns for Zimbabwean plates
  const patterns = [
    /[A-Z]{3}\s?\d{3,4}/gi,        // ADL 5345, AFU0078
    /[A-Z]{3}-\d{3,4}/gi,           // ABC-123
    /[A-Z]{3}\d{3,4}/gi,            // ADL5345
    /\[([A-Z]{3}\s?\d{3,4})\]/gi,   // [ADY 2531]
    /_([A-Z]{3}\s?\d{3,4})/gi,      // _ADL 5345
    /\s([A-Z]{3}\s?\d{3,4})\s/gi,   // space ADL 5345 space
  ];
  
  for (const pattern of patterns) {
    const matches = details.match(pattern);
    if (matches && matches.length > 0) {
      let plate = matches[0].toUpperCase();
      plate = plate.replace(/[\[_]/g, '').replace(/\]/g, '');
      return plate.trim();
    }
  }
  return undefined;
}

/**
 * Map account name to category
 */
function mapAccountToCategory(account: string): string {
  const lowerAccount = account.toLowerCase();
  
  if (lowerAccount.includes('fuel') || lowerAccount.includes('oil')) {
    return 'Fuel & Oil';
  }
  if (lowerAccount.includes('motor expense')) {
    return 'Motor Expenses';
  }
  if (lowerAccount.includes('parking')) {
    return 'Parking Fees';
  }
  if (lowerAccount.includes('toll') || lowerAccount.includes('weighbridge')) {
    return 'Toll Fees';
  }
  return 'Motor Expenses';
}

/**
 * Map Excel columns to database fields
 */
export function mapExcelToRecord(row: any): ImportedRecord {
  const keys = Object.keys(row);
  
  const findValue = (possibleNames: string[]): any => {
    for (const name of possibleNames) {
      if (row[name] !== undefined && row[name] !== null && row[name] !== "") {
        return row[name];
      }
      const matchKey = keys.find(k => k.toLowerCase() === name.toLowerCase());
      if (matchKey && row[matchKey] !== undefined && row[matchKey] !== null && row[matchKey] !== "") {
        return row[matchKey];
      }
    }
    return null;
  };
  
  // Get date
  let date: Date = new Date();
  const dateValue = findValue(['DATE', 'Date', 'date', 'DAY', 'Day', 'day']);
  if (dateValue) {
    if (typeof dateValue === 'number') {
      const excelEpoch = new Date(1900, 0, 1);
      date = new Date(excelEpoch.getTime() + (dateValue - 2) * 86400000);
    } else {
      date = new Date(dateValue);
      if (isNaN(date.getTime()) && typeof dateValue === 'string' && dateValue.includes('/')) {
        const parts = dateValue.split('/');
        if (parts.length === 3) {
          date = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        }
      }
    }
  }
  
  const reference = String(findValue(['REF', 'Ref', 'ref', 'REFERENCE', 'Reference']) || '');
  const details = String(findValue(['DETAILS', 'Details', 'details', 'DESCRIPTION', 'Description']) || '');
  const account = String(findValue(['ACCOUNT', 'Account', 'account']) || 'Motor Expenses');
  
  let amount = 0;
  const amountValue = findValue(['AMOUNT', 'Amount', 'amount', 'VALUE', 'Value', 'TOTAL', 'Total']);
  if (amountValue) {
    if (typeof amountValue === 'string') {
      amount = parseFloat(amountValue.replace(/[^0-9.-]/g, ''));
    } else {
      amount = Number(amountValue);
    }
  }
  
  const costCentre = String(findValue(['COST CENTRE', 'Cost Centre', 'COST CENTER', 'Cost Center']) || 'HRE');
  const vehiclePlate = extractVehiclePlate(details);
  const category = mapAccountToCategory(account);

  return {
    date: isNaN(date.getTime()) ? new Date() : date,
    reference,
    details,
    account,
    amount: isNaN(amount) ? 0 : amount,
    costCentre,
    vehiclePlate,
    category,
  };
}

/**
 * Process raw data and group by vehicle + date
 * Each vehicle gets its own separate records
 */
export function processRecordsByVehicle(records: ImportedRecord[]): ProcessedRecord[] {
  // Group by vehicle + date combination
  const groupedByVehicleAndDate = new Map<string, ProcessedRecord>();

  for (const record of records) {
    const vehicleKey = record.vehiclePlate || "UNKNOWN";
    const dateKey = record.date.toDateString();
    const groupKey = `${vehicleKey}|${dateKey}`;
    
    if (groupedByVehicleAndDate.has(groupKey)) {
      const existing = groupedByVehicleAndDate.get(groupKey)!;
      existing.totalAmount += record.amount;
      existing.items.push(record.details);
      existing.references.push(record.reference);
    } else {
      groupedByVehicleAndDate.set(groupKey, {
        date: record.date,
        reference: record.reference,
        details: record.details,
        account: record.account,
        totalAmount: record.amount,
        costCentre: record.costCentre,
        items: [record.details],
        references: [record.reference],
        vehiclePlate: record.vehiclePlate,
        category: record.category,
      });
    }
  }

  return Array.from(groupedByVehicleAndDate.values());
}

/**
 * Export data to Excel
 */
export function exportToExcel(data: any[], filename: string) {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

/**
 * Export data to CSV
 */
export function exportToCSV(data: any[], filename: string) {
  if (!data || data.length === 0) {
    console.warn("No data to export");
    return;
  }
  
  // Get headers from first object
  const headers = Object.keys(data[0]);
  
  // Convert data to CSV rows
  const csvRows = [];
  
  // Add headers
  csvRows.push(headers.join(','));
  
  // Add data rows
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header] || '';
      // Wrap in quotes if contains comma
      return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
    });
    csvRows.push(values.join(','));
  }
  
  // Create blob and download
  const csvContent = csvRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

========================================
FILE: lib/distance.ts
========================================
// lib/distance.ts
import { MeterLog, Trip } from "@/types";

export interface CombinedDistanceResult {
  totalDistance: number;
  unitId: string | null;
  unitSymbol: string | null;
  hasData: boolean;
  lastUpdate: Date | null;
  sources: {
    meterLogs: number;
    trips: number;
    meterLogCount: number;
    tripCount: number;
  };
}

export interface CombinedDistanceInput {
  meterLogs: MeterLog[];
  trips: Trip[];
  defaultUnitSymbol?: string;
}

// Helper type for fuel logs with flexible date
interface FuelLogInput {
  date: Date | string;
  fuel_volume: number;
  odometer?: number;
}

/**
 * Calculate the total distance for a vehicle by combining:
 * - Meter logs (max odometer reading - min odometer reading)
 * - Manual trips (sum of all trip distances)
 */
export function calculateCombinedDistance({
  meterLogs,
  trips,
  defaultUnitSymbol = "km",
}: CombinedDistanceInput): CombinedDistanceResult {
  // Calculate distance from meter logs
  let meterLogDistance = 0;
  let meterLogCount = 0;
  let lastMeterDate: Date | null = null;

  if (meterLogs.length >= 2) {
    const readings = meterLogs
      .map((log) => log.odometer)
      .filter((r) => !isNaN(r) && r !== undefined && r !== null);

    if (readings.length >= 2) {
      const maxReading = Math.max(...readings);
      const minReading = Math.min(...readings);
      meterLogDistance = maxReading - minReading;
      meterLogCount = meterLogs.length;

      // Get the latest meter log date
      const sortedByDate = [...meterLogs].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      if (sortedByDate.length > 0) {
        lastMeterDate = new Date(sortedByDate[0].date);
      }
    }
  } else if (meterLogs.length === 1) {
    // Single meter log gives 0 distance, but we count it as a source
    meterLogCount = 1;
    lastMeterDate = new Date(meterLogs[0].date);
  }

  // Calculate distance from manual trips
  let tripDistance = 0;
  let lastTripDate: Date | null = null;

  if (trips.length > 0) {
    tripDistance = trips.reduce(
      (sum, trip) => sum + (trip.distance_calculated || 0),
      0
    );

    // Get the latest trip date
    const sortedTrips = [...trips].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    if (sortedTrips.length > 0) {
      lastTripDate = new Date(sortedTrips[0].date);
    }
  }

  // Get the latest update date
  let lastUpdate: Date | null = null;
  if (lastMeterDate && lastTripDate) {
    lastUpdate = lastMeterDate > lastTripDate ? lastMeterDate : lastTripDate;
  } else if (lastMeterDate) {
    lastUpdate = lastMeterDate;
  } else if (lastTripDate) {
    lastUpdate = lastTripDate;
  }

  // Get unit info (prefer meter log unit, fallback to trip unit, then default)
  let unitId: string | null = null;
  const unitSymbol: string | null = defaultUnitSymbol;  // FIXED: changed from 'let' to 'const'

  if (meterLogs.length > 0 && meterLogs[0].unit_id) {
    unitId = meterLogs[0].unit_id;
  } else if (trips.length > 0 && trips[0].unit_id) {
    unitId = trips[0].unit_id;
  }

  const totalDistance = meterLogDistance + tripDistance;
  const hasData = meterLogCount > 0 || trips.length > 0;

  return {
    totalDistance,
    unitId,
    unitSymbol,
    hasData,
    lastUpdate,
    sources: {
      meterLogs: meterLogDistance,
      trips: tripDistance,
      meterLogCount,
      tripCount: trips.length,
    },
  };
}

/**
 * Get the last known odometer reading from combined sources
 * Useful for starting point when logging new trips
 */
export function getLastOdometerReading(
  meterLogs: MeterLog[],
  trips: Trip[],
  initialOdometer?: number
): number | null {
  // Sort all distance events by date
  const events: Array<{ date: Date; value: number; type: string }> = [];

  // Add meter logs
  meterLogs.forEach((log) => {
    events.push({
      date: new Date(log.date),
      value: log.odometer,
      type: "meter",
    });
  });

  // Add trips (cumulative)
  const sortedTrips = [...trips].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  let cumulativeDistance = 0;
  sortedTrips.forEach((trip) => {
    cumulativeDistance += trip.distance_calculated;
    events.push({
      date: new Date(trip.date),
      value: cumulativeDistance,
      type: "trip_cumulative",
    });
  });

  if (events.length === 0) {
    return initialOdometer || null;
  }

  // Get the most recent event
  const sortedEvents = events.sort(
    (a, b) => b.date.getTime() - a.date.getTime()
  );

  const latest = sortedEvents[0];

  // If latest is a meter log, return its value
  if (latest.type === "meter") {
    return latest.value;
  }

  // If latest is a cumulative trip, we need to add any meter logs that might be after?
  // Actually, trips are independent - we can't combine them for a single "odometer"
  // So we return null for combined odometer (use separate sources)
  return null;
}

/**
 * Format distance for display with proper unit
 */
export function formatDistance(
  distance: number,
  unitSymbol: string | null,
  options: { fallback?: string; decimals?: number } = {}
): string {
  const { fallback = "N/A", decimals = 0 } = options;

  if (!distance || distance === 0) {
    return fallback;
  }

  const formatted = distance.toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  });

  return unitSymbol ? `${formatted} ${unitSymbol}` : formatted;
}

/**
 * Get distance since a specific date
 * Useful for calculating distance since last service
 */
export function getDistanceSinceDate(
  meterLogs: MeterLog[],
  trips: Trip[],
  sinceDate: Date
): number {
  // Get meter logs after the date
  const meterDistance = getMeterLogDistanceSinceDate(meterLogs, sinceDate);

  // Get trips after the date
  const tripDistance = trips
    .filter((trip) => new Date(trip.date) >= sinceDate)
    .reduce((sum, trip) => sum + (trip.distance_calculated || 0), 0);

  return meterDistance + tripDistance;
}

/**
 * Helper: Calculate meter log distance since a specific date
 * Uses cumulative distance from earliest reading after date to latest
 */
function getMeterLogDistanceSinceDate(
  meterLogs: MeterLog[],
  sinceDate: Date
): number {
  const logsAfterDate = meterLogs.filter(
    (log) => new Date(log.date) >= sinceDate
  );

  if (logsAfterDate.length < 2) {
    return 0;
  }

  const readings = logsAfterDate.map((log) => log.odometer);
  const maxReading = Math.max(...readings);
  const minReading = Math.min(...readings);

  return maxReading - minReading;
}

/**
 * Calculate fuel efficiency using combined distance
 * Accepts fuel logs with Date | string for date field
 */
export function calculateFuelEfficiencyWithCombinedDistance(
  fuelLogs: FuelLogInput[],
  meterLogs: MeterLog[],
  trips: Trip[]
): number | null {
  // Sort fuel logs by date
  const sortedFuelLogs = [...fuelLogs].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  if (sortedFuelLogs.length < 2) {
    return null;
  }

  // Get distance between first and last fuel log
  const firstDate = new Date(sortedFuelLogs[0].date);
  const lastDate = new Date(sortedFuelLogs[sortedFuelLogs.length - 1].date);

  // If we have odometer readings on fuel logs, use those
  const firstOdometer = sortedFuelLogs[0].odometer;
  const lastOdometer = sortedFuelLogs[sortedFuelLogs.length - 1].odometer;

  if (firstOdometer && lastOdometer && firstOdometer > 0 && lastOdometer > 0) {
    const distance = lastOdometer - firstOdometer;
    const totalFuel = sortedFuelLogs.reduce(
      (sum, log) => sum + (log.fuel_volume || 0),
      0
    );
    return totalFuel > 0 ? distance / totalFuel : null;
  }

  // Fallback to combined distance from meter logs + trips
  const logsBetweenDates = meterLogs.filter(
    (log) => new Date(log.date) >= firstDate && new Date(log.date) <= lastDate
  );

  const tripsBetweenDates = trips.filter(
    (trip) => new Date(trip.date) >= firstDate && new Date(trip.date) <= lastDate
  );

  const combinedDistance = calculateCombinedDistance({
    meterLogs: logsBetweenDates,
    trips: tripsBetweenDates,
  });

  const totalFuel = sortedFuelLogs.reduce(
    (sum, log) => sum + (log.fuel_volume || 0),
    0
  );

  if (combinedDistance.totalDistance > 0 && totalFuel > 0) {
    return combinedDistance.totalDistance / totalFuel;
  }

  return null;
}

========================================
FILE: server/cqrs/command-bus.ts
========================================
// server/cqrs/command-bus.ts

import { ICommand, ICommandHandler, CommandConstructor } from './command';

/**
 * In-process command bus. Routes a command instance to its registered
 * handler by command class name.
 *
 * This is intentionally a simple synchronous-dispatch in-memory bus, not
 * a distributed message bus â€” it exists to enforce the CQRS separation
 * (controllers/services depend on the bus, never directly on a handler
 * or a monolithic read/write service) while keeping the deployment model
 * identical to today's single-process Next.js API routes. A future phase
 * (Event-Driven Architecture, Phase 3) can layer an outbox/queue
 * publisher on top of this without changing any call site, since every
 * write already flows through here.
 */
export class CommandBus {
  private readonly handlers = new Map<string, ICommandHandler<any, any>>();

  /**
   * Registers a handler for a given command class. Re-registering the
   * same command class overwrites the previous handler rather than
   * throwing â€” this makes the bus safe to re-bootstrap on every module
   * load in Next.js dev mode (hot reload) without crashing the process.
   */
  register<TCommand extends ICommand, TResult = void>(
    commandType: CommandConstructor<TCommand>,
    handler: ICommandHandler<TCommand, TResult>
  ): void {
    this.handlers.set(commandType.commandName, handler);
  }

  /**
   * Returns true if a handler is currently registered for the given
   * command class. Useful for idempotent bootstrap guards.
   */
  isRegistered<TCommand extends ICommand>(
    commandType: CommandConstructor<TCommand>
  ): boolean {
    return this.handlers.has(commandType.commandName);
  }

  /**
   * Executes a command by dispatching it to its registered handler.
   * Throws if no handler is registered â€” this is a programming error
   * (a command was constructed but never wired up in a *.cqrs.register.ts
   * file) and should fail loudly rather than silently no-op.
   */
  async execute<TResult = void>(command: ICommand): Promise<TResult> {
    const handler = this.handlers.get(command.commandName);
    if (!handler) {
      throw new Error(
        `[CommandBus] No handler registered for command "${command.commandName}". ` +
          `Did you forget to call the module's register*CqrsHandlers() function?`
      );
    }
    return handler.execute(command) as Promise<TResult>;
  }
}

/**
 * Process-wide singleton. Stored on globalThis in development so that
 * Next.js's module-reload-on-change behavior doesn't wipe registrations
 * out from under in-flight requests, mirroring the existing pattern used
 * for the MongoDB client in infrastructure/database/mongodb.ts.
 */
declare global {
  // eslint-disable-next-line no-var
  var _commandBus: CommandBus | undefined;
}

export const commandBus: CommandBus =
  global._commandBus ?? (global._commandBus = new CommandBus());

========================================
FILE: server/cqrs/query-bus.ts
========================================
// server/cqrs/query-bus.ts

import { IQuery, IQueryHandler, QueryConstructor } from './query';

/**
 * In-process query bus. Mirrors CommandBus but for reads. Kept as a
 * separate class (rather than a generic Bus<T>) so command and query
 * registration are visually and structurally distinct in every module's
 * cqrs.register.ts file â€” that distinction is the entire point of CQRS,
 * and collapsing the two bus types into one generic would blur it.
 */
export class QueryBus {
  private readonly handlers = new Map<string, IQueryHandler<any, any>>();

  register<TQuery extends IQuery, TResult>(
    queryType: QueryConstructor<TQuery>,
    handler: IQueryHandler<TQuery, TResult>
  ): void {
    this.handlers.set(queryType.queryName, handler);
  }

  isRegistered<TQuery extends IQuery>(
    queryType: QueryConstructor<TQuery>
  ): boolean {
    return this.handlers.has(queryType.queryName);
  }

  async execute<TResult>(query: IQuery): Promise<TResult> {
    const handler = this.handlers.get(query.queryName);
    if (!handler) {
      throw new Error(
        `[QueryBus] No handler registered for query "${query.queryName}". ` +
          `Did you forget to call the module's register*CqrsHandlers() function?`
      );
    }
    return handler.execute(query) as Promise<TResult>;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var _queryBus: QueryBus | undefined;
}

export const queryBus: QueryBus =
  global._queryBus ?? (global._queryBus = new QueryBus());

========================================
FILE: server/cqrs/command.ts
========================================
// server/cqrs/command.ts

/**
 * Marker interface for all commands in the system.
 *
 * A command represents an intent to change state (create, update, delete,
 * or any other write operation). Commands carry only the data needed to
 * perform the operation â€” they contain no business logic themselves.
 *
 * Naming convention: <Verb><Entity>Command, e.g. CreateVehicleCommand.
 */
export interface ICommand {
  readonly commandName: string;
}

/**
 * Base class for commands. Concrete commands extend this and pass their
 * own class name as commandName so the CommandBus can route by identity
 * without relying on `instanceof` chains (which break across module
 * reloads in Next.js dev mode where the same class can be loaded twice
 * under different module instances).
 */
export abstract class BaseCommand implements ICommand {
  public readonly commandName: string;

  constructor(commandName: string) {
    this.commandName = commandName;
  }
}

/**
 * A command handler executes exactly one command type and returns a
 * result. TResult defaults to void for pure side-effecting commands, but
 * most of our commands return the affected entity so the caller doesn't
 * need a follow-up query.
 */
export interface ICommandHandler<TCommand extends ICommand, TResult = void> {
  execute(command: TCommand): Promise<TResult>;
}

/**
 * Constructor type used for registering handlers against a command class
 * (not an instance), so the bus can map `SomeCommand.name` -> handler at
 * registration time.
 */
/**
 * Constructor type used for registering handlers against a command class.
 *
 * Deliberately requires a static `commandName` string (set explicitly by
 * each concrete command, e.g. `static readonly commandName = 'CreateTripCommand'`)
 * rather than relying on the built-in `Function.name`. Production builds
 * minify class names, and Next.js may bundle the same command class into
 * more than one chunk (e.g. once via the central cqrs bootstrap module,
 * once via a route handler that imports it directly), each minified
 * independently. That made `SomeCommand.name` resolve to different
 * mangled strings (or collide on the same one, like "i") depending on
 * which bundle referenced it, so the CommandBus looked up a name that
 * didn't match what it registered under. A static string literal
 * survives minification untouched and is identical no matter which
 * chunk reads it, so registration and lookup always agree.
 */
export type CommandConstructor<T extends ICommand = ICommand> = (new (
  ...args: any[]
) => T) & { readonly commandName: string };

========================================
FILE: server/cqrs/query.ts
========================================
// server/cqrs/query.ts

/**
 * Marker interface for all queries in the system.
 *
 * A query represents a request to read state. Queries must never mutate
 * data and must never have side effects beyond optional caching.
 *
 * Naming convention: Get<Entity>[By<Criteria>]Query or
 * Search<Entity>Query, e.g. GetVehicleByIdQuery, SearchVehiclesQuery.
 */
export interface IQuery {
  readonly queryName: string;
}

export abstract class BaseQuery implements IQuery {
  public readonly queryName: string;

  constructor(queryName: string) {
    this.queryName = queryName;
  }
}

export interface IQueryHandler<TQuery extends IQuery, TResult> {
  execute(query: TQuery): Promise<TResult>;
}

/**
 * Constructor type used for registering handlers against a query class.
 *
 * Deliberately requires a static `queryName` string (set explicitly by
 * each concrete query, e.g. `static readonly queryName = 'GetTripsQuery'`)
 * rather than relying on the built-in `Function.name`. Production builds
 * minify class names, and Next.js may bundle the same query class into
 * more than one chunk (e.g. once via the central cqrs bootstrap module,
 * once via a route handler that imports it directly), each minified
 * independently. That made `SomeQuery.name` resolve to different mangled
 * strings (or collide on the same one, like "i") depending on which
 * bundle referenced it, so the QueryBus looked up a name that didn't
 * match what it registered under. A static string literal survives
 * minification untouched and is identical no matter which chunk reads
 * it, so registration and lookup always agree.
 */
export type QueryConstructor<T extends IQuery = IQuery> = (new (
  ...args: any[]
) => T) & { readonly queryName: string };

========================================
FILE: server/cqrs/cqrs.module.ts
========================================
import { commandBus } from './command-bus';
import { queryBus } from './query-bus';
import { registerVehicleCqrsHandlers } from '@/modules/vehicles/cqrs.register';
import { registerFuelCqrsHandlers } from '@/modules/fuel/cqrs.register';
import { registerExpenseCqrsHandlers } from '@/modules/expenses/cqrs.register';
import { registerMaintenanceCqrsHandlers } from '@/modules/maintenance/cqrs.register';
import { registerTripCqrsHandlers } from '@/modules/trips/cqrs.register';
import { bootstrapEvents } from '@/server/events/bootstrap';

declare global {
  // eslint-disable-next-line no-var
  var _cqrsBootstrapped: boolean | undefined;
}

export function bootstrapCqrs(): void {
  if (global._cqrsBootstrapped) {
    return;
  }

  registerVehicleCqrsHandlers(commandBus, queryBus);
  registerFuelCqrsHandlers(commandBus, queryBus);
  registerExpenseCqrsHandlers(commandBus, queryBus);
  registerMaintenanceCqrsHandlers(commandBus, queryBus);
  registerTripCqrsHandlers(commandBus, queryBus);

  bootstrapEvents();

  global._cqrsBootstrapped = true;
}

export { commandBus } from './command-bus';
export { queryBus } from './query-bus';

========================================
FILE: server/repositories/base.repository.ts
========================================
/* eslint-disable @typescript-eslint/no-unused-vars */
// server/repositories/base.repository.ts

import {
  Db,
  Collection,
  Document,
  ObjectId,
  Filter,
  FindOptions,
  UpdateFilter,
  MongoServerError,
} from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';
import {
  BaseEntity,
  PaginationParams,
  PaginatedResponse,
} from '@/shared/types/common.types';
import {
  createPaginatedResponse,
  calculateSkip,
} from '@/shared/utils/pagination.utils';
import { ConflictError } from '@/server/errors/app.errors';

export interface QueryOptions extends FindOptions {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}

/**
 * FIX (critical -- tenant-isolation consistency): the set of tenantId
 * values that mean "platform-level, do not filter by tenant" used to be
 * defined independently in three places -- this file (`'default' |
 * 'system'`, missing 'super_admin'), ExpenseRepository.isSuperAdminTenant()
 * and FuelRepository (`'default' | 'system' | 'super_admin'`) -- and
 * ExpenseRepository's own comments describe that exact drift causing a
 * real production bug (dashboard stats vs. list page disagreeing on
 * what "see everything" meant). Exported here as the single source of
 * truth; other repositories should import this instead of
 * redefining it.
 *
 * Note: this sentinel-based bypass only does the right thing if
 * tenantId is actually the caller's real per-tenant tenantId for
 * non-admin users. It relied on lib/authOptions.ts, which -- until the
 * accompanying fix there -- was assigning tenantId: 'default' to every
 * password-authenticated user, not just real admins. That is the root
 * cause that needed fixing; this export just makes sure every
 * repository agrees on the sentinel set once that's fixed.
 */
export const PLATFORM_SENTINEL_TENANT_IDS: ReadonlySet<string> = new Set([
  'default',
  'system',
  'super_admin',
]);

export function isPlatformSentinelTenant(tenantId: string): boolean {
  return PLATFORM_SENTINEL_TENANT_IDS.has(tenantId);
}

export abstract class BaseRepository<T extends BaseEntity> {
  protected abstract collectionName: string;
  protected db: Db | null = null;

  protected async getCollection(): Promise<Collection<T>> {
    if (!this.db) {
      this.db = await connectToDatabase();
    }
    return this.db.collection<T>(this.collectionName);
  }

  protected getTenantFilter(
    tenantId: string,
    isSuperAdmin: boolean = false
  ): Filter<T> {
    if (isSuperAdmin || isPlatformSentinelTenant(tenantId)) {
      return {} as Filter<T>;
    }
    return { tenantId } as Filter<T>;
  }

  protected getActiveFilter(
    tenantId: string,
    includeDeleted: boolean = false,
    isSuperAdmin: boolean = false
  ): Filter<T> {
    const filter = this.getTenantFilter(tenantId, isSuperAdmin);
    if (!includeDeleted) {
      return { ...filter, isDeleted: { $ne: true } } as Filter<T>;
    }
    return filter;
  }

  /**
   * Translates a MongoDB duplicate-key error (E11000) into a ConflictError
   * with a human-readable message, so callers (controllers) that only know
   * how to render AppError subclasses (see VehicleController.handleError)
   * get a proper 409 instead of a raw driver error falling through to a
   * generic 500.
   */
  private translateDuplicateKeyError(error: unknown): never {
    if (error instanceof MongoServerError && error.code === 11000) {
      const keyValue = (error.keyValue ?? {}) as Record<string, unknown>;
      const dupEntries = Object.entries(keyValue).filter(
        ([key]) => key !== 'tenantId'
      );
      const dupField = dupEntries.map(([key]) => key).join(', ') || 'field';
      const dupValue = dupEntries.map(([, value]) => value).join(', ');

      throw new ConflictError(
        dupValue
          ? `A record with this ${dupField} already exists (${dupValue}).`
          : `A record with this ${dupField} already exists.`,
        { keyValue }
      );
    }
    throw error;
  }

  async findById(
    id: string,
    tenantId: string,
    includeDeleted: boolean = false,
    isSuperAdmin: boolean = false
  ): Promise<T | null> {
    if (!ObjectId.isValid(id)) return null;
    const collection = await this.getCollection();
    const filter = {
      ...this.getActiveFilter(tenantId, includeDeleted, isSuperAdmin),
      _id: new ObjectId(id),
    } as Filter<T>;
    // `collection.findOne` returns `WithId<T> | null` (Mongo's own `_id:
    // ObjectId` clashes with our `_id?: string`); this repository's
    // public contract has always been `T`, so cast at the boundary.
    return collection.findOne(filter) as unknown as Promise<T | null>;
  }

  async findOne(
    filter: Filter<T>,
    tenantId: string,
    includeDeleted: boolean = false,
    isSuperAdmin: boolean = false
  ): Promise<T | null> {
    const collection = await this.getCollection();
    const finalFilter = {
      ...this.getActiveFilter(tenantId, includeDeleted, isSuperAdmin),
      ...filter,
    } as Filter<T>;
    return collection.findOne(finalFilter) as unknown as Promise<T | null>;
  }

  async findMany(
    filter: Filter<T> = {},
    tenantId: string,
    options: QueryOptions = {},
    includeDeleted: boolean = false,
    isSuperAdmin: boolean = false
  ): Promise<T[]> {
    const collection = await this.getCollection();
    const finalFilter = {
      ...this.getActiveFilter(tenantId, includeDeleted, isSuperAdmin),
      ...filter,
    } as Filter<T>;

    const {
      sortBy = 'createdAt',
      sortOrder = 'desc',
      limit,
      ...findOptions
    } = options;
    const sort: Record<string, 1 | -1> = {
      [sortBy]: sortOrder === 'asc' ? 1 : -1,
    };

    let cursor = collection.find(finalFilter, findOptions).sort(sort);
    if (limit) cursor = cursor.limit(limit);
    return cursor.toArray() as unknown as Promise<T[]>;
  }

  async findWithPagination(
    filter: Filter<T> = {},
    pagination: PaginationParams,
    tenantId: string,
    includeDeleted: boolean = false,
    isSuperAdmin: boolean = false
  ): Promise<PaginatedResponse<T>> {
    const collection = await this.getCollection();
    const finalFilter = {
      ...this.getActiveFilter(tenantId, includeDeleted, isSuperAdmin),
      ...filter,
    } as Filter<T>;

    const {
      page,
      limit,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = pagination;
    const skip = calculateSkip(page, limit);
    const sort: Record<string, 1 | -1> = {
      [sortBy]: sortOrder === 'asc' ? 1 : -1,
    };

    const [data, total] = await Promise.all([
      collection
        .find(finalFilter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .toArray(),
      collection.countDocuments(finalFilter),
    ]);

    return createPaginatedResponse(data as unknown as T[], total, { page, limit });
  }

  async create(
    data: Omit<T, '_id' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt' | 'tenantId'>,
    tenantId: string,
    userId?: string
  ): Promise<T> {
    const collection = await this.getCollection();
    const now = new Date();

    const document = {
      ...data,
      tenantId,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      deletedAt: null,
      createdBy: userId,
      updatedBy: userId,
    } as unknown as T;

    try {
      const result = await collection.insertOne(document as any);
      return { ...document, _id: result.insertedId.toString() };
    } catch (error) {
      // FIX: this was the direct cause of the POST /api/vehicles 500s Ã¢â‚¬â€
      // re-creating a vehicle with a license_plate that still belonged to
      // an (already soft-deleted) record threw a raw MongoServerError
      // (E11000) that propagated straight out of this method. See
      // translateDuplicateKeyError() and the partial index fix in
      // infrastructure/database/indexes.ts.
      this.translateDuplicateKeyError(error);
    }
  }

  async update(
    id: string,
    data: Partial<Omit<T, '_id' | 'tenantId' | 'createdAt' | 'createdBy'>>,
    tenantId: string,
    userId?: string,
    isSuperAdmin: boolean = false
  ): Promise<T | null> {
    if (!ObjectId.isValid(id)) return null;
    const collection = await this.getCollection();
    const filter = {
      ...this.getTenantFilter(tenantId, isSuperAdmin),
      _id: new ObjectId(id),
      isDeleted: { $ne: true },
    } as Filter<T>;

    const update: UpdateFilter<T> = {
      $set: {
        ...data,
        updatedAt: new Date(),
        updatedBy: userId,
      } as any,
    };

    try {
      const result = await collection.findOneAndUpdate(filter, update, {
        returnDocument: 'after',
      });
      return (result ?? null) as unknown as T | null;
    } catch (error) {
      // Same rationale as create(): updating a record's unique field
      // (e.g. re-assigning a license_plate) to a value already in active
      // use should surface as a 409, not a raw driver error / 500.
      this.translateDuplicateKeyError(error);
    }
  }

  async softDelete(
    id: string,
    tenantId: string,
    userId?: string,
    isSuperAdmin: boolean = false
  ): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;
    const collection = await this.getCollection();
    const filter = {
      ...this.getTenantFilter(tenantId, isSuperAdmin),
      _id: new ObjectId(id),
      isDeleted: { $ne: true },
    } as Filter<T>;

    const update: UpdateFilter<T> = {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        updatedBy: userId,
        updatedAt: new Date(),
      } as any,
    };

    const result = await collection.updateOne(filter, update);
    return result.modifiedCount > 0;
  }

  async hardDelete(
    id: string,
    tenantId: string,
    isSuperAdmin: boolean = false
  ): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;
    const collection = await this.getCollection();
    const filter = {
      ...this.getTenantFilter(tenantId, isSuperAdmin),
      _id: new ObjectId(id),
    } as Filter<T>;

    const result = await collection.deleteOne(filter);
    return result.deletedCount > 0;
  }

  async count(
    filter: Filter<T> = {},
    tenantId: string,
    includeDeleted: boolean = false,
    isSuperAdmin: boolean = false
  ): Promise<number> {
    const collection = await this.getCollection();
    const finalFilter = {
      ...this.getActiveFilter(tenantId, includeDeleted, isSuperAdmin),
      ...filter,
    } as Filter<T>;
    return collection.countDocuments(finalFilter);
  }

  async exists(
    filter: Filter<T>,
    tenantId: string,
    isSuperAdmin: boolean = false
  ): Promise<boolean> {
    const c = await this.count(filter, tenantId, false, isSuperAdmin);
    return c > 0;
  }
}

========================================
FILE: server/repositories/tenant-scoped.repository.ts
========================================
// server/repositories/tenant-scoped.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository, QueryOptions } from './base.repository';
import { BaseEntity, PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';

/**
 * A tenant/org-unit-scoped variant of BaseEntity for domain records that
 * belong to a specific branch/department/team/fleet/workshop within an
 * organization, not just the organization as a whole (Phase 7).
 */
export interface OrgUnitScopedEntity extends BaseEntity {
  orgUnitId?: string;
}

/**
 * Extends BaseRepository with query helpers that additionally filter by
 * the caller's accessible org units (per Phase 7's TenantContext),
 * layered on top of BaseRepository's existing tenantId scoping. A
 * repository opts into this by extending TenantScopedRepository<T>
 * instead of BaseRepository<T> and having its collection's documents
 * carry an `orgUnitId` field.
 *
 * This is additive: repositories that don't need org-unit-level scoping
 * (e.g. organizations, audit log) are unaffected and continue extending
 * BaseRepository directly.
 */
export abstract class TenantScopedRepository<
  T extends OrgUnitScopedEntity
> extends BaseRepository<T> {
  async findManyInScope(
    filter: Filter<T>,
    context: TenantContext,
    options: QueryOptions = {}
  ): Promise<T[]> {
    const scopeFilter = tenantScopeService.buildFilter<T>(context, 'orgUnitId');
    return this.findMany({ ...filter, ...scopeFilter } as Filter<T>, context.organizationId, options);
  }

  async findWithPaginationInScope(
    filter: Filter<T>,
    pagination: PaginationParams,
    context: TenantContext
  ): Promise<PaginatedResponse<T>> {
    const scopeFilter = tenantScopeService.buildFilter<T>(context, 'orgUnitId');
    return this.findWithPagination(
      { ...filter, ...scopeFilter } as Filter<T>,
      pagination,
      context.organizationId
    );
  }
}

========================================
FILE: server/services/base.service.ts
========================================
// server/services/base.service.ts

import { ZodSchema } from 'zod';
import { BaseRepository } from '@/server/repositories/base.repository';
import {
  BaseEntity,
  PaginationParams,
  PaginatedResponse,
} from '@/shared/types/common.types';
import { validateWithZod } from '@/shared/utils/validation.utils';
import {
  AppError,
  ValidationError,
  NotFoundError,
} from '@/server/errors/app.errors';

export abstract class BaseService<
  T extends BaseEntity,
  CreateDTO,
  UpdateDTO
> {
  constructor(protected repository: BaseRepository<T>) {}

  protected abstract getCreateSchema(): ZodSchema<CreateDTO>;
  protected abstract getUpdateSchema(): ZodSchema<UpdateDTO>;
  protected abstract getEntityName(): string;

  protected async validateCreate(data: unknown): Promise<CreateDTO> {
    const result = await validateWithZod(this.getCreateSchema(), data);
    if (!result.success) {
      const fieldErrors = result.errors || {};
      const messages = Object.entries(fieldErrors)
        .map(([field, errs]) => `${field}: ${errs.join(', ')}`)
        .join('; ');
      throw new ValidationError(messages || 'Validation failed', fieldErrors);
    }
    return result.data!;
  }

  protected async validateUpdate(data: unknown): Promise<UpdateDTO> {
    const result = await validateWithZod(this.getUpdateSchema(), data);
    if (!result.success) {
      const fieldErrors = result.errors || {};
      const messages = Object.entries(fieldErrors)
        .map(([field, errs]) => `${field}: ${errs.join(', ')}`)
        .join('; ');
      throw new ValidationError(messages || 'Validation failed', fieldErrors);
    }
    return result.data!;
  }

  async findById(id: string, tenantId: string): Promise<T | null> {
    const entity = await this.repository.findById(id, tenantId);
    if (!entity) {
      throw new NotFoundError(`${this.getEntityName()} not found`);
    }
    return entity;
  }

  async findOne(
    filter: Record<string, unknown>,
    tenantId: string
  ): Promise<T | null> {
    return this.repository.findOne(filter as any, tenantId);
  }

  async findMany(
    filter: Record<string, unknown>,
    tenantId: string
  ): Promise<T[]> {
    return this.repository.findMany(filter as any, tenantId);
  }

  async findWithPagination(
    filter: Record<string, unknown>,
    pagination: PaginationParams,
    tenantId: string
  ): Promise<PaginatedResponse<T>> {
    return this.repository.findWithPagination(
      filter as any,
      pagination,
      tenantId
    );
  }

  async create(
    data: unknown,
    tenantId: string,
    userId?: string
  ): Promise<T> {
    const validatedData = await this.validateCreate(data);
    return this.repository.create(validatedData as any, tenantId, userId);
  }

  async update(
    id: string,
    data: unknown,
    tenantId: string,
    userId?: string
  ): Promise<T | null> {
    const validatedData = await this.validateUpdate(data);
    const entity = await this.repository.update(
      id,
      validatedData as any,
      tenantId,
      userId
    );
    if (!entity) {
      throw new NotFoundError(`${this.getEntityName()} not found`);
    }
    return entity;
  }

  async delete(
    id: string,
    tenantId: string,
    userId?: string,
    soft: boolean = true
  ): Promise<boolean> {
    const entity = await this.repository.findById(id, tenantId);
    if (!entity) {
      throw new NotFoundError(`${this.getEntityName()} not found`);
    }
    if (soft) {
      return this.repository.softDelete(id, tenantId, userId);
    }
    return this.repository.hardDelete(id, tenantId);
  }

  async count(
    filter: Record<string, unknown>,
    tenantId: string
  ): Promise<number> {
    return this.repository.count(filter as any, tenantId);
  }

  async exists(
    filter: Record<string, unknown>,
    tenantId: string
  ): Promise<boolean> {
    return this.repository.exists(filter as any, tenantId);
  }
}

========================================
FILE: server/events/bootstrap.ts
========================================
// server/events/bootstrap.ts

import { EventBusFactory } from './bus/EventBusFactory';
import { loggingMiddleware } from './middleware/LoggingMiddleware';
import { metricsMiddleware } from './middleware/MetricsMiddleware';
import { auditMiddleware } from './middleware/AuditMiddleware';
import { retryMiddleware } from './middleware/RetryMiddleware';

import { WorkflowTriggerHandler } from './handlers/workflow/WorkflowTriggerHandler';
import { NotificationHandler } from './handlers/notification/NotificationHandler';
import { AnalyticsHandler } from './handlers/analytics/AnalyticsHandler';
import { IntelligenceHandler } from './handlers/intelligence/IntelligenceHandler';
import { WebSocketHandler } from './handlers/websocket/WebSocketHandler';
import { AuditHandler } from './handlers/audit/AuditHandler';
import { PermissionCacheInvalidationHandler } from './handlers/security/PermissionCacheInvalidationHandler';
import { SecurityAuditHandler } from './handlers/security/SecurityAuditHandler';
import { AlertNotificationHandler } from './handlers/observability/AlertNotificationHandler';
import { WebhookDispatchHandler } from './handlers/webhooks/WebhookDispatchHandler';
import { AIPredictionTriggerHandler } from './handlers/ai/AIPredictionTriggerHandler';
import { AIInsightHandler } from './handlers/ai/AIInsightHandler';
import { digitalTwinProjectionHandler } from './handlers/digital-twin/DigitalTwinProjectionHandler';

import {
  VEHICLE_CREATED,
  VEHICLE_UPDATED,
  VEHICLE_DELETED,
  EXPENSE_CREATED,
  EXPENSE_UPDATED,
  EXPENSE_DELETED,
  FUEL_LOGGED,
  FUEL_LOG_UPDATED,
  FUEL_LOG_DELETED,
  REMINDER_CREATED,
  REMINDER_UPDATED,
  REMINDER_DELETED,
  REMINDER_COMPLETED,
  REMINDER_OVERDUE,
  TRIP_CREATED,
  TRIP_UPDATED,
  TRIP_DELETED,
  INVOICE_PAID,
  SUBSCRIPTION_UPGRADED,
  ORGANIZATION_CREATED,
  MEMBER_JOINED,
  MEMBER_REMOVED,
  TELEMATICS_DATA_INGESTED,
  GEOFENCE_ALERT,
  CUSTOM_ROLE_CREATED,
  CUSTOM_ROLE_UPDATED,
  CUSTOM_ROLE_DELETED,
  RESOURCE_PERMISSION_GRANTED,
  RESOURCE_PERMISSION_REVOKED,
  ORG_UNIT_CREATED,
  ORG_UNIT_UPDATED,
  ORG_UNIT_DELETED,
  USER_SCOPE_ASSIGNED,
  USER_SCOPE_REVOKED,
  SECURITY_LOGIN_SUCCESS,
  SECURITY_LOGIN_FAILED,
  SECURITY_BRUTE_FORCE_DETECTED,
  SECURITY_ACCOUNT_LOCKED,
  SECURITY_ACCOUNT_UNLOCKED,
  SECURITY_RATE_LIMIT_ANOMALY,
  AUDIT_CHAIN_INTEGRITY_FAILURE,
  MFA_ENROLLED,
  MFA_DISABLED,
  MFA_BACKUP_CODE_USED,
  // â”€â”€ FleetOps event names â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  WORK_ORDER_CREATED,
  WORK_ORDER_ASSIGNED,
  WORK_ORDER_COMPLETED,
  DISPATCH_JOB_CREATED,
  DISPATCH_JOB_ASSIGNED,
  DISPATCH_JOB_COMPLETED,
  BOOKING_CHECKED_IN,
  DRIVER_SHIFT_CREATED,
  // â”€â”€ Digital Twin specific event names â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  VEHICLE_STATUS_CHANGED,
  TRIP_COMPLETED,
} from './event-names';
import { OBSERVABILITY_ALERT_TRIGGERED } from '@/infrastructure/observability/event-names';

// â”€â”€ FleetOps event handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import {
  slaTrackingStarterHandler,
  slaTrackingResolverHandler,
  slaResponseRecorderHandler,
  complianceAutoSchedulerHandler,
} from './handlers/fleetops-event-handlers';

let bootstrapped = false;

export function bootstrapEvents(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  const bus = EventBusFactory.getInstance();

  bus.use(loggingMiddleware);
  bus.use(metricsMiddleware);
  bus.use(auditMiddleware);
  bus.use(retryMiddleware);

  const workflowHandler = new WorkflowTriggerHandler();
  const notificationHandler = new NotificationHandler();
  const analyticsHandler = new AnalyticsHandler();
  const intelligenceHandler = new IntelligenceHandler();
  const websocketHandler = new WebSocketHandler();
  const auditHandler = new AuditHandler();
  const permissionCacheHandler = new PermissionCacheInvalidationHandler();
  const securityAuditHandler = new SecurityAuditHandler();
  const alertHandler = new AlertNotificationHandler();
  const webhookDispatchHandler = new WebhookDispatchHandler();
  const aiPredictionHandler = new AIPredictionTriggerHandler();
  const aiInsightHandler = new AIInsightHandler();

  const allEventNames = [
    VEHICLE_CREATED,
    VEHICLE_UPDATED,
    VEHICLE_DELETED,
    EXPENSE_CREATED,
    EXPENSE_UPDATED,
    EXPENSE_DELETED,
    FUEL_LOGGED,
    FUEL_LOG_UPDATED,
    FUEL_LOG_DELETED,
    REMINDER_CREATED,
    REMINDER_UPDATED,
    REMINDER_DELETED,
    REMINDER_COMPLETED,
    REMINDER_OVERDUE,
    TRIP_CREATED,
    TRIP_UPDATED,
    TRIP_DELETED,
    INVOICE_PAID,
    SUBSCRIPTION_UPGRADED,
    ORGANIZATION_CREATED,
    MEMBER_JOINED,
    MEMBER_REMOVED,
    TELEMATICS_DATA_INGESTED,
    GEOFENCE_ALERT,
  ];

  for (const name of allEventNames) {
    bus.subscribe(name, workflowHandler);
    bus.subscribe(name, notificationHandler);
    bus.subscribe(name, analyticsHandler);
    bus.subscribe(name, intelligenceHandler);
    bus.subscribe(name, websocketHandler);
    bus.subscribe(name, auditHandler);
    bus.subscribe(name, webhookDispatchHandler);
  }

  // AI Prediction Triggers â€” subscribe to domain events that warrant
  // predictive analysis (maintenance forecasting, cost anomaly detection,
  // fuel efficiency predictions, trip pattern learning).
  bus.subscribe(VEHICLE_UPDATED, aiPredictionHandler);
  bus.subscribe(TRIP_CREATED, aiPredictionHandler);
  bus.subscribe(FUEL_LOGGED, aiPredictionHandler);
  bus.subscribe(EXPENSE_CREATED, aiPredictionHandler);
  bus.subscribe(REMINDER_COMPLETED, aiPredictionHandler);

  // AI Insight Handler â€” reacts to generated predictions by producing
  // actionable insights (dashboards, notifications, recommendations).
  // This is a chained event: AIPredictionTriggerHandler does the heavy
  // ML work, then emits AIPredictionGenerated, which AIInsightHandler
  // consumes to format and deliver the insight.
  bus.subscribe('AIPredictionGenerated', aiInsightHandler);

  const securityEventNames = [
    CUSTOM_ROLE_CREATED,
    CUSTOM_ROLE_UPDATED,
    CUSTOM_ROLE_DELETED,
    RESOURCE_PERMISSION_GRANTED,
    RESOURCE_PERMISSION_REVOKED,
    ORG_UNIT_CREATED,
    ORG_UNIT_UPDATED,
    ORG_UNIT_DELETED,
    USER_SCOPE_ASSIGNED,
    USER_SCOPE_REVOKED,
  ];

  for (const name of securityEventNames) {
    bus.subscribe(name, permissionCacheHandler);
    bus.subscribe(name, auditHandler);
  }

  // Slice 6c: threat-detection / audit-chain events go exclusively to
  // SecurityAuditHandler, which logs them with the correct
  // category='security' + severity and fans critical ones out to
  // organization owners via the notification system. They are NOT also
  // subscribed to the generic AuditHandler (would double-log with worse
  // metadata) or PermissionCacheInvalidationHandler (irrelevant here).
  const threatEventNames = [
    SECURITY_LOGIN_SUCCESS,
    SECURITY_LOGIN_FAILED,
    SECURITY_BRUTE_FORCE_DETECTED,
    SECURITY_ACCOUNT_LOCKED,
    SECURITY_ACCOUNT_UNLOCKED,
    SECURITY_RATE_LIMIT_ANOMALY,
    AUDIT_CHAIN_INTEGRITY_FAILURE,
  ];

  for (const name of threatEventNames) {
    bus.subscribe(name, securityAuditHandler);
  }

  // Slice 6d: MFA events subscribed to SecurityAuditHandler
  // for audit trail purposes (severity 'info', entityType 'security').
  // NOT subscribed to PermissionCacheInvalidationHandler â€” MFA status
  // doesn't affect cached permission decisions.
  bus.subscribe(MFA_ENROLLED, securityAuditHandler);
  bus.subscribe(MFA_DISABLED, securityAuditHandler);
  bus.subscribe(MFA_BACKUP_CODE_USED, securityAuditHandler);

  // Phase 9 â€” Enterprise Observability: alert delivery
  bus.subscribe(OBSERVABILITY_ALERT_TRIGGERED, alertHandler);

  // â”€â”€ FleetOps â€“ SLA Tracking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Start SLA tracking when work orders or dispatch jobs are created.
  bus.subscribe(WORK_ORDER_CREATED, slaTrackingStarterHandler);
  bus.subscribe(DISPATCH_JOB_CREATED, slaTrackingStarterHandler);

  // Record first-response time when work orders or dispatch jobs are assigned.
  bus.subscribe(WORK_ORDER_ASSIGNED, slaResponseRecorderHandler);
  bus.subscribe(DISPATCH_JOB_ASSIGNED, slaResponseRecorderHandler);

  // Resolve SLA tracking (met/breached) when work orders, dispatch jobs,
  // or bookings reach a terminal state.
  bus.subscribe(WORK_ORDER_COMPLETED, slaTrackingResolverHandler);
  bus.subscribe(DISPATCH_JOB_COMPLETED, slaTrackingResolverHandler);
  bus.subscribe(BOOKING_CHECKED_IN, slaTrackingResolverHandler);

  // â”€â”€ FleetOps â€“ Compliance Auto-Scheduling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // When a vehicle or driver is created, auto-schedule compliance records
  // for all active compliance rules that apply to that entity type.
  bus.subscribe(VEHICLE_CREATED, complianceAutoSchedulerHandler);
  bus.subscribe(DRIVER_SHIFT_CREATED, complianceAutoSchedulerHandler);

  // â”€â”€ Digital Twin Projection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Subscribe to events that update the digital twin read model.
  // This handler maintains a materialized view of vehicle state by
  // projecting domain events into a query-optimized representation
  // used by real-time dashboards, status APIs, and analytics.
  const digitalTwinEventNames = [
    VEHICLE_CREATED,
    VEHICLE_UPDATED,
    VEHICLE_STATUS_CHANGED,
    FUEL_LOGGED,
    TRIP_CREATED,
    TRIP_COMPLETED,
    REMINDER_OVERDUE,
    REMINDER_COMPLETED,
    TELEMATICS_DATA_INGESTED,
    GEOFENCE_ALERT,
    WORK_ORDER_COMPLETED,
  ];

  for (const name of digitalTwinEventNames) {
    bus.subscribe(name, digitalTwinProjectionHandler);
  }

  console.log('[EventBus] Bootstrap complete.');
}

========================================
FILE: server/events/event-names.ts
========================================
// server/events/event-names.ts

export const VEHICLE_CREATED = 'VehicleCreated';
export const VEHICLE_UPDATED = 'VehicleUpdated';
export const VEHICLE_DELETED = 'VehicleDeleted';
export const VEHICLE_STATUS_CHANGED = 'VehicleStatusChanged';

export const EXPENSE_CREATED = 'ExpenseCreated';
export const EXPENSE_UPDATED = 'ExpenseUpdated';
export const EXPENSE_DELETED = 'ExpenseDeleted';

export const FUEL_LOGGED = 'FuelLogged';
export const FUEL_LOG_UPDATED = 'FuelLogUpdated';
export const FUEL_LOG_DELETED = 'FuelLogDeleted';

export const REMINDER_CREATED = 'ReminderCreated';
export const REMINDER_UPDATED = 'ReminderUpdated';
export const REMINDER_DELETED = 'ReminderDeleted';
export const REMINDER_COMPLETED = 'ReminderCompleted';
export const REMINDER_OVERDUE = 'ReminderOverdue';

export const TRIP_CREATED = 'TripCreated';
export const TRIP_UPDATED = 'TripUpdated';
export const TRIP_DELETED = 'TripDeleted';
export const TRIP_COMPLETED = 'TripCompleted';

export const RULE_CREATED = 'RuleCreated';
export const RULE_UPDATED = 'RuleUpdated';
export const RULE_DELETED = 'RuleDeleted';

export const INVOICE_CREATED = 'InvoiceCreated';
export const INVOICE_PAID = 'InvoicePaid';
export const SUBSCRIPTION_UPGRADED = 'SubscriptionUpgraded';

export const ORGANIZATION_CREATED = 'OrganizationCreated';
export const MEMBER_JOINED = 'MemberJoined';
export const MEMBER_REMOVED = 'MemberRemoved';

export const TELEMATICS_DATA_INGESTED = 'TelematicsDataIngested';
export const GEOFENCE_ALERT = 'GeofenceAlert';

// â”€â”€ FleetOps (Dispatch, Shifts, Bookings, Work Orders, Workshop, Spare Parts, Procurement, Vendors, SLA, Compliance) â”€â”€

export const DISPATCH_JOB_CREATED = 'DispatchJobCreated';
export const DISPATCH_JOB_ASSIGNED = 'DispatchJobAssigned';
export const DISPATCH_JOB_STARTED = 'DispatchJobStarted';
export const DISPATCH_JOB_COMPLETED = 'DispatchJobCompleted';
export const DISPATCH_JOB_CANCELLED = 'DispatchJobCancelled';

export const DRIVER_SHIFT_CREATED = 'DriverShiftCreated';
export const DRIVER_SHIFT_UPDATED = 'DriverShiftUpdated';
export const DRIVER_SHIFT_CANCELLED = 'DriverShiftCancelled';
export const DRIVER_SHIFT_CONFLICT_DETECTED = 'DriverShiftConflictDetected';

export const BOOKING_CREATED = 'BookingCreated';
export const BOOKING_APPROVED = 'BookingApproved';
export const BOOKING_REJECTED = 'BookingRejected';
export const BOOKING_CANCELLED = 'BookingCancelled';
export const BOOKING_CHECKED_OUT = 'BookingCheckedOut';
export const BOOKING_CHECKED_IN = 'BookingCheckedIn';

export const WORK_ORDER_CREATED = 'WorkOrderCreated';
export const WORK_ORDER_ASSIGNED = 'WorkOrderAssigned';
export const WORK_ORDER_STATUS_CHANGED = 'WorkOrderStatusChanged';
export const WORK_ORDER_PARTS_CONSUMED = 'WorkOrderPartsConsumed';
export const WORK_ORDER_COMPLETED = 'WorkOrderCompleted';
export const WORK_ORDER_CANCELLED = 'WorkOrderCancelled';

export const WORKSHOP_BAY_CREATED = 'WorkshopBayCreated';
export const WORKSHOP_BAY_STATUS_CHANGED = 'WorkshopBayStatusChanged';
export const MECHANIC_ASSIGNED = 'MechanicAssigned';
export const MECHANIC_UNASSIGNED = 'MechanicUnassigned';

export const SPARE_PART_CREATED = 'SparePartCreated';
export const SPARE_PART_UPDATED = 'SparePartUpdated';
export const STOCK_RECEIVED = 'StockReceived';
export const STOCK_CONSUMED = 'StockConsumed';
export const STOCK_ADJUSTED = 'StockAdjusted';
export const STOCK_LOW_THRESHOLD_BREACHED = 'StockLowThresholdBreached';

export const PURCHASE_REQUEST_CREATED = 'PurchaseRequestCreated';
export const PURCHASE_REQUEST_APPROVED = 'PurchaseRequestApproved';
export const PURCHASE_REQUEST_REJECTED = 'PurchaseRequestRejected';
export const PURCHASE_ORDER_CREATED = 'PurchaseOrderCreated';
export const PURCHASE_ORDER_SENT = 'PurchaseOrderSent';
export const PURCHASE_ORDER_RECEIVED = 'PurchaseOrderReceived';
export const PURCHASE_ORDER_CANCELLED = 'PurchaseOrderCancelled';

export const VENDOR_CREATED = 'VendorCreated';
export const VENDOR_UPDATED = 'VendorUpdated';
export const VENDOR_STATUS_CHANGED = 'VendorStatusChanged';
export const VENDOR_RATED = 'VendorRated';

export const SLA_POLICY_CREATED = 'SlaPolicyCreated';
export const SLA_POLICY_UPDATED = 'SlaPolicyUpdated';
export const SLA_TRACKING_STARTED = 'SlaTrackingStarted';
export const SLA_WARNING_TRIGGERED = 'SlaWarningTriggered';
export const SLA_BREACHED = 'SlaBreached';
export const SLA_MET = 'SlaMet';

export const COMPLIANCE_RULE_CREATED = 'ComplianceRuleCreated';
export const COMPLIANCE_RECORD_CREATED = 'ComplianceRecordCreated';
export const COMPLIANCE_RECORD_DUE_SOON = 'ComplianceRecordDueSoon';
export const COMPLIANCE_RECORD_OVERDUE = 'ComplianceRecordOverdue';
export const COMPLIANCE_RECORD_RESOLVED = 'ComplianceRecordResolved';

// â”€â”€ AI & Predictions â”€â”€

export const AI_PREDICTION_GENERATED = 'AIPredictionGenerated';
export const AI_PREDICTION_CONFIRMED = 'AIPredictionConfirmed';
export const AI_PREDICTION_DISMISSED = 'AIPredictionDismissed';
export const AI_INSIGHT_AVAILABLE = 'AIInsightAvailable';

// â”€â”€ Security / Permission Engine (Slice 6a) â”€â”€

export const CUSTOM_ROLE_CREATED = 'CustomRoleCreated';
export const CUSTOM_ROLE_UPDATED = 'CustomRoleUpdated';
export const CUSTOM_ROLE_DELETED = 'CustomRoleDeleted';
export const RESOURCE_PERMISSION_GRANTED = 'ResourcePermissionGranted';
export const RESOURCE_PERMISSION_REVOKED = 'ResourcePermissionRevoked';
export const ORG_UNIT_CREATED = 'OrgUnitCreated';
export const ORG_UNIT_UPDATED = 'OrgUnitUpdated';
export const ORG_UNIT_DELETED = 'OrgUnitDeleted';
export const USER_SCOPE_ASSIGNED = 'UserScopeAssigned';
export const USER_SCOPE_REVOKED = 'UserScopeRevoked';

// â”€â”€ Session Management, Refresh Tokens & API Keys (Slice 6b) â”€â”€

export const SESSION_CREATED = 'SessionCreated';
export const SESSION_REVOKED = 'SessionRevoked';
export const API_KEY_CREATED = 'ApiKeyCreated';
export const API_KEY_REVOKED = 'ApiKeyRevoked';
export const REFRESH_TOKEN_REUSE_DETECTED = 'RefreshTokenReuseDetected';

// â”€â”€ Immutable Audit Trail & Threat Detection (Slice 6c) â”€â”€

export const SECURITY_LOGIN_SUCCESS = 'SecurityLoginSuccess';
export const SECURITY_LOGIN_FAILED = 'SecurityLoginFailed';
export const SECURITY_BRUTE_FORCE_DETECTED = 'SecurityBruteForceDetected';
export const SECURITY_ACCOUNT_LOCKED = 'SecurityAccountLocked';
export const SECURITY_ACCOUNT_UNLOCKED = 'SecurityAccountUnlocked';
export const SECURITY_RATE_LIMIT_ANOMALY = 'SecurityRateLimitAnomaly';
export const AUDIT_CHAIN_INTEGRITY_FAILURE = 'AuditChainIntegrityFailure';

// â”€â”€ Digital Twin (Phase 13) â”€â”€
export const DIGITAL_TWIN_UPDATED = 'DigitalTwinUpdated';
export const DIGITAL_TWIN_REBUILT = 'DigitalTwinRebuilt';

// â”€â”€ MFA (Slice 6d) â”€â”€

export { MFA_ENROLLED, MFA_DISABLED, MFA_BACKUP_CODE_USED } from '@/modules/security/events/mfa.events';

========================================
FILE: server/events/publishers/TripEventPublisher.ts
========================================
// server/events/publishers/TripEventPublisher.ts

export { VehicleEventPublisher as TripEventPublisher } from './VehicleEventPublisher';

========================================
FILE: server/events/publishers/FuelEventPublisher.ts
========================================
// server/events/publishers/FuelEventPublisher.ts

export { VehicleEventPublisher as FuelEventPublisher } from './VehicleEventPublisher';

========================================
FILE: server/events/handlers/fleetops-event-handlers.ts
========================================
// server/events/handlers/fleetops-event-handlers.ts
import { IEventHandler } from '../base/IEventHandler';
import { DomainEvent } from '../base/DomainEvent';
import { slaService } from '@/modules/sla/services/sla.service';
import { complianceService } from '@/modules/compliance/services/compliance.service';
import { monitoring } from '@/infrastructure/monitoring/logger';

/**
 * Handles WORK_ORDER_CREATED and DISPATCH_JOB_CREATED by starting SLA
 * tracking against the applicable policy for the entity type + priority.
 */
export class SlaTrackingStarterHandler implements IEventHandler<DomainEvent> {
  async handle(event: DomainEvent): Promise<void> {
    const { entityId, entityType, priority, tenantId } = event.payload as any;

    if (!entityId || !entityType || !tenantId) {
      monitoring.logWarn('[SlaTrackingStarter] Missing required payload fields', { eventId: event.eventId });
      return;
    }

    try {
      await slaService.startTracking(entityType, entityId, priority, tenantId, 'system');
    } catch (error) {
      monitoring.logError(`[SlaTrackingStarter] Failed for ${entityType}/${entityId}`, error as Error);
    }
  }
}

/**
 * Handles WORK_ORDER_COMPLETED, DISPATCH_JOB_COMPLETED, BOOKING_CHECKED_IN
 * by resolving (met/breached) the active SLA tracking for that entity.
 */
export class SlaTrackingResolverHandler implements IEventHandler<DomainEvent> {
  async handle(event: DomainEvent): Promise<void> {
    const { entityId, entityType, tenantId } = event.payload as any;

    if (!entityId || !entityType || !tenantId) {
      monitoring.logWarn('[SlaTrackingResolver] Missing required payload fields', { eventId: event.eventId });
      return;
    }

    try {
      await slaService.resolveTracking(entityType, entityId, tenantId, 'system');
    } catch (error) {
      monitoring.logError(`[SlaTrackingResolver] Failed for ${entityType}/${entityId}`, error as Error);
    }
  }
}

/**
 * Handles WORK_ORDER_ASSIGNED and DISPATCH_JOB_ASSIGNED by recording
 * the first-response timestamp on the active SLA tracking.
 */
export class SlaResponseRecorderHandler implements IEventHandler<DomainEvent> {
  async handle(event: DomainEvent): Promise<void> {
    const { entityId, entityType, tenantId } = event.payload as any;

    if (!entityId || !entityType || !tenantId) {
      return;
    }

    try {
      await slaService.recordResponse(entityType, entityId, tenantId, 'system');
    } catch (error) {
      monitoring.logError(`[SlaResponseRecorder] Failed for ${entityType}/${entityId}`, error as Error);
    }
  }
}

/**
 * Handles VEHICLE_CREATED and DRIVER_CREATED by auto-scheduling
 * compliance records for all active rules matching that entity type.
 */
export class ComplianceAutoSchedulerHandler implements IEventHandler<DomainEvent> {
  async handle(event: DomainEvent): Promise<void> {
    const { entityId, entityType, tenantId } = event.payload as any;

    if (!entityId || !entityType || !tenantId) {
      return;
    }

    try {
      const rules = await complianceService.listRules(entityType, tenantId);
      for (const rule of rules) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + (rule.warningDays || 30));
        await complianceService.createRecord(
          { ruleId: rule._id!, entityType, entityId, dueDate },
          tenantId,
          'system'
        );
      }
    } catch (error) {
      monitoring.logError(`[ComplianceAutoScheduler] Failed for ${entityType}/${entityId}`, error as Error);
    }
  }
}

export const slaTrackingStarterHandler = new SlaTrackingStarterHandler();
export const slaTrackingResolverHandler = new SlaTrackingResolverHandler();
export const slaResponseRecorderHandler = new SlaResponseRecorderHandler();
export const complianceAutoSchedulerHandler = new ComplianceAutoSchedulerHandler();

========================================
FILE: server/events/handlers/analytics/AnalyticsHandler.ts
========================================
// server/events/handlers/analytics/AnalyticsHandler.ts

import { IEventHandler } from '../../base/IEventHandler';
import { DomainEvent } from '../../base/DomainEvent';
import { queryCache } from '@/infrastructure/cache/query-cache.service';

export class AnalyticsHandler implements IEventHandler<DomainEvent> {
  async handle(event: DomainEvent): Promise<void> {
    const tenantId = (event.metadata?.tenantId as string) || 'default';
    const payload = event.payload;

    switch (event.eventName) {
      case 'VehicleCreated':
      case 'VehicleUpdated':
      case 'VehicleDeleted':
        await queryCache.invalidateVehicle(tenantId, payload.entityId as string);
        await queryCache.invalidatePattern(`vehicles:${tenantId}:*`);
        await queryCache.invalidatePattern(`fleet:${tenantId}:*`);
        break;
      case 'ExpenseCreated':
      case 'ExpenseUpdated':
      case 'ExpenseDeleted':
        await queryCache.invalidatePattern(`expenses:${tenantId}:*`);
        await queryCache.invalidatePattern(`analytics:${tenantId}:expenses:*`);
        await queryCache.invalidatePattern(`fleet:${tenantId}:*`);
        break;
      case 'FuelLogged':
      case 'FuelLogUpdated':
      case 'FuelLogDeleted':
        await queryCache.invalidatePattern(`fuel:${tenantId}:*`);
        await queryCache.invalidatePattern(`analytics:${tenantId}:fuel:*`);
        await queryCache.invalidatePattern(`fleet:${tenantId}:*`);
        break;
      case 'ReminderCreated':
      case 'ReminderUpdated':
      case 'ReminderCompleted':
      case 'ReminderDeleted':
        await queryCache.invalidatePattern(`maintenance:${tenantId}:*`);
        await queryCache.invalidatePattern(`analytics:${tenantId}:maintenance:*`);
        await queryCache.invalidatePattern(`fleet:${tenantId}:*`);
        break;
      case 'TripCreated':
      case 'TripUpdated':
      case 'TripDeleted':
        await queryCache.invalidatePattern(`trips:${tenantId}:*`);
        await queryCache.invalidatePattern(`analytics:${tenantId}:trips:*`);
        await queryCache.invalidatePattern(`fleet:${tenantId}:*`);
        break;
      default:
        await queryCache.invalidatePattern(`*:${tenantId}:*`);
        break;
    }
  }
}

========================================
FILE: server/middleware/permission.middleware.ts
========================================
// server/middleware/permission.middleware.ts

import { NextRequest, NextResponse } from 'next/server';
import { Permission } from '@/server/permissions/roles';
import {
  AuthContext,
  getAuthContext as getCanonicalAuthContext,
  hasPermission as contextHasPermission,
  hasAnyPermission as contextHasAnyPermission,
  hasRole as contextHasRole,
} from '@/server/auth/auth-context';

/**
 * FIX (critical -- middleware consistency / session-revocation bypass):
 * this module used to define its own getAuthContext() that parsed the
 * NextAuth JWT directly, duplicating -- and drifting from -- the
 * canonical one in server/auth/auth-context.ts. Concretely, it never
 * checked session revocation and never supported API-key auth, so any
 * route using requirePermission()/requireAnyPermission()/requireRole()
 * from this file (instead of withAuth() in with-auth.ts) let a revoked
 * session's JWT keep authenticating, and rejected valid API-key
 * requests outright. It also exported a function literally named
 * getAuthContext with a *different return shape* than the canonical
 * one in auth-context.ts -- a same-named, different-shape export
 * sitting one import path away from the real one is exactly the kind
 * of thing that gets silently mis-imported by a future route.
 *
 * This file now re-exports the canonical AuthContext type and builds
 * requirePermission/requireAnyPermission/requireRole on top of the
 * single getAuthContext() in server/auth/auth-context.ts, so every
 * route gets identical authentication + session-revocation behavior
 * whether it's wrapped with withAuth() or these helpers directly.
 *
 * Prefer withAuth() (server/middleware/with-auth.ts) for new routes --
 * it additionally gives rate limiting, API-version headers, and
 * request tracing/metrics for free. These helpers remain for routes
 * that haven't been migrated to withAuth() yet.
 */
export type { AuthContext };

export async function getAuthContext(req: NextRequest): Promise<AuthContext | null> {
  return getCanonicalAuthContext(req);
}

function unauthorized() {
  return NextResponse.json(
    {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    },
    { status: 401 }
  );
}

function forbidden(message: string) {
  return NextResponse.json(
    { success: false, error: { code: 'FORBIDDEN', message } },
    { status: 403 }
  );
}

export function requirePermission(permission: Permission) {
  return async (
    req: NextRequest,
    handler: (req: NextRequest, context: AuthContext) => Promise<NextResponse>
  ) => {
    const context = await getCanonicalAuthContext(req);
    if (!context) return unauthorized();
    if (!contextHasPermission(context, permission)) {
      return forbidden('Insufficient permissions');
    }
    return handler(req, context);
  };
}

export function requireAnyPermission(permissions: Permission[]) {
  return async (
    req: NextRequest,
    handler: (req: NextRequest, context: AuthContext) => Promise<NextResponse>
  ) => {
    const context = await getCanonicalAuthContext(req);
    if (!context) return unauthorized();
    if (!contextHasAnyPermission(context, permissions)) {
      return forbidden('Insufficient permissions');
    }
    return handler(req, context);
  };
}

export function requireRole(roles: string[]) {
  return async (
    req: NextRequest,
    handler: (req: NextRequest, context: AuthContext) => Promise<NextResponse>
  ) => {
    const context = await getCanonicalAuthContext(req);
    if (!context) return unauthorized();
    if (!contextHasRole(context, roles)) {
      return forbidden('Insufficient role');
    }
    return handler(req, context);
  };
}

========================================
FILE: server/middleware/tenant-isolation.ts
========================================
// server/middleware/tenant-isolation.ts

import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, AuthContext } from '@/server/auth/auth-context';

/**
 * FIX (critical -- middleware consistency / session-revocation bypass):
 * this used to call next-auth's getToken() directly and rebuild
 * tenantId/isSuperAdmin from raw JWT claims, completely independently
 * of server/auth/auth-context.ts's getAuthContext(). Concretely, any
 * route wrapped with enforceTenantIsolation() instead of withAuth():
 *   1. Never checked session revocation. A user force-logged-out from
 *      another device, or an admin-revoked session, kept working here
 *      indefinitely -- a JWT's signature stays valid even after the
 *      session record backing it (sessionService) is deleted, and only
 *      the canonical getAuthContext() checks that.
 *   2. Didn't support API-key authentication, so any route using this
 *      middleware silently rejected valid API-key requests that work
 *      everywhere else in the app.
 * Now a thin wrapper around the single canonical getAuthContext(), so
 * every route gets identical authentication behavior regardless of
 * whether it's wrapped with this, withAuth(), or the helpers in
 * permission.middleware.ts.
 */
export async function enforceTenantIsolation(
  req: NextRequest,
  handler: (
    req: NextRequest,
    context: { userId: string; tenantId: string }
  ) => Promise<NextResponse>
): Promise<NextResponse> {
  const context: AuthContext | null = await getAuthContext(req);

  if (!context) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      },
      { status: 401 }
    );
  }

  // Check if requestor is trying to access a different tenant
  const requestTenantId =
    req.headers.get('x-tenant-id') ||
    req.nextUrl.searchParams.get('tenantId');

  if (
    requestTenantId &&
    requestTenantId !== context.tenantId &&
    !context.isSuperAdmin
  ) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Cross-tenant access denied',
        },
      },
      { status: 403 }
    );
  }

  return handler(req, { userId: context.userId, tenantId: context.tenantId });
}

========================================
FILE: server/middleware/with-auth.ts
========================================
// server/middleware/with-auth.ts
// Updated to include version resolution and headers

import { NextRequest, NextResponse } from 'next/server';
import { Permission } from '@/server/permissions/roles';
import {
  AuthContext,
  getAuthContext,
  hasPermission,
  hasAnyPermission,
  hasRole,
  canPerform,
} from '@/server/auth/auth-context';
import { rateLimiter, RateLimitConfig } from '@/infrastructure/security/rate-limit';
import { errorResponse } from '@/server/utils/response.utils';
import { ResourceContext } from '@/modules/security/types/resource-permission.types';
import { threatDetectionService } from '@/modules/security/services/threat-detection.service';
import { generateCorrelationId, runWithContext, setContextField } from '@/infrastructure/observability/context';
import { withSpan } from '@/infrastructure/observability/tracer';
import { metricsRegistry } from '@/infrastructure/observability/metrics.registry';
import { monitoring } from '@/infrastructure/monitoring/logger';
import { triggerAlert, ALERT_THRESHOLDS } from '@/infrastructure/observability/alert-rules';

// Import versioning utilities
import { resolveVersion, VersionResolutionError } from '@/server/api-versioning/version-resolver';
import { buildVersionHeaders } from '@/server/api-versioning/version-headers';

type Handler<P = unknown> = (
  req: NextRequest,
  context: AuthContext,
  routeParams: P
) => Promise<NextResponse>;

type ResourceResolver<P> = (
  req: NextRequest,
  routeParams: P
) => Promise<ResourceContext> | ResourceContext;

type AttributesResolver<P> = (
  req: NextRequest,
  routeParams: P
) => Promise<Record<string, unknown>> | Record<string, unknown>;

interface WithAuthOptions<P = unknown> {
  permission?: Permission;
  anyPermission?: Permission[];
  roles?: string[];
  rateLimit?: boolean | Partial<RateLimitConfig>;
  resource?: ResourceResolver<P>;
  attributes?: AttributesResolver<P>;
}

function getIpAddress(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

/** Collapses ObjectId-shaped path segments so route labels stay low-cardinality in Prometheus. */
function routeLabel(req: NextRequest): string {
  return req.nextUrl.pathname.replace(/\/[0-9a-fA-F]{20,}(?=\/|$)/g, '/:id');
}

/**
 * Single consolidated route-protection entry point. As of Phase 9, also
 * the single choke point for request-level observability: every route
 * wrapped in withAuth gets a correlation ID, root tracing span, and
 * HTTP latency/count metrics.
 *
 * As of Slice 10c, also resolves and validates the API version, stamps
 * version headers on every response, and rejects retired versions.
 */
export function withAuth<P = unknown>(handler: Handler<P>, options: WithAuthOptions<P> = {}) {
  return async (req: NextRequest, routeParams: P): Promise<NextResponse> => {
    const correlationId = req.headers.get('x-correlation-id') || generateCorrelationId();
    const route = routeLabel(req);
    const method = req.method;
    const startedAt = Date.now();

    async function handleRequest(): Promise<NextResponse> {
      // â”€â”€â”€ Rate Limiting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (options.rateLimit !== false) {
        const rateLimitConfig = typeof options.rateLimit === 'object' ? options.rateLimit : undefined;
        const { allowed, reset } = rateLimiter.checkLimit(req, rateLimitConfig);

        if (!allowed) {
          threatDetectionService
            .recordRateLimitBlock(getIpAddress(req), req.nextUrl.pathname, 'system')
            .catch(() => undefined);
          return errorResponse('Too many requests', 'RATE_LIMITED', 429, { reset });
        }
      }

      // â”€â”€â”€ API Version Resolution â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      let versionResult;
      try {
        versionResult = resolveVersion(req);
      } catch (error) {
        if (error instanceof VersionResolutionError) {
          return errorResponse(error.message, error.code, error.statusCode);
        }
        return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
      }

      // â”€â”€â”€ Authentication â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const context = await getAuthContext(req);
      if (!context) {
        return errorResponse('Authentication required', 'UNAUTHORIZED', 401);
      }

      setContextField('tenantId', context.tenantId);
      setContextField('userId', context.userId);

      // â”€â”€â”€ Permission Checks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (options.permission && !hasPermission(context, options.permission)) {
        return errorResponse('Insufficient permissions', 'FORBIDDEN', 403);
      }

      if (options.anyPermission && !hasAnyPermission(context, options.anyPermission)) {
        return errorResponse('Insufficient permissions', 'FORBIDDEN', 403);
      }

      if (options.roles && !hasRole(context, options.roles)) {
        return errorResponse('Insufficient role', 'FORBIDDEN', 403);
      }

      // â”€â”€â”€ Resource-level Permission Checks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (options.resource) {
        const permissionKey = options.permission || options.anyPermission?.[0];
        if (!permissionKey) {
          console.error(
            '[withAuth] options.resource was provided without options.permission or options.anyPermission; skipping resource-scoped check.'
          );
        } else {
          const resource = await options.resource(req, routeParams);
          const userAttributes = options.attributes ? await options.attributes(req, routeParams) : undefined;

          const decision = await canPerform(context, permissionKey, resource, userAttributes);
          if (!decision.allowed) {
            return errorResponse(`Access denied: ${decision.reason}`, 'FORBIDDEN', 403, {
              source: decision.source,
            });
          }
        }
      }

      // â”€â”€â”€ Execute Handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const response = await handler(req, context, routeParams);

      // â”€â”€â”€ Stamp Version Headers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const versionHeaders = buildVersionHeaders(versionResult.versionString);
      for (const [key, value] of Object.entries(versionHeaders)) {
        response.headers.set(key, value);
      }

      // Add sunset/deprecation warnings
      if (versionResult.isSunset && versionResult.sunsetDate) {
        response.headers.set(
          'Warning',
          `299 - "This API version will be sunset on ${versionResult.sunsetDate.toISOString()}"`
        );
      }
      if (versionResult.isDeprecated) {
        response.headers.set('Warning', '299 - "This API version is deprecated"');
      }

      return response;
    }

    return runWithContext({ correlationId, route, method, startTime: startedAt }, () =>
      withSpan(
        `${method} ${route}`,
        async (span) => {
          span.setAttribute('http.method', method);
          span.setAttribute('http.route', route);

          const response = await handleRequest();

          span.setAttribute('http.status_code', response.status);
          response.headers.set('X-Correlation-Id', correlationId);

          const durationMs = Date.now() - startedAt;
          metricsRegistry.httpRequestDuration.observe(
            { method, route, status: String(response.status) },
            durationMs / 1000
          );
          metricsRegistry.httpRequestsTotal.inc({
            method,
            route,
            status: String(response.status),
          });
          await monitoring.trackApiLatency(route, durationMs, response.status);

          if (response.status >= 500) {
            void triggerAlert({
              metric: 'http_5xx',
              value: 1,
              threshold: 1,
              severity: 'warning',
              message: `5xx response from ${method} ${route}`,
              labels: { route, method, status: String(response.status) },
            });
          }
          if (durationMs >= ALERT_THRESHOLDS.p95LatencyMs) {
            void triggerAlert({
              metric: 'http_latency',
              value: durationMs,
              threshold: ALERT_THRESHOLDS.p95LatencyMs,
              severity: 'warning',
              message: `Slow request: ${method} ${route} took ${durationMs}ms`,
              labels: { route, method },
            });
          }

          return response;
        },
        { 'correlation.id': correlationId }
      )
    );
  };
}

/** Convenience wrapper for routes that need auth but no specific permission/role check. */
export function withSession<P = unknown>(handler: Handler<P>) {
  return withAuth(handler);
}

========================================
FILE: server/permissions/roles.ts
========================================
// server/permissions/roles.ts

export enum Role {
  SUPER_ADMIN = 'super_admin',
  ORGANIZATION_OWNER = 'organization_owner',
  FLEET_MANAGER = 'fleet_manager',
  ACCOUNTANT = 'accountant',
  DISPATCHER = 'dispatcher',
  DRIVER = 'driver',
  MECHANIC = 'mechanic',
  AUDITOR = 'auditor',
  VIEWER = 'viewer',
}

export enum Permission {
  // â”€â”€ Organization â”€â”€
  ORG_VIEW = 'org:view',
  ORG_MANAGE = 'org:manage',
  ORG_SETTINGS = 'org:settings',
  ORG_MEMBERS_MANAGE = 'org:members:manage',

  // â”€â”€ Vehicle â”€â”€
  VEHICLE_VIEW = 'vehicle:view',
  VEHICLE_CREATE = 'vehicle:create',
  VEHICLE_EDIT = 'vehicle:edit',
  VEHICLE_DELETE = 'vehicle:delete',

  // â”€â”€ Expense â”€â”€
  EXPENSE_VIEW = 'expense:view',
  EXPENSE_CREATE = 'expense:create',
  EXPENSE_EDIT = 'expense:edit',
  EXPENSE_DELETE = 'expense:delete',
  EXPENSE_APPROVE = 'expense:approve',

  // â”€â”€ Fuel â”€â”€
  FUEL_VIEW = 'fuel:view',
  FUEL_CREATE = 'fuel:create',
  FUEL_EDIT = 'fuel:edit',
  FUEL_DELETE = 'fuel:delete',

  // â”€â”€ Maintenance â”€â”€
  MAINTENANCE_VIEW = 'maintenance:view',
  MAINTENANCE_CREATE = 'maintenance:create',
  MAINTENANCE_EDIT = 'maintenance:edit',
  MAINTENANCE_DELETE = 'maintenance:delete',
  MAINTENANCE_COMPLETE = 'maintenance:complete',

  // â”€â”€ Trip â”€â”€
  TRIP_VIEW = 'trip:view',
  TRIP_CREATE = 'trip:create',
  TRIP_EDIT = 'trip:edit',
  TRIP_DELETE = 'trip:delete',

  // â”€â”€ Analytics â”€â”€
  ANALYTICS_VIEW = 'analytics:view',
  ANALYTICS_EXPORT = 'analytics:export',

  // â”€â”€ Reports â”€â”€
  REPORT_VIEW = 'report:view',
  REPORT_CREATE = 'report:create',
  REPORT_DELETE = 'report:delete',
  REPORT_SCHEDULE = 'report:schedule',

  // â”€â”€ Users â”€â”€
  USER_VIEW = 'user:view',
  USER_CREATE = 'user:create',
  USER_EDIT = 'user:edit',
  USER_DELETE = 'user:delete',

  // â”€â”€ Driver-specific â”€â”€
  DRIVER_ASSIGN = 'driver:assign',
  DRIVER_VIEW_TRIPS = 'driver:view:trips',

  // â”€â”€ Mechanic-specific â”€â”€
  MECHANIC_VIEW_MAINTENANCE = 'mechanic:view:maintenance',
  MECHANIC_UPDATE_STATUS = 'mechanic:update:status',

  // â”€â”€ FleetOps â€“ Dispatch â”€â”€
  DISPATCH_VIEW = 'dispatch:view',
  DISPATCH_CREATE = 'dispatch:create',
  DISPATCH_ASSIGN = 'dispatch:assign',
  DISPATCH_MANAGE = 'dispatch:manage',

  // â”€â”€ FleetOps â€“ Schedule / Shifts â”€â”€
  SCHEDULE_SHIFT_VIEW = 'schedule_shift:view',
  SCHEDULE_SHIFT_MANAGE = 'schedule_shift:manage',

  // â”€â”€ FleetOps â€“ Booking â”€â”€
  BOOKING_VIEW = 'booking:view',
  BOOKING_CREATE = 'booking:create',
  BOOKING_APPROVE = 'booking:approve',
  BOOKING_MANAGE = 'booking:manage',

  // â”€â”€ FleetOps â€“ Work Orders â”€â”€
  WORKORDER_VIEW = 'workorder:view',
  WORKORDER_CREATE = 'workorder:create',
  WORKORDER_ASSIGN = 'workorder:assign',
  WORKORDER_COMPLETE = 'workorder:complete',
  WORKORDER_MANAGE = 'workorder:manage',

  // â”€â”€ FleetOps â€“ Workshop â”€â”€
  WORKSHOP_VIEW = 'workshop:view',
  WORKSHOP_MANAGE = 'workshop:manage',

  // â”€â”€ FleetOps â€“ Inventory / Spare Parts â”€â”€
  INVENTORY_VIEW = 'inventory:view',
  INVENTORY_MANAGE = 'inventory:manage',
  INVENTORY_ADJUST = 'inventory:adjust',

  // â”€â”€ FleetOps â€“ Procurement â”€â”€
  PROCUREMENT_VIEW = 'procurement:view',
  PROCUREMENT_REQUEST = 'procurement:request',
  PROCUREMENT_APPROVE = 'procurement:approve',
  PROCUREMENT_MANAGE = 'procurement:manage',

  // â”€â”€ FleetOps â€“ Vendor â”€â”€
  VENDOR_VIEW = 'vendor:view',
  VENDOR_MANAGE = 'vendor:manage',

  // â”€â”€ FleetOps â€“ SLA â”€â”€
  SLA_VIEW = 'sla:view',
  SLA_MANAGE = 'sla:manage',

  // â”€â”€ FleetOps â€“ Compliance â”€â”€
  COMPLIANCE_VIEW = 'compliance:view',
  COMPLIANCE_MANAGE = 'compliance:manage',

  // â”€â”€ Security / Permission Engine (Slice 6a) â”€â”€
  CUSTOM_ROLE_VIEW = 'custom_role:view',
  CUSTOM_ROLE_MANAGE = 'custom_role:manage',
  ORG_UNIT_VIEW = 'org_unit:view',
  ORG_UNIT_MANAGE = 'org_unit:manage',
  RESOURCE_PERMISSION_VIEW = 'resource_permission:view',
  RESOURCE_PERMISSION_MANAGE = 'resource_permission:manage',
  SCOPE_ASSIGNMENT_VIEW = 'scope_assignment:view',
  SCOPE_ASSIGNMENT_MANAGE = 'scope_assignment:manage',

  // â”€â”€ Session Management & API Keys (Slice 6b) â”€â”€
  SESSION_VIEW = 'session:view',
  SESSION_MANAGE = 'session:manage',
  API_KEY_VIEW = 'api_key:view',
  API_KEY_MANAGE = 'api_key:manage',

  // â”€â”€ Immutable Audit Trail & Threat Detection (Slice 6c) â”€â”€
  AUDIT_LOG_VIEW = 'audit_log:view',
  AUDIT_LOG_VERIFY = 'audit_log:verify',
  SECURITY_EVENT_VIEW = 'security_event:view',
  ACCOUNT_LOCKOUT_MANAGE = 'account_lockout:manage',

  // â”€â”€ MFA & SSO (Slice 6d) â”€â”€
  MFA_MANAGE = 'mfa:manage',
  SSO_CONNECTION_VIEW = 'sso_connection:view',
  SSO_CONNECTION_MANAGE = 'sso_connection:manage',

  // â”€â”€ Phase 7 â€” True Multi-Tenancy / Platform Management â”€â”€
  PLATFORM_VIEW = 'platform:view',
  PLATFORM_MANAGE = 'platform:manage',
  ORG_UNIT_MOVE = 'org_unit:move',

  // â”€â”€ Jobs & Schedules (Platform Operations) â”€â”€
  JOB_VIEW = 'job:view',
  JOB_MANAGE = 'job:manage',
  SCHEDULE_VIEW = 'schedule:view',
  SCHEDULE_MANAGE = 'schedule:manage',

  // â”€â”€ Plugins / Integrations (Phase 10a) â”€â”€
  PLUGIN_VIEW = 'plugin:view',
  PLUGIN_MANAGE = 'plugin:manage',
  PLUGIN_REGISTER = 'plugin:register',

  // â”€â”€ Webhooks / Event Subscriptions (Phase 10b) â”€â”€
  WEBHOOK_VIEW = 'webhook:view',
  WEBHOOK_MANAGE = 'webhook:manage',

  // â”€â”€ OAuth Clients (Slice 10d) â”€â”€
  OAUTH_CLIENT_VIEW = 'oauth:client:view',
  OAUTH_CLIENT_MANAGE = 'oauth:client:manage',

  // â”€â”€ External Providers â”€â”€
  EXTERNAL_PROVIDER_VIEW = 'external:provider:view',
  EXTERNAL_PROVIDER_MANAGE = 'external:provider:manage',
}

/**
 * Permissions that are restricted to SUPER_ADMIN only.
 * ORGANIZATION_OWNER (and all other roles) must NOT have these.
 */
const PLATFORM_ONLY_PERMISSIONS: Permission[] = [
  Permission.PLATFORM_VIEW,
  Permission.PLATFORM_MANAGE,
  Permission.PLUGIN_REGISTER,
];

export const rolePermissions: Record<Role, Permission[]> = {
  [Role.SUPER_ADMIN]: Object.values(Permission),

  [Role.ORGANIZATION_OWNER]: Object.values(Permission).filter(
    (p) => !PLATFORM_ONLY_PERMISSIONS.includes(p)
  ),

  [Role.FLEET_MANAGER]: [
    // Organization
    Permission.ORG_VIEW,
    // Vehicles
    Permission.VEHICLE_VIEW,
    Permission.VEHICLE_CREATE,
    Permission.VEHICLE_EDIT,
    // Maintenance
    Permission.MAINTENANCE_VIEW,
    Permission.MAINTENANCE_CREATE,
    Permission.MAINTENANCE_EDIT,
    Permission.MAINTENANCE_COMPLETE,
    // Trips
    Permission.TRIP_VIEW,
    // Fuel & Expenses
    Permission.FUEL_VIEW,
    Permission.EXPENSE_VIEW,
    // Analytics & Reports
    Permission.ANALYTICS_VIEW,
    Permission.REPORT_VIEW,
    Permission.REPORT_CREATE,
    // Drivers
    Permission.DRIVER_ASSIGN,
    // FleetOps â€“ Dispatch
    Permission.DISPATCH_VIEW,
    Permission.DISPATCH_CREATE,
    Permission.DISPATCH_ASSIGN,
    Permission.DISPATCH_MANAGE,
    // FleetOps â€“ Schedule / Shifts
    Permission.SCHEDULE_SHIFT_VIEW,
    Permission.SCHEDULE_SHIFT_MANAGE,
    // FleetOps â€“ Booking
    Permission.BOOKING_VIEW,
    Permission.BOOKING_CREATE,
    Permission.BOOKING_APPROVE,
    Permission.BOOKING_MANAGE,
    // FleetOps â€“ Work Orders
    Permission.WORKORDER_VIEW,
    Permission.WORKORDER_CREATE,
    Permission.WORKORDER_ASSIGN,
    Permission.WORKORDER_COMPLETE,
    Permission.WORKORDER_MANAGE,
    // FleetOps â€“ Workshop
    Permission.WORKSHOP_VIEW,
    Permission.WORKSHOP_MANAGE,
    // FleetOps â€“ Inventory
    Permission.INVENTORY_VIEW,
    // FleetOps â€“ Procurement
    Permission.PROCUREMENT_VIEW,
    Permission.PROCUREMENT_REQUEST,
    // FleetOps â€“ Vendor
    Permission.VENDOR_VIEW,
    // FleetOps â€“ SLA & Compliance
    Permission.SLA_VIEW,
    Permission.COMPLIANCE_VIEW,
    // Org Units & Security
    Permission.ORG_UNIT_VIEW,
    Permission.ORG_UNIT_MOVE,
    Permission.CUSTOM_ROLE_VIEW,
    Permission.RESOURCE_PERMISSION_VIEW,
    Permission.SCOPE_ASSIGNMENT_VIEW,
    Permission.SECURITY_EVENT_VIEW,
    Permission.SSO_CONNECTION_VIEW,
    Permission.OAUTH_CLIENT_VIEW,
    Permission.EXTERNAL_PROVIDER_VIEW,
  ],

  [Role.ACCOUNTANT]: [
    Permission.ORG_VIEW,
    Permission.VEHICLE_VIEW,
    Permission.EXPENSE_VIEW,
    Permission.EXPENSE_CREATE,
    Permission.EXPENSE_EDIT,
    Permission.EXPENSE_APPROVE,
    Permission.FUEL_VIEW,
    Permission.FUEL_CREATE,
    Permission.ANALYTICS_VIEW,
    Permission.ANALYTICS_EXPORT,
    Permission.REPORT_VIEW,
    Permission.REPORT_CREATE,
    // FleetOps â€“ Procurement (approve only)
    Permission.PROCUREMENT_VIEW,
    Permission.PROCUREMENT_APPROVE,
    // FleetOps â€“ Vendor
    Permission.VENDOR_VIEW,
  ],

  [Role.DISPATCHER]: [
    Permission.ORG_VIEW,
    Permission.VEHICLE_VIEW,
    Permission.TRIP_VIEW,
    Permission.TRIP_CREATE,
    Permission.TRIP_EDIT,
    Permission.MAINTENANCE_VIEW,
    Permission.DRIVER_ASSIGN,
    Permission.DRIVER_VIEW_TRIPS,
    // FleetOps â€“ Dispatch
    Permission.DISPATCH_VIEW,
    Permission.DISPATCH_CREATE,
    Permission.DISPATCH_ASSIGN,
    // FleetOps â€“ Schedule / Shifts
    Permission.SCHEDULE_SHIFT_VIEW,
    // FleetOps â€“ Booking
    Permission.BOOKING_VIEW,
  ],

  [Role.DRIVER]: [
    Permission.VEHICLE_VIEW,
    Permission.FUEL_CREATE,
    Permission.TRIP_CREATE,
    Permission.MAINTENANCE_VIEW,
    Permission.DRIVER_VIEW_TRIPS,
    // FleetOps â€“ Booking
    Permission.BOOKING_CREATE,
    Permission.BOOKING_VIEW,
    // FleetOps â€“ Schedule / Shifts
    Permission.SCHEDULE_SHIFT_VIEW,
  ],

  [Role.MECHANIC]: [
    Permission.ORG_VIEW,
    Permission.VEHICLE_VIEW,
    Permission.MAINTENANCE_VIEW,
    Permission.MAINTENANCE_EDIT,
    Permission.MAINTENANCE_COMPLETE,
    Permission.MECHANIC_VIEW_MAINTENANCE,
    Permission.MECHANIC_UPDATE_STATUS,
    // FleetOps â€“ Work Orders
    Permission.WORKORDER_VIEW,
    Permission.WORKORDER_COMPLETE,
    // FleetOps â€“ Workshop
    Permission.WORKSHOP_VIEW,
    // FleetOps â€“ Inventory
    Permission.INVENTORY_VIEW,
    Permission.INVENTORY_ADJUST,
  ],

  [Role.AUDITOR]: [
    Permission.ORG_VIEW,
    Permission.VEHICLE_VIEW,
    Permission.EXPENSE_VIEW,
    Permission.FUEL_VIEW,
    Permission.TRIP_VIEW,
    Permission.ANALYTICS_VIEW,
    Permission.ANALYTICS_EXPORT,
    Permission.REPORT_VIEW,
    Permission.ORG_UNIT_VIEW,
    Permission.CUSTOM_ROLE_VIEW,
    Permission.RESOURCE_PERMISSION_VIEW,
    Permission.SCOPE_ASSIGNMENT_VIEW,
    Permission.SESSION_VIEW,
    Permission.API_KEY_VIEW,
    Permission.AUDIT_LOG_VIEW,
    Permission.AUDIT_LOG_VERIFY,
    Permission.SECURITY_EVENT_VIEW,
    Permission.SSO_CONNECTION_VIEW,
    Permission.OAUTH_CLIENT_VIEW,
    Permission.EXTERNAL_PROVIDER_VIEW,
    // FleetOps â€“ Compliance, SLA, Vendor, Procurement
    Permission.COMPLIANCE_VIEW,
    Permission.SLA_VIEW,
    Permission.VENDOR_VIEW,
    Permission.PROCUREMENT_VIEW,
  ],

  [Role.VIEWER]: [
    Permission.ORG_VIEW,
    Permission.VEHICLE_VIEW,
    Permission.EXPENSE_VIEW,
    Permission.FUEL_VIEW,
    Permission.TRIP_VIEW,
    Permission.MAINTENANCE_VIEW,
    Permission.ANALYTICS_VIEW,
    Permission.REPORT_VIEW,
  ],
};

export class PermissionService {
  hasPermission(userRoles: string[], requiredPermission: Permission): boolean {
    for (const userRole of userRoles) {
      const perms = rolePermissions[userRole as Role];
      if (perms?.includes(requiredPermission)) return true;
    }
    return false;
  }

  hasAnyPermission(userRoles: string[], requiredPermissions: Permission[]): boolean {
    return requiredPermissions.some((p) => this.hasPermission(userRoles, p));
  }

  hasAllPermissions(userRoles: string[], requiredPermissions: Permission[]): boolean {
    return requiredPermissions.every((p) => this.hasPermission(userRoles, p));
  }

  getPermissionsForRole(role: Role): Permission[] {
    return rolePermissions[role] || [];
  }

  getAllPermissions(): Permission[] {
    return Object.values(Permission);
  }
}

export const permissionService = new PermissionService();

========================================
FILE: server/utils/api-response.ts
========================================
// server/utils/api-response.ts

import { NextResponse } from 'next/server';
import { ApiResponse, PaginatedResponse } from '@/shared/types/common.types';

export class APIResponse {
  static success<T>(
    data: T,
    meta?: Record<string, unknown>
  ): NextResponse<ApiResponse<T>> {
    return NextResponse.json({
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        ...meta,
      },
    });
  }

  static created<T>(
    data: T,
    meta?: Record<string, unknown>
  ): NextResponse<ApiResponse<T>> {
    return NextResponse.json(
      {
        success: true,
        data,
        meta: {
          timestamp: new Date().toISOString(),
          ...meta,
        },
      },
      { status: 201 }
    );
  }

  static paginated<T>(
    data: T[],
    pagination: PaginatedResponse<T>['pagination']
  ): NextResponse<ApiResponse<T[]>> {
    return NextResponse.json({
      success: true,
      data,
      pagination,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  static error(
    message: string,
    code: string,
    status: number = 500,
    details?: unknown
  ): NextResponse<ApiResponse<null>> {
    return NextResponse.json(
      {
        success: false,
        error: {
          code,
          message,
          details,
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      },
      { status }
    );
  }

  static notFound(
    message: string = 'Resource not found'
  ): NextResponse<ApiResponse<null>> {
    return this.error(message, 'NOT_FOUND', 404);
  }

  static unauthorized(
    message: string = 'Unauthorized'
  ): NextResponse<ApiResponse<null>> {
    return this.error(message, 'UNAUTHORIZED', 401);
  }

  static forbidden(
    message: string = 'Forbidden'
  ): NextResponse<ApiResponse<null>> {
    return this.error(message, 'FORBIDDEN', 403);
  }

  static badRequest(
    message: string,
    details?: unknown
  ): NextResponse<ApiResponse<null>> {
    return this.error(message, 'BAD_REQUEST', 400, details);
  }
}

========================================
FILE: server/utils/context.utils.ts
========================================
// server/utils/context.utils.ts
//
// FIX (critical -- middleware consistency / session-revocation bypass):
// every helper in this file used to call next-auth's getToken() and
// rebuild tenantId/roles/isSuperAdmin from raw JWT claims directly,
// completely bypassing the canonical getAuthContext() in
// server/auth/auth-context.ts -- the same class of bug already fixed in
// server/middleware/permission.middleware.ts,
// server/middleware/tenant-isolation.ts, and
// infrastructure/security/middleware.ts. Concretely, these helpers never
// checked session revocation and never supported API-key auth.
//
// TenancyController (createOrgUnit, moveOrgUnit, getHierarchyTree) calls
// these directly. Every route that reaches those methods currently also
// goes through withAuth() first (which does check revocation), so this
// was not independently exploitable end-to-end today -- but any future
// route wired up without withAuth(), or any route added by someone who
// reasonably assumes "the app already checked auth", would inherit the
// gap silently. Now a thin wrapper over the single canonical
// getAuthContext(), so there is exactly one place session validity is
// decided.

import { NextRequest } from 'next/server';
import { getAuthContext } from '@/server/auth/auth-context';
import { UnauthorizedError } from '@/server/errors/app.errors';

async function requireContext(req: NextRequest) {
  const context = await getAuthContext(req);
  if (!context) {
    throw new UnauthorizedError('No authentication token found');
  }
  return context;
}

export async function getTenantFromRequest(req: NextRequest): Promise<string> {
  const context = await requireContext(req);
  return context.tenantId;
}

export async function getUserIdFromRequest(req: NextRequest): Promise<string> {
  const context = await requireContext(req);
  return context.userId;
}

export async function getUserRolesFromRequest(req: NextRequest): Promise<string[]> {
  const context = await requireContext(req);
  return context.roles.length > 0 ? context.roles : ['viewer'];
}

export async function isSuperAdmin(req: NextRequest): Promise<boolean> {
  const context = await getAuthContext(req);
  return context?.isSuperAdmin ?? false;
}

========================================
FILE: server/utils/error-handler.ts
========================================
// server/utils/error-handler.ts

import { NextResponse } from 'next/server';
import { APIResponse } from './api-response';
import { AppError } from '@/server/errors/app.errors';

export function handleError(
  error: unknown,
  context?: Record<string, unknown>
): NextResponse {
  if (error instanceof AppError) {
    return APIResponse.error(
      error.message,
      error.code,
      error.statusCode,
      error.details
    );
  }

  // Log unhandled errors to console in all environments
  console.error('[Unhandled Error]', error, context);

  return APIResponse.error(
    'Internal server error',
    'INTERNAL_ERROR',
    500,
    process.env.NODE_ENV === 'development'
      ? { error: String(error) }
      : undefined
  );
}

========================================
FILE: server/utils/response.utils.ts
========================================
// server/utils/response.utils.ts

import { NextResponse } from 'next/server';
import { ApiResponse, PaginatedResponse as PaginatedResponseType } from '@/shared/types/common.types';
import { applySecurityHeaders } from '@/infrastructure/security/security-headers';

export function successResponse<T>(
  data: T,
  meta?: Record<string, unknown>
): NextResponse<ApiResponse<T>> {
  const response = NextResponse.json({
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  });
  return applySecurityHeaders(response) as NextResponse<ApiResponse<T>>;
}

export function createdResponse<T>(
  data: T,
  meta?: Record<string, unknown>
): NextResponse<ApiResponse<T>> {
  const response = NextResponse.json(
    {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        ...meta,
      },
    },
    { status: 201 }
  );
  return applySecurityHeaders(response) as NextResponse<ApiResponse<T>>;
}

export function paginatedResponse<T>(
  data: T[],
  pagination: PaginatedResponseType<T>['pagination'],
  meta?: Record<string, unknown>
): NextResponse<ApiResponse<T[]>> {
  const response = NextResponse.json({
    success: true,
    data,
    pagination,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  });
  return applySecurityHeaders(response) as NextResponse<ApiResponse<T[]>>;
}

export function errorResponse(
  message: string,
  code: string,
  status: number = 500,
  details?: unknown
): NextResponse<ApiResponse<null>> {
  const response = NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        details,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    },
    { status }
  );
  return applySecurityHeaders(response) as NextResponse<ApiResponse<null>>;
}

export function noContentResponse(): NextResponse {
  return applySecurityHeaders(new NextResponse(null, { status: 204 }));
}

========================================
FILE: infrastructure/database/indexes.ts
========================================
// infrastructure/database/indexes.ts
//
// FIX: indexes.session-addendum.ts (tblusersessions, tblrefreshtokens,
// tblapikeys) and indexes.security-addendum.ts (tblorgunits,
// tblcustomroles, tblresourcepermissions, tbluser_scope_assignments) were
// written but NEVER imported/merged into the INDEXES map below, so
// ensureIndexes() never created them. Those are exactly the collections
// your dev log flagged as slow:
//   Slow MongoDB query ... collection: tblrefreshtokens
//   Slow MongoDB query ... collection: tblusersessions
//   Slow MongoDB query ... collection: tblmfafactors  (add this one too, see note below)
// Every session check, refresh-token rotation, and MFA lookup was doing a
// full collection scan. This is the direct cause of /api/auth/session,
// /api/security/sessions, and /api/security/mfa/status taking 20-60s.
//
// FIX 2 (this pass): idx_vehicle_tenant_plate was a plain unique index on
// {tenantId, license_plate} with no partial filter, so a soft-deleted
// vehicle (isDeleted: true) permanently occupied its license plate.
// Re-creating/re-adding a vehicle with a plate that belonged to an
// already-deleted record threw an unhandled E11000 duplicate key error,
// which VehicleController.handleError() couldn't translate (it only
// special-cases AppError subclasses), so it fell through to a generic
// 500 on POST /api/vehicles. Scoping the unique index to non-deleted
// documents only (partialFilterExpression) lets a plate be reused once
// the old record is gone, matching how soft delete is supposed to work
// everywhere else in this schema.

import connectToDatabase from './mongodb';
import { ensureDigitalTwinIndexes } from './indexes.digital-twin-addendum';
import { SESSION_INDEXES } from './indexes.session-addendum';
import { SECURITY_INDEXES } from './indexes.security-addendum';
import { BILLING_INDEXES } from './indexes.billing-addendum';
import { DRIVER_INDEXES } from './indexes.drivers-addendum';
import { FUEL_DRIVER_INDEXES } from './indexes.fuel-driver-addendum';
import { FUEL_ANALYTICS_INDEXES } from './indexes.fuel-analytics-addendum';
import { REPORTING_INDEXES } from './indexes.reporting-addendum';
import { RULES_INDEXES } from './indexes.rules-addendum';
import { TELEMATICS_INDEXES } from './indexes.telematics-addendum';
import { WORKFLOWS_INDEXES } from './indexes.workflows-addendum';
import { ANOMALY_INDEXES } from './indexes.anomaly-addendum'

const BASE_INDEXES = {
  // â”€â”€ Domain collections â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  tblvehicles: [
    {
      key: { tenantId: 1, license_plate: 1 },
      name: 'idx_vehicle_tenant_plate',
      unique: true,
      // Only enforce uniqueness among non-deleted vehicles.
      // Use { isDeleted: false } or { isDeleted: { $exists: false } } 
      // if your implementation of soft-delete uses false/missing instead of true.
      partialFilterExpression: { isDeleted: false },
    },
    {
      key: { tenantId: 1, status: 1, isDeleted: 1 },
      name: 'idx_vehicle_tenant_status',
    },
    {
      key: { tenantId: 1, make: 1, model: 1 },
      name: 'idx_vehicle_tenant_make_model',
    },
    {
      key: { tenantId: 1, createdAt: -1 },
      name: 'idx_vehicle_tenant_created',
    },
    {
      key: { isDeleted: 1, status: 1 },
      name: 'idx_vehicle_deleted_status',
    },
    // Phase 7 â€” org-unit scoped queries (getFilteredVehiclesInScope)
    {
      key: { tenantId: 1, orgUnitId: 1 },
      name: 'idx_vehicle_tenant_orgunit',
    },
  ],
  tblexpenses: [
    {
      key: { tenantId: 1, license_plate: 1, date: -1 },
      name: 'idx_expense_tenant_plate_date',
    },
    {
      key: { tenantId: 1, expense_type_id: 1 },
      name: 'idx_expense_tenant_type',
    },
    {
      key: { tenantId: 1, date: -1 },
      name: 'idx_expense_tenant_date',
    },
    {
      key: { tenantId: 1, amount: 1 },
      name: 'idx_expense_tenant_amount',
    },
    {
      key: { isDeleted: 1, tenantId: 1 },
      name: 'idx_expense_deleted_tenant',
    },
    // Phase 7 â€” org-unit scoped queries
    {
      key: { tenantId: 1, orgUnitId: 1 },
      name: 'idx_expense_tenant_orgunit',
    },
    {
      key: { tenantId: 1, amount: -1, date: -1 },
      name: 'idx_expense_tenant_amount_date',
      // supports top-transactions and outlier-candidate sorting
    },
  ],
  tblfuellogs: [
    {
      key: { tenantId: 1, license_plate: 1, date: -1 },
      name: 'idx_fuel_tenant_plate_date',
    },
    {
      key: { tenantId: 1, date: -1 },
      name: 'idx_fuel_tenant_date',
    },
    {
      key: { tenantId: 1, unit_id: 1 },
      name: 'idx_fuel_tenant_unit',
    },
    // Phase 7 â€” org-unit scoped queries
    {
      key: { tenantId: 1, orgUnitId: 1 },
      name: 'idx_fuel_tenant_orgunit',
    },
  ],
  tblreminders: [
    {
      key: { tenantId: 1, license_plate: 1, due_date: 1 },
      name: 'idx_reminder_tenant_plate_due',
    },
    {
      key: { tenantId: 1, status: 1, due_date: 1 },
      name: 'idx_reminder_tenant_status_due',
    },
    {
      key: { tenantId: 1, assigned_to: 1, status: 1 },
      name: 'idx_reminder_tenant_assignee_status',
    },
    {
      key: { tenantId: 1, category: 1 },
      name: 'idx_reminder_tenant_category',
    },
    {
      key: { tenantId: 1, priority: 1, status: 1 },
      name: 'idx_reminder_tenant_priority_status',
    },
  ],
  tbltrips: [
    {
      key: { tenantId: 1, license_plate: 1, date: -1 },
      name: 'idx_trip_tenant_plate_date',
    },
    {
      key: { tenantId: 1, date: -1 },
      name: 'idx_trip_tenant_date',
    },
    {
      key: { tenantId: 1, driver_id: 1 },
      name: 'idx_trip_tenant_driver',
    },
    // Phase 7 â€” org-unit scoped queries
    {
      key: { tenantId: 1, orgUnitId: 1 },
      name: 'idx_trip_tenant_orgunit',
    },
  ],
  tblmeterlogs: [
    {
      key: { tenantId: 1, license_plate: 1, date: -1 },
      name: 'idx_meter_tenant_plate_date',
    },
  ],

  // â”€â”€ FleetOps collections â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  tbldispatchjobs: [
    { key: { tenantId: 1, status: 1, priority: 1 }, name: 'idx_dispatch_tenant_status_priority' },
    { key: { tenantId: 1, assignedDriverId: 1 }, name: 'idx_dispatch_tenant_driver' },
    { key: { tenantId: 1, assignedVehicleId: 1 }, name: 'idx_dispatch_tenant_vehicle' },
    { key: { tenantId: 1, scheduledFor: 1 }, name: 'idx_dispatch_tenant_scheduled' },
  ],
  tbldrivershifts: [
    { key: { tenantId: 1, driverId: 1, startTime: 1 }, name: 'idx_shift_tenant_driver_start' },
    { key: { tenantId: 1, vehicleId: 1, startTime: 1 }, name: 'idx_shift_tenant_vehicle_start' },
    { key: { tenantId: 1, status: 1 }, name: 'idx_shift_tenant_status' },
  ],
  tblbookings: [
    { key: { tenantId: 1, vehicleId: 1, startTime: 1, endTime: 1 }, name: 'idx_booking_tenant_vehicle_window' },
    { key: { tenantId: 1, requestedBy: 1, status: 1 }, name: 'idx_booking_tenant_requester_status' },
    { key: { tenantId: 1, status: 1 }, name: 'idx_booking_tenant_status' },
  ],
  tblworkorders: [
    { key: { tenantId: 1, status: 1, priority: 1 }, name: 'idx_workorder_tenant_status_priority' },
    { key: { tenantId: 1, license_plate: 1 }, name: 'idx_workorder_tenant_plate' },
    { key: { tenantId: 1, assignedMechanicId: 1 }, name: 'idx_workorder_tenant_mechanic' },
    { key: { tenantId: 1, bayId: 1 }, name: 'idx_workorder_tenant_bay' },
  ],
  tblworkshopbays: [
    { key: { tenantId: 1, status: 1 }, name: 'idx_bay_tenant_status' },
  ],
  tblspareparts: [
    { key: { tenantId: 1, sku: 1 }, name: 'idx_sparepart_tenant_sku', unique: true },
    { key: { tenantId: 1, category: 1 }, name: 'idx_sparepart_tenant_category' },
    { key: { tenantId: 1, quantityOnHand: 1 }, name: 'idx_sparepart_tenant_qty' },
  ],
  tblstockmovements: [
    { key: { tenantId: 1, sparePartId: 1, createdAt: -1 }, name: 'idx_stockmove_tenant_part_created' },
    { key: { tenantId: 1, workOrderId: 1 }, name: 'idx_stockmove_tenant_workorder' },
  ],
  tblpurchaserequests: [
    { key: { tenantId: 1, status: 1 }, name: 'idx_pr_tenant_status' },
    { key: { tenantId: 1, requestedBy: 1 }, name: 'idx_pr_tenant_requester' },
  ],
  tblpurchaseorders: [
    { key: { tenantId: 1, status: 1 }, name: 'idx_po_tenant_status' },
    { key: { tenantId: 1, vendorId: 1 }, name: 'idx_po_tenant_vendor' },
  ],
  tblvendors: [
    { key: { tenantId: 1, name: 1 }, name: 'idx_vendor_tenant_name' },
    { key: { tenantId: 1, category: 1, status: 1 }, name: 'idx_vendor_tenant_category_status' },
  ],
  tblslapolicies: [
    { key: { tenantId: 1, entityType: 1, status: 1 }, name: 'idx_slapolicy_tenant_entitytype_status' },
  ],
  tblslatrackings: [
    { key: { tenantId: 1, entityType: 1, entityId: 1 }, name: 'idx_slatrack_tenant_entity' },
    { key: { tenantId: 1, status: 1, targetAt: 1 }, name: 'idx_slatrack_tenant_status_target' },
  ],
  tblcompliancerules: [
    { key: { tenantId: 1, appliesTo: 1, status: 1 }, name: 'idx_compliancerule_tenant_appliesto_status' },
  ],
  tblcompliancerecords: [
    { key: { tenantId: 1, entityType: 1, entityId: 1 }, name: 'idx_compliancerecord_tenant_entity' },
    { key: { tenantId: 1, status: 1, dueDate: 1 }, name: 'idx_compliancerecord_tenant_status_due' },
  ],

  // â”€â”€ Organization & auth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  tblorganizations: [
    { key: { slug: 1 }, name: 'idx_org_slug', unique: true },
    { key: { ownerId: 1 }, name: 'idx_org_owner' },
    { key: { 'members.userId': 1 }, name: 'idx_org_member_user' },
  ],
  tblnotifications: [
    {
      key: { tenantId: 1, userId: 1, sentAt: -1 },
      name: 'idx_notif_tenant_user_sent',
    },
    {
      key: { tenantId: 1, userId: 1, read: 1 },
      name: 'idx_notif_tenant_user_read',
    },
  ],

  // â”€â”€ Security â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  tblauditlog: [
    { key: { sequence: 1 }, name: 'idx_audit_sequence', unique: true },
    { key: { tenantId: 1, recordedAt: -1 }, name: 'idx_audit_tenant_recorded' },
    { key: { category: 1, severity: 1 }, name: 'idx_audit_category_severity' },
    { key: { entityType: 1, entityId: 1 }, name: 'idx_audit_entity' },
    { key: { userId: 1, recordedAt: -1 }, name: 'idx_audit_user_recorded' },
  ],
  tblloginattempts: [
    { key: { email: 1, tenantId: 1, attemptedAt: -1 }, name: 'idx_loginattempt_email_tenant_time' },
    { key: { ipAddress: 1, attemptedAt: -1 }, name: 'idx_loginattempt_ip_time' },
  ],
  tblaccountlockouts: [
    { key: { email: 1, tenantId: 1 }, name: 'idx_lockout_email_tenant', unique: true },
    { key: { lockedUntil: 1 }, name: 'idx_lockout_locked_until' },
  ],
  tblmfafactors: [
    { key: { userId: 1, status: 1 }, name: 'idx_mfa_factor_user_status' },
    { key: { tenantId: 1, userId: 1 }, name: 'idx_mfa_factor_tenant_user' },
  ],
  tblmfabackupcodes: [
    { key: { userId: 1, used: 1 }, name: 'idx_mfa_backup_user_used' },
    { key: { codeHash: 1 }, name: 'idx_mfa_backup_hash' },
  ],
  tblssoconnections: [
    { key: { organizationId: 1, status: 1 }, name: 'idx_sso_org_status' },
    { key: { domainHints: 1, status: 1 }, name: 'idx_sso_domainhints_status' },
  ],

  // â”€â”€ Phase 7 â€” Org Unit Hierarchy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  tblorgunits: [
    {
      key: { organizationId: 1, path: 1 },
      name: 'idx_orgunit_org_path_contains',
    },
  ],

  // â”€â”€ Phase 10a â€” Plugins / Integrations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  tblplugins: [
    {
      key: { pluginId: 1 },
      name: 'idx_plugin_pluginid',
      unique: true,
    },
    {
      key: { status: 1 },
      name: 'idx_plugin_status',
    },
    {
      key: { isSystemPlugin: 1 },
      name: 'idx_plugin_issystem',
    },
  ],
  tblplugininstallations: [
    {
      key: { organizationId: 1, pluginId: 1 },
      name: 'idx_plugininstall_org_pluginid',
      unique: true,
    },
    {
      key: { organizationId: 1, status: 1 },
      name: 'idx_plugininstall_org_status',
    },
    {
      key: { pluginId: 1 },
      name: 'idx_plugininstall_pluginid',
    },
  ],

  // â”€â”€ Phase 10b â€” Webhooks / Event Subscriptions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  tblwebhooksubscriptions: [
    {
      key: { organizationId: 1, status: 1, events: 1 },
      name: 'idx_webhooksub_org_status_events',
    },
    {
      key: { organizationId: 1, createdAt: -1 },
      name: 'idx_webhooksub_org_created',
    },
  ],
  tblwebhookdeliveries: [
    {
      key: { deliveryId: 1 },
      name: 'idx_webhookdelivery_deliveryid',
      unique: true,
    },
    {
      key: { organizationId: 1, subscriptionId: 1, createdAt: -1 },
      name: 'idx_webhookdelivery_org_sub_created',
    },
    {
      key: { organizationId: 1, status: 1 },
      name: 'idx_webhookdelivery_org_status',
    },
  ],

  // â”€â”€ Slice 10d â€” OAuth Clients â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  tbloauth_clients: [
    {
      key: { clientId: 1 },
      name: 'idx_oauth_client_clientid',
      unique: true,
    },
    {
      key: { organizationId: 1, status: 1 },
      name: 'idx_oauth_client_org_status',
    },
    {
      key: { organizationId: 1, createdAt: -1 },
      name: 'idx_oauth_client_org_created',
    },
    {
      key: { expiresAt: 1 },
      name: 'idx_oauth_client_expires',
    },
  ],
  tbloauth_tokens: [
    {
      key: { tokenHash: 1 },
      name: 'idx_oauth_token_hash',
      unique: true,
    },
    {
      key: { clientId: 1, status: 1, expiresAt: 1 },
      name: 'idx_oauth_token_client_status_expires',
    },
    {
      key: { userId: 1, status: 1 },
      name: 'idx_oauth_token_user_status',
    },
    {
      key: { expiresAt: 1 },
      name: 'idx_oauth_token_expires',
    },
  ],

  // â”€â”€ External Providers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  tblexternal_providers: [
    {
      key: { providerId: 1 },
      name: 'idx_extprovider_providerid',
      unique: true,
    },
    {
      key: { organizationId: 1, status: 1 },
      name: 'idx_extprovider_org_status',
    },
    {
      key: { domainHints: 1, status: 1 },
      name: 'idx_extprovider_domainhints_status',
    },
    {
      key: { organizationId: 1, type: 1 },
      name: 'idx_extprovider_org_type',
    },
  ],
} as const;

export const INDEXES = {
  ...BASE_INDEXES,
  ...SESSION_INDEXES,
  ...SECURITY_INDEXES,
  ...BILLING_INDEXES,
  ...DRIVER_INDEXES,
  ...FUEL_DRIVER_INDEXES,
  ...REPORTING_INDEXES,
  ...RULES_INDEXES,
  ...TELEMATICS_INDEXES,
  ...WORKFLOWS_INDEXES,
  ...ANOMALY_INDEXES, 
  tblorgunits: [
    ...BASE_INDEXES.tblorgunits,
    ...SECURITY_INDEXES.tblorgunits,
  ],
  tblfuellogs: [
    ...BASE_INDEXES.tblfuellogs,
    ...FUEL_DRIVER_INDEXES.tblfuellogs,
    ...FUEL_ANALYTICS_INDEXES.tblfuellogs,
  ],
} as const;

export async function ensureIndexes(): Promise<void> {
  const db = await connectToDatabase();

  for (const [collectionName, indexes] of Object.entries(INDEXES)) {
    const collection = db.collection(collectionName);
    for (const indexDef of indexes as any[]) {
      try {
        const options: any = {
          name: indexDef.name,
          unique: !!indexDef.unique,
          background: true,
        };

        if (indexDef.partialFilterExpression) {
          options.partialFilterExpression = indexDef.partialFilterExpression;
        }

        await collection.createIndex(indexDef.key, options);
      } catch (err: any) {
        // 85: IndexOptionsConflict, 86: IndexKeySpecsConflict
        if (err?.code !== 85 && err?.code !== 86) {
          console.error(`[Indexes] Failed to create ${indexDef.name}:`, err.message);
        }
      }
    }
  }

  await ensureDigitalTwinIndexes(db);
  console.log('[Indexes] All indexes ensured');
}

========================================
FILE: infrastructure/database/indexes.trip-analytics-addendum.ts
========================================
// infrastructure/database/indexes.trip-analytics-addendum.ts
//
// Supports the Phase 1 Trip KPI and exception-analytics aggregations
// (TripRepository.getTripKpis / getTripExceptions) without full
// collection scans. Merge into infrastructure/database/indexes.ts's
// INDEXES map the same way indexes.fuel-analytics-addendum.ts is
// merged, then run `npm run db:indexes`.
//
//   import { TRIP_ANALYTICS_INDEXES } from './indexes.trip-analytics-addendum';
//   export const INDEXES = {
//     ...
//     tbltrips: [
//       ...BASE_INDEXES.tbltrips,
//       ...TRIP_ANALYTICS_INDEXES.tbltrips,
//     ],
//   };

export const TRIP_ANALYTICS_INDEXES = {
  tbltrips: [
    // KPI facet + status breakdown (getTripKpis)
    { key: { tenantId: 1, status: 1, date: -1 }, name: 'idx_trip_tenant_status_date' },
    // Most-utilized vehicle / vehicle trend / duplicate detection
    { key: { tenantId: 1, license_plate: 1, date: -1 }, name: 'idx_trip_tenant_plate_date' },
    // Most-utilized driver / driver trend
    { key: { tenantId: 1, driver_id: 1, date: -1 }, name: 'idx_trip_tenant_driver_date' },
    // Duration-outlier aggregation (getTripExceptions)
    { key: { tenantId: 1, license_plate: 1, duration_minutes: 1 }, name: 'idx_trip_tenant_plate_duration' },
    // Trip type distribution / future route analytics
    { key: { tenantId: 1, trip_type: 1 }, name: 'idx_trip_tenant_type' },
    { key: { tenantId: 1, routeId: 1, date: -1 }, name: 'idx_trip_tenant_route_date' },
  ],
} as const;

========================================
FILE: infrastructure/database/indexes.fuel-analytics-addendum.ts
========================================
// infrastructure/database/indexes.fuel-analytics-addendum.ts
//
// Supports the enterprise Fuel Analytics aggregations without loading
// unnecessary records into memory. Merge into infrastructure/database/
// indexes.ts's INDEXES map the same way indexes.fuel-driver-addendum.ts
// is merged, then run `npm run db:indexes`.
//
//   import { FUEL_ANALYTICS_INDEXES } from './indexes.fuel-analytics-addendum';
//   export const INDEXES = {
//     ...
//     tblfuellogs: [
//       ...BASE_INDEXES.tblfuellogs,
//       ...FUEL_DRIVER_INDEXES.tblfuellogs,
//       ...FUEL_ANALYTICS_INDEXES.tblfuellogs,
//     ],
//   };

export const FUEL_ANALYTICS_INDEXES = {
  tblfuellogs: [
    // Fuel Spend/Top Stations (#4, #8)
    { key: { tenantId: 1, fuel_station_id: 1, date: -1 }, name: 'idx_fuel_tenant_station_date' },
    // Fuel Type Distribution (#6)
    { key: { tenantId: 1, fuel_type: 1 }, name: 'idx_fuel_tenant_type' },
    // Vehicle Fuel Activity Timeline / Fueling Frequency (#1, #7)
    { key: { tenantId: 1, license_plate: 1, date: -1 }, name: 'idx_fuel_tenant_plate_date' },
  ],
} as const;

========================================
FILE: infrastructure/database/mongodb.ts
========================================
/* eslint-disable prefer-const */
import { MongoClient, Db } from 'mongodb';
import { attachDbMonitoring } from '@/infrastructure/observability/db-monitoring';

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('MONGODB_URI environment variable is not defined');
}

// FIX: maxPoolSize/minPoolSize tuned down for serverless. On Vercel, every
// route can run in its own lambda instance; each *instance* gets its own
// pool once cached (see below), and many instances can run concurrently,
// so a large per-instance pool multiplies fast across the fleet of
// functions. Small pools per instance + reuse across warm invocations is
// the correct serverless pattern (mirrors MongoDB's own Vercel guidance).
const options = {
  maxPoolSize: 5,
  minPoolSize: 0,
  maxIdleTimeMS: 60_000,
  connectTimeoutMS: 10_000,
  // FIX: was missing â€” without this the driver falls back to its 30s
  // default, and a stuck/blocked network path can appear to hang far
  // longer (matches the ~296s hangs seen in the Vercel logs). Failing
  // fast means a real outage surfaces as a quick, clear 500 instead of a
  // multi-minute hang that also eats into the function's execution-time
  // budget.
  serverSelectionTimeoutMS: 10_000,
  socketTimeoutMS: 45_000,
  monitorCommands: true,
};

async function connectWithMonitoring(): Promise<MongoClient> {
  const client = new MongoClient(uri!, options);
  const connected = await client.connect();
  attachDbMonitoring(connected);
  return connected;
}

// FIX: this was the actual bug causing the 500s on Vercel. The client
// promise used to only be cached on `globalThis` when
// NODE_ENV === 'development' (to survive Next.js HMR reloads locally). In
// production it fell into the `else` branch and created a brand-new
// MongoClient â€” with its own fresh connection pool â€” on every cold start
// of every serverless function. With 250+ API routes, a single page load
// that fires several API calls in parallel could spin up a dozen+ lambdas
// simultaneously, each opening a new pool of connections at once. That
// connection storm is what was hitting Atlas's connection/rate limits and
// producing the long hangs -> MongoServerSelectionError -> 500s seen in
// the logs, intermittently, depending on which lambda instance was warm.
//
// The fix: cache the client promise on `globalThis` in ALL environments.
// Each serverless function instance still gets its own client (that part
// is unavoidable and fine), but it now reuses that same client/pool across
// every warm invocation of that instance instead of reconnecting every
// time â€” exactly what Vercel + MongoDB's official guidance recommends.
let clientPromise: Promise<MongoClient>;

if (!globalThis.__mongoClientPromise) {
  globalThis.__mongoClientPromise = connectWithMonitoring();
}
clientPromise = globalThis.__mongoClientPromise;

async function connectToDatabase(): Promise<Db> {
  const client = await clientPromise;
  return client.db('VehicleExpense');
}

export default connectToDatabase;
export { clientPromise };

========================================
FILE: modules/trips/api/trips.api.ts
========================================
// modules/trips/api/trips.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import { Trip, TripCreateDTO, TripUpdateDTO, TripFilters, TripStats } from '@/shared/types/trip.types';
import { PaginatedResponse } from '@/shared/types/common.types';

const BASE_URL = '/trips';

export const tripsApi = {
  async getTrips(filters: TripFilters = {}, page: number = 1, limit: number = 10): Promise<PaginatedResponse<Trip>> {
    const params: Record<string, string | number | boolean | undefined> = {
      page,
      limit,
      ...(filters.license_plate && { license_plate: filters.license_plate }),
      ...(filters.mode && { mode: filters.mode }),
      ...(filters.driver_id && { driver_id: filters.driver_id }),
      ...(filters.startDate && { startDate: filters.startDate.toISOString() }),
      ...(filters.endDate && { endDate: filters.endDate.toISOString() }),
    };
    
    return apiClient.get<PaginatedResponse<Trip>>(BASE_URL, { params });
  },

  async getTripById(id: string): Promise<Trip> {
    return apiClient.get<Trip>(BASE_URL, { params: { id } });
  },

  async getTripStats(dateRange?: { startDate?: Date; endDate?: Date }): Promise<TripStats> {
    const params: Record<string, string | undefined> = {};
    if (dateRange?.startDate) params.startDate = dateRange.startDate.toISOString();
    if (dateRange?.endDate) params.endDate = dateRange.endDate.toISOString();
    
    return apiClient.get<TripStats>(BASE_URL, { params: { action: 'stats', ...params } });
  },

  async getDailyDistance(days: number = 30): Promise<Array<{ date: string; distance: number }>> {
    return apiClient.get<Array<{ date: string; distance: number }>>(BASE_URL, {
      params: { action: 'daily', days },
    });
  },

  async createTrip(data: TripCreateDTO): Promise<Trip> {
    return apiClient.post<Trip>(BASE_URL, data);
  },

  async updateTrip(id: string, data: TripUpdateDTO): Promise<Trip> {
    return apiClient.put<Trip>(BASE_URL, data, { params: { id } });
  },

  async deleteTrip(id: string): Promise<void> {
    await apiClient.delete<void>(BASE_URL, { params: { id } });
  },
};

export default tripsApi;

========================================
FILE: modules/trips/cqrs.register.ts
========================================
// modules/trips/cqrs.register.ts

import { CommandBus } from '@/server/cqrs/command-bus';
import { QueryBus } from '@/server/cqrs/query-bus';
import { tripRepository } from './repositories/trip.repository';

import { CreateTripCommand } from './commands/create-trip.command';
import { UpdateTripCommand } from './commands/update-trip.command';
import { DeleteTripCommand } from './commands/delete-trip.command';

import { CreateTripHandler } from './commands/handlers/create-trip.handler';
import { UpdateTripHandler } from './commands/handlers/update-trip.handler';
import { DeleteTripHandler } from './commands/handlers/delete-trip.handler';

import { GetTripsQuery } from './queries/get-trips.query';
import { GetTripByIdQuery } from './queries/get-trip-by-id.query';
import { GetTripStatsQuery } from './queries/get-trip-stats.query';
import { GetDailyDistanceQuery } from './queries/get-daily-distance.query';
import { GetTripKpisQuery } from './queries/get-trip-kpis.query';
import { GetTripExceptionsQuery } from './queries/get-trip-exceptions.query';

import { GetTripsHandler } from './queries/handlers/get-trips.handler';
import { GetTripByIdHandler } from './queries/handlers/get-trip-by-id.handler';
import { GetTripStatsHandler } from './queries/handlers/get-trip-stats.handler';
import { GetDailyDistanceHandler } from './queries/handlers/get-daily-distance.handler';
import { GetTripKpisHandler } from './queries/handlers/get-trip-kpis.handler';
import { GetTripExceptionsHandler } from './queries/handlers/get-trip-exceptions.handler';

export function registerTripCqrsHandlers(
  commandBus: CommandBus,
  queryBus: QueryBus
): void {
  // Commands
  commandBus.register(CreateTripCommand, new CreateTripHandler(tripRepository));
  commandBus.register(UpdateTripCommand, new UpdateTripHandler(tripRepository));
  commandBus.register(DeleteTripCommand, new DeleteTripHandler(tripRepository));

  // Queries
  queryBus.register(GetTripsQuery, new GetTripsHandler(tripRepository));
  queryBus.register(GetTripByIdQuery, new GetTripByIdHandler(tripRepository));
  queryBus.register(GetTripStatsQuery, new GetTripStatsHandler(tripRepository));
  queryBus.register(GetDailyDistanceQuery, new GetDailyDistanceHandler(tripRepository));
  // PHASE 1 additions
  queryBus.register(GetTripKpisQuery, new GetTripKpisHandler(tripRepository));
  queryBus.register(GetTripExceptionsQuery, new GetTripExceptionsHandler(tripRepository));
}

========================================
FILE: modules/trips/controllers/trip.controller.ts
========================================
// modules/trips/controllers/trip.controller.ts

import { NextRequest } from 'next/server';
import { bootstrapCqrs } from '@/server/cqrs/cqrs.module';
import { tripCommandService } from '../services/trip-command.service';
import { tripQueryService } from '../services/trip-query.service';
import { TripFilters } from '@/shared/types/trip.types';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import {
  successResponse,
  paginatedResponse,
  errorResponse,
  createdResponse,
} from '@/server/utils/response.utils';
import { AppError, ValidationError, UnauthorizedError, ForbiddenError, NotFoundError } from '@/server/errors/app.errors';
import {
  getTenantFromRequest,
  getUserIdFromRequest,
} from '@/server/utils/context.utils';
import { getAuthContext } from '@/server/auth/auth-context';
import { tenantContextService } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import { tripRepository } from '../repositories/trip.repository';
import { exportService, fileDownloadResponse } from '@/shared/export';
import {
  TRIP_EXPORT_COLUMNS,
  TRIP_EXPORT_SHEET_NAME,
  TRIP_EXPORT_BASE_FILENAME,
} from '../export/trip-export.columns';

bootstrapCqrs();

/**
 * PHASE 1: shared filter parsing, extended with status/trip_type/routeId.
 * Previously duplicated between getTrips and exportTrips; pulled into
 * one helper so the two new fields only need to be added in one place.
 */
function parseTripFilters(searchParams: URLSearchParams): TripFilters {
  return {
    license_plate: searchParams.get('license_plate') || undefined,
    mode: (searchParams.get('mode') as any) || undefined,
    driver_id: searchParams.get('driver_id') || undefined,
    status: (searchParams.get('status') as any) || undefined,
    trip_type: (searchParams.get('trip_type') as any) || undefined,
    routeId: searchParams.get('routeId') || undefined,
    startDate: searchParams.get('start')
      ? new Date(searchParams.get('start')!)
      : undefined,
    endDate: searchParams.get('end')
      ? new Date(searchParams.get('end')!)
      : undefined,
  };
}

export class TripController {
  async getTrips(req: NextRequest) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        throw new UnauthorizedError('Authentication required');
      }

      const tenantContext = await tenantContextService.resolveContext(
        authContext.userId,
        authContext.tenantId,
        authContext.roles,
        authContext.isSuperAdmin,
        authContext.orgUnitId
      );

      const searchParams = req.nextUrl.searchParams;
      const filters = parseTripFilters(searchParams);

      // Support non-paginated path for legacy dashboard/chart usage
      const pageParam = searchParams.get('page');
      if (!pageParam) {
        const result = await tripRepository.getFilteredTripsInScope(
          filters,
          tenantContext,
          { page: 1, limit: 10000 }
        );
        return successResponse(result.data);
      }

      const { page, limit } = validatePaginationParams(
        pageParam,
        searchParams.get('limit')
      );

      const result = await tripRepository.getFilteredTripsInScope(
        filters,
        tenantContext,
        { page, limit }
      );

      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Phase 2 Enterprise Export Framework: exports the COMPLETE set of
   * trips matching the caller's current filters and authorization
   * scope, not just the page of results currently loaded in the UI
   * table. Reuses the exact same auth/tenant-context/filter parsing as
   * getTrips above.
   */
  async exportTrips(req: NextRequest) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        throw new UnauthorizedError('Authentication required');
      }

      const tenantContext = await tenantContextService.resolveContext(
        authContext.userId,
        authContext.tenantId,
        authContext.roles,
        authContext.isSuperAdmin,
        authContext.orgUnitId
      );

      const searchParams = req.nextUrl.searchParams;
      const filters = parseTripFilters(searchParams);
      const format = exportService.parseFormat(searchParams.get('format'));

      const { rows, totalMatched, truncated, exportCap } = await tripRepository.getFilteredTripsForExport(
        filters,
        tenantContext
      );

      const file = exportService.generate(
        rows,
        TRIP_EXPORT_COLUMNS,
        format,
        TRIP_EXPORT_BASE_FILENAME,
        TRIP_EXPORT_SHEET_NAME
      );

      return fileDownloadResponse(file, {
        totalMatched,
        rowsExported: rows.length,
        truncated,
        exportCap,
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * FIX (critical -- org-unit scope bypass on single-record access):
   * same bug/fix as VehicleController.loadInScopeVehicle. getTrips (the
   * list endpoint) is the only place that used to apply org-unit
   * scoping; getTrip/updateTrip/deleteTrip checked only tenantId, so a
   * user scoped to a single branch could still read/edit/delete any
   * trip in the tenant by ID. This re-resolves the caller's
   * TenantContext and verifies the target trip's orgUnitId is one the
   * caller may access, throwing NotFoundError (not ForbiddenError) on a
   * scope violation to avoid leaking the existence of out-of-scope
   * records.
   */
  private async loadInScopeTrip(req: NextRequest, id: string) {
    const authContext = await getAuthContext(req);
    if (!authContext) {
      throw new UnauthorizedError('Authentication required');
    }

    const trip = await tripQueryService.getTripById(id, authContext.tenantId);

    const tenantContext = await tenantContextService.resolveContext(
      authContext.userId,
      authContext.tenantId,
      authContext.roles,
      authContext.isSuperAdmin,
      authContext.orgUnitId
    );

    const tripOrgUnitId = (trip as any).orgUnitId as string | undefined;
    if (
      tripOrgUnitId &&
      !tenantScopeService.canAccessOrgUnit(tenantContext, tripOrgUnitId)
    ) {
      throw new NotFoundError('Trip not found');
    }

    return { authContext, trip };
  }

  async getTrip(req: NextRequest, id: string) {
    try {
      const { trip } = await this.loadInScopeTrip(req, id);
      return successResponse(trip);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createTrip(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const trip = await tripCommandService.createTrip(body, tenantId, userId);
      return createdResponse(trip);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateTrip(req: NextRequest, id: string) {
    try {
      const { authContext } = await this.loadInScopeTrip(req, id);
      const userId = authContext.userId;
      const body = await req.json();

      const trip = await tripCommandService.updateTrip(id, body, authContext.tenantId, userId);
      return successResponse(trip);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * FIX (critical -- unauthorized hard delete): same bug/fix as
   * VehicleController.deleteVehicle. `?soft=false` used to permanently
   * hardDelete() a trip under the same TRIP_DELETE permission as an
   * ordinary soft delete.
   */
  async deleteTrip(req: NextRequest, id: string) {
    try {
      const { authContext } = await this.loadInScopeTrip(req, id);
      const soft = req.nextUrl.searchParams.get('soft') !== 'false';

      if (!soft && !authContext.isSuperAdmin) {
        throw new ForbiddenError(
          'Permanently deleting a trip requires organization owner or super admin access. Use a soft delete instead.'
        );
      }

      await tripCommandService.deleteTrip(id, authContext.tenantId, authContext.userId, soft);
      return successResponse({ message: 'Trip deleted successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getTripStats(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;

      const dateRange =
        searchParams.get('startDate') && searchParams.get('endDate')
          ? {
              startDate: new Date(searchParams.get('startDate')!),
              endDate: new Date(searchParams.get('endDate')!),
            }
          : undefined;

      const stats = await tripQueryService.getTripStats(tenantId, dateRange);
      return successResponse(stats);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getDailyDistance(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const days = Number(req.nextUrl.searchParams.get('days') || '30');

      const data = await tripQueryService.getDailyDistance(tenantId, days);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** PHASE 1: executive KPI cards endpoint, backing GET /api/trips/kpis */
  async getTripKpis(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;

      const dateRange =
        searchParams.get('startDate') && searchParams.get('endDate')
          ? {
              startDate: new Date(searchParams.get('startDate')!),
              endDate: new Date(searchParams.get('endDate')!),
            }
          : undefined;

      const kpis = await tripQueryService.getTripKpis(tenantId, dateRange);
      return successResponse(kpis);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** PHASE 1: exception analytics endpoint, backing GET /api/trips/exceptions */
  async getTripExceptions(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;

      const dateRange =
        searchParams.get('startDate') && searchParams.get('endDate')
          ? {
              startDate: new Date(searchParams.get('startDate')!),
              endDate: new Date(searchParams.get('endDate')!),
            }
          : undefined;
      const zThreshold = Number(searchParams.get('zThreshold') || '2.5');
      const limit = Number(searchParams.get('limit') || '50');

      const exceptions = await tripQueryService.getTripExceptions(tenantId, dateRange, zThreshold, limit);
      return successResponse(exceptions);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[TripController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const tripController = new TripController();

========================================
FILE: modules/trips/repositories/trip.repository.ts
========================================
// modules/trips/repositories/trip.repository.ts

import { BaseRepository } from '@/server/repositories/base.repository';
import {
  Trip,
  TripFilters,
  TripStats,
  TripKpis,
  TripExceptionRow,
} from '@/shared/types/trip.types';
import {
  PaginationParams,
  PaginatedResponse,
} from '@/shared/types/common.types';
import { Filter } from 'mongodb';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import { EXPORT_ROW_CAP, ExportDataset } from '@/shared/export';

export class TripRepository extends BaseRepository<Trip> {
  protected collectionName = 'tbltrips';

  private isSuperAdminTenant(tenantId: string): boolean {
    return (
      tenantId === 'default' ||
      tenantId === 'system' ||
      tenantId === 'super_admin'
    );
  }

  /**
   * PHASE 1: single source of truth for the base tenant + soft-delete
   * match used by every analytics aggregation below. Mirrors
   * FuelRepository.buildBaseMatch / ExpenseRepository.buildBaseMatch so
   * the three modules' analytics methods read the same way.
   */
  private buildBaseMatch(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Record<string, unknown> {
    const match: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (!this.isSuperAdminTenant(tenantId)) {
      match.tenantId = tenantId;
    }
    if (dateRange?.startDate || dateRange?.endDate) {
      match.date = {};
      if (dateRange.startDate) (match.date as any).$gte = dateRange.startDate;
      if (dateRange.endDate) (match.date as any).$lte = dateRange.endDate;
    }
    return match;
  }

  async findByLicensePlate(
    licensePlate: string,
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<Trip>> {
    return this.findWithPagination(
      { license_plate: licensePlate.toUpperCase() } as Filter<Trip>,
      pagination,
      tenantId
    );
  }

  async getFilteredTrips(
    filters: TripFilters,
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<Trip>> {
    const filter: Record<string, unknown> = {};

    if (filters.license_plate) {
      filter.license_plate = {
        $regex: filters.license_plate,
        $options: 'i',
      };
    }
    if (filters.mode) filter.mode = filters.mode;
    if (filters.driver_id) filter.driver_id = filters.driver_id;
    if (filters.status) filter.status = filters.status;
    if (filters.trip_type) filter.trip_type = filters.trip_type;
    if (filters.routeId) filter.routeId = filters.routeId;
    if (filters.startDate || filters.endDate) {
      filter.date = {};
      if (filters.startDate) (filter.date as any).$gte = filters.startDate;
      if (filters.endDate) (filter.date as any).$lte = filters.endDate;
    }

    return this.findWithPagination(
      filter as Filter<Trip>,
      pagination,
      tenantId
    );
  }

  /**
   * Org/branch-scoped variant of getFilteredTrips. Mirrors
   * VehicleRepository.getFilteredVehiclesInScope: applies the same
   * filters, then narrows to the org units the caller may see via
   * tenantScopeService.buildFilter(context, 'orgUnitId'), on top of
   * (not instead of) tenant isolation.
   */
  /**
   * Single source of truth for the tenant + org-unit-scope + filter
   * query shared by getFilteredTripsInScope (paginated list) and
   * getFilteredTripsForExport (uncapped-by-pagination export).
   */
  private buildScopedQuery(filters: TripFilters, context: TenantContext): Record<string, unknown> {
    const query: Record<string, unknown> = {
      isDeleted: { $ne: true },
    };

    if (!this.isSuperAdminTenant(context.organizationId)) {
      query.tenantId = context.organizationId;
    }

    if (filters.license_plate) {
      query.license_plate = {
        $regex: filters.license_plate,
        $options: 'i',
      };
    }
    if (filters.mode) query.mode = filters.mode;
    if (filters.driver_id) query.driver_id = filters.driver_id;
    if (filters.status) query.status = filters.status;
    if (filters.trip_type) query.trip_type = filters.trip_type;
    if (filters.routeId) query.routeId = filters.routeId;
    if (filters.startDate || filters.endDate) {
      query.date = {};
      if (filters.startDate) (query.date as any).$gte = filters.startDate;
      if (filters.endDate) (query.date as any).$lte = filters.endDate;
    }

    const scopeFilter = tenantScopeService.buildFilter<Trip>(context, 'orgUnitId');
    Object.assign(query, scopeFilter);

    return query;
  }

  async getFilteredTripsInScope(
    filters: TripFilters,
    context: TenantContext,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<Trip>> {
    const collection = await this.getCollection();
    const query = this.buildScopedQuery(filters, context);

    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      collection
        .find(query as Filter<Trip>)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      collection.countDocuments(query as Filter<Trip>),
    ]);

    return {
      data: data as Trip[],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Export variant of getFilteredTripsInScope: same filters and same
   * tenant/org-unit scope, but returns up to `cap` matching records
   * (default EXPORT_ROW_CAP) ignoring UI pagination, plus the true
   * total match count so the caller can detect truncation.
   */
  async getFilteredTripsForExport(
    filters: TripFilters,
    context: TenantContext,
    cap: number = EXPORT_ROW_CAP
  ): Promise<ExportDataset<Trip>> {
    const collection = await this.getCollection();
    const query = this.buildScopedQuery(filters, context);

    const [rows, totalMatched] = await Promise.all([
      collection
        .find(query as Filter<Trip>)
        .sort({ createdAt: -1 })
        .limit(cap)
        .toArray(),
      collection.countDocuments(query as Filter<Trip>),
    ]);

    return {
      rows: rows as Trip[],
      totalMatched,
      truncated: totalMatched > rows.length,
      exportCap: cap,
    };
  }

  async getTripStats(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<TripStats> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);

    const filter: Record<string, unknown> = {
      isDeleted: { $ne: true },
    };
    if (!isSuperAdmin) {
      filter.tenantId = tenantId;
    }

    if (dateRange?.startDate || dateRange?.endDate) {
      filter.date = {};
      if (dateRange.startDate) (filter.date as any).$gte = dateRange.startDate;
      if (dateRange.endDate) (filter.date as any).$lte = dateRange.endDate;
    }

    const pipeline = [
      { $match: filter },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                totalDistance: { $sum: '$distance_calculated' },
                totalTrips: { $sum: 1 },
              },
            },
          ],
          byVehicle: [
            {
              $group: {
                _id: '$license_plate',
                distance: { $sum: '$distance_calculated' },
              },
            },
            { $sort: { distance: -1 } },
          ],
          byDriver: [
            {
              $group: {
                _id: '$driver_id',
                distance: { $sum: '$distance_calculated' },
              },
            },
            { $sort: { distance: -1 } },
          ],
        },
      },
    ];

    const result = await collection.aggregate(pipeline).toArray();
    const data = result[0] || { totals: [], byVehicle: [], byDriver: [] };
    const totals = data.totals[0] || { totalDistance: 0, totalTrips: 0 };

    return {
      totalDistance: totals.totalDistance,
      totalTrips: totals.totalTrips,
      averageDistance:
        totals.totalTrips > 0
          ? totals.totalDistance / totals.totalTrips
          : 0,
      byVehicle: Object.fromEntries(
        (data.byVehicle || []).map((v: any) => [v._id, v.distance])
      ),
      byDriver: Object.fromEntries(
        (data.byDriver || []).map((d: any) => [
          d._id || 'unassigned',
          d.distance,
        ])
      ),
    };
  }

  async getDailyDistance(
    tenantId: string,
    days: number = 30
  ): Promise<Array<{ date: string; distance: number }>> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const matchStage: Record<string, unknown> = {
      isDeleted: { $ne: true },
      date: { $gte: startDate },
    };
    if (!isSuperAdmin) {
      matchStage.tenantId = tenantId;
    }

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$date' },
          },
          distance: { $sum: '$distance_calculated' },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map((r) => ({ date: r._id, distance: r.distance }));
  }

  /**
   * Per-vehicle distance total within a date window, keyed by
   * license_plate. Added specifically so FuelQueryService can fall back
   * to trip-derived distance when a vehicle's fuel logs have sparse/zero
   * odometer readings -- odometer-derived distance and trip-derived
   * distance are two independent measurements of the same physical
   * quantity, and trips are the more reliable of the two in this dataset
   * since CreateTripHandler already rejects any trip with
   * distance_calculated <= 0 at write time, while fuel-log odometer has
   * no equivalent guard.
   */
  async getDistanceByVehicle(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Record<string, number>> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);

    const match: Record<string, unknown> = {
      isDeleted: { $ne: true },
      date: { $gte: startDate, $lte: endDate },
    };
    if (!isSuperAdmin) {
      match.tenantId = tenantId;
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: '$license_plate',
          distance: { $sum: '$distance_calculated' },
        },
      },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return Object.fromEntries(results.map((r) => [r._id as string, r.distance as number]));
  }

  /**
   * PHASE 1: Executive KPI aggregation backing GetTripKpisQuery.
   * Structured as one $facet pass (current period) plus a lightweight
   * second pass (previous period, totals only) for trend deltas --
   * same two-pass shape as FuelRepository.getFuelKpis, but trip KPIs
   * don't need FuelKpis' per-vehicle odometer-fallback complexity since
   * distance_calculated is already normalized at write time.
   */
  async getTripKpis(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<TripKpis> {
    const collection = await this.getCollection();
    const now = new Date();
    const rangeEnd = dateRange?.endDate ?? now;
    const rangeStart = dateRange?.startDate ?? new Date(rangeEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
    const periodMs = rangeEnd.getTime() - rangeStart.getTime();
    const prevRangeEnd = new Date(rangeStart.getTime() - 1);
    const prevRangeStart = new Date(prevRangeEnd.getTime() - periodMs);

    const currentMatch = this.buildBaseMatch(tenantId, { startDate: rangeStart, endDate: rangeEnd });
    const prevMatch = this.buildBaseMatch(tenantId, { startDate: prevRangeStart, endDate: prevRangeEnd });

    const pipeline = [
      { $match: currentMatch },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                totalTrips: { $sum: 1 },
                totalDistance: { $sum: '$distance_calculated' },
                totalDurationMinutes: { $sum: { $ifNull: ['$duration_minutes', 0] } },
                completedTrips: {
                  $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
                },
                ongoingTrips: {
                  $sum: { $cond: [{ $eq: ['$status', 'ongoing'] }, 1, 0] },
                },
                cancelledTrips: {
                  $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
                },
              },
            },
          ],
          activeVehicles: [{ $group: { _id: '$license_plate' } }, { $count: 'count' }],
          activeDrivers: [
            { $match: { driver_id: { $exists: true, $ne: null } } },
            { $group: { _id: '$driver_id' } },
            { $count: 'count' },
          ],
          topVehicle: [
            { $group: { _id: '$license_plate', trips: { $sum: 1 } } },
            { $sort: { trips: -1 } },
            { $limit: 1 },
          ],
          topDriver: [
            { $match: { driver_id: { $exists: true, $ne: null } } },
            { $group: { _id: '$driver_id', trips: { $sum: 1 } } },
            { $sort: { trips: -1 } },
            { $limit: 1 },
          ],
          longest: [
            { $sort: { distance_calculated: -1 } },
            { $limit: 1 },
            { $project: { _id: { $toString: '$_id' }, license_plate: 1, distance: '$distance_calculated' } },
          ],
          shortest: [
            { $match: { distance_calculated: { $gt: 0 } } },
            { $sort: { distance_calculated: 1 } },
            { $limit: 1 },
            { $project: { _id: { $toString: '$_id' }, license_plate: 1, distance: '$distance_calculated' } },
          ],
        },
      },
    ];

    const prevPipeline = [
      { $match: prevMatch },
      {
        $group: {
          _id: null,
          totalTrips: { $sum: 1 },
          totalDistance: { $sum: '$distance_calculated' },
        },
      },
    ];

    const [result, prevResult] = await Promise.all([
      collection.aggregate(pipeline).toArray(),
      collection.aggregate(prevPipeline).toArray(),
    ]);

    const data = result[0] || {};
    const totals = data.totals?.[0] || {
      totalTrips: 0,
      totalDistance: 0,
      totalDurationMinutes: 0,
      completedTrips: 0,
      ongoingTrips: 0,
      cancelledTrips: 0,
    };
    const prevTotals = prevResult[0] || { totalTrips: 0, totalDistance: 0 };

    const pctChange = (current: number, previous: number): number => {
      if (!previous) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 1000) / 10;
    };

    return {
      totalTrips: totals.totalTrips || 0,
      completedTrips: totals.completedTrips || 0,
      ongoingTrips: totals.ongoingTrips || 0,
      cancelledTrips: totals.cancelledTrips || 0,
      totalDistance: totals.totalDistance || 0,
      averageDistance: totals.totalTrips ? totals.totalDistance / totals.totalTrips : 0,
      totalDrivingHours: (totals.totalDurationMinutes || 0) / 60,
      averageDurationMinutes: totals.totalTrips
        ? (totals.totalDurationMinutes || 0) / totals.totalTrips
        : 0,
      activeVehicles: data.activeVehicles?.[0]?.count || 0,
      activeDrivers: data.activeDrivers?.[0]?.count || 0,
      mostUtilizedVehicle: data.topVehicle?.[0]
        ? { license_plate: data.topVehicle[0]._id, trips: data.topVehicle[0].trips }
        : null,
      mostUtilizedDriver: data.topDriver?.[0]
        ? { driver_id: data.topDriver[0]._id, trips: data.topDriver[0].trips }
        : null,
      longestTrip: data.longest?.[0] || null,
      shortestTrip: data.shortest?.[0] || null,
      distanceTrend: pctChange(totals.totalDistance || 0, prevTotals.totalDistance || 0),
      tripCountTrend: pctChange(totals.totalTrips || 0, prevTotals.totalTrips || 0),
    };
  }

  /**
   * PHASE 1: Exception analytics, equivalent in spirit to
   * ExpenseRepository.getExpenseOutliers but for trip-shaped data
   * quality problems. Uses population mean/stddev per vehicle for
   * duration outliers (same z-score technique as expense outliers),
   * plus deterministic rule checks for odometer inconsistency,
   * duplicate trips, and missing driver -- these last three are
   * data-integrity issues, not statistical outliers, so a fixed rule
   * is more honest than a z-score for them.
   */
  async getTripExceptions(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    zThreshold: number = 2.5,
    limit: number = 50
  ): Promise<TripExceptionRow[]> {
    const collection = await this.getCollection();
    const match = this.buildBaseMatch(tenantId, dateRange);
    const exceptions: TripExceptionRow[] = [];

    // 1. Duration outliers per vehicle (z-score), mirrors getExpenseOutliers.
    const durationPipeline = [
      { $match: { ...match, duration_minutes: { $exists: true, $gt: 0 } } },
      {
        $group: {
          _id: '$license_plate',
          mean: { $avg: '$duration_minutes' },
          stdDev: { $stdDevPop: '$duration_minutes' },
          docs: {
            $push: {
              _id: '$_id',
              license_plate: '$license_plate',
              date: '$date',
              duration_minutes: '$duration_minutes',
              distance_calculated: '$distance_calculated',
            },
          },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gte: 3 }, stdDev: { $gt: 0 } } },
      { $unwind: '$docs' },
      {
        $addFields: {
          zScore: {
            $divide: [{ $subtract: ['$docs.duration_minutes', '$mean'] }, '$stdDev'],
          },
        },
      },
      { $match: { $expr: { $gte: [{ $abs: '$zScore' }, zThreshold] } } },
      { $sort: { zScore: -1 } },
      { $limit: limit },
    ];
    const durationResults = await collection.aggregate(durationPipeline).toArray();
    for (const r of durationResults) {
      const long = r.zScore > 0;
      exceptions.push({
        _id: String(r.docs._id),
        license_plate: r.docs.license_plate,
        date: r.docs.date,
        type: long ? 'unusually_long_duration' : 'unusually_short_duration',
        detail: `${r.docs.duration_minutes.toFixed(0)} min vs. this vehicle's average of ${r.mean.toFixed(0)} min (z=${r.zScore.toFixed(2)})`,
        duration_minutes: r.docs.duration_minutes,
        distance: r.docs.distance_calculated,
      });
    }

    // 2. Odometer inconsistency: end < start already rejected at write
    // time, but a trip whose start_odometer is LOWER than the vehicle's
    // previously recorded end_odometer indicates a data-entry error
    // (odometer went backwards between trips).
    const odometerPipeline = [
      { $match: { ...match, mode: 'odometer', start_odometer: { $exists: true }, end_odometer: { $exists: true } } },
      { $sort: { license_plate: 1, date: 1 } },
      {
        $group: {
          _id: '$license_plate',
          trips: {
            $push: {
              _id: '$_id',
              date: '$date',
              start_odometer: '$start_odometer',
              end_odometer: '$end_odometer',
            },
          },
        },
      },
      { $limit: 500 }, // vehicle-count safety cap; per-vehicle trip count checked in app code below
    ];
    const odometerGroups = await collection.aggregate(odometerPipeline).toArray();
    for (const group of odometerGroups) {
      const trips = group.trips as Array<{ _id: any; date: Date; start_odometer: number; end_odometer: number }>;
      for (let i = 1; i < trips.length; i++) {
        const prev = trips[i - 1];
        const curr = trips[i];
        if (curr.start_odometer < prev.end_odometer) {
          exceptions.push({
            _id: String(curr._id),
            license_plate: group._id,
            date: curr.date,
            type: 'odometer_inconsistent',
            detail: `Start odometer (${curr.start_odometer}) is lower than the previous trip's end odometer (${prev.end_odometer}) for this vehicle`,
          });
          if (exceptions.filter((e) => e.type === 'odometer_inconsistent').length >= limit) break;
        }
      }
    }

    // 3. Possible duplicates: same vehicle + same date + same distance,
    // more than one row -- a common bulk-import artifact.
    const duplicatePipeline = [
      { $match: match },
      {
        $group: {
          _id: {
            license_plate: '$license_plate',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
            distance: '$distance_calculated',
          },
          docs: { $push: { _id: '$_id', date: '$date' } },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $limit: limit },
    ];
    const duplicateGroups = await collection.aggregate(duplicatePipeline).toArray();
    for (const group of duplicateGroups) {
      for (const doc of group.docs.slice(1)) {
        exceptions.push({
          _id: String(doc._id),
          license_plate: group._id.license_plate,
          date: doc.date,
          type: 'possible_duplicate',
          detail: `Matches another trip for ${group._id.license_plate} on ${group._id.date} with the same distance (${group._id.distance})`,
        });
      }
    }

    // 4. Missing driver: informational, capped low so it doesn't drown
    // out the other exception types on fleets that don't track drivers.
    const missingDriverPipeline = [
      { $match: { ...match, $or: [{ driver_id: { $exists: false } }, { driver_id: null }, { driver_id: '' }] } },
      { $sort: { date: -1 } },
      { $limit: Math.min(limit, 20) },
    ];
    const missingDriverDocs = await collection.aggregate(missingDriverPipeline).toArray();
    for (const doc of missingDriverDocs) {
      exceptions.push({
        _id: String(doc._id),
        license_plate: doc.license_plate,
        date: doc.date,
        type: 'missing_driver',
        detail: 'No driver assigned to this trip',
        distance: doc.distance_calculated,
      });
    }

    return exceptions.slice(0, limit * 4);
  }
}

export const tripRepository = new TripRepository();

========================================
FILE: modules/trips/services/trip-command.service.ts
========================================
// modules/trips/services/trip-command.service.ts

import { commandBus } from '@/server/cqrs/command-bus';
import { CreateTripCommand } from '../commands/create-trip.command';
import { UpdateTripCommand } from '../commands/update-trip.command';
import { DeleteTripCommand } from '../commands/delete-trip.command';
import { Trip } from '@/shared/types/trip.types';

export class TripCommandService {
  async createTrip(
    rawData: unknown,
    tenantId: string,
    userId?: string
  ): Promise<Trip> {
    return commandBus.execute<Trip>(
      new CreateTripCommand(rawData, tenantId, userId)
    );
  }

  async updateTrip(
    tripId: string,
    rawData: unknown,
    tenantId: string,
    userId?: string
  ): Promise<Trip> {
    return commandBus.execute<Trip>(
      new UpdateTripCommand(tripId, rawData, tenantId, userId)
    );
  }

  async deleteTrip(
    tripId: string,
    tenantId: string,
    userId?: string,
    soft: boolean = false
  ): Promise<void> {
    return commandBus.execute<void>(
      new DeleteTripCommand(tripId, tenantId, userId, soft)
    );
  }
}

export const tripCommandService = new TripCommandService();

========================================
FILE: modules/trips/services/trip-query.service.ts
========================================
// modules/trips/services/trip-query.service.ts

import { queryBus } from '@/server/cqrs/query-bus';
import { GetTripsQuery } from '../queries/get-trips.query';
import { GetTripByIdQuery } from '../queries/get-trip-by-id.query';
import { GetTripStatsQuery } from '../queries/get-trip-stats.query';
import { GetDailyDistanceQuery } from '../queries/get-daily-distance.query';
import { GetTripKpisQuery } from '../queries/get-trip-kpis.query';
import { GetTripExceptionsQuery } from '../queries/get-trip-exceptions.query';
import {
  Trip,
  TripFilters,
  TripStats,
  TripKpis,
  TripExceptionRow,
} from '@/shared/types/trip.types';
import { PaginatedResponse, PaginationParams } from '@/shared/types/common.types';

export class TripQueryService {
  async getFilteredTrips(
    filters: TripFilters,
    pagination: PaginationParams,
    tenantId: string
  ): Promise<PaginatedResponse<Trip>> {
    return queryBus.execute<PaginatedResponse<Trip>>(
      new GetTripsQuery(filters, pagination, tenantId)
    );
  }

  async getTripById(tripId: string, tenantId: string): Promise<Trip> {
    return queryBus.execute<Trip>(new GetTripByIdQuery(tripId, tenantId));
  }

  async getTripStats(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<TripStats> {
    return queryBus.execute<TripStats>(new GetTripStatsQuery(tenantId, dateRange));
  }

  async getDailyDistance(
    tenantId: string,
    days: number = 30
  ): Promise<Array<{ date: string; distance: number }>> {
    return queryBus.execute<Array<{ date: string; distance: number }>>(
      new GetDailyDistanceQuery(tenantId, days)
    );
  }

  /** PHASE 1 */
  async getTripKpis(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<TripKpis> {
    return queryBus.execute<TripKpis>(new GetTripKpisQuery(tenantId, dateRange));
  }

  /** PHASE 1 */
  async getTripExceptions(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    zThreshold: number = 2.5,
    limit: number = 50
  ): Promise<TripExceptionRow[]> {
    return queryBus.execute<TripExceptionRow[]>(
      new GetTripExceptionsQuery(tenantId, dateRange, zThreshold, limit)
    );
  }
}

export const tripQueryService = new TripQueryService();

========================================
FILE: modules/trips/export/trip-export.columns.ts
========================================
// modules/trips/export/trip-export.columns.ts
//
// Column definitions for the Trips export. Mirrors the fields already
// used by the pre-Phase-2 client-side exportTripsToCSV/exportTripsToExcel
// in frontend/modules/trips/utils/index.ts.
//
// Deliberately uses plain field access rather than the frontend's
// formatDistance/formatDate helpers (those live under frontend/shared
// and format for on-screen display, e.g. locale-aware date strings) --
// exports use raw ISO dates and numeric values so the file stays
// machine-parseable (re-importable, chartable in Excel) rather than
// display-formatted text.
//
// PHASE 1: appended status/timing/type columns after the original set
// rather than interleaving them, so a spreadsheet someone already built
// against the old column order doesn't have its column indexes shift.

import type { ExportColumn } from '@/shared/export';
import type { Trip } from '@/shared/types/trip.types';

function tripModeLabel(mode: Trip['mode']): string {
  return mode === 'distance' ? 'Direct distance' : 'Odometer reading';
}

export const TRIP_EXPORT_COLUMNS: ExportColumn<Trip>[] = [
  { header: 'Date', accessor: (t) => new Date(t.date).toISOString().slice(0, 10) },
  { header: 'License Plate', accessor: (t) => t.license_plate },
  { header: 'Mode', accessor: (t) => tripModeLabel(t.mode) },
  { header: 'Distance (km)', accessor: (t) => t.distance_calculated },
  { header: 'Start Odometer', accessor: (t) => t.start_odometer ?? '' },
  { header: 'End Odometer', accessor: (t) => t.end_odometer ?? '' },
  { header: 'Start Location', accessor: (t) => t.start_location ?? '' },
  { header: 'End Location', accessor: (t) => t.end_location ?? '' },
  { header: 'Driver', accessor: (t) => t.driver_id ?? '' },
  { header: 'Notes', accessor: (t) => t.notes ?? '' },
  // --- PHASE 1 additions ---
  { header: 'Status', accessor: (t) => t.status ?? '' },
  { header: 'Trip Type', accessor: (t) => t.trip_type ?? '' },
  { header: 'Start Time', accessor: (t) => (t.start_time ? new Date(t.start_time).toISOString() : '') },
  { header: 'End Time', accessor: (t) => (t.end_time ? new Date(t.end_time).toISOString() : '') },
  { header: 'Duration (min)', accessor: (t) => t.duration_minutes ?? '' },
  { header: 'Avg Speed (km/h)', accessor: (t) => (t.average_speed != null ? Number(t.average_speed.toFixed(1)) : '') },
  { header: 'Route', accessor: (t) => t.routeId ?? '' },
];

export const TRIP_EXPORT_SHEET_NAME = 'Trips';
export const TRIP_EXPORT_BASE_FILENAME = 'trips-export';

========================================
FILE: modules/trips/commands/create-trip.command.ts
========================================
// modules/trips/commands/create-trip.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export class CreateTripCommand extends BaseCommand {
  static readonly commandName = 'CreateTripCommand';

  constructor(
    public readonly rawData: unknown,
    public readonly tenantId: string,
    public readonly userId?: string
  ) {
    super(CreateTripCommand.commandName);
  }
}

========================================
FILE: modules/trips/commands/update-trip.command.ts
========================================
// modules/trips/commands/update-trip.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export class UpdateTripCommand extends BaseCommand {
  static readonly commandName = 'UpdateTripCommand';

  constructor(
    public readonly tripId: string,
    public readonly rawData: unknown,
    public readonly tenantId: string,
    public readonly userId?: string
  ) {
    super(UpdateTripCommand.commandName);
  }
}

========================================
FILE: modules/trips/commands/delete-trip.command.ts
========================================
// modules/trips/commands/delete-trip.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export class DeleteTripCommand extends BaseCommand {
  static readonly commandName = 'DeleteTripCommand';

  constructor(
    public readonly tripId: string,
    public readonly tenantId: string,
    public readonly userId?: string,
    public readonly soft: boolean = false
  ) {
    super(DeleteTripCommand.commandName);
  }
}

========================================
FILE: modules/trips/commands/handlers/create-trip.handler.ts
========================================
// modules/trips/commands/handlers/create-trip.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { CreateTripCommand } from '../create-trip.command';
import { TripRepository } from '@/modules/trips/repositories/trip.repository';
import { tripCreateSchema } from '@/shared/validations/trip.schema';
import { Trip } from '@/shared/types/trip.types';
import { ValidationError, AppError } from '@/server/errors/app.errors';
import { validateWithZod } from '@/shared/utils/validation.utils';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { TripCreatedEvent } from '@/modules/trips/events/TripCreatedEvent';

function calculateDistance(data: {
  mode: string;
  trip_distance?: number | null;
  start_odometer?: number | null;
  end_odometer?: number | null;
}): number {
  if (data.mode === 'distance') {
    return Number(data.trip_distance) || 0;
  }
  if (data.mode === 'odometer') {
    const start = Number(data.start_odometer) || 0;
    const end = Number(data.end_odometer) || 0;
    return Math.max(0, end - start);
  }
  return 0;
}

/**
 * PHASE 1: duration_minutes and average_speed are always derived
 * server-side, never trusted from the client -- same principle as
 * distance_calculated above. Returns undefined for either when the
 * inputs needed to compute them aren't present, rather than 0, so the
 * KPI aggregation ($ifNull fallbacks in TripRepository.getTripKpis)
 * can distinguish "no timing data" from "zero-duration trip".
 */
function calculateTiming(
  startTime: Date | undefined,
  endTime: Date | undefined,
  distanceCalculated: number
): { duration_minutes?: number; average_speed?: number } {
  if (!startTime || !endTime) return {};
  const durationMs = endTime.getTime() - startTime.getTime();
  if (durationMs <= 0) return {};
  const duration_minutes = durationMs / 60000;
  const hours = duration_minutes / 60;
  const average_speed = hours > 0 ? distanceCalculated / hours : undefined;
  return { duration_minutes, average_speed };
}

export class CreateTripHandler implements ICommandHandler<CreateTripCommand, Trip> {
  constructor(private readonly tripRepo: TripRepository) {}

  async execute(command: CreateTripCommand): Promise<Trip> {
    const raw = command.rawData as Record<string, unknown>;

    const clean: Record<string, unknown> = {
      license_plate: raw.license_plate,
      mode: raw.mode,
      date: raw.date,
      unit_id: raw.unit_id,
      notes: raw.notes,
      start_location: raw.start_location,
      end_location: raw.end_location,
      driver_id: raw.driver_id,
      status: raw.status,
      start_time: raw.start_time,
      end_time: raw.end_time,
      trip_type: raw.trip_type,
      routeId: raw.routeId,
      trip_distance:
        raw.trip_distance !== undefined && raw.trip_distance !== ''
          ? Number(raw.trip_distance)
          : undefined,
      start_odometer:
        raw.start_odometer !== undefined && raw.start_odometer !== ''
          ? Number(raw.start_odometer)
          : undefined,
      end_odometer:
        raw.end_odometer !== undefined && raw.end_odometer !== ''
          ? Number(raw.end_odometer)
          : undefined,
    };

    const payload = Object.fromEntries(
      Object.entries(clean).filter(([, v]) => v !== undefined && v !== null && v !== '')
    );

    const result = await validateWithZod(tripCreateSchema, payload);
    if (!result.success || !result.data) {
      const fieldErrors = result.errors || {};
      const messages = Object.entries(fieldErrors)
        .map(([field, errs]) => `${field}: ${errs.join(', ')}`)
        .join('; ');
      throw new ValidationError(messages || 'Validation failed', fieldErrors);
    }

    const validated = result.data;
    const db = await connectToDatabase();

    const vehicle = await db.collection('tblvehicles').findOne({
      license_plate: String(validated.license_plate).toUpperCase(),
      isDeleted: { $ne: true },
    });
    if (!vehicle) {
      throw new AppError(
        `Vehicle "${validated.license_plate}" not found`,
        'VEHICLE_NOT_FOUND',
        400
      );
    }

    const unit = await db.collection('tblunits').findOne({
      unit_id: validated.unit_id,
      type: 'distance',
    });
    if (!unit) {
      throw new AppError(
        `Unit "${validated.unit_id}" not found or is not a distance unit`,
        'UNIT_NOT_FOUND',
        400
      );
    }

    /**
     * PHASE 1 (validation gap closed): driver_id was previously
     * accepted and stored with no existence check at all -- a typo'd
     * or stale driver ID would silently save and only surface later as
     * a broken join in analytics/drill-down. Mirrors the
     * vehicle/unit existence checks immediately above.
     */
    if (validated.driver_id) {
      const driver = await db.collection('tbldrivers').findOne({
        _id: validated.driver_id as any,
        isDeleted: { $ne: true },
      });
      if (!driver) {
        throw new AppError(
          `Driver "${validated.driver_id}" not found`,
          'DRIVER_NOT_FOUND',
          400
        );
      }
    }

    const distance_calculated = calculateDistance({
      mode: validated.mode,
      trip_distance: validated.trip_distance ?? null,
      start_odometer: validated.start_odometer ?? null,
      end_odometer: validated.end_odometer ?? null,
    });

    if (distance_calculated <= 0) {
      throw new ValidationError('Calculated distance must be greater than 0');
    }

    const start_time = validated.start_time ? new Date(validated.start_time as unknown as string) : undefined;
    const end_time = validated.end_time ? new Date(validated.end_time as unknown as string) : undefined;
    const timing = calculateTiming(start_time, end_time, distance_calculated);

    /**
     * PHASE 1: duplicate-trip guard at write time, in addition to the
     * read-side exception report (TripRepository.getTripExceptions).
     * Catching this on create is strictly better than only reporting it
     * after the fact, but it's a warning-level AppError (409) rather
     * than a hard block, since legitimate back-to-back short trips with
     * identical distance do happen (e.g. a fixed shuttle route run
     * twice in a day) -- callers can resubmit with `allowDuplicate`.
     */
    if (!raw.allowDuplicate) {
      const dateOnly = new Date(validated.date as unknown as Date);
      const dayStart = new Date(dateOnly);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dateOnly);
      dayEnd.setHours(23, 59, 59, 999);

      const possibleDuplicate = await db.collection('tbltrips').findOne({
        tenantId: command.tenantId,
        isDeleted: { $ne: true },
        license_plate: String(validated.license_plate).toUpperCase(),
        distance_calculated,
        date: { $gte: dayStart, $lte: dayEnd },
      });
      if (possibleDuplicate) {
        throw new AppError(
          `A trip for ${validated.license_plate} on this date with the same distance (${distance_calculated}) already exists. Resubmit with allowDuplicate to override.`,
          'POSSIBLE_DUPLICATE_TRIP',
          409
        );
      }
    }

    const tripData: Omit<Trip, '_id' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt'> = {
      tenantId: command.tenantId,
      license_plate: String(validated.license_plate).toUpperCase(),
      mode: validated.mode,
      date: new Date(validated.date as unknown as string),
      unit_id: String(validated.unit_id),
      distance_calculated,
      ...((vehicle as { orgUnitId?: string }).orgUnitId && {
        orgUnitId: (vehicle as { orgUnitId?: string }).orgUnitId,
      }),
      ...(validated.trip_distance != null && { trip_distance: Number(validated.trip_distance) }),
      ...(validated.start_odometer != null && { start_odometer: Number(validated.start_odometer) }),
      ...(validated.end_odometer != null && { end_odometer: Number(validated.end_odometer) }),
      ...(validated.notes && { notes: String(validated.notes) }),
      ...(validated.start_location && { start_location: String(validated.start_location) }),
      ...(validated.end_location && { end_location: String(validated.end_location) }),
      ...(validated.driver_id && { driver_id: String(validated.driver_id) }),
      // --- PHASE 1 additions ---
      status: (validated.status as Trip['status']) || 'completed',
      ...(start_time && { start_time }),
      ...(end_time && { end_time }),
      ...(timing.duration_minutes != null && { duration_minutes: timing.duration_minutes }),
      ...(timing.average_speed != null && { average_speed: timing.average_speed }),
      ...(validated.trip_type && { trip_type: validated.trip_type as Trip['trip_type'] }),
      ...(validated.routeId && { routeId: String(validated.routeId) }),
      created_from: (raw.created_from as Trip['created_from']) || 'manual',
    };

    const created = await this.tripRepo.create(tripData, command.tenantId, command.userId);

    // Emit event
    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new TripCreatedEvent(created, {
      tenantId: command.tenantId,
      userId: command.userId,
      correlationId: command.commandName,
    }));

    return created;
  }
}

========================================
FILE: modules/trips/commands/handlers/update-trip.handler.ts
========================================
// modules/trips/commands/handlers/update-trip.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { UpdateTripCommand } from '../update-trip.command';
import { TripRepository } from '@/modules/trips/repositories/trip.repository';
import { tripUpdateSchema } from '@/shared/validations/trip.schema';
import { Trip } from '@/shared/types/trip.types';
import { NotFoundError, ValidationError, AppError } from '@/server/errors/app.errors';
import { validateWithZod } from '@/shared/utils/validation.utils';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { TripUpdatedEvent } from '@/modules/trips/events/TripUpdatedEvent';

const ALLOWED_FIELDS = [
  'license_plate',
  'mode',
  'date',
  'unit_id',
  'notes',
  'start_location',
  'end_location',
  'driver_id',
  'trip_distance',
  'start_odometer',
  'end_odometer',
  // --- PHASE 1 additions ---
  'status',
  'start_time',
  'end_time',
  'trip_type',
  'routeId',
] as const;

const NUMERIC_FIELDS = ['trip_distance', 'start_odometer', 'end_odometer'];

/** Same derivation used in CreateTripHandler -- see that file for rationale. */
function calculateTiming(
  startTime: Date | undefined,
  endTime: Date | undefined,
  distanceCalculated: number
): { duration_minutes?: number; average_speed?: number } {
  if (!startTime || !endTime) return {};
  const durationMs = endTime.getTime() - startTime.getTime();
  if (durationMs <= 0) return {};
  const duration_minutes = durationMs / 60000;
  const hours = duration_minutes / 60;
  const average_speed = hours > 0 ? distanceCalculated / hours : undefined;
  return { duration_minutes, average_speed };
}

export class UpdateTripHandler implements ICommandHandler<UpdateTripCommand, Trip> {
  constructor(private readonly tripRepo: TripRepository) {}

  async execute(command: UpdateTripCommand): Promise<Trip> {
    const raw = command.rawData as Record<string, unknown>;
    const clean: Record<string, unknown> = { _id: command.tripId };

    for (const field of ALLOWED_FIELDS) {
      if (raw[field] !== undefined) {
        clean[field] = NUMERIC_FIELDS.includes(field) && raw[field] !== ''
          ? Number(raw[field])
          : raw[field];
      }
    }

    const result = await validateWithZod(tripUpdateSchema, clean);
    if (!result.success || !result.data) {
      const fieldErrors = result.errors || {};
      const messages = Object.entries(fieldErrors)
        .map(([field, errs]) => `${field}: ${errs.join(', ')}`)
        .join('; ');
      throw new ValidationError(messages || 'Validation failed', fieldErrors);
    }

    const { _id, ...updateData } = result.data as Record<string, unknown>;
    const db = await connectToDatabase();

    if (updateData.license_plate) {
      const vehicle = await db.collection('tblvehicles').findOne({
        license_plate: String(updateData.license_plate).toUpperCase(),
        isDeleted: { $ne: true },
      });
      if (!vehicle) {
        throw new AppError(
          `Vehicle "${updateData.license_plate}" not found`,
          'VEHICLE_NOT_FOUND',
          400
        );
      }
      updateData.license_plate = String(updateData.license_plate).toUpperCase();
      updateData.orgUnitId = (vehicle as { orgUnitId?: string }).orgUnitId ?? null;
    }

    if (updateData.unit_id) {
      const unit = await db.collection('tblunits').findOne({
        unit_id: updateData.unit_id,
        type: 'distance',
      });
      if (!unit) {
        throw new AppError(
          `Unit "${updateData.unit_id}" not found or is not a distance unit`,
          'UNIT_NOT_FOUND',
          400
        );
      }
    }

    /**
     * PHASE 1 (validation gap closed -- see CreateTripHandler for the
     * matching create-side fix). An empty string clears the driver
     * assignment and is intentionally not checked against tbldrivers.
     */
    if (updateData.driver_id) {
      const driver = await db.collection('tbldrivers').findOne({
        _id: updateData.driver_id as any,
        isDeleted: { $ne: true },
      });
      if (!driver) {
        throw new AppError(
          `Driver "${updateData.driver_id}" not found`,
          'DRIVER_NOT_FOUND',
          400
        );
      }
    }

    const mode = updateData.mode as string | undefined;
    if (mode === 'distance' && updateData.trip_distance != null) {
      updateData.distance_calculated = Number(updateData.trip_distance);
      updateData.start_odometer = null;
      updateData.end_odometer = null;
    } else if (mode === 'odometer') {
      const start = updateData.start_odometer != null ? Number(updateData.start_odometer) : null;
      const end = updateData.end_odometer != null ? Number(updateData.end_odometer) : null;
      if (start != null && end != null) {
        if (end < start) {
          throw new ValidationError('End odometer cannot be less than start odometer');
        }
        updateData.distance_calculated = end - start;
      }
      updateData.trip_distance = null;
    } else if (!mode) {
      if (updateData.trip_distance != null) {
        updateData.distance_calculated = Number(updateData.trip_distance);
      } else if (
        updateData.start_odometer != null &&
        updateData.end_odometer != null
      ) {
        const start = Number(updateData.start_odometer);
        const end = Number(updateData.end_odometer);
        if (end < start) {
          throw new ValidationError('End odometer cannot be less than start odometer');
        }
        updateData.distance_calculated = end - start;
      }
    }

    /**
     * PHASE 1: recompute duration/average_speed whenever start_time,
     * end_time, or the distance changed. If only one of start/end time
     * is supplied on this update we can't recompute against the other
     * (unknown) side, so we leave the existing stored value alone --
     * TripCommandService always sends full objects only where the
     * caller explicitly changed something, and a partial time edit
     * without the paired value is treated as "not enough information
     * to recompute" rather than silently zeroing out duration.
     */
    if (updateData.start_time !== undefined || updateData.end_time !== undefined) {
      const startTime = updateData.start_time ? new Date(updateData.start_time as string) : undefined;
      const endTime = updateData.end_time ? new Date(updateData.end_time as string) : undefined;
      if (startTime && endTime) {
        const distanceForTiming =
          (updateData.distance_calculated as number | undefined) ?? undefined;
        if (distanceForTiming != null) {
          const timing = calculateTiming(startTime, endTime, distanceForTiming);
          if (timing.duration_minutes != null) updateData.duration_minutes = timing.duration_minutes;
          if (timing.average_speed != null) updateData.average_speed = timing.average_speed;
        }
      }
    }

    const updated = await this.tripRepo.update(
      command.tripId,
      updateData as Partial<Omit<Trip, '_id' | 'tenantId' | 'createdAt' | 'createdBy'>>,
      command.tenantId,
      command.userId
    );

    if (!updated) {
      throw new NotFoundError('Trip not found');
    }

    // Emit event
    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new TripUpdatedEvent(updated, updateData, {
      tenantId: command.tenantId,
      userId: command.userId,
      correlationId: command.commandName,
    }));

    return updated;
  }
}

========================================
FILE: modules/trips/commands/handlers/delete-trip.handler.ts
========================================
// modules/trips/commands/handlers/delete-trip.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { DeleteTripCommand } from '../delete-trip.command';
import { TripRepository } from '@/modules/trips/repositories/trip.repository';
import { NotFoundError } from '@/server/errors/app.errors';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { TripDeletedEvent } from '@/modules/trips/events/TripDeletedEvent';

export class DeleteTripHandler implements ICommandHandler<DeleteTripCommand, void> {
  constructor(private readonly tripRepo: TripRepository) {}

  async execute(command: DeleteTripCommand): Promise<void> {
    const existing = await this.tripRepo.findById(command.tripId, command.tenantId);
    if (!existing) {
      throw new NotFoundError('Trip not found');
    }

    if (command.soft) {
      await this.tripRepo.softDelete(command.tripId, command.tenantId, command.userId);
    } else {
      await this.tripRepo.hardDelete(command.tripId, command.tenantId);
    }

    // Emit event
    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new TripDeletedEvent(
      command.tripId,
      existing.license_plate,
      existing.distance_calculated,
      command.tenantId,
      {
        userId: command.userId,
        correlationId: command.commandName,
        soft: command.soft,
      }
    ));
  }
}

========================================
FILE: modules/trips/events/TripCreatedEvent.ts
========================================
// modules/trips/events/TripCreatedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { TRIP_CREATED } from '@/server/events/event-names';
import { Trip } from '@/shared/types/trip.types';

export class TripCreatedEvent extends DomainEvent {
  constructor(trip: Trip, metadata?: Record<string, unknown>) {
    super(TRIP_CREATED, {
      entityId: trip._id,
      entityType: 'trip',
      license_plate: trip.license_plate,
      distance: trip.distance_calculated,
      mode: trip.mode,
      date: trip.date,
      tenantId: trip.tenantId,
    }, metadata);
  }
}

========================================
FILE: modules/trips/events/TripUpdatedEvent.ts
========================================
// modules/trips/events/TripUpdatedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { TRIP_UPDATED } from '@/server/events/event-names';
import { Trip } from '@/shared/types/trip.types';

export class TripUpdatedEvent extends DomainEvent {
  constructor(
    trip: Trip,
    changes: Partial<Trip>,
    metadata?: Record<string, unknown>,
  ) {
    super(TRIP_UPDATED, {
      entityId: trip._id,
      entityType: 'trip',
      license_plate: trip.license_plate,
      distance: trip.distance_calculated,
      changes,
      tenantId: trip.tenantId,
    }, metadata);
  }
}

========================================
FILE: modules/trips/events/TripDeletedEvent.ts
========================================
// modules/trips/events/TripDeletedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { TRIP_DELETED } from '@/server/events/event-names';

export class TripDeletedEvent extends DomainEvent {
  constructor(
    tripId: string,
    licensePlate: string,
    distance: number,
    tenantId: string,
    metadata?: Record<string, unknown>,
  ) {
    super(TRIP_DELETED, {
      entityId: tripId,
      entityType: 'trip',
      license_plate: licensePlate,
      distance,
      tenantId,
    }, metadata);
  }
}

========================================
FILE: modules/trips/queries/get-trips.query.ts
========================================
// modules/trips/queries/get-trips.query.ts

import { BaseQuery } from '@/server/cqrs/query';
import { TripFilters } from '@/shared/types/trip.types';
import { PaginationParams } from '@/shared/types/common.types';

export class GetTripsQuery extends BaseQuery {
  static readonly queryName = 'GetTripsQuery';

  constructor(
    public readonly filters: TripFilters,
    public readonly pagination: PaginationParams,
    public readonly tenantId: string
  ) {
    super(GetTripsQuery.queryName);
  }
}

========================================
FILE: modules/trips/queries/get-trip-by-id.query.ts
========================================
// modules/trips/queries/get-trip-by-id.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetTripByIdQuery extends BaseQuery {
  static readonly queryName = 'GetTripByIdQuery';

  constructor(
    public readonly tripId: string,
    public readonly tenantId: string
  ) {
    super(GetTripByIdQuery.queryName);
  }
}

========================================
FILE: modules/trips/queries/get-trip-kpis.query.ts
========================================
// modules/trips/queries/get-trip-kpis.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetTripKpisQuery extends BaseQuery {
  static readonly queryName = 'GetTripKpisQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date }
  ) {
    super(GetTripKpisQuery.queryName);
  }
}

========================================
FILE: modules/trips/queries/get-trip-stats.query.ts
========================================
// modules/trips/queries/get-trip-stats.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetTripStatsQuery extends BaseQuery {
  static readonly queryName = 'GetTripStatsQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date }
  ) {
    super(GetTripStatsQuery.queryName);
  }
}

========================================
FILE: modules/trips/queries/get-daily-distance.query.ts
========================================
// modules/trips/queries/get-daily-distance.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetDailyDistanceQuery extends BaseQuery {
  static readonly queryName = 'GetDailyDistanceQuery';

  constructor(
    public readonly tenantId: string,
    public readonly days: number = 30
  ) {
    super(GetDailyDistanceQuery.queryName);
  }
}

========================================
FILE: modules/trips/queries/get-trip-exceptions.query.ts
========================================
// modules/trips/queries/get-trip-exceptions.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetTripExceptionsQuery extends BaseQuery {
  static readonly queryName = 'GetTripExceptionsQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly zThreshold: number = 2.5,
    public readonly limit: number = 50
  ) {
    super(GetTripExceptionsQuery.queryName);
  }
}

========================================
FILE: modules/trips/queries/handlers/get-trips.handler.ts
========================================
// modules/trips/queries/handlers/get-trips.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetTripsQuery } from '../get-trips.query';
import { TripRepository } from '@/modules/trips/repositories/trip.repository';
import { Trip } from '@/shared/types/trip.types';
import { PaginatedResponse } from '@/shared/types/common.types';

export class GetTripsHandler
  implements IQueryHandler<GetTripsQuery, PaginatedResponse<Trip>>
{
  constructor(private readonly tripRepo: TripRepository) {}

  async execute(query: GetTripsQuery): Promise<PaginatedResponse<Trip>> {
    return this.tripRepo.getFilteredTrips(
      query.filters,
      query.tenantId,
      query.pagination
    );
  }
}

========================================
FILE: modules/trips/queries/handlers/get-trip-by-id.handler.ts
========================================
// modules/trips/queries/handlers/get-trip-by-id.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetTripByIdQuery } from '../get-trip-by-id.query';
import { TripRepository } from '@/modules/trips/repositories/trip.repository';
import { Trip } from '@/shared/types/trip.types';
import { NotFoundError } from '@/server/errors/app.errors';

export class GetTripByIdHandler implements IQueryHandler<GetTripByIdQuery, Trip> {
  constructor(private readonly tripRepo: TripRepository) {}

  async execute(query: GetTripByIdQuery): Promise<Trip> {
    const trip = await this.tripRepo.findById(query.tripId, query.tenantId);
    if (!trip) {
      throw new NotFoundError('Trip not found');
    }
    return trip;
  }
}

========================================
FILE: modules/trips/queries/handlers/get-trip-kpis.handler.ts
========================================
// modules/trips/queries/handlers/get-trip-kpis.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetTripKpisQuery } from '../get-trip-kpis.query';
import { TripRepository } from '@/modules/trips/repositories/trip.repository';
import { TripKpis } from '@/shared/types/trip.types';

export class GetTripKpisHandler implements IQueryHandler<GetTripKpisQuery, TripKpis> {
  constructor(private readonly tripRepo: TripRepository) {}

  async execute(query: GetTripKpisQuery): Promise<TripKpis> {
    return this.tripRepo.getTripKpis(query.tenantId, query.dateRange);
  }
}

========================================
FILE: modules/trips/queries/handlers/get-trip-stats.handler.ts
========================================
// modules/trips/queries/handlers/get-trip-stats.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetTripStatsQuery } from '../get-trip-stats.query';
import { TripRepository } from '@/modules/trips/repositories/trip.repository';
import { TripStats } from '@/shared/types/trip.types';

export class GetTripStatsHandler implements IQueryHandler<GetTripStatsQuery, TripStats> {
  constructor(private readonly tripRepo: TripRepository) {}

  async execute(query: GetTripStatsQuery): Promise<TripStats> {
    return this.tripRepo.getTripStats(query.tenantId, query.dateRange);
  }
}

========================================
FILE: modules/trips/queries/handlers/get-daily-distance.handler.ts
========================================
// modules/trips/queries/handlers/get-daily-distance.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetDailyDistanceQuery } from '../get-daily-distance.query';
import { TripRepository } from '@/modules/trips/repositories/trip.repository';

export class GetDailyDistanceHandler
  implements IQueryHandler<GetDailyDistanceQuery, Array<{ date: string; distance: number }>>
{
  constructor(private readonly tripRepo: TripRepository) {}

  async execute(
    query: GetDailyDistanceQuery
  ): Promise<Array<{ date: string; distance: number }>> {
    return this.tripRepo.getDailyDistance(query.tenantId, query.days);
  }
}

========================================
FILE: modules/trips/queries/handlers/get-trip-exceptions.handler.ts
========================================
// modules/trips/queries/handlers/get-trip-exceptions.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetTripExceptionsQuery } from '../get-trip-exceptions.query';
import { TripRepository } from '@/modules/trips/repositories/trip.repository';
import { TripExceptionRow } from '@/shared/types/trip.types';

export class GetTripExceptionsHandler
  implements IQueryHandler<GetTripExceptionsQuery, TripExceptionRow[]>
{
  constructor(private readonly tripRepo: TripRepository) {}

  async execute(query: GetTripExceptionsQuery): Promise<TripExceptionRow[]> {
    return this.tripRepo.getTripExceptions(
      query.tenantId,
      query.dateRange,
      query.zThreshold,
      query.limit
    );
  }
}

========================================
FILE: modules/fuel/api/fuel.api.ts
========================================
// modules/fuel/api/fuel.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import { FuelLog, FuelLogCreateDTO, FuelLogUpdateDTO, FuelFilters, FuelStats } from '@/shared/types/fuel.types';
import { PaginatedResponse } from '@/shared/types/common.types';

const BASE_URL = '/fuellogs';

export const fuelApi = {
  async getFuelLogs(filters: FuelFilters = {}, page: number = 1, limit: number = 10): Promise<PaginatedResponse<FuelLog>> {
    const params: Record<string, string | number | boolean | undefined> = {
      page,
      limit,
      ...(filters.license_plate && { license_plate: filters.license_plate }),
      ...(filters.unit_id && { unit_id: filters.unit_id }),
      ...(filters.startDate && { startDate: filters.startDate.toISOString() }),
      ...(filters.endDate && { endDate: filters.endDate.toISOString() }),
    };
    
    return apiClient.get<PaginatedResponse<FuelLog>>(BASE_URL, { params });
  },

  async getFuelLogById(id: string): Promise<FuelLog> {
    return apiClient.get<FuelLog>(BASE_URL, { params: { id } });
  },

  async getFuelStats(dateRange?: { startDate?: Date; endDate?: Date }): Promise<FuelStats> {
    const params: Record<string, string | undefined> = {};
    if (dateRange?.startDate) params.startDate = dateRange.startDate.toISOString();
    if (dateRange?.endDate) params.endDate = dateRange.endDate.toISOString();
    
    return apiClient.get<FuelStats>(BASE_URL, { params: { action: 'stats', ...params } });
  },

  async getMonthlyFuelConsumption(months: number = 12): Promise<Array<{ month: string; fuel: number; cost: number }>> {
    return apiClient.get<Array<{ month: string; fuel: number; cost: number }>>(BASE_URL, {
      params: { action: 'monthly', months },
    });
  },

  async getTopFuelConsumers(limit: number = 5): Promise<Array<{ license_plate: string; totalFuel: number; totalCost: number }>> {
    return apiClient.get<Array<{ license_plate: string; totalFuel: number; totalCost: number }>>(BASE_URL, {
      params: { action: 'top-consumers', limit },
    });
  },

  async createFuelLog(data: FuelLogCreateDTO): Promise<FuelLog> {
    return apiClient.post<FuelLog>(BASE_URL, data);
  },

  async updateFuelLog(id: string, data: FuelLogUpdateDTO): Promise<FuelLog> {
    return apiClient.put<FuelLog>(BASE_URL, data, { params: { id } });
  },

  async deleteFuelLog(id: string): Promise<void> {
    await apiClient.delete<void>(BASE_URL, { params: { id } });
  },
};

export default fuelApi;

========================================
FILE: modules/fuel/cqrs.register.ts
========================================
// modules/fuel/cqrs.register.ts

import { CommandBus } from '@/server/cqrs/command-bus';
import { QueryBus } from '@/server/cqrs/query-bus';
import { fuelRepository } from './repositories/fuel.repository';

import { CreateFuelLogCommand } from './commands/create-fuel-log.command';
import { UpdateFuelLogCommand } from './commands/update-fuel-log.command';
import { DeleteFuelLogCommand } from './commands/delete-fuel-log.command';

import { CreateFuelLogHandler } from './commands/handlers/create-fuel-log.handler';
import { UpdateFuelLogHandler } from './commands/handlers/update-fuel-log.handler';
import { DeleteFuelLogHandler } from './commands/handlers/delete-fuel-log.handler';

import { GetFuelLogsQuery } from './queries/get-fuel-logs.query';
import { GetFuelLogByIdQuery } from './queries/get-fuel-log-by-id.query';
import { GetFuelStatsQuery } from './queries/get-fuel-stats.query';
import { GetMonthlyFuelConsumptionQuery } from './queries/get-monthly-fuel-consumption.query';
import { GetTopFuelConsumersQuery } from './queries/get-top-fuel-consumers.query';
import { GetFuelKpisQuery } from './queries/get-fuel-kpis.query';
import { GetAbnormalFuelConsumptionQuery } from './queries/get-abnormal-fuel-consumption.query';
import { GetFuelByDriverQuery } from './queries/get-fuel-by-driver.query';
import { GetVehicleFuelTimelineQuery } from './queries/get-vehicle-fuel-timeline.query';
import { GetFuelByStationQuery } from './queries/get-fuel-by-station.query';
import { GetFuelActivityTrendQuery } from './queries/get-fuel-activity-trend.query';
import { GetAverageFuelPriceTrendQuery } from './queries/get-average-fuel-price-trend.query';
import { GetFuelTypeDistributionQuery } from './queries/get-fuel-type-distribution.query';
import { GetFuelingFrequencyByVehicleQuery } from './queries/get-fueling-frequency-by-vehicle.query';
import { GetFuelCostDistributionQuery } from './queries/get-fuel-cost-distribution.query';
import { GetFuelEntryHeatmapQuery } from './queries/get-fuel-entry-heatmap.query';

import { GetFuelLogsHandler } from './queries/handlers/get-fuel-logs.handler';
import { GetFuelLogByIdHandler } from './queries/handlers/get-fuel-log-by-id.handler';
import { GetFuelStatsHandler } from './queries/handlers/get-fuel-stats.handler';
import { GetMonthlyFuelConsumptionHandler } from './queries/handlers/get-monthly-fuel-consumption.handler';
import { GetTopFuelConsumersHandler } from './queries/handlers/get-top-fuel-consumers.handler';
import { GetFuelKpisHandler } from './queries/handlers/get-fuel-kpis.handler';
import { GetAbnormalFuelConsumptionHandler } from './queries/handlers/get-abnormal-fuel-consumption.handler';
import { GetFuelByDriverHandler } from './queries/handlers/get-fuel-by-driver.handler';
import { GetVehicleFuelTimelineHandler } from './queries/handlers/get-vehicle-fuel-timeline.handler';
import { GetFuelByStationHandler } from './queries/handlers/get-fuel-by-station.handler';
import { GetFuelActivityTrendHandler } from './queries/handlers/get-fuel-activity-trend.handler';
import { GetAverageFuelPriceTrendHandler } from './queries/handlers/get-average-fuel-price-trend.handler';
import { GetFuelTypeDistributionHandler } from './queries/handlers/get-fuel-type-distribution.handler';
import { GetFuelingFrequencyByVehicleHandler } from './queries/handlers/get-fueling-frequency-by-vehicle.handler';
import { GetFuelCostDistributionHandler } from './queries/handlers/get-fuel-cost-distribution.handler';
import { GetFuelEntryHeatmapHandler } from './queries/handlers/get-fuel-entry-heatmap.handler';

export function registerFuelCqrsHandlers(
  commandBus: CommandBus,
  queryBus: QueryBus
): void {
  // Commands
  commandBus.register(CreateFuelLogCommand, new CreateFuelLogHandler(fuelRepository));
  commandBus.register(UpdateFuelLogCommand, new UpdateFuelLogHandler(fuelRepository));
  commandBus.register(DeleteFuelLogCommand, new DeleteFuelLogHandler(fuelRepository));

  // Queries
  queryBus.register(GetFuelLogsQuery, new GetFuelLogsHandler(fuelRepository));
  queryBus.register(GetFuelLogByIdQuery, new GetFuelLogByIdHandler(fuelRepository));
  queryBus.register(GetFuelStatsQuery, new GetFuelStatsHandler(fuelRepository));
  queryBus.register(GetMonthlyFuelConsumptionQuery, new GetMonthlyFuelConsumptionHandler(fuelRepository));
  queryBus.register(GetTopFuelConsumersQuery, new GetTopFuelConsumersHandler(fuelRepository));
  queryBus.register(GetFuelKpisQuery, new GetFuelKpisHandler(fuelRepository));
  queryBus.register(GetAbnormalFuelConsumptionQuery, new GetAbnormalFuelConsumptionHandler(fuelRepository));
  queryBus.register(GetFuelByDriverQuery, new GetFuelByDriverHandler(fuelRepository));

  // NEW -- enterprise analytics
  queryBus.register(GetVehicleFuelTimelineQuery, new GetVehicleFuelTimelineHandler(fuelRepository));
  queryBus.register(GetFuelByStationQuery, new GetFuelByStationHandler(fuelRepository));
  queryBus.register(GetFuelActivityTrendQuery, new GetFuelActivityTrendHandler(fuelRepository));
  queryBus.register(GetAverageFuelPriceTrendQuery, new GetAverageFuelPriceTrendHandler(fuelRepository));
  queryBus.register(GetFuelTypeDistributionQuery, new GetFuelTypeDistributionHandler(fuelRepository));
  queryBus.register(
    GetFuelingFrequencyByVehicleQuery,
    new GetFuelingFrequencyByVehicleHandler(fuelRepository)
  );
  queryBus.register(GetFuelCostDistributionQuery, new GetFuelCostDistributionHandler(fuelRepository));
  queryBus.register(GetFuelEntryHeatmapQuery, new GetFuelEntryHeatmapHandler(fuelRepository));
}

========================================
FILE: modules/fuel/controllers/fuel.controller.ts
========================================
// modules/fuel/controllers/fuel.controller.ts

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { bootstrapCqrs } from '@/server/cqrs/cqrs.module';
import { fuelCommandService } from '../services/fuel-command.service';
import { fuelQueryService } from '../services/fuel-query.service';
import { FuelFilters } from '@/shared/types/fuel.types';
import type { FuelByDriverSort } from '../queries/get-fuel-by-driver.query';
import type { FuelTrendGranularity } from '@/shared/types/fuel.types';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import {
  successResponse,
  paginatedResponse,
  errorResponse,
  createdResponse,
} from '@/server/utils/response.utils';
import { AppError, ValidationError, UnauthorizedError, ForbiddenError, NotFoundError } from '@/server/errors/app.errors';
import {
  getTenantFromRequest,
  getUserIdFromRequest,
} from '@/server/utils/context.utils';
import { getAuthContext } from '@/server/auth/auth-context';
import { driverRepository } from '@/modules/drivers/repositories/driver.repository';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { tenantContextService } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import { fuelRepository } from '../repositories/fuel.repository';
import { exportService, fileDownloadResponse } from '@/shared/export';
import {
  FUEL_EXPORT_COLUMNS,
  FUEL_EXPORT_SHEET_NAME,
  FUEL_EXPORT_BASE_FILENAME,
} from '../export/fuel-export.columns';

bootstrapCqrs();

const MAX_IMPORT_ROWS = 2000;
const VALID_GRANULARITIES: FuelTrendGranularity[] = ['week', 'month', 'quarter', 'year'];

export interface ImportRowResult {
  row: number;
  success: boolean;
  identifier?: string;
  error?: string;
  /** True when this row was skipped because it duplicates an existing
   *  fuel log or another row earlier in the same file. Always false
   *  when `success` is true. */
  duplicate?: boolean;
}

export interface ImportResponse {
  summary: { total: number; succeeded: number; duplicates: number; failed: number };
  results: ImportRowResult[];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Shared helper: parses the optional startDate/endDate query params used by every analytics action. */
function parseDateRange(searchParams: URLSearchParams): { startDate?: Date; endDate?: Date } | undefined {
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  if (!startDate && !endDate) return undefined;
  return {
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
  };
}

/**
 * FIX (Ã°Å¸Å¸  perf / timeout root cause): the import loop used to call
 * driverRepository.findByNameOrCode(...) and a one-off fuel-station regex
 * query PER ROW. Resolving both ONCE before the loop into in-memory maps
 * removes ~2 DB round trips Ãƒâ€” row count.
 */
interface DriverLookupEntry {
  id: string;
}

async function buildDriverLookup(tenantId: string): Promise<{
  byKey: Map<string, DriverLookupEntry>;
  ambiguousKeys: Set<string>;
  byId: Map<string, DriverLookupEntry>;
}> {
  const drivers = await driverRepository.findAll(tenantId);
  const byKey = new Map<string, DriverLookupEntry>();
  const ambiguousKeys = new Set<string>();
  const byId = new Map<string, DriverLookupEntry>();

  for (const d of drivers) {
    const id = String(d._id);
    byId.set(id, { id });

    const keys = [d.name, (d as { driver_code?: string }).driver_code]
      .filter((k): k is string => Boolean(k && k.trim()))
      .map((k) => k.trim().toLowerCase());

    for (const key of keys) {
      const existing = byKey.get(key);
      if (existing && existing.id !== id) {
        ambiguousKeys.add(key);
      } else {
        byKey.set(key, { id });
      }
    }
  }

  return { byKey, ambiguousKeys, byId };
}

async function buildStationLookup(tenantId: string): Promise<Map<string, string>> {
  const db = await connectToDatabase();
  const stations = await db
    .collection('tblfuelstations')
    .find(
      { tenantId, isDeleted: { $ne: true } },
      { projection: { name: 1, brand: 1 } }
    )
    .toArray();

  const map = new Map<string, string>();
  for (const s of stations) {
    const id = String(s._id);
    if (s.name) map.set(String(s.name).trim().toLowerCase(), id);
    if (s.brand) map.set(String(s.brand).trim().toLowerCase(), id);
  }
  return map;
}

// ---------------------------------------------------------------------
// NEW: duplicate detection for bulk fuel-log imports.
//
// A "duplicate" is defined as the SAME vehicle + SAME calendar day +
// SAME fuel volume + SAME cost -- matching the exact criteria the
// person's own upstream data-cleaning tooling already used for
// cross-sheet dedup (see their Transformation Log: "Exact duplicate of
// a transaction already present on an earlier sheet (same plate/date/
// volume/cost/driver/fuel type)"). We intentionally key on
// plate+date+volume+cost only (not driver/fuel_type) so this also
// catches duplicates against records already sitting in the database
// from a prior manual entry or an earlier import run, where those extra
// fields may not always be populated consistently.
// ---------------------------------------------------------------------

function normalizeDedupDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const d = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString().slice(0, 10); // calendar day only
}

function normalizeDedupNumber(value: unknown): string {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  if (typeof n !== 'number' || Number.isNaN(n)) return String(value ?? '');
  return (Math.round(n * 100) / 100).toFixed(2);
}

/** Returns null if there isn't enough data on the row to form a reliable key (missing plate). */
function buildFuelDedupKey(row: {
  license_plate?: unknown;
  date?: unknown;
  fuel_volume?: unknown;
  cost?: unknown;
}): string | null {
  const plate = typeof row.license_plate === 'string' ? row.license_plate.trim().toUpperCase() : '';
  if (!plate) return null;
  return [plate, normalizeDedupDate(row.date), normalizeDedupNumber(row.fuel_volume), normalizeDedupNumber(row.cost)].join('|');
}

/**
 * Pre-fetches every existing (non-deleted) fuel log for the vehicles
 * touched by this batch, scoped to the batch's own date range, and
 * reduces them to a Set of dedup keys. One query for the whole import
 * instead of one per row.
 */
async function buildExistingFuelLogKeys(
  tenantId: string,
  plates: string[],
  dateRange: { min: Date; max: Date } | null
): Promise<Set<string>> {
  if (plates.length === 0) return new Set();

  const db = await connectToDatabase();
  const match: Record<string, unknown> = {
    tenantId,
    isDeleted: { $ne: true },
    license_plate: { $in: plates },
  };
  if (dateRange) {
    // Small buffer on either side to be safe against timezone-boundary rounding.
    const bufferedMin = new Date(dateRange.min.getTime() - 24 * 60 * 60 * 1000);
    const bufferedMax = new Date(dateRange.max.getTime() + 24 * 60 * 60 * 1000);
    match.date = { $gte: bufferedMin, $lte: bufferedMax };
  }

  const existing = await db
    .collection('tblfuellogs')
    .find(match, { projection: { license_plate: 1, date: 1, fuel_volume: 1, cost: 1 } })
    .toArray();

  const keys = new Set<string>();
  for (const log of existing) {
    const key = buildFuelDedupKey({
      license_plate: log.license_plate,
      date: log.date,
      fuel_volume: log.fuel_volume,
      cost: log.cost,
    });
    if (key) keys.add(key);
  }
  return keys;
}

export class FuelController {
  async getFuelLogs(req: NextRequest) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        throw new UnauthorizedError('Authentication required');
      }

      const tenantContext = await tenantContextService.resolveContext(
        authContext.userId,
        authContext.tenantId,
        authContext.roles,
        authContext.isSuperAdmin,
        authContext.orgUnitId
      );

      const searchParams = req.nextUrl.searchParams;

      const filters: FuelFilters = {
        license_plate: searchParams.get('license_plate') || undefined,
        unit_id: searchParams.get('unit_id') || undefined,
        payment_method: (searchParams.get('payment_method') as FuelFilters['payment_method']) || undefined,
        fuel_station_id: searchParams.get('fuel_station_id') || undefined,
        fuel_card_id: searchParams.get('fuel_card_id') || undefined,
        driver_id: searchParams.get('driver_id') || undefined,
        startDate: searchParams.get('start')
          ? new Date(searchParams.get('start')!)
          : undefined,
        endDate: searchParams.get('end')
          ? new Date(searchParams.get('end')!)
          : undefined,
      };

      const pageParam = searchParams.get('page');
      if (!pageParam) {
        const result = await fuelRepository.getFilteredLogsInScope(
          filters,
          tenantContext,
          { page: 1, limit: 10000 }
        );
        return successResponse(result.data);
      }

      const { page, limit } = validatePaginationParams(
        pageParam,
        searchParams.get('limit')
      );

      const result = await fuelRepository.getFilteredLogsInScope(
        filters,
        tenantContext,
        { page, limit }
      );

      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Phase 2 Enterprise Export Framework: exports the COMPLETE set of
   * fuel logs matching the caller's current filters and authorization
   * scope, not just the page of results currently loaded in the UI
   * table. Reuses the exact same auth/tenant-context/filter parsing as
   * getFuelLogs above.
   */
  async exportFuelLogs(req: NextRequest) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        throw new UnauthorizedError('Authentication required');
      }

      const tenantContext = await tenantContextService.resolveContext(
        authContext.userId,
        authContext.tenantId,
        authContext.roles,
        authContext.isSuperAdmin,
        authContext.orgUnitId
      );

      const searchParams = req.nextUrl.searchParams;

      const filters: FuelFilters = {
        license_plate: searchParams.get('license_plate') || undefined,
        unit_id: searchParams.get('unit_id') || undefined,
        payment_method: (searchParams.get('payment_method') as FuelFilters['payment_method']) || undefined,
        fuel_station_id: searchParams.get('fuel_station_id') || undefined,
        fuel_card_id: searchParams.get('fuel_card_id') || undefined,
        driver_id: searchParams.get('driver_id') || undefined,
        startDate: searchParams.get('start')
          ? new Date(searchParams.get('start')!)
          : undefined,
        endDate: searchParams.get('end')
          ? new Date(searchParams.get('end')!)
          : undefined,
      };

      const format = exportService.parseFormat(searchParams.get('format'));

      const { rows, totalMatched, truncated, exportCap } = await fuelRepository.getFilteredLogsForExport(
        filters,
        tenantContext
      );

      const file = exportService.generate(
        rows,
        FUEL_EXPORT_COLUMNS,
        format,
        FUEL_EXPORT_BASE_FILENAME,
        FUEL_EXPORT_SHEET_NAME
      );

      return fileDownloadResponse(file, {
        totalMatched,
        rowsExported: rows.length,
        truncated,
        exportCap,
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * FIX (critical -- org-unit scope bypass on single-record access):
   * same bug/fix as VehicleController.loadInScopeVehicle -- getFuelLogs
   * (list) was the only endpoint applying org-unit scoping;
   * getFuelLog/updateFuelLog/deleteFuelLog checked only tenantId.
   */
  private async loadInScopeFuelLog(req: NextRequest, id: string) {
    const authContext = await getAuthContext(req);
    if (!authContext) {
      throw new UnauthorizedError('Authentication required');
    }

    const log = await fuelQueryService.getFuelLogById(id, authContext.tenantId);

    const tenantContext = await tenantContextService.resolveContext(
      authContext.userId,
      authContext.tenantId,
      authContext.roles,
      authContext.isSuperAdmin,
      authContext.orgUnitId
    );

    const logOrgUnitId = (log as any).orgUnitId as string | undefined;
    if (
      logOrgUnitId &&
      !tenantScopeService.canAccessOrgUnit(tenantContext, logOrgUnitId)
    ) {
      throw new NotFoundError('Fuel log not found');
    }

    return { authContext, log };
  }

  async getFuelLog(req: NextRequest, id: string) {
    try {
      const { log } = await this.loadInScopeFuelLog(req, id);
      return successResponse(log);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createFuelLog(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const log = await fuelCommandService.createFuelLog(body, tenantId, userId);
      return createdResponse(log);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async importFuelLogs(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);

      let body: { records?: unknown };
      try {
        body = await req.json();
      } catch {
        throw new ValidationError('Invalid JSON body');
      }

      const records = Array.isArray(body.records) ? (body.records as Record<string, unknown>[]) : null;
      if (!records || records.length === 0) {
        throw new ValidationError('No records provided for import');
      }
      if (records.length > MAX_IMPORT_ROWS) {
        throw new ValidationError(
          `Import exceeds the maximum of ${MAX_IMPORT_ROWS} rows per batch`
        );
      }

      // Batch-resolve drivers + stations ONCE for the whole import.
      const [{ byKey: driverByKey, ambiguousKeys: ambiguousDriverKeys, byId: driverById }, stationLookup] =
        await Promise.all([buildDriverLookup(tenantId), buildStationLookup(tenantId)]);

      // NEW: pre-fetch existing fuel logs for the vehicles in this batch so
      // we can detect duplicates against data already in the database,
      // without querying per row.
      const distinctPlates = Array.from(
        new Set(
          records
            .map((r) => (typeof r.license_plate === 'string' ? r.license_plate.trim().toUpperCase() : ''))
            .filter(Boolean)
        )
      );

      let batchDateRange: { min: Date; max: Date } | null = null;
      for (const r of records) {
        if (!r.date) continue;
        const d = new Date(r.date as string | number);
        if (Number.isNaN(d.getTime())) continue;
        if (!batchDateRange) {
          batchDateRange = { min: d, max: d };
        } else {
          if (d < batchDateRange.min) batchDateRange.min = d;
          if (d > batchDateRange.max) batchDateRange.max = d;
        }
      }

      const existingKeys = await buildExistingFuelLogKeys(tenantId, distinctPlates, batchDateRange);
      // Tracks keys created earlier in THIS SAME batch, to catch
      // duplicates within the file itself (e.g. the same transaction
      // appearing on two source sheets, or the file being uploaded twice
      // in one go).
      const seenInBatch = new Set<string>();

      const results: ImportRowResult[] = [];
      let succeeded = 0;
      let duplicates = 0;
      let failed = 0;

      for (let i = 0; i < records.length; i++) {
        const rawRow = { ...records[i] };
        const rowNumber = i + 2;
        const licensePlate =
          typeof rawRow.license_plate === 'string' ? rawRow.license_plate.toUpperCase() : undefined;

        try {
          // --- Duplicate check happens before any DB write for this row ---
          const dedupKey = buildFuelDedupKey(rawRow);
          if (dedupKey && (existingKeys.has(dedupKey) || seenInBatch.has(dedupKey))) {
            duplicates += 1;
            results.push({
              row: rowNumber,
              success: false,
              duplicate: true,
              identifier: licensePlate,
              error: 'Skipped -- duplicate of an existing fuel log or another row in this file (same plate, date, volume, and cost)',
            });
            continue;
          }

          const driverCell = rawRow.driver;
          delete rawRow.driver;

          if (typeof driverCell === 'string' && driverCell.trim().length > 0) {
            const trimmed = driverCell.trim();

            if (ObjectId.isValid(trimmed) && driverById.has(trimmed)) {
              rawRow.driver_id = trimmed;
            } else {
              const key = trimmed.toLowerCase();
              if (ambiguousDriverKeys.has(key)) {
                failed += 1;
                results.push({
                  row: rowNumber,
                  success: false,
                  identifier: licensePlate,
                  error: `Driver "${driverCell}" matches more than one active driver -- use a driver ID instead`,
                });
                continue;
              }
              const match = driverByKey.get(key);
              if (!match) {
                failed += 1;
                results.push({
                  row: rowNumber,
                  success: false,
                  identifier: licensePlate,
                  error: `Driver "${driverCell}" could not be matched to an active driver`,
                });
                continue;
              }
              rawRow.driver_id = match.id;
            }
          }

          if (
            !rawRow.fuel_station_id &&
            typeof rawRow.station_name === 'string' &&
            rawRow.station_name.trim().length > 0
          ) {
            const resolvedStationId = stationLookup.get(rawRow.station_name.trim().toLowerCase());
            if (resolvedStationId) {
              rawRow.fuel_station_id = resolvedStationId;
            }
          }

          const log = await fuelCommandService.createFuelLog(rawRow, tenantId, userId);
          succeeded += 1;
          if (dedupKey) seenInBatch.add(dedupKey);
          results.push({
            row: rowNumber,
            success: true,
            identifier: `${log.license_plate} - ${new Date(log.date).toLocaleDateString()}`,
          });
        } catch (error) {
          failed += 1;
          const message =
            error instanceof AppError ? error.message : 'Unexpected error while importing this row';
          results.push({ row: rowNumber, success: false, identifier: licensePlate, error: message });
        }
      }

      const response: ImportResponse = {
        summary: { total: records.length, succeeded, duplicates, failed },
        results,
      };
      return successResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateFuelLog(req: NextRequest, id: string) {
    try {
      const { authContext } = await this.loadInScopeFuelLog(req, id);
      const userId = authContext.userId;
      const body = await req.json();

      const log = await fuelCommandService.updateFuelLog(id, body, authContext.tenantId, userId);
      return successResponse(log);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async deleteFuelLog(req: NextRequest, id: string) {
    try {
      const { authContext } = await this.loadInScopeFuelLog(req, id);
      const soft = req.nextUrl.searchParams.get('soft') !== 'false';

      if (!soft && !authContext.isSuperAdmin) {
        throw new ForbiddenError(
          'Permanently deleting a fuel log requires organization owner or super admin access. Use a soft delete instead.'
        );
      }

      await fuelCommandService.deleteFuelLog(id, authContext.tenantId, authContext.userId, soft);
      return successResponse({ message: 'Fuel log deleted successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getFuelStats(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const dateRange = parseDateRange(req.nextUrl.searchParams);
      const stats = await fuelQueryService.getFuelStats(tenantId, dateRange);
      return successResponse(stats);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getMonthlyConsumption(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const months = Number(req.nextUrl.searchParams.get('months') || '12');
      const data = await fuelQueryService.getMonthlyFuelConsumption(tenantId, months);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getTopConsumers(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const limit = Number(req.nextUrl.searchParams.get('limit') || '5');
      const data = await fuelQueryService.getTopFuelConsumers(tenantId, limit);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getFuelByDriver(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;
      const limit = Number(searchParams.get('limit') || '10');
      const sortBy = (searchParams.get('sortBy') as FuelByDriverSort) || 'volume';
      const dateRange = parseDateRange(searchParams);

      const data = await fuelQueryService.getFuelByDriver(tenantId, dateRange, limit, sortBy);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getFuelKpis(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const dateRange = parseDateRange(req.nextUrl.searchParams);
      const kpis = await fuelQueryService.getFuelKpis(tenantId, dateRange);
      return successResponse(kpis);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getAbnormalConsumption(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const threshold = Number(req.nextUrl.searchParams.get('threshold') || '2');
      const data = await fuelQueryService.getAbnormalConsumption(tenantId, threshold);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ---- Enterprise analytics ----

  /** #1 Vehicle Fuel Activity Timeline */
  async getVehicleFuelTimeline(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;
      const dateRange = parseDateRange(searchParams);
      const licensePlate = searchParams.get('license_plate') || undefined;

      const data = await fuelQueryService.getVehicleFuelTimeline(tenantId, {
        license_plate: licensePlate,
        startDate: dateRange?.startDate,
        endDate: dateRange?.endDate,
      });
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** #4 Fuel Spend by Station + #8 Top Fuel Stations (same data, sorted client-side) */
  async getFuelByStation(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;
      const limit = Number(searchParams.get('limit') || '15');
      const dateRange = parseDateRange(searchParams);

      const data = await fuelQueryService.getFuelByStation(tenantId, dateRange, limit);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** #3 Fuel Activity Trend */
  async getFuelActivityTrend(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;
      const granularityParam = searchParams.get('granularity') as FuelTrendGranularity | null;
      const granularity: FuelTrendGranularity =
        granularityParam && VALID_GRANULARITIES.includes(granularityParam) ? granularityParam : 'month';
      const dateRange = parseDateRange(searchParams);

      const data = await fuelQueryService.getFuelActivityTrend(tenantId, granularity, dateRange);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** #5 Average Fuel Price Trend */
  async getAverageFuelPriceTrend(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;
      const granularityParam = searchParams.get('granularity') as FuelTrendGranularity | null;
      const granularity: FuelTrendGranularity =
        granularityParam && VALID_GRANULARITIES.includes(granularityParam) ? granularityParam : 'month';
      const dateRange = parseDateRange(searchParams);

      const data = await fuelQueryService.getAverageFuelPriceTrend(tenantId, dateRange, granularity);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** #6 Fuel Type Distribution */
  async getFuelTypeDistribution(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const dateRange = parseDateRange(req.nextUrl.searchParams);
      const data = await fuelQueryService.getFuelTypeDistribution(tenantId, dateRange);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** #7 Fueling Frequency by Vehicle */
  async getFuelingFrequencyByVehicle(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;
      const limit = Number(searchParams.get('limit') || '20');
      const dateRange = parseDateRange(searchParams);

      const data = await fuelQueryService.getFuelingFrequencyByVehicle(tenantId, dateRange, limit);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** #9 Fuel Cost Distribution */
  async getFuelCostDistribution(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const dateRange = parseDateRange(req.nextUrl.searchParams);
      const data = await fuelQueryService.getFuelCostDistribution(tenantId, dateRange);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** #10 Fuel Entry Heatmap */
  async getFuelEntryHeatmap(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const dateRange = parseDateRange(req.nextUrl.searchParams);
      const data = await fuelQueryService.getFuelEntryHeatmap(tenantId, dateRange);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[FuelController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const fuelController = new FuelController();

========================================
FILE: modules/fuel/repositories/fuel.repository.ts
========================================
// modules/fuel/repositories/fuel.repository.ts

import { BaseRepository } from '@/server/repositories/base.repository';
import {
  FuelLog,
  FuelFilters,
  FuelStats,
  FuelKpis,
  AbnormalFuelConsumptionRow,
  FuelPaymentMethod,
  FuelPaymentBreakdown,
  DriverFuelConsumptionRow,
  FuelTrendGranularity,
  VehicleFuelTimelinePoint,
  FuelByStationRow,
  FuelActivityTrendPoint,
  FuelPriceTrendPoint,
  FuelTypeDistributionRow,
  FuelFrequencyByVehicleRow,
  FuelCostDistributionBucket,
  FuelHeatmapCell,
} from '@/shared/types/fuel.types';
import {
  PaginationParams,
  PaginatedResponse,
} from '@/shared/types/common.types';
import { Filter, ObjectId } from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import { EXPORT_ROW_CAP, ExportDataset } from '@/shared/export';

interface VehiclePeriodAggregate {
  _id: string;
  minOdometer?: number;
  maxOdometer?: number;
  totalFuel: number;
  totalCost: number;
  count: number;
  avgVolume: number;
}

const ALL_PAYMENT_METHODS: FuelPaymentMethod[] = ['cash', 'fuel_card', 'credit_card', 'company_account', 'other'];

export const DEFAULT_ABNORMAL_CONSUMPTION_MULTIPLIER = 2;

export class FuelRepository extends BaseRepository<FuelLog> {
  protected collectionName = 'tblfuellogs';

  private isSuperAdminTenant(tenantId: string): boolean {
    return (
      tenantId === 'default' ||
      tenantId === 'system' ||
      tenantId === 'super_admin'
    );
  }

  /** Shared tenant + date-range match stage builder used by every analytics aggregation below. */
  private buildBaseMatch(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Record<string, unknown> {
    const match: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (!this.isSuperAdminTenant(tenantId)) match.tenantId = tenantId;
    if (dateRange?.startDate || dateRange?.endDate) {
      match.date = {};
      if (dateRange.startDate) (match.date as any).$gte = dateRange.startDate;
      if (dateRange.endDate) (match.date as any).$lte = dateRange.endDate;
    }
    return match;
  }

  /**
   * Single source of truth for period bucketing, shared by getFuelActivityTrend
   * and getAverageFuelPriceTrend so the two charts can never disagree about
   * what a "week"/"quarter" boundary is.
   */
  private buildPeriodExpr(granularity: FuelTrendGranularity): Record<string, unknown> {
    switch (granularity) {
      case 'week':
        return { $dateToString: { format: '%G-W%V', date: '$date' } };
      case 'quarter':
        return {
          $concat: [
            { $toString: { $year: '$date' } },
            '-Q',
            { $toString: { $ceil: { $divide: [{ $month: '$date' }, 3] } } },
          ],
        };
      case 'year':
        return { $dateToString: { format: '%Y', date: '$date' } };
      case 'month':
      default:
        return { $dateToString: { format: '%Y-%m', date: '$date' } };
    }
  }

  private async enrichFuelLogs(logs: FuelLog[]): Promise<FuelLog[]> {
    const driverIds = Array.from(
      new Set(logs.map((l) => l.driver_id).filter((id): id is string => Boolean(id)))
    );
    const stationIds = Array.from(
      new Set(logs.map((l) => l.fuel_station_id).filter((id): id is string => Boolean(id)))
    );

    if (driverIds.length === 0 && stationIds.length === 0) return logs;

    const db = await connectToDatabase();

    const driverMap = new Map<string, { _id: string; name: string; driver_code?: string }>();
    const validDriverObjectIds = driverIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
    if (validDriverObjectIds.length > 0) {
      const drivers = await db
        .collection('tbldrivers')
        .find({ _id: { $in: validDriverObjectIds } }, { projection: { name: 1, driver_code: 1 } })
        .toArray();
      for (const d of drivers) {
        driverMap.set(String(d._id), {
          _id: String(d._id),
          name: d.name as string,
          driver_code: d.driver_code as string | undefined,
        });
      }
    }

    const stationMap = new Map<string, { _id: string; name: string; brand?: string }>();
    const validStationObjectIds = stationIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
    if (validStationObjectIds.length > 0) {
      const stations = await db
        .collection('tblfuelstations')
        .find({ _id: { $in: validStationObjectIds } }, { projection: { name: 1, brand: 1 } })
        .toArray();
      for (const s of stations) {
        stationMap.set(String(s._id), {
          _id: String(s._id),
          name: s.name as string,
          brand: s.brand as string | undefined,
        });
      }
    }

    if (driverMap.size === 0 && stationMap.size === 0) return logs;

    return logs.map((log) => {
      let enriched = log;
      if (log.driver_id) {
        const driver = driverMap.get(log.driver_id);
        if (driver) enriched = { ...enriched, driver };
      }
      if (log.fuel_station_id) {
        const station = stationMap.get(log.fuel_station_id);
        if (station) enriched = { ...enriched, fuel_station: station };
      }
      return enriched;
    });
  }

  async findByLicensePlate(
    licensePlate: string,
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<FuelLog>> {
    const result = await this.findWithPagination(
      { license_plate: licensePlate.toUpperCase() } as Filter<FuelLog>,
      pagination,
      tenantId
    );
    return { ...result, data: await this.enrichFuelLogs(result.data) };
  }

  async getFilteredLogs(
    filters: FuelFilters,
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<FuelLog>> {
    const filter: Record<string, unknown> = {};

    if (filters.license_plate) {
      filter.license_plate = { $regex: filters.license_plate, $options: 'i' };
    }
    if (filters.unit_id) filter.unit_id = filters.unit_id;
    if (filters.payment_method) filter.payment_method = filters.payment_method;
    if (filters.fuel_station_id) filter.fuel_station_id = filters.fuel_station_id;
    if (filters.fuel_card_id) filter.fuel_card_id = filters.fuel_card_id;
    if (filters.driver_id) filter.driver_id = filters.driver_id;
    if (filters.startDate || filters.endDate) {
      filter.date = {};
      if (filters.startDate) (filter.date as any).$gte = filters.startDate;
      if (filters.endDate) (filter.date as any).$lte = filters.endDate;
    }

    const result = await this.findWithPagination(filter as Filter<FuelLog>, pagination, tenantId);
    return { ...result, data: await this.enrichFuelLogs(result.data) };
  }

  /**
   * Org/branch-scoped variant of getFilteredLogs. Mirrors
   * VehicleRepository.getFilteredVehiclesInScope: same filters, plus
   * tenantScopeService.buildFilter(context, 'orgUnitId') on top of (not
   * instead of) tenant isolation.
   */
  /**
   * Single source of truth for the tenant + org-unit-scope + filter
   * query shared by getFilteredLogsInScope (paginated list) and
   * getFilteredLogsForExport (uncapped-by-pagination export).
   */
  private buildScopedQuery(filters: FuelFilters, context: TenantContext): Record<string, unknown> {
    const query: Record<string, unknown> = {
      isDeleted: { $ne: true },
    };

    if (!this.isSuperAdminTenant(context.organizationId)) {
      query.tenantId = context.organizationId;
    }

    if (filters.license_plate) {
      query.license_plate = { $regex: filters.license_plate, $options: 'i' };
    }
    if (filters.unit_id) query.unit_id = filters.unit_id;
    if (filters.payment_method) query.payment_method = filters.payment_method;
    if (filters.fuel_station_id) query.fuel_station_id = filters.fuel_station_id;
    if (filters.fuel_card_id) query.fuel_card_id = filters.fuel_card_id;
    if (filters.driver_id) query.driver_id = filters.driver_id;
    if (filters.startDate || filters.endDate) {
      query.date = {};
      if (filters.startDate) (query.date as any).$gte = filters.startDate;
      if (filters.endDate) (query.date as any).$lte = filters.endDate;
    }

    const scopeFilter = tenantScopeService.buildFilter<FuelLog>(context, 'orgUnitId');
    Object.assign(query, scopeFilter);

    return query;
  }

  async getFilteredLogsInScope(
    filters: FuelFilters,
    context: TenantContext,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<FuelLog>> {
    const collection = await this.getCollection();
    const query = this.buildScopedQuery(filters, context);

    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      collection
        .find(query as Filter<FuelLog>)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      collection.countDocuments(query as Filter<FuelLog>),
    ]);

    const result = {
      data: data as FuelLog[],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };

    return { ...result, data: await this.enrichFuelLogs(result.data) };
  }

  /**
   * Export variant of getFilteredLogsInScope: same filters and same
   * tenant/org-unit scope, returns up to `cap` matching records
   * (default EXPORT_ROW_CAP) ignoring UI pagination, enriched with
   * driver/station names the same way the list endpoint is, plus the
   * true total match count so the caller can detect truncation.
   */
  async getFilteredLogsForExport(
    filters: FuelFilters,
    context: TenantContext,
    cap: number = EXPORT_ROW_CAP
  ): Promise<ExportDataset<FuelLog>> {
    const collection = await this.getCollection();
    const query = this.buildScopedQuery(filters, context);

    const [rows, totalMatched] = await Promise.all([
      collection
        .find(query as Filter<FuelLog>)
        .sort({ createdAt: -1 })
        .limit(cap)
        .toArray(),
      collection.countDocuments(query as Filter<FuelLog>),
    ]);

    const enriched = await this.enrichFuelLogs(rows as FuelLog[]);

    return {
      rows: enriched,
      totalMatched,
      truncated: totalMatched > rows.length,
      exportCap: cap,
    };
  }

  async findById(id: string, tenantId: string): Promise<FuelLog | null> {
    const log = await super.findById(id, tenantId);
    if (!log) return null;
    const [enriched] = await this.enrichFuelLogs([log]);
    return enriched;
  }

  async getFuelStats(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelStats> {
    const collection = await this.getCollection();
    const filter = this.buildBaseMatch(tenantId, dateRange);

    const pipeline = [
      { $match: filter },
      {
        $facet: {
          total: [
            {
              $group: {
                _id: null,
                totalFuel: { $sum: '$fuel_volume' },
                totalCost: { $sum: '$cost' },
                count: { $sum: 1 },
              },
            },
          ],
          byPayment: [
            {
              $group: {
                _id: { $ifNull: ['$payment_method', 'cash'] },
                totalCost: { $sum: '$cost' },
                totalVolume: { $sum: '$fuel_volume' },
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
    ];

    const result = await collection.aggregate(pipeline).toArray();
    const data = result[0]?.total[0] || { totalFuel: 0, totalCost: 0, count: 0 };
    const byPayment = (result[0]?.byPayment || []) as Array<{
      _id: FuelPaymentMethod;
      totalCost: number;
      totalVolume: number;
      count: number;
    }>;

    const breakdownMap = new Map(byPayment.map((row) => [row._id, row]));
    const paymentBreakdown: FuelPaymentBreakdown[] = ALL_PAYMENT_METHODS.map((method) => {
      const row = breakdownMap.get(method);
      return {
        method,
        totalCost: row?.totalCost ?? 0,
        totalVolume: row?.totalVolume ?? 0,
        count: row?.count ?? 0,
      };
    }).filter((row) => row.count > 0);

    return {
      totalFuel: data.totalFuel,
      totalCost: data.totalCost,
      averageCostPerUnit: data.totalFuel > 0 ? data.totalCost / data.totalFuel : 0,
      logCount: data.count,
      efficiency: null,
      paymentBreakdown,
    };
  }

  async getMonthlyFuelConsumption(
    tenantId: string,
    months: number = 12
  ): Promise<Array<{ month: string; fuel: number; cost: number }>> {
    const collection = await this.getCollection();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);
    const matchStage = this.buildBaseMatch(tenantId, { startDate });

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$date' } },
          fuel: { $sum: '$fuel_volume' },
          cost: { $sum: '$cost' },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map((r) => ({ month: r._id, fuel: r.fuel, cost: r.cost }));
  }

  async getTopFuelConsumers(
    tenantId: string,
    limit: number = 5
  ): Promise<Array<{ license_plate: string; totalFuel: number; totalCost: number }>> {
    const collection = await this.getCollection();
    const matchStage = this.buildBaseMatch(tenantId);

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: '$license_plate',
          totalFuel: { $sum: '$fuel_volume' },
          totalCost: { $sum: '$cost' },
        },
      },
      { $sort: { totalFuel: -1 } },
      { $limit: limit },
      { $project: { license_plate: '$_id', totalFuel: 1, totalCost: 1, _id: 0 } },
    ];

    return collection.aggregate(pipeline).toArray() as Promise<
  { license_plate: string; totalFuel: number; totalCost: number }[]
>;
  }

  /**
   * "Fuel Consumption by Driver" / "Fuel Cost by Driver" (enterprise spec #2)
   * -- same aggregation, `sortBy` picks which figure ranks the result so we
   * don't stand up a second near-identical pipeline for the dashboard's
   * existing widget vs. the new enterprise chart.
   *
   * FIX (root cause of duplicate/fragmented "Unassigned" rows): the group
   * key previously used `$ifNull: ['$driver_id', null]`, which does NOT
   * treat an empty-string driver_id ("") as absent -- only true null/missing
   * is caught by $ifNull. Since "" is truthy in Mongo aggregation, rows with
   * driver_id === "" formed their own group distinct from true-null rows,
   * producing two separate "Unassigned" entries in the output instead of
   * one merged total. Normalized both null and "" to a single `null` key
   * via $addFields before grouping so unattributed fuel logs are always
   * merged into exactly one bucket.
   */
  async getFuelByDriver(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 10,
    sortBy: 'volume' | 'cost' = 'volume'
  ): Promise<DriverFuelConsumptionRow[]> {
    const collection = await this.getCollection();
    const matchStage = this.buildBaseMatch(tenantId, dateRange);
    const sortField = sortBy === 'cost' ? 'totalCost' : 'totalFuel';

    const pipeline = [
      { $match: matchStage },
      {
        $addFields: {
          __driverKey: {
            $cond: [
              { $and: [{ $ne: ['$driver_id', null] }, { $ne: ['$driver_id', ''] }] },
              '$driver_id',
              null,
            ],
          },
        },
      },
      {
        $group: {
          _id: '$__driverKey',
          totalFuel: { $sum: '$fuel_volume' },
          totalCost: { $sum: '$cost' },
          count: { $sum: 1 },
          vehicles: { $addToSet: '$license_plate' },
        },
      },
      { $sort: { [sortField]: -1 } },
      { $limit: limit },
    ];

    const grouped = await collection.aggregate(pipeline).toArray();

    const driverIds = grouped
      .map((g) => g._id)
      .filter((id): id is string => Boolean(id) && ObjectId.isValid(id));

    let driverNameMap = new Map<string, string>();
    if (driverIds.length > 0) {
      const db = await connectToDatabase();
      const drivers = await db
        .collection('tbldrivers')
        .find({ _id: { $in: driverIds.map((id) => new ObjectId(id)) } }, { projection: { name: 1 } })
        .toArray();
      driverNameMap = new Map(drivers.map((d) => [String(d._id), d.name as string]));
    }

    return grouped.map((g) => {
      const driverId: string | null = g._id ?? null;
      return {
        driver_id: driverId,
        driverName: driverId ? driverNameMap.get(driverId) ?? 'Unknown driver' : 'Unassigned',
        totalFuel: g.totalFuel,
        totalCost: g.totalCost,
        logCount: g.count,
        vehicleCount: Array.isArray(g.vehicles) ? g.vehicles.length : 0,
        averageCostPerUnit: g.totalFuel > 0 ? g.totalCost / g.totalFuel : 0,
      };
    });
  }

  async getFuelKpis(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    tripDistanceByVehicle?: Record<string, number>,
    prevTripDistanceByVehicle?: Record<string, number>
  ): Promise<FuelKpis> {
    const collection = await this.getCollection();
    const now = new Date();

    const rangeEnd = dateRange?.endDate ?? now;
    const rangeStart = dateRange?.startDate ?? new Date(rangeEnd.getTime() - 90 * 24 * 60 * 60 * 1000);
    const periodMs = rangeEnd.getTime() - rangeStart.getTime();
    const prevRangeEnd = new Date(rangeStart.getTime() - 1);
    const prevRangeStart = new Date(prevRangeEnd.getTime() - periodMs);

    const baseMatch = this.buildBaseMatch(tenantId);

    const aggregateByVehicle = async (start: Date, end: Date): Promise<VehiclePeriodAggregate[]> => {
      const pipeline = [
        { $match: { ...baseMatch, date: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: '$license_plate',
            minOdometer: { $min: '$odometer' },
            maxOdometer: { $max: '$odometer' },
            totalFuel: { $sum: '$fuel_volume' },
            totalCost: { $sum: '$cost' },
            count: { $sum: 1 },
            avgVolume: { $avg: '$fuel_volume' },
          },
        },
      ];
      return collection.aggregate(pipeline).toArray() as Promise<VehiclePeriodAggregate[]>;
    };

    const [currentByVehicle, previousByVehicle, recentLogs] = await Promise.all([
      aggregateByVehicle(rangeStart, rangeEnd),
      aggregateByVehicle(prevRangeStart, prevRangeEnd),
      collection.find({ ...baseMatch, date: { $gte: rangeStart, $lte: rangeEnd } }).sort({ date: -1 }).toArray(),
    ]);

    const summarize = (
      byVehicle: VehiclePeriodAggregate[],
      distanceFallback?: Record<string, number>
    ) => {
      let totalDistance = 0;
      let totalFuel = 0;
      let totalCost = 0;
      let fallbackVehicleCount = 0;
      const fallbackPlates: string[] = [];

      for (const v of byVehicle) {
        totalFuel += v.totalFuel || 0;
        totalCost += v.totalCost || 0;

        let vehicleDistance = 0;
        const hasOdometerRange =
          typeof v.minOdometer === 'number' &&
          typeof v.maxOdometer === 'number' &&
          v.maxOdometer > v.minOdometer;

        if (hasOdometerRange) {
          vehicleDistance = (v.maxOdometer as number) - (v.minOdometer as number);
        }

        if (vehicleDistance <= 0 && distanceFallback && distanceFallback[v._id]) {
          vehicleDistance = distanceFallback[v._id];
          fallbackVehicleCount += 1;
          fallbackPlates.push(v._id);
        }

        totalDistance += vehicleDistance;
      }

      const efficiency = totalFuel > 0 ? totalDistance / totalFuel : 0;
      const costPerKm = totalDistance > 0 ? totalCost / totalDistance : 0;
      return { totalDistance, totalFuel, totalCost, efficiency, costPerKm, fallbackVehicleCount, fallbackPlates };
    };

    const current = summarize(currentByVehicle, tripDistanceByVehicle);
    const previous = summarize(previousByVehicle, prevTripDistanceByVehicle);

    const vehicleAvgVolume = new Map<string, number>();
    currentByVehicle.forEach((v) => vehicleAvgVolume.set(v._id, v.avgVolume || 0));

    let abnormalCount = 0;
    for (const log of recentLogs) {
      const avg = vehicleAvgVolume.get(log.license_plate) || 0;
      if (avg > 0 && log.fuel_volume > avg * DEFAULT_ABNORMAL_CONSUMPTION_MULTIPLIER) abnormalCount += 1;
    }
    const abnormalConsumptionPercentage =
      recentLogs.length > 0 ? Math.round((abnormalCount / recentLogs.length) * 1000) / 10 : 0;

    const mostRecent = recentLogs[0];
    const daysSinceLastFill = mostRecent
      ? Math.max(0, Math.floor((now.getTime() - new Date(mostRecent.date).getTime()) / (24 * 60 * 60 * 1000)))
      : 0;

    return {
      averageFuelEfficiency: Math.round(current.efficiency * 100) / 100,
      totalDistance: Math.round(current.totalDistance),
      efficiencyTrend: Math.round((current.efficiency - previous.efficiency) * 100) / 100,
      costPerKm: Math.round(current.costPerKm * 100) / 100,
      costTrend: Math.round((current.costPerKm - previous.costPerKm) * 100) / 100,
      vehiclesTracked: currentByVehicle.length,
      abnormalConsumptionCount: abnormalCount,
      abnormalConsumptionPercentage,
      daysSinceLastFill,
      mostRecentVehicle: mostRecent?.station_name,
      mostRecentPlate: mostRecent?.license_plate,
      fallbackVehicleCount: current.fallbackVehicleCount,
      fallbackPlates: current.fallbackPlates,
    };
  }

  async getAbnormalConsumption(
    tenantId: string,
    threshold: number = DEFAULT_ABNORMAL_CONSUMPTION_MULTIPLIER
  ): Promise<AbnormalFuelConsumptionRow[]> {
    const collection = await this.getCollection();
    const matchStage = this.buildBaseMatch(tenantId);

    const pipeline = [
      { $match: matchStage },
      { $group: { _id: '$license_plate', avgVolume: { $avg: '$fuel_volume' }, logs: { $push: '$$ROOT' } } },
    ];

    const grouped = await collection.aggregate(pipeline).toArray();
    const rows: AbnormalFuelConsumptionRow[] = [];

    for (const group of grouped) {
      const avg = group.avgVolume || 0;
      if (avg <= 0) continue;
      for (const log of group.logs) {
        if (log.fuel_volume > avg * threshold) {
          rows.push({
            _id: String(log._id),
            license_plate: log.license_plate,
            volume: log.fuel_volume,
            station_name: log.station_name,
            date: log.date,
            anomalyScore: Math.round((log.fuel_volume / avg) * 100) / 100,
            threshold,
          });
        }
      }
    }

    return rows
      .sort((a, b) => new Date(b.date as string).getTime() - new Date(a.date as string).getTime())
      .slice(0, 50);
  }

  // ------------------------------------------------------------------
  // Enterprise analytics additions (Fuel Analytics Enhancement)
  // ------------------------------------------------------------------

  /** #1 Vehicle Fuel Activity Timeline -- entries per day, optionally scoped to one vehicle. */
  async getVehicleFuelTimeline(
    tenantId: string,
    filters: { license_plate?: string; startDate?: Date; endDate?: Date }
  ): Promise<VehicleFuelTimelinePoint[]> {
    const collection = await this.getCollection();
    const matchStage = this.buildBaseMatch(tenantId, filters);
    if (filters.license_plate) {
      matchStage.license_plate = filters.license_plate.toUpperCase();
    }

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          count: { $sum: 1 },
          volume: { $sum: '$fuel_volume' },
          cost: { $sum: '$cost' },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map((r) => ({
      date: r._id,
      count: r.count,
      volume: Math.round((r.volume || 0) * 100) / 100,
      cost: Math.round((r.cost || 0) * 100) / 100,
    }));
  }

  /**
   * #4 Fuel Spend by Station + #8 Top Fuel Stations -- one grouped
   * aggregation keyed by fuel_station_id (falling back to the free-text
   * station_name for unregistered entries), resolving registered station
   * names in a single batched follow-up query. Callers sort the returned
   * rows by totalSpend or visits depending on which chart is rendering.
   *
   * FIX (root cause of "Unregistered station" mislabeling): the previous
   * `_id`/`isRegistered` computation used `$ifNull: ['$fuel_station_id', ...]`
   * and `$cond: [{ $ifNull: ['$fuel_station_id', false] }, true, false]`.
   * $ifNull only catches true null/missing -- an empty-string fuel_station_id
   * ("", the value a controlled <Select> submits when nothing is chosen)
   * is truthy in Mongo's $cond, so those rows were incorrectly marked
   * isRegistered=true with an unresolvable _id of "", which then failed
   * ObjectId.isValid() downstream and fell through to a generic fallback
   * instead of the real station name. Normalized both fuel_station_id and
   * station_name via $addFields (treating null AND "" as absent) before
   * grouping, so registered/unregistered detection and the display name
   * are computed consistently.
   */
  async getFuelByStation(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 15
  ): Promise<FuelByStationRow[]> {
    const collection = await this.getCollection();
    const matchStage = this.buildBaseMatch(tenantId, dateRange);

    const pipeline = [
      { $match: matchStage },
      {
        $addFields: {
          __hasStationId: {
            $and: [{ $ne: ['$fuel_station_id', null] }, { $ne: ['$fuel_station_id', ''] }],
          },
          __hasStationName: {
            $and: [{ $ne: ['$station_name', null] }, { $ne: ['$station_name', ''] }],
          },
        },
      },
      {
        $group: {
          _id: {
            $cond: [
              '$__hasStationId',
              '$fuel_station_id',
              { $cond: ['$__hasStationName', '$station_name', 'Unregistered station'] },
            ],
          },
          isRegistered: { $max: '$__hasStationId' },
          fallbackName: { $first: '$station_name' },
          totalSpend: { $sum: '$cost' },
          totalLitres: { $sum: '$fuel_volume' },
          visits: { $sum: 1 },
        },
      },
      { $sort: { totalSpend: -1 } },
      { $limit: Math.max(limit, 50) }, // fetch a wider pool so callers can re-sort by visits client-side
    ];

    const grouped = await collection.aggregate(pipeline).toArray();

    const stationIds = grouped
      .filter((g) => g.isRegistered && ObjectId.isValid(g._id))
      .map((g) => new ObjectId(g._id));

    let stationNameMap = new Map<string, string>();
    if (stationIds.length > 0) {
      const db = await connectToDatabase();
      const stations = await db
        .collection('tblfuelstations')
        .find({ _id: { $in: stationIds } }, { projection: { name: 1 } })
        .toArray();
      stationNameMap = new Map(stations.map((s) => [String(s._id), s.name as string]));
    }

    return grouped.map((g) => ({
      station_id: g.isRegistered ? String(g._id) : null,
      stationName: g.isRegistered
        ? stationNameMap.get(String(g._id)) ?? 'Unknown station'
        : (g.fallbackName && String(g.fallbackName).trim()) || 'Unregistered station',
      totalSpend: Math.round(g.totalSpend * 100) / 100,
      totalLitres: Math.round(g.totalLitres * 100) / 100,
      visits: g.visits,
    }));
  }

  /** #3 Fuel Activity Trend -- entries (bar) + volume/cost/avg-price (switchable line), by period. */
  async getFuelActivityTrend(
    tenantId: string,
    granularity: FuelTrendGranularity,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelActivityTrendPoint[]> {
    const collection = await this.getCollection();
    const matchStage = this.buildBaseMatch(tenantId, dateRange);

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: this.buildPeriodExpr(granularity),
          entries: { $sum: 1 },
          volume: { $sum: '$fuel_volume' },
          cost: { $sum: '$cost' },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map((r) => ({
      period: r._id,
      entries: r.entries,
      volume: Math.round(r.volume * 100) / 100,
      cost: Math.round(r.cost * 100) / 100,
      avgCostPerLitre: r.volume > 0 ? Math.round((r.cost / r.volume) * 100) / 100 : 0,
    }));
  }

  /** #5 Average Fuel Price Trend -- weighted (totalCost/totalVolume) average per period. */
  async getAverageFuelPriceTrend(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    granularity: FuelTrendGranularity = 'month'
  ): Promise<FuelPriceTrendPoint[]> {
    const collection = await this.getCollection();
    const matchStage = this.buildBaseMatch(tenantId, dateRange);

    const pipeline = [
      { $match: { ...matchStage, fuel_volume: { $gt: 0 } } },
      {
        $group: {
          _id: this.buildPeriodExpr(granularity),
          totalCost: { $sum: '$cost' },
          totalVolume: { $sum: '$fuel_volume' },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map((r) => ({
      period: r._id,
      avgCostPerLitre: r.totalVolume > 0 ? Math.round((r.totalCost / r.totalVolume) * 100) / 100 : 0,
    }));
  }

  /** #6 Fuel Type Distribution -- litres/cost/percentage per fuel_type. */
  async getFuelTypeDistribution(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelTypeDistributionRow[]> {
    const collection = await this.getCollection();
    const matchStage = this.buildBaseMatch(tenantId, dateRange);

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: { $ifNull: ['$fuel_type', 'unspecified'] },
          litres: { $sum: '$fuel_volume' },
          cost: { $sum: '$cost' },
        },
      },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    const totalLitres = results.reduce((sum, r) => sum + r.litres, 0);

    return results
      .map((r) => ({
        fuelType: r._id as string,
        litres: Math.round(r.litres * 100) / 100,
        cost: Math.round(r.cost * 100) / 100,
        percentage: totalLitres > 0 ? Math.round((r.litres / totalLitres) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.litres - a.litres);
  }

  /** #7 Fueling Frequency by Vehicle -- entry count + volume/cost totals per license plate. */
  async getFuelingFrequencyByVehicle(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 20
  ): Promise<FuelFrequencyByVehicleRow[]> {
    const collection = await this.getCollection();
    const matchStage = this.buildBaseMatch(tenantId, dateRange);

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: '$license_plate',
          count: { $sum: 1 },
          totalVolume: { $sum: '$fuel_volume' },
          totalCost: { $sum: '$cost' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: limit },
      {
        $project: {
          license_plate: '$_id',
          count: 1,
          totalVolume: { $round: [{ $ifNull: ['$totalVolume', 0] }, 2] },
          totalCost: { $round: [{ $ifNull: ['$totalCost', 0] }, 2] },
          _id: 0,
        },
      },
    ];

    return collection.aggregate(pipeline).toArray() as Promise<FuelFrequencyByVehicleRow[]>;
  }

  /** #9 Fuel Cost Distribution -- histogram buckets via $bucketAuto (server picks even boundaries). */
  async getFuelCostDistribution(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelCostDistributionBucket[]> {
    const collection = await this.getCollection();
    const matchStage = this.buildBaseMatch(tenantId, dateRange);

    const count = await collection.countDocuments(matchStage as Filter<FuelLog>);
    if (count === 0) return [];

    const bucketCount = Math.min(8, count);
    const pipeline = [
      { $match: matchStage },
      {
        $bucketAuto: {
          groupBy: '$cost',
          buckets: bucketCount,
          output: { count: { $sum: 1 } },
        },
      },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map((r) => ({
      min: Math.round((r._id.min ?? 0) * 100) / 100,
      max: Math.round((r._id.max ?? 0) * 100) / 100,
      count: r.count,
    }));
  }

  /**
   * #10 Fuel Entry Heatmap -- day-of-week x hour-of-day entry counts.
   * Note: entries logged via the date-only form input default to midnight,
   * so the hour dimension is only meaningful for records that carry a real
   * timestamp (e.g. imported data with full datetimes).
   */
  async getFuelEntryHeatmap(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelHeatmapCell[]> {
    const collection = await this.getCollection();
    const matchStage = this.buildBaseMatch(tenantId, dateRange);

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: { dayOfWeek: { $dayOfWeek: '$date' }, hour: { $hour: '$date' } },
          count: { $sum: 1 },
        },
      },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    // Mongo $dayOfWeek: 1=Sunday..7=Saturday -> normalize to 0=Sunday..6=Saturday
    return results.map((r) => ({
      dayOfWeek: r._id.dayOfWeek - 1,
      hour: r._id.hour,
      count: r.count,
    }));
  }
}

export const fuelRepository = new FuelRepository();

========================================
FILE: modules/fuel/services/fuel-command.service.ts
========================================
// modules/fuel/services/fuel-command.service.ts

import { commandBus } from '@/server/cqrs/command-bus';
import { CreateFuelLogCommand } from '../commands/create-fuel-log.command';
import { UpdateFuelLogCommand } from '../commands/update-fuel-log.command';
import { DeleteFuelLogCommand } from '../commands/delete-fuel-log.command';
import { FuelLog } from '@/shared/types/fuel.types';

export class FuelCommandService {
  async createFuelLog(
    rawData: unknown,
    tenantId: string,
    userId?: string
  ): Promise<FuelLog> {
    return commandBus.execute<FuelLog>(
      new CreateFuelLogCommand(rawData, tenantId, userId)
    );
  }

  async updateFuelLog(
    fuelLogId: string,
    rawData: unknown,
    tenantId: string,
    userId?: string
  ): Promise<FuelLog> {
    return commandBus.execute<FuelLog>(
      new UpdateFuelLogCommand(fuelLogId, rawData, tenantId, userId)
    );
  }

  async deleteFuelLog(
    fuelLogId: string,
    tenantId: string,
    userId?: string,
    soft: boolean = false
  ): Promise<void> {
    return commandBus.execute<void>(
      new DeleteFuelLogCommand(fuelLogId, tenantId, userId, soft)
    );
  }
}

export const fuelCommandService = new FuelCommandService();

========================================
FILE: modules/fuel/services/fuel-query.service.ts
========================================
/* eslint-disable @typescript-eslint/no-unused-vars */
// modules/fuel/services/fuel-query.service.ts

import { queryBus } from '@/server/cqrs/query-bus';
import { GetFuelLogsQuery } from '../queries/get-fuel-logs.query';
import { GetFuelLogByIdQuery } from '../queries/get-fuel-log-by-id.query';
import { GetFuelStatsQuery } from '../queries/get-fuel-stats.query';
import { GetMonthlyFuelConsumptionQuery } from '../queries/get-monthly-fuel-consumption.query';
import { GetTopFuelConsumersQuery } from '../queries/get-top-fuel-consumers.query';
import { GetFuelKpisQuery } from '../queries/get-fuel-kpis.query';
import { GetAbnormalFuelConsumptionQuery } from '../queries/get-abnormal-fuel-consumption.query';
import { GetFuelByDriverQuery, FuelByDriverSort } from '../queries/get-fuel-by-driver.query';
import { GetVehicleFuelTimelineQuery, VehicleFuelTimelineFilters } from '../queries/get-vehicle-fuel-timeline.query';
import { GetFuelByStationQuery } from '../queries/get-fuel-by-station.query';
import { GetFuelActivityTrendQuery } from '../queries/get-fuel-activity-trend.query';
import { GetAverageFuelPriceTrendQuery } from '../queries/get-average-fuel-price-trend.query';
import { GetFuelTypeDistributionQuery } from '../queries/get-fuel-type-distribution.query';
import { GetFuelingFrequencyByVehicleQuery } from '../queries/get-fueling-frequency-by-vehicle.query';
import { GetFuelCostDistributionQuery } from '../queries/get-fuel-cost-distribution.query';
import { GetFuelEntryHeatmapQuery } from '../queries/get-fuel-entry-heatmap.query';
import {
  FuelLog,
  FuelFilters,
  FuelStats,
  FuelKpis,
  AbnormalFuelConsumptionRow,
  DriverFuelConsumptionRow,
  FuelTrendGranularity,
  VehicleFuelTimelinePoint,
  FuelByStationRow,
  FuelActivityTrendPoint,
  FuelPriceTrendPoint,
  FuelTypeDistributionRow,
  FuelFrequencyByVehicleRow,
  FuelCostDistributionBucket,
  FuelHeatmapCell,
} from '@/shared/types/fuel.types';
import { PaginatedResponse, PaginationParams } from '@/shared/types/common.types';
import { fuelRepository } from '../repositories/fuel.repository';
import { tripRepository } from '@/modules/trips/repositories/trip.repository';

export class FuelQueryService {
  async getFilteredLogs(
    filters: FuelFilters,
    pagination: PaginationParams,
    tenantId: string
  ): Promise<PaginatedResponse<FuelLog>> {
    return queryBus.execute<PaginatedResponse<FuelLog>>(
      new GetFuelLogsQuery(filters, pagination, tenantId)
    );
  }

  async getFuelLogById(fuelLogId: string, tenantId: string): Promise<FuelLog> {
    return queryBus.execute<FuelLog>(
      new GetFuelLogByIdQuery(fuelLogId, tenantId)
    );
  }

  async getFuelStats(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelStats> {
    return queryBus.execute<FuelStats>(
      new GetFuelStatsQuery(tenantId, dateRange)
    );
  }

  async getMonthlyFuelConsumption(
    tenantId: string,
    months: number = 12
  ): Promise<Array<{ month: string; fuel: number; cost: number }>> {
    return queryBus.execute<Array<{ month: string; fuel: number; cost: number }>>(
      new GetMonthlyFuelConsumptionQuery(tenantId, months)
    );
  }

  async getTopFuelConsumers(
    tenantId: string,
    limit: number = 5
  ): Promise<Array<{ license_plate: string; totalFuel: number; totalCost: number }>> {
    return queryBus.execute<Array<{ license_plate: string; totalFuel: number; totalCost: number }>>(
      new GetTopFuelConsumersQuery(tenantId, limit)
    );
  }

  async getFuelByDriver(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 10,
    sortBy: FuelByDriverSort = 'volume'
  ): Promise<DriverFuelConsumptionRow[]> {
    return queryBus.execute<DriverFuelConsumptionRow[]>(
      new GetFuelByDriverQuery(tenantId, dateRange, limit, sortBy)
    );
  }

  async getFuelKpis(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelKpis> {
    const now = new Date();
    const rangeEnd = dateRange?.endDate ?? now;
    const rangeStart = dateRange?.startDate ?? new Date(rangeEnd.getTime() - 90 * 24 * 60 * 60 * 1000);
    const periodMs = rangeEnd.getTime() - rangeStart.getTime();
    const prevRangeEnd = new Date(rangeStart.getTime() - 1);
    const prevRangeStart = new Date(prevRangeEnd.getTime() - periodMs);

    const [tripDistanceByVehicle, prevTripDistanceByVehicle] = await Promise.all([
      tripRepository.getDistanceByVehicle(tenantId, rangeStart, rangeEnd),
      tripRepository.getDistanceByVehicle(tenantId, prevRangeStart, prevRangeEnd),
    ]);

    return fuelRepository.getFuelKpis(
      tenantId,
      dateRange,
      tripDistanceByVehicle,
      prevTripDistanceByVehicle
    );
  }

  async getAbnormalConsumption(
    tenantId: string,
    threshold: number = 2
  ): Promise<AbnormalFuelConsumptionRow[]> {
    return queryBus.execute<AbnormalFuelConsumptionRow[]>(
      new GetAbnormalFuelConsumptionQuery(tenantId, threshold)
    );
  }

  // ---- Enterprise analytics ----

  async getVehicleFuelTimeline(
    tenantId: string,
    filters: VehicleFuelTimelineFilters
  ): Promise<VehicleFuelTimelinePoint[]> {
    return queryBus.execute<VehicleFuelTimelinePoint[]>(
      new GetVehicleFuelTimelineQuery(tenantId, filters)
    );
  }

  async getFuelByStation(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 15
  ): Promise<FuelByStationRow[]> {
    return queryBus.execute<FuelByStationRow[]>(
      new GetFuelByStationQuery(tenantId, dateRange, limit)
    );
  }

  async getFuelActivityTrend(
    tenantId: string,
    granularity: FuelTrendGranularity,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelActivityTrendPoint[]> {
    return queryBus.execute<FuelActivityTrendPoint[]>(
      new GetFuelActivityTrendQuery(tenantId, granularity, dateRange)
    );
  }

  async getAverageFuelPriceTrend(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    granularity: FuelTrendGranularity = 'month'
  ): Promise<FuelPriceTrendPoint[]> {
    return queryBus.execute<FuelPriceTrendPoint[]>(
      new GetAverageFuelPriceTrendQuery(tenantId, dateRange, granularity)
    );
  }

  async getFuelTypeDistribution(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelTypeDistributionRow[]> {
    return queryBus.execute<FuelTypeDistributionRow[]>(
      new GetFuelTypeDistributionQuery(tenantId, dateRange)
    );
  }

  async getFuelingFrequencyByVehicle(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 20
  ): Promise<FuelFrequencyByVehicleRow[]> {
    return queryBus.execute<FuelFrequencyByVehicleRow[]>(
      new GetFuelingFrequencyByVehicleQuery(tenantId, dateRange, limit)
    );
  }

  async getFuelCostDistribution(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelCostDistributionBucket[]> {
    return queryBus.execute<FuelCostDistributionBucket[]>(
      new GetFuelCostDistributionQuery(tenantId, dateRange)
    );
  }

  async getFuelEntryHeatmap(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelHeatmapCell[]> {
    return queryBus.execute<FuelHeatmapCell[]>(
      new GetFuelEntryHeatmapQuery(tenantId, dateRange)
    );
  }
}

export const fuelQueryService = new FuelQueryService();

========================================
FILE: modules/fuel/export/fuel-export.columns.ts
========================================
// modules/fuel/export/fuel-export.columns.ts
//
// Column definitions for the Fuel Logs export. Extends the field set
// used by the pre-Phase-2 client-side exportFuelLogsToCSV in
// frontend/modules/fuel/utils/index.ts (which fell back to CSV for
// "Excel" exports since it had no shared column model) with the
// driver/station/payment fields already available on FuelLog once
// FuelRepository.enrichFuelLogs() has run.

import type { ExportColumn } from '@/shared/export';
import type { FuelLog } from '@/shared/types/fuel.types';

export const FUEL_EXPORT_COLUMNS: ExportColumn<FuelLog>[] = [
  { header: 'Date', accessor: (f) => new Date(f.date).toISOString().slice(0, 10) },
  { header: 'License Plate', accessor: (f) => f.license_plate },
  { header: 'Volume', accessor: (f) => f.fuel_volume },
  { header: 'Unit', accessor: (f) => f.unit?.symbol ?? '' },
  { header: 'Cost', accessor: (f) => f.cost },
  { header: 'Currency', accessor: (f) => f.currency ?? 'USD' },
  { header: 'Odometer', accessor: (f) => f.odometer ?? '' },
  { header: 'Fuel Type', accessor: (f) => f.fuel_type ?? '' },
  { header: 'Station', accessor: (f) => f.fuel_station?.name ?? f.station_name ?? '' },
  { header: 'Driver', accessor: (f) => f.driver?.name ?? '' },
  { header: 'Payment Method', accessor: (f) => f.payment_method ?? '' },
  { header: 'Full Tank', accessor: (f) => (f.is_full_tank ? 'Yes' : 'No') },
  { header: 'Notes', accessor: (f) => f.notes ?? '' },
];

export const FUEL_EXPORT_SHEET_NAME = 'Fuel Logs';
export const FUEL_EXPORT_BASE_FILENAME = 'fuel-logs-export';

========================================
FILE: modules/fuel/commands/create-fuel-log.command.ts
========================================
// modules/fuel/commands/create-fuel-log.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export class CreateFuelLogCommand extends BaseCommand {
  static readonly commandName = 'CreateFuelLogCommand';

  constructor(
    public readonly rawData: unknown,
    public readonly tenantId: string,
    public readonly userId?: string
  ) {
    super(CreateFuelLogCommand.commandName);
  }
}

========================================
FILE: modules/fuel/commands/update-fuel-log.command.ts
========================================
// modules/fuel/commands/update-fuel-log.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export class UpdateFuelLogCommand extends BaseCommand {
  static readonly commandName = 'UpdateFuelLogCommand';

  constructor(
    public readonly fuelLogId: string,
    public readonly rawData: unknown,
    public readonly tenantId: string,
    public readonly userId?: string
  ) {
    super(UpdateFuelLogCommand.commandName);
  }
}

========================================
FILE: modules/fuel/commands/delete-fuel-log.command.ts
========================================
// modules/fuel/commands/delete-fuel-log.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export class DeleteFuelLogCommand extends BaseCommand {
  static readonly commandName = 'DeleteFuelLogCommand';

  constructor(
    public readonly fuelLogId: string,
    public readonly tenantId: string,
    public readonly userId?: string,
    public readonly soft: boolean = false
  ) {
    super(DeleteFuelLogCommand.commandName);
  }
}

========================================
FILE: modules/fuel/commands/handlers/create-fuel-log.handler.ts
========================================
// modules/fuel/commands/handlers/create-fuel-log.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { CreateFuelLogCommand } from '../create-fuel-log.command';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { fuelLogCreateSchema } from '@/shared/validations/fuel.schema';
import { FuelLog } from '@/shared/types/fuel.types';
import { ValidationError, AppError } from '@/server/errors/app.errors';
import { validateWithZod } from '@/shared/utils/validation.utils';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { ObjectId } from 'mongodb';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { FuelLoggedEvent } from '@/modules/fuel/events/FuelLoggedEvent';
import { monitoring } from '@/infrastructure/monitoring/logger';

export class CreateFuelLogHandler implements ICommandHandler<CreateFuelLogCommand, FuelLog> {
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(command: CreateFuelLogCommand): Promise<FuelLog> {
    const raw = command.rawData as Record<string, unknown>;

    const clean: Record<string, unknown> = {
      license_plate: raw.license_plate,
      date: raw.date,
      fuel_volume: typeof raw.fuel_volume === 'string' ? Number(raw.fuel_volume) : raw.fuel_volume,
      unit_id: raw.unit_id,
      cost: typeof raw.cost === 'string' ? Number(raw.cost) : raw.cost,
      odometer: raw.odometer !== undefined && raw.odometer !== '' ? Number(raw.odometer) : undefined,
      station_name: raw.station_name,
      fuel_station_id: raw.fuel_station_id,
      fuel_type: raw.fuel_type,
      notes: raw.notes,
      currency: raw.currency,
      is_full_tank: typeof raw.is_full_tank === 'string' ? raw.is_full_tank === 'true' : raw.is_full_tank,
      receipt_url: raw.receipt_url,
      payment_method: raw.payment_method || 'cash',
      fuel_card_id: raw.fuel_card_id,
      driver_id: raw.driver_id,
    };

    const payload = Object.fromEntries(
      Object.entries(clean).filter(([, v]) => v !== undefined && v !== null && v !== '')
    );

    const result = await validateWithZod(fuelLogCreateSchema, payload);
    if (!result.success || !result.data) {
      const fieldErrors = result.errors || {};
      const messages = Object.entries(fieldErrors)
        .map(([field, errs]) => `${field}: ${errs.join(', ')}`)
        .join('; ');
      throw new ValidationError(messages || 'Validation failed', fieldErrors);
    }

    const validated = result.data;
    const db = await connectToDatabase();

    const vehicle = await db.collection('tblvehicles').findOne({
      license_plate: String(validated.license_plate).toUpperCase(),
      isDeleted: { $ne: true },
    });
    if (!vehicle) {
      throw new AppError(`Vehicle "${validated.license_plate}" not found`, 'VEHICLE_NOT_FOUND', 400);
    }

    const unit = await db.collection('tblunits').findOne({ unit_id: validated.unit_id });
    if (!unit) {
      throw new AppError(`Unit "${validated.unit_id}" not found`, 'UNIT_NOT_FOUND', 400);
    }

    if (validated.fuel_station_id) {
      // FIX: fuel_station_id arrives as a string from validation, but
      // tblfuelstations._id is a real ObjectId. The raw driver never
      // auto-casts, so this lookup previously always missed for a
      // genuinely registered station -- every create with a station
      // selected from the dropdown incorrectly 400'd as "not found".
      const stationIdStr = String(validated.fuel_station_id);
      if (!ObjectId.isValid(stationIdStr)) {
        throw new AppError('Selected fuel station was not found', 'FUEL_STATION_NOT_FOUND', 400);
      }
      const station = await db.collection('tblfuelstations').findOne({
        _id: new ObjectId(stationIdStr),
        tenantId: command.tenantId,
        isDeleted: { $ne: true },
      });
      if (!station) {
        throw new AppError('Selected fuel station was not found', 'FUEL_STATION_NOT_FOUND', 400);
      }
    }

    if (validated.payment_method === 'fuel_card' && validated.fuel_card_id) {
      // FIX: same ObjectId-vs-string mismatch as fuel_station_id above.
      const cardIdStr = String(validated.fuel_card_id);
      if (!ObjectId.isValid(cardIdStr)) {
        throw new AppError('Selected fuel card was not found', 'FUEL_CARD_NOT_FOUND', 400);
      }
      const card = await db.collection('tblfuelcards').findOne({
        _id: new ObjectId(cardIdStr),
        tenantId: command.tenantId,
        isDeleted: { $ne: true },
      });
      if (!card) {
        throw new AppError('Selected fuel card was not found', 'FUEL_CARD_NOT_FOUND', 400);
      }
      if (card.status !== 'active') {
        throw new AppError('Selected fuel card is not active', 'FUEL_CARD_INACTIVE', 400);
      }
    }

    const fuelData: Omit<FuelLog, '_id' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt'> = {
      tenantId: command.tenantId,
      license_plate: String(validated.license_plate).toUpperCase(),
      date: new Date(validated.date as unknown as string),
      fuel_volume: Number(validated.fuel_volume),
      unit_id: String(validated.unit_id),
      cost: Number(validated.cost),
      payment_method: validated.payment_method,
      ...((vehicle as { orgUnitId?: string }).orgUnitId && {
        orgUnitId: (vehicle as { orgUnitId?: string }).orgUnitId,
      }),
      ...(validated.odometer != null ? { odometer: Number(validated.odometer) } : undefined),
      ...(validated.station_name ? { station_name: String(validated.station_name) } : undefined),
      ...(validated.fuel_station_id ? { fuel_station_id: String(validated.fuel_station_id) } : undefined),
      ...(validated.fuel_type ? { fuel_type: String(validated.fuel_type) } : undefined),
      ...(validated.notes ? { notes: String(validated.notes) } : undefined),
      ...(validated.currency ? { currency: String(validated.currency) } : undefined),
      ...(validated.is_full_tank !== undefined && validated.is_full_tank !== null
        ? { is_full_tank: Boolean(validated.is_full_tank) }
        : undefined),
      ...(validated.receipt_url ? { receipt_url: String(validated.receipt_url) } : undefined),
      ...(validated.fuel_card_id ? { fuel_card_id: String(validated.fuel_card_id) } : undefined),
      ...((validated as Record<string, unknown>).driver_id
        ? { driver_id: String((validated as Record<string, unknown>).driver_id) }
        : undefined),
    };

    const created = await this.fuelRepo.create(fuelData, command.tenantId, command.userId);

    // FIX (ðŸ”´ critical): this is a side-effect (AI insights, webhooks,
    // notifications, analytics, digital-twin projection, etc.) that fires
    // AFTER the fuel log has already been durably written above. It must
    // never be able to fail the create operation itself. The event bus
    // (InMemoryEventBus.publish) has also been hardened so it can no
    // longer reject, but this try/catch is kept as defense-in-depth so
    // this handler's correctness never depends on the bus implementation
    // staying that way.
    try {
      const eventBus = EventBusFactory.getInstance();
      await eventBus.publish(
        new FuelLoggedEvent(created, {
          tenantId: command.tenantId,
          userId: command.userId,
          correlationId: command.commandName,
        })
      );
    } catch (eventError) {
      monitoring.logError('FUEL_LOGGED event publish failed (non-fatal)', eventError as Error, {
        fuelLogId: created._id,
        tenantId: command.tenantId,
      });
    }

    return created;
  }
}

========================================
FILE: modules/fuel/commands/handlers/update-fuel-log.handler.ts
========================================
/* eslint-disable @typescript-eslint/no-unused-vars */
// modules/fuel/commands/handlers/update-fuel-log.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { UpdateFuelLogCommand } from '../update-fuel-log.command';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { fuelLogUpdateSchema } from '@/shared/validations/fuel.schema';
import { FuelLog } from '@/shared/types/fuel.types';
import { NotFoundError, ValidationError, AppError } from '@/server/errors/app.errors';
import { validateWithZod } from '@/shared/utils/validation.utils';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { ObjectId } from 'mongodb';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { FuelLogUpdatedEvent } from '@/modules/fuel/events/FuelLogUpdatedEvent';

const UPDATABLE_FIELDS = [
  'license_plate',
  'date',
  'fuel_volume',
  'unit_id',
  'cost',
  'odometer',
  'notes',
  'station_name',
  'fuel_station_id',
  'fuel_type',
  'currency',
  'is_full_tank',
  'receipt_url',
  'payment_method',
  'fuel_card_id',
  // FIX: driver_id was missing from this list entirely -- a fuel log's
  // driver could be set at creation but never corrected, cleared, or
  // reassigned via update. Any log created with the wrong (or no)
  // driver stayed that way permanently.
  'driver_id',
] as const;

export class UpdateFuelLogHandler implements ICommandHandler<UpdateFuelLogCommand, FuelLog> {
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(command: UpdateFuelLogCommand): Promise<FuelLog> {
    const raw = command.rawData as Record<string, unknown>;
    const clean: Record<string, unknown> = { _id: command.fuelLogId };

    for (const field of UPDATABLE_FIELDS) {
      if (raw[field] !== undefined && raw[field] !== '') {
        clean[field] = raw[field];
      }
    }

    const result = await validateWithZod(fuelLogUpdateSchema, clean);
    if (!result.success || !result.data) {
      const fieldErrors = result.errors || {};
      const messages = Object.entries(fieldErrors)
        .map(([field, errs]) => `${field}: ${errs.join(', ')}`)
        .join('; ');
      throw new ValidationError(messages || 'Validation failed', fieldErrors);
    }

    const { _id, ...updateData } = result.data as Record<string, unknown>;
    const db = await connectToDatabase();

    if (updateData.license_plate) {
      const vehicle = await db.collection('tblvehicles').findOne({
        license_plate: String(updateData.license_plate).toUpperCase(),
        isDeleted: { $ne: true },
      });
      if (!vehicle) {
        throw new AppError(`Vehicle "${updateData.license_plate}" not found`, 'VEHICLE_NOT_FOUND', 400);
      }
      updateData.license_plate = String(updateData.license_plate).toUpperCase();
      updateData.orgUnitId = (vehicle as { orgUnitId?: string }).orgUnitId ?? null;
    }

    if (updateData.unit_id) {
      const unit = await db.collection('tblunits').findOne({ unit_id: updateData.unit_id });
      if (!unit) {
        throw new AppError(`Unit "${updateData.unit_id}" not found`, 'UNIT_NOT_FOUND', 400);
      }
    }

    if (updateData.fuel_station_id) {
      // FIX: same ObjectId-vs-string mismatch as the create handler --
      // tblfuelstations._id is an ObjectId, updateData.fuel_station_id
      // is a string, and the raw MongoDB driver does not auto-cast.
      const stationIdStr = String(updateData.fuel_station_id);
      if (!ObjectId.isValid(stationIdStr)) {
        throw new AppError('Selected fuel station was not found', 'FUEL_STATION_NOT_FOUND', 400);
      }
      const station = await db.collection('tblfuelstations').findOne({
        _id: new ObjectId(stationIdStr),
        tenantId: command.tenantId,
        isDeleted: { $ne: true },
      });
      if (!station) {
        throw new AppError('Selected fuel station was not found', 'FUEL_STATION_NOT_FOUND', 400);
      }
    }

    if (updateData.payment_method === 'fuel_card' && updateData.fuel_card_id) {
      // FIX: same ObjectId-vs-string mismatch.
      const cardIdStr = String(updateData.fuel_card_id);
      if (!ObjectId.isValid(cardIdStr)) {
        throw new AppError('Selected fuel card was not found', 'FUEL_CARD_NOT_FOUND', 400);
      }
      const card = await db.collection('tblfuelcards').findOne({
        _id: new ObjectId(cardIdStr),
        tenantId: command.tenantId,
        isDeleted: { $ne: true },
      });
      if (!card) {
        throw new AppError('Selected fuel card was not found', 'FUEL_CARD_NOT_FOUND', 400);
      }
      if (card.status !== 'active') {
        throw new AppError('Selected fuel card is not active', 'FUEL_CARD_INACTIVE', 400);
      }
    }

    const updated = await this.fuelRepo.update(
      command.fuelLogId,
      updateData as Partial<Omit<FuelLog, '_id' | 'tenantId' | 'createdAt' | 'createdBy'>>,
      command.tenantId,
      command.userId
    );

    if (!updated) {
      throw new NotFoundError('Fuel log not found');
    }

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(
      new FuelLogUpdatedEvent(updated, updateData, {
        tenantId: command.tenantId,
        userId: command.userId,
        correlationId: command.commandName,
      })
    );

    return updated;
  }
}

========================================
FILE: modules/fuel/commands/handlers/delete-fuel-log.handler.ts
========================================
// modules/fuel/commands/handlers/delete-fuel-log.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { DeleteFuelLogCommand } from '../delete-fuel-log.command';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { NotFoundError } from '@/server/errors/app.errors';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { FuelLogDeletedEvent } from '@/modules/fuel/events/FuelLogDeletedEvent';

export class DeleteFuelLogHandler
  implements ICommandHandler<DeleteFuelLogCommand, void>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(command: DeleteFuelLogCommand): Promise<void> {
    const existing = await this.fuelRepo.findById(
      command.fuelLogId,
      command.tenantId
    );
    if (!existing) {
      throw new NotFoundError('Fuel log not found');
    }

    if (command.soft) {
      await this.fuelRepo.softDelete(
        command.fuelLogId,
        command.tenantId,
        command.userId
      );
    } else {
      await this.fuelRepo.hardDelete(command.fuelLogId, command.tenantId);
    }

    // Emit event
    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new FuelLogDeletedEvent(
      command.fuelLogId,
      existing.license_plate,
      existing.fuel_volume,
      command.tenantId,
      {
        userId: command.userId,
        correlationId: command.commandName,
        soft: command.soft,
      }
    ));
  }
}

========================================
FILE: modules/fuel/events/FuelLoggedEvent.ts
========================================
// modules/fuel/events/FuelLoggedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { FUEL_LOGGED } from '@/server/events/event-names';
import { FuelLog } from '@/shared/types/fuel.types';

export class FuelLoggedEvent extends DomainEvent {
  constructor(fuelLog: FuelLog, metadata?: Record<string, unknown>) {
    super(FUEL_LOGGED, {
      entityId: fuelLog._id,
      entityType: 'fuel_log',
      license_plate: fuelLog.license_plate,
      fuel_volume: fuelLog.fuel_volume,
      cost: fuelLog.cost,
      odometer: fuelLog.odometer,
      tenantId: fuelLog.tenantId,
    }, metadata);
  }
}

========================================
FILE: modules/fuel/events/FuelLogUpdatedEvent.ts
========================================
// modules/fuel/events/FuelLogUpdatedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { FUEL_LOG_UPDATED } from '@/server/events/event-names';
import { FuelLog } from '@/shared/types/fuel.types';

export class FuelLogUpdatedEvent extends DomainEvent {
  constructor(
    fuelLog: FuelLog,
    changes: Partial<FuelLog>,
    metadata?: Record<string, unknown>,
  ) {
    super(FUEL_LOG_UPDATED, {
      entityId: fuelLog._id,
      entityType: 'fuel_log',
      license_plate: fuelLog.license_plate,
      fuel_volume: fuelLog.fuel_volume,
      changes,
      tenantId: fuelLog.tenantId,
    }, metadata);
  }
}

========================================
FILE: modules/fuel/events/FuelLogDeletedEvent.ts
========================================
// modules/fuel/events/FuelLogDeletedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { FUEL_LOG_DELETED } from '@/server/events/event-names';

export class FuelLogDeletedEvent extends DomainEvent {
  constructor(
    fuelLogId: string,
    licensePlate: string,
    fuelVolume: number,
    tenantId: string,
    metadata?: Record<string, unknown>,
  ) {
    super(FUEL_LOG_DELETED, {
      entityId: fuelLogId,
      entityType: 'fuel_log',
      license_plate: licensePlate,
      fuel_volume: fuelVolume,
      tenantId,
    }, metadata);
  }
}

========================================
FILE: modules/fuel/queries/get-fuel-logs.query.ts
========================================
// modules/fuel/queries/get-fuel-logs.query.ts

import { BaseQuery } from '@/server/cqrs/query';
import { FuelFilters } from '@/shared/types/fuel.types';
import { PaginationParams } from '@/shared/types/common.types';

export class GetFuelLogsQuery extends BaseQuery {
  static readonly queryName = 'GetFuelLogsQuery';

  constructor(
    public readonly filters: FuelFilters,
    public readonly pagination: PaginationParams,
    public readonly tenantId: string
  ) {
    super(GetFuelLogsQuery.queryName);
  }
}

========================================
FILE: modules/fuel/queries/get-fuel-log-by-id.query.ts
========================================
// modules/fuel/queries/get-fuel-log-by-id.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetFuelLogByIdQuery extends BaseQuery {
  static readonly queryName = 'GetFuelLogByIdQuery';

  constructor(
    public readonly fuelLogId: string,
    public readonly tenantId: string
  ) {
    super(GetFuelLogByIdQuery.queryName);
  }
}

========================================
FILE: modules/fuel/queries/get-fuel-kpis.query.ts
========================================
// modules/fuel/queries/get-fuel-kpis.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetFuelKpisQuery extends BaseQuery {
  static readonly queryName = 'GetFuelKpisQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date }
  ) {
    super(GetFuelKpisQuery.queryName);
  }
}

========================================
FILE: modules/fuel/queries/get-fuel-stats.query.ts
========================================
// modules/fuel/queries/get-fuel-stats.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetFuelStatsQuery extends BaseQuery {
  static readonly queryName = 'GetFuelStatsQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date }
  ) {
    super(GetFuelStatsQuery.queryName);
  }
}

========================================
FILE: modules/fuel/queries/get-monthly-fuel-consumption.query.ts
========================================
// modules/fuel/queries/get-monthly-fuel-consumption.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetMonthlyFuelConsumptionQuery extends BaseQuery {
  static readonly queryName = 'GetMonthlyFuelConsumptionQuery';

  constructor(
    public readonly tenantId: string,
    public readonly months: number = 12
  ) {
    super(GetMonthlyFuelConsumptionQuery.queryName);
  }
}

========================================
FILE: modules/fuel/queries/get-fuel-activity-trend.query.ts
========================================
//modules/fuel/queries/get-fuel-activity-trend.query.ts

import { BaseQuery } from '@/server/cqrs/query';
import { FuelTrendGranularity } from '@/shared/types/fuel.types';

export class GetFuelActivityTrendQuery extends BaseQuery {
  static readonly queryName = 'GetFuelActivityTrendQuery';

  constructor(
    public readonly tenantId: string,
    public readonly granularity: FuelTrendGranularity,
    public readonly dateRange?: { startDate?: Date; endDate?: Date }
  ) {
    super(GetFuelActivityTrendQuery.queryName);
  }
}

========================================
FILE: modules/fuel/queries/get-fuel-by-driver.query.ts
========================================
// modules/fuel/queries/get-fuel-by-driver.query.ts
//
// FIX: added `sortBy` so this one pipeline can serve both the dashboard's
// existing "Fuel Consumption by Driver" widget (volume-ranked) and the new
// enterprise "Fuel Cost by Driver" chart (cost-ranked) without a duplicate
// query/handler pair. Defaults to 'volume' so every existing caller is
// unaffected.

import { BaseQuery } from '@/server/cqrs/query';

export type FuelByDriverSort = 'volume' | 'cost';

export class GetFuelByDriverQuery extends BaseQuery {
  static readonly queryName = 'GetFuelByDriverQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly limit: number = 10,
    public readonly sortBy: FuelByDriverSort = 'volume'
  ) {
    super(GetFuelByDriverQuery.queryName);
  }
}

========================================
FILE: modules/fuel/queries/get-fuel-by-station.query.ts
========================================
//modules/fuel/queries/get-fuel-by-station.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetFuelByStationQuery extends BaseQuery {
  static readonly queryName = 'GetFuelByStationQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly limit: number = 15
  ) {
    super(GetFuelByStationQuery.queryName);
  }
}

========================================
FILE: modules/fuel/queries/get-fuel-cost-distribution.query.ts
========================================
//modules/fuel/queries/get-fuel-cost-distribution.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetFuelCostDistributionQuery extends BaseQuery {
  static readonly queryName = 'GetFuelCostDistributionQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date }
  ) {
    super(GetFuelCostDistributionQuery.queryName);
  }
}

========================================
FILE: modules/fuel/queries/get-fuel-entry-heatmap.query.ts
========================================
//modules/fuel/queries/get-fuel-entry-heatmap.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetFuelEntryHeatmapQuery extends BaseQuery {
  static readonly queryName = 'GetFuelEntryHeatmapQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date }
  ) {
    super(GetFuelEntryHeatmapQuery.queryName);
  }
}

========================================
FILE: modules/fuel/queries/get-fuel-type-distribution.query.ts
========================================
import { BaseQuery } from '@/server/cqrs/query';

export class GetFuelTypeDistributionQuery extends BaseQuery {
  static readonly queryName = 'GetFuelTypeDistributionQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date }
  ) {
    super(GetFuelTypeDistributionQuery.queryName);
  }
}

========================================
FILE: modules/fuel/queries/get-fueling-frequency-by-vehicle.query.ts
========================================
//modules/fuel/queries/get-fueling-frequency-by-vehicle.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetFuelingFrequencyByVehicleQuery extends BaseQuery {
  static readonly queryName = 'GetFuelingFrequencyByVehicleQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly limit: number = 20
  ) {
    super(GetFuelingFrequencyByVehicleQuery.queryName);
  }
}

========================================
FILE: modules/fuel/queries/get-top-fuel-consumers.query.ts
========================================
// modules/fuel/queries/get-top-fuel-consumers.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetTopFuelConsumersQuery extends BaseQuery {
  static readonly queryName = 'GetTopFuelConsumersQuery';

  constructor(
    public readonly tenantId: string,
    public readonly limit: number = 5
  ) {
    super(GetTopFuelConsumersQuery.queryName);
  }
}

========================================
FILE: modules/fuel/queries/get-vehicle-fuel-timeline.query.ts
========================================
//FILE: modules/fuel/queries/get-vehicle-fuel-timeline.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export interface VehicleFuelTimelineFilters {
  license_plate?: string;
  startDate?: Date;
  endDate?: Date;
}

export class GetVehicleFuelTimelineQuery extends BaseQuery {
  static readonly queryName = 'GetVehicleFuelTimelineQuery';

  constructor(
    public readonly tenantId: string,
    public readonly filters: VehicleFuelTimelineFilters
  ) {
    super(GetVehicleFuelTimelineQuery.queryName);
  }
}

========================================
FILE: modules/fuel/queries/get-abnormal-fuel-consumption.query.ts
========================================
// modules/fuel/queries/get-abnormal-fuel-consumption.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetAbnormalFuelConsumptionQuery extends BaseQuery {
  static readonly queryName = 'GetAbnormalFuelConsumptionQuery';

  constructor(
    public readonly tenantId: string,
    public readonly threshold: number = 2
  ) {
    super(GetAbnormalFuelConsumptionQuery.queryName);
  }
}

========================================
FILE: modules/fuel/queries/get-average-fuel-price-trend.query.ts
========================================
//modules/fuel/queries/get-average-fuel-price-trend.query.ts

import { BaseQuery } from '@/server/cqrs/query';
import { FuelTrendGranularity } from '@/shared/types/fuel.types';

export class GetAverageFuelPriceTrendQuery extends BaseQuery {
  static readonly queryName = 'GetAverageFuelPriceTrendQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly granularity: FuelTrendGranularity = 'month'
  ) {
    super(GetAverageFuelPriceTrendQuery.queryName);
  }
}

========================================
FILE: modules/fuel/queries/handlers/get-fuel-logs.handler.ts
========================================
// modules/fuel/queries/handlers/get-fuel-logs.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetFuelLogsQuery } from '../get-fuel-logs.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { FuelLog } from '@/shared/types/fuel.types';
import { PaginatedResponse } from '@/shared/types/common.types';

export class GetFuelLogsHandler
  implements IQueryHandler<GetFuelLogsQuery, PaginatedResponse<FuelLog>>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(query: GetFuelLogsQuery): Promise<PaginatedResponse<FuelLog>> {
    return this.fuelRepo.getFilteredLogs(
      query.filters,
      query.tenantId,
      query.pagination
    );
  }
}

========================================
FILE: modules/fuel/queries/handlers/get-fuel-log-by-id.handler.ts
========================================
// modules/fuel/queries/handlers/get-fuel-log-by-id.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetFuelLogByIdQuery } from '../get-fuel-log-by-id.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { FuelLog } from '@/shared/types/fuel.types';
import { NotFoundError } from '@/server/errors/app.errors';

export class GetFuelLogByIdHandler
  implements IQueryHandler<GetFuelLogByIdQuery, FuelLog>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(query: GetFuelLogByIdQuery): Promise<FuelLog> {
    const log = await this.fuelRepo.findById(query.fuelLogId, query.tenantId);
    if (!log) {
      throw new NotFoundError('Fuel log not found');
    }
    return log;
  }
}

========================================
FILE: modules/fuel/queries/handlers/get-fuel-kpis.handler.ts
========================================
// modules/fuel/queries/handlers/get-fuel-kpis.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetFuelKpisQuery } from '../get-fuel-kpis.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { FuelKpis } from '@/shared/types/fuel.types';

export class GetFuelKpisHandler implements IQueryHandler<GetFuelKpisQuery, FuelKpis> {
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(query: GetFuelKpisQuery): Promise<FuelKpis> {
    return this.fuelRepo.getFuelKpis(query.tenantId, query.dateRange);
  }
}


========================================
FILE: modules/fuel/queries/handlers/get-fuel-stats.handler.ts
========================================
// modules/fuel/queries/handlers/get-fuel-stats.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetFuelStatsQuery } from '../get-fuel-stats.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { FuelStats } from '@/shared/types/fuel.types';

export class GetFuelStatsHandler
  implements IQueryHandler<GetFuelStatsQuery, FuelStats>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(query: GetFuelStatsQuery): Promise<FuelStats> {
    return this.fuelRepo.getFuelStats(query.tenantId, query.dateRange);
  }
}

========================================
FILE: modules/fuel/queries/handlers/get-monthly-fuel-consumption.handler.ts
========================================
// modules/fuel/queries/handlers/get-monthly-fuel-consumption.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetMonthlyFuelConsumptionQuery } from '../get-monthly-fuel-consumption.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';

export class GetMonthlyFuelConsumptionHandler
  implements IQueryHandler<GetMonthlyFuelConsumptionQuery, Array<{ month: string; fuel: number; cost: number }>>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(
    query: GetMonthlyFuelConsumptionQuery
  ): Promise<Array<{ month: string; fuel: number; cost: number }>> {
    return this.fuelRepo.getMonthlyFuelConsumption(query.tenantId, query.months);
  }
}

========================================
FILE: modules/fuel/queries/handlers/get-fuel-activity-trend.handler.ts
========================================
//modules/fuel/queries/handlers/get-fuel-activity-trend.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetFuelActivityTrendQuery } from '../get-fuel-activity-trend.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { FuelActivityTrendPoint } from '@/shared/types/fuel.types';

export class GetFuelActivityTrendHandler
  implements IQueryHandler<GetFuelActivityTrendQuery, FuelActivityTrendPoint[]>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(query: GetFuelActivityTrendQuery): Promise<FuelActivityTrendPoint[]> {
    return this.fuelRepo.getFuelActivityTrend(query.tenantId, query.granularity, query.dateRange);
  }
}

========================================
FILE: modules/fuel/queries/handlers/get-fuel-by-driver.handler.ts
========================================
// modules/fuel/queries/handlers/get-fuel-by-driver.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetFuelByDriverQuery } from '../get-fuel-by-driver.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { DriverFuelConsumptionRow } from '@/shared/types/fuel.types';

export class GetFuelByDriverHandler
  implements IQueryHandler<GetFuelByDriverQuery, DriverFuelConsumptionRow[]>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(query: GetFuelByDriverQuery): Promise<DriverFuelConsumptionRow[]> {
    return this.fuelRepo.getFuelByDriver(query.tenantId, query.dateRange, query.limit, query.sortBy);
  }
}

========================================
FILE: modules/fuel/queries/handlers/get-fuel-by-station.handler.ts
========================================
//modules/fuel/queries/handlers/get-fuel-by-station.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetFuelByStationQuery } from '../get-fuel-by-station.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { FuelByStationRow } from '@/shared/types/fuel.types';

export class GetFuelByStationHandler implements IQueryHandler<GetFuelByStationQuery, FuelByStationRow[]> {
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(query: GetFuelByStationQuery): Promise<FuelByStationRow[]> {
    return this.fuelRepo.getFuelByStation(query.tenantId, query.dateRange, query.limit);
  }
}

========================================
FILE: modules/fuel/queries/handlers/get-fuel-cost-distribution.handler.ts
========================================
//modules/fuel/queries/handlers/get-fuel-cost-distribution.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetFuelCostDistributionQuery } from '../get-fuel-cost-distribution.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { FuelCostDistributionBucket } from '@/shared/types/fuel.types';

export class GetFuelCostDistributionHandler
  implements IQueryHandler<GetFuelCostDistributionQuery, FuelCostDistributionBucket[]>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(query: GetFuelCostDistributionQuery): Promise<FuelCostDistributionBucket[]> {
    return this.fuelRepo.getFuelCostDistribution(query.tenantId, query.dateRange);
  }
}

========================================
FILE: modules/fuel/queries/handlers/get-fuel-entry-heatmap.handler.ts
========================================
//modules/fuel/queries/handlers/get-fuel-entry-heatmap.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetFuelEntryHeatmapQuery } from '../get-fuel-entry-heatmap.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { FuelHeatmapCell } from '@/shared/types/fuel.types';

export class GetFuelEntryHeatmapHandler
  implements IQueryHandler<GetFuelEntryHeatmapQuery, FuelHeatmapCell[]>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(query: GetFuelEntryHeatmapQuery): Promise<FuelHeatmapCell[]> {
    return this.fuelRepo.getFuelEntryHeatmap(query.tenantId, query.dateRange);
  }
}

========================================
FILE: modules/fuel/queries/handlers/get-fuel-type-distribution.handler.ts
========================================
//modules/fuel/queries/handlers/get-fuel-type-distribution.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetFuelTypeDistributionQuery } from '../get-fuel-type-distribution.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { FuelTypeDistributionRow } from '@/shared/types/fuel.types';

export class GetFuelTypeDistributionHandler
  implements IQueryHandler<GetFuelTypeDistributionQuery, FuelTypeDistributionRow[]>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(query: GetFuelTypeDistributionQuery): Promise<FuelTypeDistributionRow[]> {
    return this.fuelRepo.getFuelTypeDistribution(query.tenantId, query.dateRange);
  }
}

========================================
FILE: modules/fuel/queries/handlers/get-fueling-frequency-by-vehicle.handler.ts
========================================
//modules/fuel/queries/handlers/get-fueling-frequency-by-vehicle.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetFuelingFrequencyByVehicleQuery } from '../get-fueling-frequency-by-vehicle.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { FuelFrequencyByVehicleRow } from '@/shared/types/fuel.types';

export class GetFuelingFrequencyByVehicleHandler
  implements IQueryHandler<GetFuelingFrequencyByVehicleQuery, FuelFrequencyByVehicleRow[]>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(query: GetFuelingFrequencyByVehicleQuery): Promise<FuelFrequencyByVehicleRow[]> {
    return this.fuelRepo.getFuelingFrequencyByVehicle(query.tenantId, query.dateRange, query.limit);
  }
}

========================================
FILE: modules/fuel/queries/handlers/get-top-fuel-consumers.handler.ts
========================================
// modules/fuel/queries/handlers/get-top-fuel-consumers.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetTopFuelConsumersQuery } from '../get-top-fuel-consumers.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';

export class GetTopFuelConsumersHandler
  implements IQueryHandler<GetTopFuelConsumersQuery, Array<{ license_plate: string; totalFuel: number; totalCost: number }>>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(
    query: GetTopFuelConsumersQuery
  ): Promise<Array<{ license_plate: string; totalFuel: number; totalCost: number }>> {
    return this.fuelRepo.getTopFuelConsumers(query.tenantId, query.limit);
  }
}

========================================
FILE: modules/fuel/queries/handlers/get-vehicle-fuel-timeline.handler.ts
========================================
//modules/fuel/queries/handlers/get-vehicle-fuel-timeline.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetVehicleFuelTimelineQuery } from '../get-vehicle-fuel-timeline.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { VehicleFuelTimelinePoint } from '@/shared/types/fuel.types';

export class GetVehicleFuelTimelineHandler
  implements IQueryHandler<GetVehicleFuelTimelineQuery, VehicleFuelTimelinePoint[]>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(query: GetVehicleFuelTimelineQuery): Promise<VehicleFuelTimelinePoint[]> {
    return this.fuelRepo.getVehicleFuelTimeline(query.tenantId, query.filters);
  }
}

========================================
FILE: modules/fuel/queries/handlers/get-abnormal-fuel-consumption.handler.ts
========================================

// modules/fuel/queries/handlers/get-abnormal-fuel-consumption.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetAbnormalFuelConsumptionQuery } from '../get-abnormal-fuel-consumption.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { AbnormalFuelConsumptionRow } from '@/shared/types/fuel.types';

export class GetAbnormalFuelConsumptionHandler
  implements IQueryHandler<GetAbnormalFuelConsumptionQuery, AbnormalFuelConsumptionRow[]>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(query: GetAbnormalFuelConsumptionQuery): Promise<AbnormalFuelConsumptionRow[]> {
    return this.fuelRepo.getAbnormalConsumption(query.tenantId, query.threshold);
  }
}

========================================
FILE: modules/fuel/queries/handlers/get-average-fuel-price-trend.handler.ts
========================================
//modules/fuel/queries/handlers/get-average-fuel-price-trend.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetAverageFuelPriceTrendQuery } from '../get-average-fuel-price-trend.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { FuelPriceTrendPoint } from '@/shared/types/fuel.types';

export class GetAverageFuelPriceTrendHandler
  implements IQueryHandler<GetAverageFuelPriceTrendQuery, FuelPriceTrendPoint[]>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(query: GetAverageFuelPriceTrendQuery): Promise<FuelPriceTrendPoint[]> {
    return this.fuelRepo.getAverageFuelPriceTrend(query.tenantId, query.dateRange, query.granularity);
  }
}

========================================
FILE: modules/expenses/api/expenses.api.ts
========================================
// modules/expenses/api/expenses.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import {
  Expense,
  ExpenseCreateDTO,
  ExpenseUpdateDTO,
  ExpenseFilters,
  ExpenseStats,
} from '@/shared/types/expense.types';
import { PaginatedResponse, DateRange } from '@/shared/types/common.types';

const BASE_URL = '/expenses';

export const expensesApi = {
  async getExpenses(
    filters: ExpenseFilters = {},
    page: number = 1,
    limit: number = 10
  ): Promise<PaginatedResponse<Expense>> {
    const params: Record<string, string | number | boolean | undefined> = {
      page,
      limit,
      ...(filters.license_plate && {
        license_plate: filters.license_plate,
      }),
      ...(filters.type && { type: filters.type }),
      ...(filters.startDate && {
        startDate: filters.startDate.toISOString(),
      }),
      ...(filters.endDate && { endDate: filters.endDate.toISOString() }),
      ...(filters.minAmount !== undefined && {
        minAmount: filters.minAmount,
      }),
      ...(filters.maxAmount !== undefined && {
        maxAmount: filters.maxAmount,
      }),
    };

    return apiClient.get<PaginatedResponse<Expense>>(BASE_URL, { params });
  },

  async getExpenseById(id: string): Promise<Expense> {
    return apiClient.get<Expense>(BASE_URL, { params: { id } });
  },

  async getExpenseStats(dateRange?: DateRange): Promise<ExpenseStats> {
    const params: Record<string, string | undefined> = {};
    if (dateRange?.startDate)
      params.startDate = dateRange.startDate.toISOString();
    if (dateRange?.endDate)
      params.endDate = dateRange.endDate.toISOString();

    return apiClient.get<ExpenseStats>(BASE_URL, {
      params: { action: 'stats', ...params },
    });
  },

  async getMonthlyTrends(
    months: number = 12
  ): Promise<Array<{ month: string; total: number }>> {
    return apiClient.get<Array<{ month: string; total: number }>>(
      BASE_URL,
      { params: { action: 'monthly', months } }
    );
  },

  async getExpenseAnalytics(
    startDate: Date,
    endDate: Date
  ): Promise<any[]> {
    return apiClient.get<any[]>(BASE_URL, {
      params: {
        action: 'analytics',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    });
  },

  async getExpenseTypes(): Promise<Array<{ _id: string; name: string; category: string }>> {
    return apiClient.get<Array<{ _id: string; name: string; category: string }>>(
      '/expense-types'
    );
  },

  async createExpense(data: ExpenseCreateDTO): Promise<Expense> {
    return apiClient.post<Expense>(BASE_URL, data);
  },

  async updateExpense(
    id: string,
    data: ExpenseUpdateDTO
  ): Promise<Expense> {
    return apiClient.put<Expense>(BASE_URL, data, { params: { id } });
  },

  async deleteExpense(id: string): Promise<void> {
    await apiClient.delete<void>(BASE_URL, { params: { id } });
  },

  async createExpenseType(data: {
    name: string;
    category: string;
    description?: string;
  }): Promise<{ _id: string; name: string }> {
    return apiClient.post<{ _id: string; name: string }>(
      '/expense-types',
      data
    );
  },
};

export default expensesApi;

========================================
FILE: modules/expenses/cqrs.register.ts
========================================
// modules/expenses/cqrs.register.ts

import { CommandBus } from '@/server/cqrs/command-bus';
import { QueryBus } from '@/server/cqrs/query-bus';
import { expenseRepository } from './repositories/expense.repository';

import { CreateExpenseCommand } from './commands/create-expense.command';
import { UpdateExpenseCommand } from './commands/update-expense.command';
import { DeleteExpenseCommand } from './commands/delete-expense.command';
import { BulkImportExpensesCommand } from './commands/bulk-import-expenses.command';
import { ImportExpensesCommand } from './commands/import-expenses.command';

import { CreateExpenseHandler } from './commands/handlers/create-expense.handler';
import { UpdateExpenseHandler } from './commands/handlers/update-expense.handler';
import { DeleteExpenseHandler } from './commands/handlers/delete-expense.handler';
import { BulkImportExpensesHandler } from './commands/handlers/bulk-import-expenses.handler';
import { ImportExpensesHandler } from './commands/handlers/import-expenses.handler';

import { GetExpensesQuery } from './queries/get-expenses.query';
import { GetExpenseByIdQuery } from './queries/get-expense-by-id.query';
import { GetExpenseStatsQuery } from './queries/get-expense-stats.query';
import { GetMonthlyTrendsQuery } from './queries/get-monthly-trends.query';
import { GetExpenseAnalyticsQuery } from './queries/get-expense-analytics.query';
import { GetExpenseCategoryOverTimeQuery } from './queries/get-expense-category-over-time.query';
import { GetTopVehiclesByExpenseQuery } from './queries/get-top-vehicles-by-expense.query';
import { GetVehicleExpenseBreakdownQuery } from './queries/get-vehicle-expense-breakdown.query';
import { GetExpenseAmountDistributionQuery } from './queries/get-expense-amount-distribution.query';
import { GetJobTripExpenseQuery } from './queries/get-job-trip-expense.query';
import { GetExpenseCategorySummaryQuery } from './queries/get-expense-category-summary.query';
import { GetTopExpenseTransactionsQuery } from './queries/get-top-expense-transactions.query';
import { GetDailyExpenseTotalsQuery } from './queries/get-daily-expense-totals.query';
import { GetExpenseOutliersQuery } from './queries/get-expense-outliers.query';

import { GetExpensesHandler } from './queries/handlers/get-expenses.handler';
import { GetExpenseByIdHandler } from './queries/handlers/get-expense-by-id.handler';
import { GetExpenseStatsHandler } from './queries/handlers/get-expense-stats.handler';
import { GetMonthlyTrendsHandler } from './queries/handlers/get-monthly-trends.handler';
import { GetExpenseAnalyticsHandler } from './queries/handlers/get-expense-analytics.handler';
import { GetExpenseCategoryOverTimeHandler } from './queries/handlers/get-expense-category-over-time.handler';
import { GetTopVehiclesByExpenseHandler } from './queries/handlers/get-top-vehicles-by-expense.handler';
import { GetVehicleExpenseBreakdownHandler } from './queries/handlers/get-vehicle-expense-breakdown.handler';
import { GetExpenseAmountDistributionHandler } from './queries/handlers/get-expense-amount-distribution.handler';
import { GetJobTripExpenseHandler } from './queries/handlers/get-job-trip-expense.handler';
import { GetExpenseCategorySummaryHandler } from './queries/handlers/get-expense-category-summary.handler';
import { GetTopExpenseTransactionsHandler } from './queries/handlers/get-top-expense-transactions.handler';
import { GetDailyExpenseTotalsHandler } from './queries/handlers/get-daily-expense-totals.handler';
import { GetExpenseOutliersHandler } from './queries/handlers/get-expense-outliers.handler';

export function registerExpenseCqrsHandlers(commandBus: CommandBus, queryBus: QueryBus): void {
  commandBus.register(CreateExpenseCommand, new CreateExpenseHandler(expenseRepository));
  commandBus.register(UpdateExpenseCommand, new UpdateExpenseHandler(expenseRepository));
  commandBus.register(DeleteExpenseCommand, new DeleteExpenseHandler(expenseRepository));
  commandBus.register(BulkImportExpensesCommand, new BulkImportExpensesHandler(expenseRepository));
  commandBus.register(ImportExpensesCommand, new ImportExpensesHandler(expenseRepository));

  queryBus.register(GetExpensesQuery, new GetExpensesHandler(expenseRepository));
  queryBus.register(GetExpenseByIdQuery, new GetExpenseByIdHandler(expenseRepository));
  queryBus.register(GetExpenseStatsQuery, new GetExpenseStatsHandler(expenseRepository));
  queryBus.register(GetMonthlyTrendsQuery, new GetMonthlyTrendsHandler(expenseRepository));
  queryBus.register(GetExpenseAnalyticsQuery, new GetExpenseAnalyticsHandler(expenseRepository));
  queryBus.register(GetExpenseCategoryOverTimeQuery, new GetExpenseCategoryOverTimeHandler(expenseRepository));
  queryBus.register(GetTopVehiclesByExpenseQuery, new GetTopVehiclesByExpenseHandler(expenseRepository));
  queryBus.register(GetVehicleExpenseBreakdownQuery, new GetVehicleExpenseBreakdownHandler(expenseRepository));
  queryBus.register(GetExpenseAmountDistributionQuery, new GetExpenseAmountDistributionHandler(expenseRepository));
  queryBus.register(GetJobTripExpenseQuery, new GetJobTripExpenseHandler(expenseRepository));
  queryBus.register(GetExpenseCategorySummaryQuery, new GetExpenseCategorySummaryHandler(expenseRepository));
  queryBus.register(GetTopExpenseTransactionsQuery, new GetTopExpenseTransactionsHandler(expenseRepository));
  queryBus.register(GetDailyExpenseTotalsQuery, new GetDailyExpenseTotalsHandler(expenseRepository));
  queryBus.register(GetExpenseOutliersQuery, new GetExpenseOutliersHandler(expenseRepository));
}

========================================
FILE: modules/expenses/controllers/expense.controller.ts
========================================
// modules/expenses/controllers/expense.controller.ts

import { NextRequest } from 'next/server';
import { bootstrapCqrs } from '@/server/cqrs/cqrs.module';
import { expenseCommandService } from '../services/expense-command.service';
import { expenseQueryService } from '../services/expense-query.service';
import { ExpenseFilters } from '@/shared/types/expense.types';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import {
  successResponse,
  paginatedResponse,
  errorResponse,
  createdResponse,
} from '@/server/utils/response.utils';
import { AppError, ValidationError, UnauthorizedError, ForbiddenError, NotFoundError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';
import { getAuthContext } from '@/server/auth/auth-context';
import { tenantContextService } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import { expenseRepository } from '../repositories/expense.repository';
import { exportService, fileDownloadResponse } from '@/shared/export';
import {
  EXPENSE_EXPORT_COLUMNS,
  EXPENSE_EXPORT_SHEET_NAME,
  EXPENSE_EXPORT_BASE_FILENAME,
} from '../export/expense-export.columns';

bootstrapCqrs();

function parseDateRangeParams(req: NextRequest): { startDate?: Date; endDate?: Date } | undefined {
  const sp = req.nextUrl.searchParams;
  const start = sp.get('startDate');
  const end = sp.get('endDate');
  if (!start && !end) return undefined;
  return {
    startDate: start ? new Date(start) : undefined,
    endDate: end ? new Date(end) : undefined,
  };
}

export class ExpenseController {
  async getExpenses(req: NextRequest) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        throw new UnauthorizedError('Authentication required');
      }

      const tenantContext = await tenantContextService.resolveContext(
        authContext.userId,
        authContext.tenantId,
        authContext.roles,
        authContext.isSuperAdmin,
        authContext.orgUnitId
      );

      const searchParams = req.nextUrl.searchParams;

      const filters: ExpenseFilters = {
        license_plate: searchParams.get('license_plate') || undefined,
        type: searchParams.get('type') || undefined,
        jobTrip: searchParams.get('jobTrip') || undefined,
        startDate: searchParams.get('start') ? new Date(searchParams.get('start')!) : undefined,
        endDate: searchParams.get('end') ? new Date(searchParams.get('end')!) : undefined,
        minAmount: searchParams.get('minAmount') ? Number(searchParams.get('minAmount')) : undefined,
        maxAmount: searchParams.get('maxAmount') ? Number(searchParams.get('maxAmount')) : undefined,
      };

      const pageParam = searchParams.get('page');
      if (!pageParam) {
        const result = await expenseRepository.getFilteredExpensesInScope(filters, tenantContext, { page: 1, limit: 10000 });
        return successResponse(result.data);
      }

      const { page, limit } = validatePaginationParams(pageParam, searchParams.get('limit'));
      const result = await expenseRepository.getFilteredExpensesInScope(filters, tenantContext, { page, limit });
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Phase 2 Enterprise Export Framework: exports the COMPLETE set of
   * expenses matching the caller's current filters and authorization
   * scope, not just the page of results currently loaded in the UI
   * table. Reuses the exact same auth/tenant-context/filter parsing as
   * getExpenses above.
   */
  async exportExpenses(req: NextRequest) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        throw new UnauthorizedError('Authentication required');
      }

      const tenantContext = await tenantContextService.resolveContext(
        authContext.userId,
        authContext.tenantId,
        authContext.roles,
        authContext.isSuperAdmin,
        authContext.orgUnitId
      );

      const searchParams = req.nextUrl.searchParams;

      const filters: ExpenseFilters = {
        license_plate: searchParams.get('license_plate') || undefined,
        type: searchParams.get('type') || undefined,
        jobTrip: searchParams.get('jobTrip') || undefined,
        startDate: searchParams.get('start') ? new Date(searchParams.get('start')!) : undefined,
        endDate: searchParams.get('end') ? new Date(searchParams.get('end')!) : undefined,
        minAmount: searchParams.get('minAmount') ? Number(searchParams.get('minAmount')) : undefined,
        maxAmount: searchParams.get('maxAmount') ? Number(searchParams.get('maxAmount')) : undefined,
      };

      const format = exportService.parseFormat(searchParams.get('format'));

      const { rows, totalMatched, truncated, exportCap } = await expenseRepository.getFilteredExpensesForExport(
        filters,
        tenantContext
      );

      const file = exportService.generate(
        rows,
        EXPENSE_EXPORT_COLUMNS,
        format,
        EXPENSE_EXPORT_BASE_FILENAME,
        EXPENSE_EXPORT_SHEET_NAME
      );

      return fileDownloadResponse(file, {
        totalMatched,
        rowsExported: rows.length,
        truncated,
        exportCap,
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * FIX (critical -- org-unit scope bypass on single-record access):
   * same bug/fix as VehicleController.loadInScopeVehicle -- getExpenses
   * (list) was the only endpoint applying org-unit scoping;
   * getExpense/updateExpense/deleteExpense checked only tenantId.
   */
  private async loadInScopeExpense(req: NextRequest, id: string) {
    const authContext = await getAuthContext(req);
    if (!authContext) {
      throw new UnauthorizedError('Authentication required');
    }

    const expense = await expenseQueryService.getExpenseById(id, authContext.tenantId);

    const tenantContext = await tenantContextService.resolveContext(
      authContext.userId,
      authContext.tenantId,
      authContext.roles,
      authContext.isSuperAdmin,
      authContext.orgUnitId
    );

    const expenseOrgUnitId = (expense as any).orgUnitId as string | undefined;
    if (
      expenseOrgUnitId &&
      !tenantScopeService.canAccessOrgUnit(tenantContext, expenseOrgUnitId)
    ) {
      throw new NotFoundError('Expense not found');
    }

    return { authContext, expense };
  }

  async getExpense(req: NextRequest, id: string) {
    try {
      const { expense } = await this.loadInScopeExpense(req, id);
      return successResponse(expense);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createExpense(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      const expense = await expenseCommandService.createExpense(body, tenantId, userId);
      return createdResponse(expense);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateExpense(req: NextRequest, id: string) {
    try {
      const { authContext } = await this.loadInScopeExpense(req, id);
      const userId = authContext.userId;
      const body = await req.json();
      const expense = await expenseCommandService.updateExpense(id, body, authContext.tenantId, userId);
      return successResponse(expense);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async deleteExpense(req: NextRequest, id: string) {
    try {
      const { authContext } = await this.loadInScopeExpense(req, id);
      const soft = req.nextUrl.searchParams.get('soft') !== 'false';

      if (!soft && !authContext.isSuperAdmin) {
        throw new ForbiddenError(
          'Permanently deleting an expense requires organization owner or super admin access. Use a soft delete instead.'
        );
      }

      await expenseCommandService.deleteExpense(id, authContext.tenantId, authContext.userId, soft);
      return successResponse({ message: 'Expense deleted successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async bulkImport(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const { records } = await req.json();
      const result = await expenseCommandService.bulkImport(records, tenantId, userId);
      return successResponse({
        message: `Import completed: ${result.inserted} inserted, ${result.errors} errors`,
        results: result,
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async importExpenses(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const { rows } = await req.json();
      if (!Array.isArray(rows) || rows.length === 0) throw new ValidationError('No rows to import');
      const result = await expenseCommandService.importExpenses(rows, tenantId, userId);
      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getExpenseStats(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;
      const dateRange =
        searchParams.get('startDate') && searchParams.get('endDate')
          ? {
              startDate: new Date(searchParams.get('startDate')!),
              endDate: new Date(searchParams.get('endDate')!),
            }
          : undefined;
      const stats = await expenseQueryService.getExpenseStats(tenantId, dateRange);
      return successResponse(stats);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getMonthlyTrends(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const months = Number(req.nextUrl.searchParams.get('months') || '12');
      const trends = await expenseQueryService.getMonthlyTrends(tenantId, months);
      return successResponse(trends);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getExpenseAnalytics(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;
      if (!searchParams.get('startDate') || !searchParams.get('endDate')) {
        throw new ValidationError('startDate and endDate are required');
      }
      const analytics = await expenseQueryService.getExpenseAnalytics(
        tenantId,
        new Date(searchParams.get('startDate')!),
        new Date(searchParams.get('endDate')!)
      );
      return successResponse(analytics);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getCategoryOverTime(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const data = await expenseQueryService.getExpenseCategoryOverTime(tenantId, parseDateRangeParams(req));
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getTopVehicles(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const limit = Number(req.nextUrl.searchParams.get('limit') || '10');
      const data = await expenseQueryService.getTopVehiclesByExpense(tenantId, parseDateRangeParams(req), limit);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getVehicleBreakdown(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const vehicleLimit = Number(req.nextUrl.searchParams.get('vehicleLimit') || '8');
      const data = await expenseQueryService.getVehicleExpenseBreakdown(tenantId, parseDateRangeParams(req), vehicleLimit);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getAmountDistribution(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const data = await expenseQueryService.getExpenseAmountDistribution(tenantId, parseDateRangeParams(req));
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getJobTripExpense(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const jobLimit = Number(req.nextUrl.searchParams.get('jobLimit') || '10');
      const data = await expenseQueryService.getJobTripExpense(tenantId, parseDateRangeParams(req), jobLimit);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getCategorySummary(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const data = await expenseQueryService.getExpenseCategorySummary(tenantId, parseDateRangeParams(req));
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getTopTransactions(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const limit = Number(req.nextUrl.searchParams.get('limit') || '10');
      const data = await expenseQueryService.getTopExpenseTransactions(tenantId, parseDateRangeParams(req), limit);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getDailyTotals(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const data = await expenseQueryService.getDailyExpenseTotals(tenantId, parseDateRangeParams(req));
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getOutliers(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;
      const zThreshold = Number(searchParams.get('zThreshold') || '2.5');
      const limit = Number(searchParams.get('limit') || '25');
      const data = await expenseQueryService.getExpenseOutliers(tenantId, parseDateRangeParams(req), zThreshold, limit);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[ExpenseController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const expenseController = new ExpenseController();

========================================
FILE: modules/expenses/repositories/expense.repository.ts
========================================
// modules/expenses/repositories/expense.repository.ts

import { Filter, ObjectId } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import {
  Expense,
  ExpenseFilters,
  ExpenseStats,
  ExpenseCategoryOverTimePoint,
  CategorySummary,
  TopVehicleExpenseRow,
  VehicleExpenseBreakdownRow,
  ExpenseAmountDistributionBucket,
  JobTripExpenseRow,
  TopExpenseTransactionRow,
  DailyExpenseTotal,
  ExpenseOutlierRow,
} from '@/shared/types/expense.types';
import {
  PaginationParams,
  PaginatedResponse,
  DateRange,
} from '@/shared/types/common.types';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import { EXPORT_ROW_CAP, ExportDataset } from '@/shared/export';

export class ExpenseRepository extends BaseRepository<Expense> {
  protected collectionName = 'tblexpenses';

  private isSuperAdminTenant(tenantId: string): boolean {
    return (
      tenantId === 'default' ||
      tenantId === 'system' ||
      tenantId === 'super_admin'
    );
  }

  private expenseTypeLookupStages() {
    return [
      {
        $lookup: {
          from: 'tblexpense_types',
          localField: 'expense_type_id',
          foreignField: '_id',
          as: 'expense_type',
        },
      },
      { $unwind: { path: '$expense_type', preserveNullAndEmptyArrays: true } },
    ];
  }

  private buildBaseMatch(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Record<string, unknown> {
    const match: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (!this.isSuperAdminTenant(tenantId)) match.tenantId = tenantId;
    if (dateRange?.startDate || dateRange?.endDate) {
      match.date = {};
      if (dateRange.startDate) (match.date as any).$gte = dateRange.startDate;
      if (dateRange.endDate) (match.date as any).$lte = dateRange.endDate;
    }
    return match;
  }

  /** Previous period of equal length immediately preceding a given range, for MoM/period-over-period comparisons. */
  private previousPeriodMatch(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Record<string, unknown> | null {
    if (!dateRange?.startDate || !dateRange?.endDate) return null;
    const periodMs = dateRange.endDate.getTime() - dateRange.startDate.getTime();
    const prevEnd = new Date(dateRange.startDate.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - periodMs);
    return this.buildBaseMatch(tenantId, { startDate: prevStart, endDate: prevEnd });
  }

  async findByLicensePlate(
    licensePlate: string,
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<Expense>> {
    return this.getFilteredExpenses(
      { license_plate: licensePlate.toUpperCase() },
      tenantId,
      pagination
    );
  }

  async getFilteredExpenses(
    filters: ExpenseFilters,
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<Expense>> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);

    const match: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (!isSuperAdmin) match.tenantId = tenantId;

    if (filters.license_plate) {
      match.license_plate = { $regex: filters.license_plate, $options: 'i' };
    }
    if (filters.type) {
      match.expense_type_id = new ObjectId(filters.type);
    }
    /**
     * FIX (drill-down gap): the Job/Trip chart's drill-down had no
     * corresponding server-side filter -- jobTrip was accepted nowhere
     * in ExpenseFilters or this match. Added so clicking a Job/Trip bar
     * can open a transaction list scoped to that exact job/trip
     * reference, the same way license_plate/type drill-downs already
     * work. "No Job/Trip" (the bucket label used by
     * getJobTripExpenseAnalysis for records with no jobTrip) is treated
     * as an explicit "field absent or empty" filter.
     */
    if (filters.jobTrip) {
      match.jobTrip =
        filters.jobTrip === 'No Job/Trip'
          ? { $in: [null, ''] }
          : { $regex: `^${filters.jobTrip}$`, $options: 'i' };
    }
    if (filters.startDate || filters.endDate) {
      match.date = {};
      if (filters.startDate) (match.date as any).$gte = filters.startDate;
      if (filters.endDate) (match.date as any).$lte = filters.endDate;
    }
    if (filters.minAmount !== undefined) {
      match.amount = { $gte: filters.minAmount };
    }
    if (filters.maxAmount !== undefined) {
      match.amount = { ...(match.amount as object), $lte: filters.maxAmount };
    }

    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      collection
        .aggregate<Expense>([
          { $match: match },
          ...this.expenseTypeLookupStages(),
          { $sort: { date: -1 } },
          { $skip: skip },
          { $limit: limit },
        ])
        .toArray(),
      collection.aggregate([{ $match: match }, { $count: 'count' }]).toArray(),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Org/branch-scoped variant of getFilteredExpenses. Mirrors
   * VehicleRepository.getFilteredVehiclesInScope: same match stage,
   * plus tenantScopeService.buildFilter(context, 'orgUnitId') on top of
   * (not instead of) tenant isolation.
   */
  /**
   * Single source of truth for the tenant + org-unit-scope + filter
   * match stage shared by getFilteredExpensesInScope (paginated list)
   * and getFilteredExpensesForExport (uncapped-by-pagination export).
   */
  private buildScopedMatch(filters: ExpenseFilters, context: TenantContext): Record<string, unknown> {
    const match: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (!this.isSuperAdminTenant(context.organizationId)) {
      match.tenantId = context.organizationId;
    }

    if (filters.license_plate) {
      match.license_plate = { $regex: filters.license_plate, $options: 'i' };
    }
    if (filters.type) {
      match.expense_type_id = new ObjectId(filters.type);
    }
    if (filters.jobTrip) {
      match.jobTrip =
        filters.jobTrip === 'No Job/Trip'
          ? { $in: [null, ''] }
          : { $regex: `^${filters.jobTrip}$`, $options: 'i' };
    }
    if (filters.startDate || filters.endDate) {
      match.date = {};
      if (filters.startDate) (match.date as any).$gte = filters.startDate;
      if (filters.endDate) (match.date as any).$lte = filters.endDate;
    }
    if (filters.minAmount !== undefined) {
      match.amount = { $gte: filters.minAmount };
    }
    if (filters.maxAmount !== undefined) {
      match.amount = { ...(match.amount as object), $lte: filters.maxAmount };
    }

    const scopeFilter = tenantScopeService.buildFilter<Expense>(context, 'orgUnitId');
    Object.assign(match, scopeFilter);

    return match;
  }

  async getFilteredExpensesInScope(
    filters: ExpenseFilters,
    context: TenantContext,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<Expense>> {
    const collection = await this.getCollection();
    const match = this.buildScopedMatch(filters, context);

    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      collection
        .aggregate<Expense>([
          { $match: match },
          ...this.expenseTypeLookupStages(),
          { $sort: { date: -1 } },
          { $skip: skip },
          { $limit: limit },
        ])
        .toArray(),
      collection.aggregate([{ $match: match }, { $count: 'count' }]).toArray(),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Export variant of getFilteredExpensesInScope: same filters and
   * same tenant/org-unit scope, but returns up to `cap` matching
   * records (default EXPORT_ROW_CAP) ignoring UI pagination, with the
   * same expense_type $lookup so category labels are available, plus
   * the true total match count so the caller can detect truncation.
   */
  async getFilteredExpensesForExport(
    filters: ExpenseFilters,
    context: TenantContext,
    cap: number = EXPORT_ROW_CAP
  ): Promise<ExportDataset<Expense>> {
    const collection = await this.getCollection();
    const match = this.buildScopedMatch(filters, context);

    const [rows, totalResult] = await Promise.all([
      collection
        .aggregate<Expense>([
          { $match: match },
          ...this.expenseTypeLookupStages(),
          { $sort: { date: -1 } },
          { $limit: cap },
        ])
        .toArray(),
      collection.aggregate([{ $match: match }, { $count: 'count' }]).toArray(),
    ]);

    const totalMatched = totalResult[0]?.count ?? 0;

    return {
      rows,
      totalMatched,
      truncated: totalMatched > rows.length,
      exportCap: cap,
    };
  }

  async getExpenseStats(
    tenantId: string,
    dateRange?: DateRange
  ): Promise<ExpenseStats> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);

    const filter: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (!isSuperAdmin) filter.tenantId = tenantId;
    if (dateRange) {
      filter.date = { $gte: dateRange.startDate, $lte: dateRange.endDate };
    }

    const pipeline = [
      { $match: filter },
      ...this.expenseTypeLookupStages(),
      {
        $facet: {
          total: [{ $group: { _id: null, total: { $sum: '$amount' } } }],
          count: [{ $count: 'count' }],
          byType: [
            { $group: { _id: '$expense_type.name', total: { $sum: '$amount' } } },
            { $sort: { total: -1 } },
          ],
          byMonth: [
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m', date: '$date' } },
                total: { $sum: '$amount' },
              },
            },
            { $sort: { _id: 1 } },
          ],
          topCategories: [
            { $group: { _id: '$expense_type.name', total: { $sum: '$amount' } } },
            { $sort: { total: -1 } },
            { $limit: 5 },
          ],
        },
      },
    ];

    const result = await collection.aggregate(pipeline).toArray();
    const data = result[0] || { total: [], count: [], byType: [], byMonth: [], topCategories: [] };

    const totalAmount: number = data.total[0]?.total || 0;
    const totalCount: number = data.count[0]?.count || 0;

    return {
      total: totalAmount,
      average: totalCount > 0 ? totalAmount / totalCount : 0,
      byType: Object.fromEntries(data.byType.map((t: any) => [t._id || 'All', t.total])),
      byMonth: Object.fromEntries(data.byMonth.map((m: any) => [m._id, m.total])),
      topCategories: data.topCategories.map((c: any) => ({
        name: c._id || 'All',
        amount: c.total,
      })),
    };
  }

  async getMonthlyTrends(
    tenantId: string,
    months: number = 12
  ): Promise<Array<{ month: string; total: number }>> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const match: Record<string, unknown> = {
      isDeleted: { $ne: true },
      date: { $gte: startDate },
    };
    if (!isSuperAdmin) match.tenantId = tenantId;

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$date' } },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map((r) => ({ month: r._id, total: r.total }));
  }

  async getExpenseAnalytics(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any[]> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);

    const match: Record<string, unknown> = {
      isDeleted: { $ne: true },
      date: { $gte: startDate, $lte: endDate },
    };
    if (!isSuperAdmin) match.tenantId = tenantId;

    const pipeline = [
      { $match: match },
      ...this.expenseTypeLookupStages(),
      {
        $group: {
          _id: {
            category: '$expense_type.name',
            month: { $dateToString: { format: '%Y-%m', date: '$date' } },
          },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.month': 1 } },
    ];

    return collection.aggregate(pipeline).toArray();
  }

  // ------------------------------------------------------------------
  // Enterprise analytics -- category over time / vehicle / distribution
  // ------------------------------------------------------------------

  async getExpenseCategoryOverTime(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<ExpenseCategoryOverTimePoint[]> {
    const collection = await this.getCollection();
    const match = this.buildBaseMatch(tenantId, dateRange);

    const pipeline = [
      { $match: match },
      ...this.expenseTypeLookupStages(),
      {
        $group: {
          _id: {
            category: { $ifNull: ['$expense_type.name', 'Uncategorized'] },
            month: { $dateToString: { format: '%Y-%m', date: '$date' } },
          },
          amount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.month': 1 } },
      {
        $project: {
          _id: 0,
          category: '$_id.category',
          month: '$_id.month',
          amount: { $round: ['$amount', 2] },
          count: 1,
        },
      },
    ];

    return collection.aggregate<ExpenseCategoryOverTimePoint>(pipeline).toArray();
  }

  /**
   * Rich per-category summary for hover tooltips and the Pareto/waterfall
   * charts. Three bounded aggregation queries total (current period,
   * category x vehicle breakdown for top-vehicle-per-category, and an
   * optional previous-period query for MoM) -- run once per dashboard
   * load, never per hover.
   */
  async getExpenseCategorySummary(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<CategorySummary[]> {
    const collection = await this.getCollection();
    const match = this.buildBaseMatch(tenantId, dateRange);

    const grandTotalResult = await collection
      .aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: '$amount' } } }])
      .toArray();
    const grandTotal: number = grandTotalResult[0]?.total || 0;

    const summaryPipeline = [
      { $match: match },
      ...this.expenseTypeLookupStages(),
      {
        $group: {
          _id: { $ifNull: ['$expense_type.name', 'Uncategorized'] },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
          min: { $min: '$amount' },
          max: { $max: '$amount' },
          latestDate: { $max: '$date' },
        },
      },
    ];
    const summaries = await collection.aggregate(summaryPipeline).toArray();

    // Category x vehicle totals, to pick each category's top vehicle --
    // one aggregation, not one query per category.
    const byVehiclePipeline = [
      { $match: match },
      ...this.expenseTypeLookupStages(),
      {
        $group: {
          _id: {
            category: { $ifNull: ['$expense_type.name', 'Uncategorized'] },
            plate: '$license_plate',
          },
          amount: { $sum: '$amount' },
        },
      },
    ];
    const byVehicle = await collection.aggregate(byVehiclePipeline).toArray();
    const topVehicleByCategory = new Map<string, { plate: string; amount: number }>();
    for (const row of byVehicle) {
      const cat = row._id.category as string;
      const current = topVehicleByCategory.get(cat);
      if (!current || row.amount > current.amount) {
        topVehicleByCategory.set(cat, { plate: row._id.plate, amount: row.amount });
      }
    }

    // Previous period, for MoM change -- skipped entirely if no explicit range given.
    const prevMatch = this.previousPeriodMatch(tenantId, dateRange);
    let prevTotalsByCategory = new Map<string, number>();
    if (prevMatch) {
      const prevPipeline = [
        { $match: prevMatch },
        ...this.expenseTypeLookupStages(),
        {
          $group: {
            _id: { $ifNull: ['$expense_type.name', 'Uncategorized'] },
            total: { $sum: '$amount' },
          },
        },
      ];
      const prevResults = await collection.aggregate(prevPipeline).toArray();
      prevTotalsByCategory = new Map(prevResults.map((r) => [r._id as string, r.total as number]));
    }

    return summaries
      .map((s) => {
        const category = s._id as string;
        const prevTotal = prevTotalsByCategory.get(category);
        const momChangePercent =
          prevMatch && prevTotal !== undefined && prevTotal > 0
            ? Math.round(((s.total - prevTotal) / prevTotal) * 1000) / 10
            : prevMatch && (prevTotal === undefined || prevTotal === 0) && s.total > 0
              ? null // no meaningful prior baseline (division by zero) -- omit rather than fabricate
              : null;

        return {
          category,
          total: Math.round(s.total * 100) / 100,
          count: s.count,
          average: s.count > 0 ? Math.round((s.total / s.count) * 100) / 100 : 0,
          min: Math.round(s.min * 100) / 100,
          max: Math.round(s.max * 100) / 100,
          latestDate: s.latestDate ? new Date(s.latestDate).toISOString() : null,
          topVehicle: topVehicleByCategory.get(category)?.plate ?? null,
          percentageOfTotal: grandTotal > 0 ? Math.round((s.total / grandTotal) * 1000) / 10 : 0,
          momChangePercent,
        };
      })
      .sort((a, b) => b.total - a.total);
  }

  /**
   * FIX (Job/Trip drill-down had no filter path): getFilteredExpenses
   * above now accepts `jobTrip`; this method is unchanged apart from
   * that fix already applied there.
   */

  async getTopVehiclesByExpense(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 10
  ): Promise<TopVehicleExpenseRow[]> {
    const collection = await this.getCollection();
    const match = this.buildBaseMatch(tenantId, dateRange);

    const pipeline = [
      { $match: match },
      ...this.expenseTypeLookupStages(),
      {
        $group: {
          _id: {
            plate: '$license_plate',
            category: { $ifNull: ['$expense_type.name', 'Uncategorized'] },
          },
          amount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.plate',
          totalAmount: { $sum: '$amount' },
          expenseCount: { $sum: '$count' },
          categories: { $push: { category: '$_id.category', amount: '$amount' } },
        },
      },
      {
        $addFields: {
          sortedCategories: { $sortArray: { input: '$categories', sortBy: { amount: -1 } } },
        },
      },
      {
        $project: {
          _id: 0,
          license_plate: '$_id',
          totalAmount: { $round: ['$totalAmount', 2] },
          expenseCount: 1,
          topCategory: { $arrayElemAt: ['$sortedCategories.category', 0] },
        },
      },
      { $sort: { totalAmount: -1 } },
      { $limit: limit },
    ];

    const rows = await collection.aggregate(pipeline).toArray();

    // Per-vehicle min/max/avg/latestDate -- single follow-up aggregation
    // scoped to only the top-N plates already selected above, not N+1.
    const plates = rows.map((r) => r.license_plate as string);
    const detailMap = new Map<string, { min: number; max: number; latestDate: Date | null }>();
    if (plates.length > 0) {
      const detailPipeline = [
        { $match: { ...match, license_plate: { $in: plates } } },
        {
          $group: {
            _id: '$license_plate',
            min: { $min: '$amount' },
            max: { $max: '$amount' },
            latestDate: { $max: '$date' },
          },
        },
      ];
      const details = await collection.aggregate(detailPipeline).toArray();
      for (const d of details) {
        detailMap.set(d._id as string, { min: d.min, max: d.max, latestDate: d.latestDate });
      }
    }

    // Optional previous-period totals for MoM, scoped to the same plates -- one query, not per-vehicle.
    const prevMatch = this.previousPeriodMatch(tenantId, dateRange);
    let prevTotalsByPlate = new Map<string, number>();
    if (prevMatch && plates.length > 0) {
      const prevPipeline = [
        { $match: { ...prevMatch, license_plate: { $in: plates } } },
        { $group: { _id: '$license_plate', total: { $sum: '$amount' } } },
      ];
      const prevResults = await collection.aggregate(prevPipeline).toArray();
      prevTotalsByPlate = new Map(prevResults.map((r) => [r._id as string, r.total as number]));
    }

    return rows.map((r) => {
      const detail = detailMap.get(r.license_plate as string);
      const prevTotal = prevTotalsByPlate.get(r.license_plate as string);
      const momChangePercent =
        prevMatch && prevTotal !== undefined && prevTotal > 0
          ? Math.round(((r.totalAmount - prevTotal) / prevTotal) * 1000) / 10
          : null;

      return {
        license_plate: r.license_plate,
        totalAmount: r.totalAmount,
        expenseCount: r.expenseCount,
        topCategory: r.topCategory,
        average: r.expenseCount > 0 ? Math.round((r.totalAmount / r.expenseCount) * 100) / 100 : 0,
        min: detail ? Math.round(detail.min * 100) / 100 : 0,
        max: detail ? Math.round(detail.max * 100) / 100 : 0,
        latestDate: detail?.latestDate ? new Date(detail.latestDate).toISOString() : null,
        momChangePercent,
      };
    });
  }

  async getVehicleExpenseBreakdown(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    vehicleLimit: number = 8
  ): Promise<VehicleExpenseBreakdownRow[]> {
    const collection = await this.getCollection();
    const match = this.buildBaseMatch(tenantId, dateRange);

    const topPlatesPipeline = [
      { $match: match },
      { $group: { _id: '$license_plate', totalAmount: { $sum: '$amount' } } },
      { $sort: { totalAmount: -1 } },
      { $limit: vehicleLimit },
    ];
    const topPlates = await collection.aggregate(topPlatesPipeline).toArray();
    const plates = topPlates.map((p) => p._id as string);
    if (plates.length === 0) return [];

    const pipeline = [
      { $match: { ...match, license_plate: { $in: plates } } },
      ...this.expenseTypeLookupStages(),
      {
        $group: {
          _id: {
            plate: '$license_plate',
            category: { $ifNull: ['$expense_type.name', 'Uncategorized'] },
          },
          amount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          license_plate: '$_id.plate',
          category: '$_id.category',
          amount: { $round: ['$amount', 2] },
          count: 1,
        },
      },
    ];

    return collection.aggregate<VehicleExpenseBreakdownRow>(pipeline).toArray();
  }

  async getExpenseAmountDistribution(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<ExpenseAmountDistributionBucket[]> {
    const collection = await this.getCollection();
    const match = this.buildBaseMatch(tenantId, dateRange);

    const count = await collection.countDocuments(match as Filter<Expense>);
    if (count === 0) return [];

    const bucketCount = Math.min(8, count);
    const pipeline = [
      { $match: match },
      { $bucketAuto: { groupBy: '$amount', buckets: bucketCount, output: { count: { $sum: 1 } } } },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map((r) => ({
      min: Math.round((r._id.min ?? 0) * 100) / 100,
      max: Math.round((r._id.max ?? 0) * 100) / 100,
      count: r.count,
    }));
  }

  async getJobTripExpenseAnalysis(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    jobLimit: number = 10
  ): Promise<JobTripExpenseRow[]> {
    const collection = await this.getCollection();
    const match = this.buildBaseMatch(tenantId, dateRange);

    const jobKeyExpr = {
      $cond: [
        { $and: [{ $ne: ['$jobTrip', null] }, { $ne: ['$jobTrip', ''] }] },
        '$jobTrip',
        'No Job/Trip',
      ],
    };

    const topJobsPipeline = [
      { $match: match },
      { $addFields: { __job: jobKeyExpr } },
      { $group: { _id: '$__job', totalAmount: { $sum: '$amount' } } },
      { $sort: { totalAmount: -1 } },
      { $limit: jobLimit },
    ];
    const topJobs = await collection.aggregate(topJobsPipeline).toArray();
    const jobs = topJobs.map((j) => j._id as string);
    if (jobs.length === 0) return [];

    const pipeline = [
      { $match: match },
      { $addFields: { __job: jobKeyExpr } },
      { $match: { __job: { $in: jobs } } },
      ...this.expenseTypeLookupStages(),
      {
        $group: {
          _id: {
            job: '$__job',
            category: { $ifNull: ['$expense_type.name', 'Uncategorized'] },
          },
          amount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          jobTrip: '$_id.job',
          category: '$_id.category',
          amount: { $round: ['$amount', 2] },
          count: 1,
        },
      },
    ];

    return collection.aggregate<JobTripExpenseRow>(pipeline).toArray();
  }

  // ------------------------------------------------------------------
  // New in this pass: top transactions, calendar heatmap, outliers
  // ------------------------------------------------------------------

  /** Top N single highest-value transactions, for the executive "biggest expenses" list. */
  async getTopExpenseTransactions(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 10
  ): Promise<TopExpenseTransactionRow[]> {
    const collection = await this.getCollection();
    const match = this.buildBaseMatch(tenantId, dateRange);

    const pipeline = [
      { $match: match },
      ...this.expenseTypeLookupStages(),
      { $sort: { amount: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: { $toString: '$_id' },
          license_plate: 1,
          category: { $ifNull: ['$expense_type.name', 'Uncategorized'] },
          amount: { $round: ['$amount', 2] },
          date: 1,
          jobTrip: { $ifNull: ['$jobTrip', null] },
          description: { $ifNull: ['$description', null] },
        },
      },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map((r) => ({ ...r, date: new Date(r.date).toISOString() })) as TopExpenseTransactionRow[];
  }

  /**
   * Daily totals for the calendar heatmap. Bounded to at most 366 days
   * even if the caller passes no range or an overlong one, so an
   * enterprise dataset can never return an unbounded number of days.
   */
  async getDailyExpenseTotals(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<DailyExpenseTotal[]> {
    const collection = await this.getCollection();
    const endDate = dateRange?.endDate ?? new Date();
    const requestedStart = dateRange?.startDate ?? new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);
    const earliestAllowedStart = new Date(endDate.getTime() - 366 * 24 * 60 * 60 * 1000);
    const startDate = requestedStart < earliestAllowedStart ? earliestAllowedStart : requestedStart;

    const match = this.buildBaseMatch(tenantId, { startDate, endDate });

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          amount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map((r) => ({
      date: r._id,
      amount: Math.round(r.amount * 100) / 100,
      count: r.count,
    }));
  }

  /**
   * Statistical outlier detection: flags expenses whose amount is more
   * than `zThreshold` standard deviations from their OWN CATEGORY's
   * mean (not the fleet-wide mean -- a $250 tyre expense and a $250
   * insurance expense mean very different things). Categories with
   * fewer than 3 records are excluded since a std-dev computed from 1-2
   * points is not statistically meaningful. Single aggregation query.
   */
  async getExpenseOutliers(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    zThreshold: number = 2.5,
    limit: number = 25
  ): Promise<ExpenseOutlierRow[]> {
    const collection = await this.getCollection();
    const match = this.buildBaseMatch(tenantId, dateRange);

    const pipeline = [
      { $match: match },
      ...this.expenseTypeLookupStages(),
      {
        $group: {
          _id: { $ifNull: ['$expense_type.name', 'Uncategorized'] },
          mean: { $avg: '$amount' },
          stdDev: { $stdDevPop: '$amount' },
          docs: {
            $push: {
              _id: '$_id',
              license_plate: '$license_plate',
              amount: '$amount',
              date: '$date',
            },
          },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gte: 3 }, stdDev: { $gt: 0 } } },
      { $unwind: '$docs' },
      {
        $addFields: {
          zScore: { $divide: [{ $subtract: ['$docs.amount', '$mean'] }, '$stdDev'] },
        },
      },
      { $match: { $expr: { $gte: [{ $abs: '$zScore' }, zThreshold] } } },
      {
        $project: {
          _id: { $toString: '$docs._id' },
          license_plate: '$docs.license_plate',
          category: '$_id',
          amount: { $round: ['$docs.amount', 2] },
          date: '$docs.date',
          categoryMean: { $round: ['$mean', 2] },
          categoryStdDev: { $round: ['$stdDev', 2] },
          zScore: { $round: ['$zScore', 2] },
        },
      },
      { $sort: { zScore: -1 } },
      { $limit: limit },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map((r) => ({ ...r, date: new Date(r.date).toISOString() })) as ExpenseOutlierRow[];
  }
}

export const expenseRepository = new ExpenseRepository();

========================================
FILE: modules/expenses/repositories/expense-type.repository.ts
========================================
/* eslint-disable @typescript-eslint/no-unused-vars */
// modules/expenses/repositories/expense-type.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { ExpenseType } from '@/shared/types/expense.types';

export class ExpenseTypeRepository extends BaseRepository<ExpenseType> {
  protected collectionName = 'tblexpense_types';

  async findByName(name: string, tenantId: string): Promise<ExpenseType | null> {
    return this.findOne(
      { name: { $regex: `^${name}$`, $options: 'i' } } as Filter<ExpenseType>,
      tenantId
    );
  }

  async findByCategory(category: string, tenantId: string): Promise<ExpenseType[]> {
    return this.findMany(
      { category } as Filter<ExpenseType>,
      tenantId
    );
  }

  async findActive(tenantId: string): Promise<ExpenseType[]> {
    return this.findMany(
      { isDeleted: { $ne: true } } as Filter<ExpenseType>,
      tenantId,
      { sortBy: 'name', sortOrder: 'asc' }
    );
  }

  async findWithCategory(tenantId: string): Promise<Array<{ category: string; types: ExpenseType[] }>> {
    const types = await this.findActive(tenantId);
    const grouped = types.reduce((acc, type) => {
      const category = type.category || 'All';
      if (!acc[category]) acc[category] = [];
      acc[category].push(type);
      return acc;
    }, {} as Record<string, ExpenseType[]>);

    return Object.entries(grouped).map(([category, types]) => ({ category, types }));
  }

  async softDeleteByName(name: string, tenantId: string): Promise<boolean> {
    const type = await this.findByName(name, tenantId);
    if (!type || !type._id) return false;
    return this.softDelete(type._id, tenantId);
  }

  async getCategoryStats(tenantId: string): Promise<Array<{ category: string; count: number; totalAmount: number }>> {
    const collection = await this.getCollection();
    const db = await (await import('@/infrastructure/database/mongodb')).default();
    const expensesCollection = db.collection('tblexpenses');

    const pipeline = [
      {
        $lookup: {
          from: 'tblexpenses',
          localField: '_id',
          foreignField: 'expense_type_id',
          as: 'expenses',
        },
      },
      {
        $project: {
          category: 1,
          expenseCount: { $size: '$expenses' },
          totalAmount: { $sum: '$expenses.amount' },
        },
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: '$expenseCount' },
          totalAmount: { $sum: '$totalAmount' },
        },
      },
      {
        $sort: { totalAmount: -1 },
      },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map((r) => ({
      category: r._id || 'All',
      count: r.count,
      totalAmount: r.totalAmount,
    }));
  }
}

export const expenseTypeRepository = new ExpenseTypeRepository();

========================================
FILE: modules/expenses/services/expense-command.service.ts
========================================
// modules/expenses/services/expense-command.service.ts

import { commandBus } from '@/server/cqrs/command-bus';
import { CreateExpenseCommand } from '../commands/create-expense.command';
import { UpdateExpenseCommand } from '../commands/update-expense.command';
import { DeleteExpenseCommand } from '../commands/delete-expense.command';
import {
  BulkImportExpensesCommand,
  BulkExpenseRecord,
} from '../commands/bulk-import-expenses.command';
import { ImportExpensesCommand, ImportExpenseRow } from '../commands/import-expenses.command';
import { Expense } from '@/shared/types/expense.types';
import type { BulkImportResult } from '../commands/handlers/bulk-import-expenses.handler';
import type { ImportExpensesResult } from '../commands/handlers/import-expenses.handler';

export class ExpenseCommandService {
  async createExpense(
    rawData: unknown,
    tenantId: string,
    userId?: string
  ): Promise<Expense> {
    return commandBus.execute<Expense>(
      new CreateExpenseCommand(rawData, tenantId, userId)
    );
  }

  async updateExpense(
    expenseId: string,
    rawData: unknown,
    tenantId: string,
    userId?: string
  ): Promise<Expense> {
    return commandBus.execute<Expense>(
      new UpdateExpenseCommand(expenseId, rawData, tenantId, userId)
    );
  }

  async deleteExpense(
    expenseId: string,
    tenantId: string,
    userId?: string,
    soft: boolean = true
  ): Promise<void> {
    return commandBus.execute<void>(
      new DeleteExpenseCommand(expenseId, tenantId, userId, soft)
    );
  }

  async bulkImport(
    records: BulkExpenseRecord[],
    tenantId: string,
    userId?: string
  ): Promise<BulkImportResult> {
    return commandBus.execute<BulkImportResult>(
      new BulkImportExpensesCommand(records, tenantId, userId)
    );
  }

  /** Standard-column enterprise import (date/vehicle/category/amount/jobTrip/description). */
  async importExpenses(
    rows: ImportExpenseRow[],
    tenantId: string,
    userId?: string
  ): Promise<ImportExpensesResult> {
    return commandBus.execute<ImportExpensesResult>(
      new ImportExpensesCommand(rows, tenantId, userId)
    );
  }
}

export const expenseCommandService = new ExpenseCommandService();

========================================
FILE: modules/expenses/services/expense-query.service.ts
========================================
// modules/expenses/services/expense-query.service.ts

import { queryBus } from '@/server/cqrs/query-bus';
import { GetExpensesQuery } from '../queries/get-expenses.query';
import { GetExpenseByIdQuery } from '../queries/get-expense-by-id.query';
import { GetExpenseStatsQuery } from '../queries/get-expense-stats.query';
import { GetMonthlyTrendsQuery } from '../queries/get-monthly-trends.query';
import { GetExpenseAnalyticsQuery } from '../queries/get-expense-analytics.query';
import { GetExpenseCategoryOverTimeQuery } from '../queries/get-expense-category-over-time.query';
import { GetTopVehiclesByExpenseQuery } from '../queries/get-top-vehicles-by-expense.query';
import { GetVehicleExpenseBreakdownQuery } from '../queries/get-vehicle-expense-breakdown.query';
import { GetExpenseAmountDistributionQuery } from '../queries/get-expense-amount-distribution.query';
import { GetJobTripExpenseQuery } from '../queries/get-job-trip-expense.query';
import { GetExpenseCategorySummaryQuery } from '../queries/get-expense-category-summary.query';
import { GetTopExpenseTransactionsQuery } from '../queries/get-top-expense-transactions.query';
import { GetDailyExpenseTotalsQuery } from '../queries/get-daily-expense-totals.query';
import { GetExpenseOutliersQuery } from '../queries/get-expense-outliers.query';
import {
  Expense,
  ExpenseFilters,
  ExpenseStats,
  ExpenseCategoryOverTimePoint,
  TopVehicleExpenseRow,
  VehicleExpenseBreakdownRow,
  ExpenseAmountDistributionBucket,
  JobTripExpenseRow,
  CategorySummary,
  TopExpenseTransactionRow,
  DailyExpenseTotal,
  ExpenseOutlierRow,
} from '@/shared/types/expense.types';
import { PaginatedResponse, PaginationParams, DateRange } from '@/shared/types/common.types';

export class ExpenseQueryService {
  async getFilteredExpenses(
    filters: ExpenseFilters,
    pagination: PaginationParams,
    tenantId: string
  ): Promise<PaginatedResponse<Expense>> {
    return queryBus.execute<PaginatedResponse<Expense>>(
      new GetExpensesQuery(filters, pagination, tenantId)
    );
  }

  async getExpenseById(expenseId: string, tenantId: string): Promise<Expense> {
    return queryBus.execute<Expense>(new GetExpenseByIdQuery(expenseId, tenantId));
  }

  async getExpenseStats(tenantId: string, dateRange?: DateRange): Promise<ExpenseStats> {
    return queryBus.execute<ExpenseStats>(new GetExpenseStatsQuery(tenantId, dateRange));
  }

  async getMonthlyTrends(
    tenantId: string,
    months: number = 12
  ): Promise<Array<{ month: string; total: number }>> {
    return queryBus.execute<Array<{ month: string; total: number }>>(
      new GetMonthlyTrendsQuery(tenantId, months)
    );
  }

  async getExpenseAnalytics(tenantId: string, startDate: Date, endDate: Date): Promise<unknown[]> {
    return queryBus.execute<unknown[]>(new GetExpenseAnalyticsQuery(tenantId, startDate, endDate));
  }

  async getExpenseCategoryOverTime(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<ExpenseCategoryOverTimePoint[]> {
    return queryBus.execute<ExpenseCategoryOverTimePoint[]>(
      new GetExpenseCategoryOverTimeQuery(tenantId, dateRange)
    );
  }

  async getTopVehiclesByExpense(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 10
  ): Promise<TopVehicleExpenseRow[]> {
    return queryBus.execute<TopVehicleExpenseRow[]>(
      new GetTopVehiclesByExpenseQuery(tenantId, dateRange, limit)
    );
  }

  async getVehicleExpenseBreakdown(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    vehicleLimit: number = 8
  ): Promise<VehicleExpenseBreakdownRow[]> {
    return queryBus.execute<VehicleExpenseBreakdownRow[]>(
      new GetVehicleExpenseBreakdownQuery(tenantId, dateRange, vehicleLimit)
    );
  }

  async getExpenseAmountDistribution(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<ExpenseAmountDistributionBucket[]> {
    return queryBus.execute<ExpenseAmountDistributionBucket[]>(
      new GetExpenseAmountDistributionQuery(tenantId, dateRange)
    );
  }

  async getJobTripExpense(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    jobLimit: number = 10
  ): Promise<JobTripExpenseRow[]> {
    return queryBus.execute<JobTripExpenseRow[]>(new GetJobTripExpenseQuery(tenantId, dateRange, jobLimit));
  }

  async getExpenseCategorySummary(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<CategorySummary[]> {
    return queryBus.execute<CategorySummary[]>(new GetExpenseCategorySummaryQuery(tenantId, dateRange));
  }

  async getTopExpenseTransactions(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 10
  ): Promise<TopExpenseTransactionRow[]> {
    return queryBus.execute<TopExpenseTransactionRow[]>(
      new GetTopExpenseTransactionsQuery(tenantId, dateRange, limit)
    );
  }

  async getDailyExpenseTotals(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<DailyExpenseTotal[]> {
    return queryBus.execute<DailyExpenseTotal[]>(new GetDailyExpenseTotalsQuery(tenantId, dateRange));
  }

  async getExpenseOutliers(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    zThreshold: number = 2.5,
    limit: number = 25
  ): Promise<ExpenseOutlierRow[]> {
    return queryBus.execute<ExpenseOutlierRow[]>(
      new GetExpenseOutliersQuery(tenantId, dateRange, zThreshold, limit)
    );
  }
}

export const expenseQueryService = new ExpenseQueryService();

========================================
FILE: modules/expenses/export/expense-export.columns.ts
========================================
// modules/expenses/export/expense-export.columns.ts
//
// Column definitions for the Expenses export. Mirrors
// EXPORT_COLUMNS in frontend/modules/expenses/utils/index.ts,
// including the 'Uncategorized' fallback fix documented there --
// expense_type is populated by ExpenseRepository's
// expenseTypeLookupStages() $lookup, which the new
// getFilteredExpensesForExport() reuses.

import type { ExportColumn } from '@/shared/export';
import type { Expense } from '@/shared/types/expense.types';

function expenseCategoryLabel(expense: Expense): string {
  return expense.expense_type?.name || (expense.expense_type as { category?: string } | undefined)?.category || 'Uncategorized';
}

export const EXPENSE_EXPORT_COLUMNS: ExportColumn<Expense>[] = [
  { header: 'Date', accessor: (e) => new Date(e.date).toISOString().slice(0, 10) },
  { header: 'Vehicle', accessor: (e) => e.license_plate },
  { header: 'Category', accessor: (e) => expenseCategoryLabel(e) },
  { header: 'Amount', accessor: (e) => e.amount },
  { header: 'Job / Trip', accessor: (e) => e.jobTrip ?? '' },
  { header: 'Description', accessor: (e) => e.description ?? '' },
  { header: 'Notes', accessor: (e) => e.notes ?? '' },
];

export const EXPENSE_EXPORT_SHEET_NAME = 'Expenses';
export const EXPENSE_EXPORT_BASE_FILENAME = 'expenses-export';

========================================
FILE: modules/expenses/commands/create-expense.command.ts
========================================
// modules/expenses/commands/create-expense.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export class CreateExpenseCommand extends BaseCommand {
  static readonly commandName = 'CreateExpenseCommand';

  constructor(
    public readonly rawData: unknown,
    public readonly tenantId: string,
    public readonly userId?: string
  ) {
    super(CreateExpenseCommand.commandName);
  }
}

========================================
FILE: modules/expenses/commands/update-expense.command.ts
========================================
// modules/expenses/commands/update-expense.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export class UpdateExpenseCommand extends BaseCommand {
  static readonly commandName = 'UpdateExpenseCommand';

  constructor(
    public readonly expenseId: string,
    public readonly rawData: unknown,
    public readonly tenantId: string,
    public readonly userId?: string
  ) {
    super(UpdateExpenseCommand.commandName);
  }
}

========================================
FILE: modules/expenses/commands/delete-expense.command.ts
========================================
// modules/expenses/commands/delete-expense.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export class DeleteExpenseCommand extends BaseCommand {
  static readonly commandName = 'DeleteExpenseCommand';

  constructor(
    public readonly expenseId: string,
    public readonly tenantId: string,
    public readonly userId?: string,
    public readonly soft: boolean = true
  ) {
    super(DeleteExpenseCommand.commandName);
  }
}

========================================
FILE: modules/expenses/commands/import-expenses.command.ts
========================================
//modules/expenses/commands/import-expenses.command.ts

// modules/expenses/commands/import-expenses.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export interface ImportExpenseRow {
  rowNumber: number;
  date: string;
  license_plate: string;
  category?: string;
  amount: string;
  jobTrip?: string;
  description?: string;
}

export class ImportExpensesCommand extends BaseCommand {
  static readonly commandName = 'ImportExpensesCommand';

  constructor(
    public readonly rows: ImportExpenseRow[],
    public readonly tenantId: string,
    public readonly userId?: string
  ) {
    super(ImportExpensesCommand.commandName);
  }
}

========================================
FILE: modules/expenses/commands/bulk-import-expenses.command.ts
========================================
// modules/expenses/commands/bulk-import-expenses.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export interface BulkExpenseRecord {
  date: string | Date;
  reference: string;
  details: string;
  account: string;
  totalAmount: number;
  costCentre: string;
  items: string[];
  vehiclePlate?: string;
  category?: string;
}

export class BulkImportExpensesCommand extends BaseCommand {
  static readonly commandName = 'BulkImportExpensesCommand';

  constructor(
    public readonly records: BulkExpenseRecord[],
    public readonly tenantId: string,
    public readonly userId?: string
  ) {
    super(BulkImportExpensesCommand.commandName);
  }
}

========================================
FILE: modules/expenses/commands/handlers/create-expense.handler.ts
========================================
// modules/expenses/commands/handlers/create-expense.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { CreateExpenseCommand } from '../create-expense.command';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { expenseCreateSchema } from '@/shared/validations/expense.schema';
import { Expense } from '@/shared/types/expense.types';
import { ValidationError, AppError } from '@/server/errors/app.errors';
import { validateWithZod } from '@/shared/utils/validation.utils';
import { ObjectId } from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { ExpenseCreatedEvent } from '@/modules/expenses/events/ExpenseCreatedEvent';

export class CreateExpenseHandler
  implements ICommandHandler<CreateExpenseCommand, Expense>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(command: CreateExpenseCommand): Promise<Expense> {
    const raw = command.rawData as Record<string, unknown>;

    const clean: Record<string, unknown> = {
      license_plate: raw.license_plate,
      amount: typeof raw.amount === 'string' ? Number(raw.amount) : raw.amount,
      date: raw.date,
      expense_type_id: raw.expense_type_id || undefined,
      description: raw.description,
      jobTrip: raw.jobTrip,
      notes: raw.notes,
    };

    const payload = Object.fromEntries(
      Object.entries(clean).filter(([, v]) => v !== undefined && v !== null && v !== '')
    );

    const result = await validateWithZod(expenseCreateSchema, payload);
    if (!result.success || !result.data) {
      const fieldErrors = result.errors || {};
      const messages = Object.entries(fieldErrors)
        .map(([field, errs]) => `${field}: ${errs.join(', ')}`)
        .join('; ');
      throw new ValidationError(messages || 'Validation failed', fieldErrors);
    }

    const validated = result.data;

    const db = await connectToDatabase();
    const vehicle = await db.collection('tblvehicles').findOne({
      license_plate: String(validated.license_plate).toUpperCase(),
      isDeleted: { $ne: true },
      ...(command.tenantId !== 'default' && command.tenantId !== 'system'
        ? { tenantId: command.tenantId }
        : {}),
    });

    if (!vehicle) {
      throw new AppError(
        `Vehicle "${validated.license_plate}" not found`,
        'VEHICLE_NOT_FOUND',
        400
      );
    }

    let expenseTypeId: ObjectId | undefined;
    if (validated.expense_type_id) {
      if (!ObjectId.isValid(String(validated.expense_type_id))) {
        throw new ValidationError('Invalid expense type ID');
      }
      const expenseType = await db.collection('tblexpense_types').findOne({
        _id: new ObjectId(String(validated.expense_type_id)),
        isDeleted: { $ne: true },
      });
      if (!expenseType) {
        throw new AppError('Expense type not found', 'EXPENSE_TYPE_NOT_FOUND', 400);
      }
      expenseTypeId = new ObjectId(String(validated.expense_type_id));
    }

    /**
     * FIX (category always displays as "Uncategorized" for new
     * expenses): this previously stored `expenseTypeId.toString()` --
     * a plain string -- on the expense document. tblexpense_types._id
     * is a native MongoDB ObjectId, and ExpenseRepository's
     * expenseTypeLookupStages() joins on
     * { localField: 'expense_type_id', foreignField: '_id' }.
     * MongoDB's $lookup requires exact BSON type equality, so a string
     * value NEVER matches an ObjectId value even when their hex text is
     * identical -- the join silently returned nothing for every expense
     * created through this handler, and expenseCategoryLabel() then
     * correctly (but misleadingly) fell back to "Uncategorized" even
     * though a real category had been selected and validated above.
     * Storing the ObjectId itself (matching how
     * scripts/seed-actual-expenses-from-file.ts has always stored it,
     * and how ExpenseRepository.getFilteredExpenses's own type filter
     * already expects it: `new ObjectId(filters.type)`) makes the join
     * -- and category filtering -- work correctly for every new expense.
     * See scripts/fix-expense-type-id-types.ts for a one-off migration
     * that repairs existing string-typed records created before this
     * fix.
     */
    // FIX: `tenantId` removed from this object. ExpenseRepository.create()
    // takes tenantId as its own (second) argument and sets it internally --
    // its data-parameter type is
    // Omit<Expense, '_id' | 'isDeleted' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'tenantId'>.
    // The Omit<> annotation below previously didn't exclude 'tenantId', so this
    // object carried a redundant (and, once assigned into a literal call site,
    // TS-rejected -- see bulk-import-expenses.handler.ts) tenantId field. It
    // only compiled here because expenseData is a separately-typed variable,
    // which skips TypeScript's excess-property check; the actual tenantId
    // used for the write was always the `command.tenantId` argument below,
    // never this one.
    const expenseData: Omit<
      Expense,
      '_id' | 'isDeleted' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'tenantId'
    > = {
      license_plate: String(validated.license_plate).toUpperCase(),
      amount: Number(validated.amount),
      date: new Date(validated.date as unknown as string),
      ...((vehicle as { orgUnitId?: string }).orgUnitId && {
        orgUnitId: (vehicle as { orgUnitId?: string }).orgUnitId,
      }),
      ...(expenseTypeId && { expense_type_id: expenseTypeId as unknown as string }),
      ...(validated.description && { description: String(validated.description).trim() }),
      ...(validated.jobTrip && { jobTrip: String(validated.jobTrip).trim() }),
      ...(validated.notes && { notes: String(validated.notes).trim() }),
    };

    const created = await this.expenseRepo.create(expenseData, command.tenantId, command.userId);

    // Emit event
    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new ExpenseCreatedEvent(created, {
      tenantId: command.tenantId,
      userId: command.userId,
      correlationId: command.commandName,
    }));

    return created;
  }
}

========================================
FILE: modules/expenses/commands/handlers/update-expense.handler.ts
========================================
/* eslint-disable @typescript-eslint/no-unused-vars */
// modules/expenses/commands/handlers/update-expense.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { UpdateExpenseCommand } from '../update-expense.command';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { expenseUpdateSchema } from '@/shared/validations/expense.schema';
import { Expense } from '@/shared/types/expense.types';
import { NotFoundError, ValidationError, AppError } from '@/server/errors/app.errors';
import { validateWithZod } from '@/shared/utils/validation.utils';
import { ObjectId } from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { ExpenseUpdatedEvent } from '@/modules/expenses/events/ExpenseUpdatedEvent';

const ALLOWED_FIELDS = [
  'license_plate',
  'amount',
  'date',
  'expense_type_id',
  'description',
  'jobTrip',
  'notes',
] as const;

export class UpdateExpenseHandler
  implements ICommandHandler<UpdateExpenseCommand, Expense>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(command: UpdateExpenseCommand): Promise<Expense> {
    const raw = command.rawData as Record<string, unknown>;

    const clean: Record<string, unknown> = { _id: command.expenseId };
    for (const field of ALLOWED_FIELDS) {
      if (raw[field] !== undefined) {
        clean[field] =
          field === 'amount' && typeof raw[field] === 'string'
            ? Number(raw[field])
            : raw[field];
      }
    }

    const result = await validateWithZod(expenseUpdateSchema, clean);
    if (!result.success || !result.data) {
      const fieldErrors = result.errors || {};
      const messages = Object.entries(fieldErrors)
        .map(([field, errs]) => `${field}: ${errs.join(', ')}`)
        .join('; ');
      throw new ValidationError(messages || 'Validation failed', fieldErrors);
    }

    const { _id, ...updateData } = result.data as Record<string, unknown>;
    const db = await connectToDatabase();

    if (updateData.license_plate) {
      const vehicle = await db.collection('tblvehicles').findOne({
        license_plate: String(updateData.license_plate).toUpperCase(),
        isDeleted: { $ne: true },
      });
      if (!vehicle) {
        throw new AppError(
          `Vehicle "${updateData.license_plate}" not found`,
          'VEHICLE_NOT_FOUND',
          400
        );
      }
      updateData.license_plate = String(updateData.license_plate).toUpperCase();
      updateData.orgUnitId = (vehicle as { orgUnitId?: string }).orgUnitId ?? null;
    }

    if (updateData.expense_type_id) {
      if (!ObjectId.isValid(String(updateData.expense_type_id))) {
        throw new ValidationError('Invalid expense type ID');
      }
      const expenseType = await db.collection('tblexpense_types').findOne({
        _id: new ObjectId(String(updateData.expense_type_id)),
        isDeleted: { $ne: true },
      });
      if (!expenseType) {
        throw new AppError('Expense type not found', 'EXPENSE_TYPE_NOT_FOUND', 400);
      }

      /**
       * FIX (editing an expense's category always reset it to
       * "Uncategorized"): this block validated that expense_type_id was
       * a real, existing ObjectId, but then let updateData.expense_type_id
       * fall through to expenseRepo.update() unchanged -- still the plain
       * string produced by expenseUpdateSchema (z.string()). tblexpense_types._id
       * is a native MongoDB ObjectId, and ExpenseRepository's
       * expenseTypeLookupStages() joins on
       * { localField: 'expense_type_id', foreignField: '_id' }. $lookup
       * requires exact BSON type equality, so the stored string never
       * matched the ObjectId and expenseCategoryLabel() fell back to
       * "Uncategorized" even though a valid category had just been
       * selected and confirmed to exist above. Assigning the ObjectId
       * itself here (matching how create-expense.handler.ts stores it)
       * makes the join -- and category filtering -- work correctly.
       */
      updateData.expense_type_id = new ObjectId(
        String(updateData.expense_type_id)
      ) as unknown as string;
    }

    const updated = await this.expenseRepo.update(
      command.expenseId,
      updateData as Partial<Omit<Expense, '_id' | 'tenantId' | 'createdAt' | 'createdBy'>>,
      command.tenantId,
      command.userId
    );

    if (!updated) {
      throw new NotFoundError('Expense not found');
    }

    // Emit event
    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new ExpenseUpdatedEvent(updated, updateData, {
      tenantId: command.tenantId,
      userId: command.userId,
      correlationId: command.commandName,
    }));

    return updated;
  }
}

========================================
FILE: modules/expenses/commands/handlers/delete-expense.handler.ts
========================================
// modules/expenses/commands/handlers/delete-expense.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { DeleteExpenseCommand } from '../delete-expense.command';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { NotFoundError } from '@/server/errors/app.errors';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { ExpenseDeletedEvent } from '@/modules/expenses/events/ExpenseDeletedEvent';

export class DeleteExpenseHandler
  implements ICommandHandler<DeleteExpenseCommand, void>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(command: DeleteExpenseCommand): Promise<void> {
    const existing = await this.expenseRepo.findById(
      command.expenseId,
      command.tenantId
    );
    if (!existing) {
      throw new NotFoundError('Expense not found');
    }

    if (command.soft) {
      await this.expenseRepo.softDelete(
        command.expenseId,
        command.tenantId,
        command.userId
      );
    } else {
      await this.expenseRepo.hardDelete(command.expenseId, command.tenantId);
    }

    // Emit event
    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new ExpenseDeletedEvent(
      command.expenseId,
      existing.license_plate,
      existing.amount,
      command.tenantId,
      {
        userId: command.userId,
        correlationId: command.commandName,
        soft: command.soft,
      }
    ));
  }
}

========================================
FILE: modules/expenses/commands/handlers/import-expenses.handler.ts
========================================
// modules/expenses/commands/handlers/import-expenses.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { ImportExpensesCommand } from '../import-expenses.command';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { ObjectId } from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';

export interface ImportRowResult {
  row: number;
  success: boolean;
  identifier?: string;
  column?: string;
  invalidValue?: string;
  error?: string;
  suggestedFix?: string;
}

export interface ImportSummary {
  total: number;
  succeeded: number;
  failed: number;
}

export interface ImportExpensesResult {
  summary: ImportSummary;
  results: ImportRowResult[];
}

function isValidDate(value: string): boolean {
  const d = new Date(value);
  return !isNaN(d.getTime());
}

function parseAmount(value: string): number | null {
  const n = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export class ImportExpensesHandler
  implements ICommandHandler<ImportExpensesCommand, ImportExpensesResult>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(command: ImportExpensesCommand): Promise<ImportExpensesResult> {
    const db = await connectToDatabase();
    const results: ImportRowResult[] = [];

    // Cache vehicle and category lookups across rows to avoid N+1 queries.
    const vehicleCache = new Map<string, boolean>();
    const categoryCache = new Map<string, ObjectId>();

    for (const row of command.rows) {
      const rowNum = row.rowNumber;

      // --- Column-level validation ---
      if (!row.date || !isValidDate(row.date)) {
        results.push({
          row: rowNum,
          success: false,
          column: 'date',
          invalidValue: row.date,
          error: 'Date is missing or not a valid date',
          suggestedFix: 'Provide a date in YYYY-MM-DD format.',
        });
        continue;
      }

      const plate = (row.license_plate || '').trim().toUpperCase();
      if (!plate) {
        results.push({
          row: rowNum,
          success: false,
          column: 'vehicle',
          invalidValue: row.license_plate,
          error: 'Vehicle license plate is required',
          suggestedFix: 'Provide a valid vehicle license plate.',
        });
        continue;
      }

      const amount = parseAmount(row.amount);
      if (amount === null || amount <= 0) {
        results.push({
          row: rowNum,
          success: false,
          column: 'amount',
          invalidValue: row.amount,
          error: 'Amount is missing or not a valid positive number',
          suggestedFix: 'Provide a valid numeric amount, e.g. 125.50.',
        });
        continue;
      }

      // --- Vehicle existence (cached) ---
      let vehicleExists = vehicleCache.get(plate);
      if (vehicleExists === undefined) {
        const vehicle = await db.collection('tblvehicles').findOne({
          license_plate: plate,
          isDeleted: { $ne: true },
        });
        vehicleExists = Boolean(vehicle);
        vehicleCache.set(plate, vehicleExists);
      }
      if (!vehicleExists) {
        results.push({
          row: rowNum,
          success: false,
          column: 'vehicle',
          invalidValue: plate,
          error: `Vehicle "${plate}" was not found`,
          suggestedFix: 'Check the license plate matches an existing vehicle exactly.',
        });
        continue;
      }

      // --- Category resolution (cached, auto-create if new) ---
      let expenseTypeId: ObjectId | undefined;
      const categoryName = (row.category || '').trim();
      if (categoryName) {
        const cacheKey = categoryName.toLowerCase();
        let typeId = categoryCache.get(cacheKey);
        if (!typeId) {
          const existing = await db.collection('tblexpense_types').findOne({
            name: { $regex: `^${categoryName}$`, $options: 'i' },
            tenantId: command.tenantId,
            isDeleted: { $ne: true },
          });
          if (existing) {
            typeId = existing._id as ObjectId;
          } else {
            const inserted = await db.collection('tblexpense_types').insertOne({
              name: categoryName,
              category: categoryName,
              tenantId: command.tenantId,
              isDeleted: false,
              createdAt: new Date(),
            });
            typeId = inserted.insertedId;
          }
          categoryCache.set(cacheKey, typeId);
        }
        expenseTypeId = typeId;
      }

      // --- Duplicate detection: same vehicle + same calendar day + same amount, in this tenant ---
      const parsedDate = new Date(row.date);
      const dayStart = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      const duplicate = await db.collection('tblexpenses').findOne({
        tenantId: command.tenantId,
        license_plate: plate,
        amount,
        date: { $gte: dayStart, $lt: dayEnd },
        isDeleted: { $ne: true },
      });

      if (duplicate) {
        results.push({
          row: rowNum,
          success: false,
          identifier: plate,
          error: `Duplicate of an existing expense for ${plate} on ${dayStart.toDateString()} for the same amount`,
          suggestedFix: 'Remove this row if it is a re-import, or adjust the amount/date if it is genuinely a separate expense.',
        });
        continue;
      }

      // --- Insert ---
      try {
        await this.expenseRepo.create(
          {
            license_plate: plate,
            amount,
            date: parsedDate,
            ...(expenseTypeId && { expense_type_id: expenseTypeId as unknown as string }),
            ...(row.description && { description: row.description.trim() }),
            ...(row.jobTrip && { jobTrip: row.jobTrip.trim() }),
          },
          command.tenantId,
          command.userId
        );
        results.push({ row: rowNum, success: true, identifier: plate });
      } catch (err) {
        results.push({
          row: rowNum,
          success: false,
          identifier: plate,
          error: err instanceof Error ? err.message : 'Unknown error while saving this row',
          suggestedFix: 'Check the row values and try again.',
        });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    return {
      summary: { total: results.length, succeeded, failed: results.length - succeeded },
      results,
    };
  }
}

========================================
FILE: modules/expenses/commands/handlers/bulk-import-expenses.handler.ts
========================================
// modules/expenses/commands/handlers/bulk-import-expenses.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { BulkImportExpensesCommand } from '../bulk-import-expenses.command';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { ValidationError } from '@/server/errors/app.errors';
import { ObjectId } from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';

export interface BulkImportResult {
  inserted: number;
  errors: number;
  errorDetails: string[];
}

export class BulkImportExpensesHandler
  implements ICommandHandler<BulkImportExpensesCommand, BulkImportResult>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(command: BulkImportExpensesCommand): Promise<BulkImportResult> {
    if (!command.records || command.records.length === 0) {
      throw new ValidationError('No records to import');
    }

    const db = await connectToDatabase();
    const result: BulkImportResult = {
      inserted: 0,
      errors: 0,
      errorDetails: [],
    };

    for (const record of command.records) {
      try {
        // FIX (critical -- cross-tenant data leak): the expense-type
        // lookup/create block below previously ran with NO tenantId
        // filter on the lookup, and NEVER set tenantId on the auto-
        // created document at all. That meant:
        //   1) A bulk import for Tenant A could match and silently
        //      reuse an expense type actually owned by Tenant B, purely
        //      because the category name matched case-insensitively.
        //   2) Any category auto-created via import had no tenant
        //      owner, so it was invisible to the importing tenant on
        //      every subsequent tenant-scoped read, while still being
        //      matchable (and reusable) by any other tenant's future
        //      import of the same category name.
        // Both the filter and the insert now scope to command.tenantId,
        // the same value used two lines below for expenseRepo.create().
        let expenseTypeId: ObjectId | null = null;
        if (record.category) {
          const expenseType = await db.collection('tblexpense_types').findOne({
            name: { $regex: `^${record.category}$`, $options: 'i' },
            tenantId: command.tenantId,
            isDeleted: { $ne: true },
          });

          if (!expenseType) {
            const insertResult = await db.collection('tblexpense_types').insertOne({
              name: record.category,
              category: record.category,
              tenantId: command.tenantId,
              isDeleted: false,
              createdAt: new Date(),
            });
            expenseTypeId = insertResult.insertedId;
          } else {
            expenseTypeId = expenseType._id as ObjectId;
          }
        }

        await this.expenseRepo.create(
          {
            license_plate: record.vehiclePlate || 'UNKNOWN',
            amount: record.totalAmount,
            date: new Date(record.date),
            // expense_type_id must be a real ObjectId (not a string) so
            // ExpenseRepository's $lookup join on tblexpense_types._id
            // resolves -- see create-expense.handler.ts for the same
            // rule and its history.
            ...(expenseTypeId && { expense_type_id: expenseTypeId as unknown as string }),
            description: record.items.join(', '),
            notes: `Ref: ${record.reference} | Account: ${record.account} | Cost Centre: ${record.costCentre}`,
          },
          command.tenantId,
          command.userId
        );

        result.inserted++;
      } catch (err) {
        result.errors++;
        result.errorDetails.push(
          `Failed to import record: ${record.reference} - ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
    }

    return result;
  }
}

========================================
FILE: modules/expenses/queries/get-expenses.query.ts
========================================
// modules/expenses/queries/get-expenses.query.ts

import { BaseQuery } from '@/server/cqrs/query';
import { ExpenseFilters } from '@/shared/types/expense.types';
import { PaginationParams } from '@/shared/types/common.types';

export class GetExpensesQuery extends BaseQuery {
  static readonly queryName = 'GetExpensesQuery';

  constructor(
    public readonly filters: ExpenseFilters,
    public readonly pagination: PaginationParams,
    public readonly tenantId: string
  ) {
    super(GetExpensesQuery.queryName);
  }
}

========================================
FILE: modules/expenses/queries/get-expense-by-id.query.ts
========================================
// modules/expenses/queries/get-expense-by-id.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetExpenseByIdQuery extends BaseQuery {
  static readonly queryName = 'GetExpenseByIdQuery';

  constructor(
    public readonly expenseId: string,
    public readonly tenantId: string
  ) {
    super(GetExpenseByIdQuery.queryName);
  }
}

========================================
FILE: modules/expenses/queries/get-expense-analytics.query.ts
========================================
// modules/expenses/queries/get-expense-analytics.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetExpenseAnalyticsQuery extends BaseQuery {
  static readonly queryName = 'GetExpenseAnalyticsQuery';

  constructor(
    public readonly tenantId: string,
    public readonly startDate: Date,
    public readonly endDate: Date
  ) {
    super(GetExpenseAnalyticsQuery.queryName);
  }
}

========================================
FILE: modules/expenses/queries/get-expense-stats.query.ts
========================================
// modules/expenses/queries/get-expense-stats.query.ts

import { BaseQuery } from '@/server/cqrs/query';
import { DateRange } from '@/shared/types/common.types';

export class GetExpenseStatsQuery extends BaseQuery {
  static readonly queryName = 'GetExpenseStatsQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: DateRange
  ) {
    super(GetExpenseStatsQuery.queryName);
  }
}

========================================
FILE: modules/expenses/queries/get-monthly-trends.query.ts
========================================
// modules/expenses/queries/get-monthly-trends.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetMonthlyTrendsQuery extends BaseQuery {
  static readonly queryName = 'GetMonthlyTrendsQuery';

  constructor(
    public readonly tenantId: string,
    public readonly months: number = 12
  ) {
    super(GetMonthlyTrendsQuery.queryName);
  }
}

========================================
FILE: modules/expenses/queries/get-expense-category-summary.query.ts
========================================
// modules/expenses/queries/get-expense-category-summary.query.ts
import { BaseQuery } from '@/server/cqrs/query';

export class GetExpenseCategorySummaryQuery extends BaseQuery {
  static readonly queryName = 'GetExpenseCategorySummaryQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date }
  ) {
    super(GetExpenseCategorySummaryQuery.queryName);
  }
}

========================================
FILE: modules/expenses/queries/get-expense-category-over-time.query.ts
========================================
//modules/expenses/queries/get-expense-category-over-time.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetExpenseCategoryOverTimeQuery extends BaseQuery {
  static readonly queryName = 'GetExpenseCategoryOverTimeQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date }
  ) {
    super(GetExpenseCategoryOverTimeQuery.queryName);
  }
}

========================================
FILE: modules/expenses/queries/get-expense-amount-distribution.query.ts
========================================
//modules/expenses/queries/get-expense-amount-distribution.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetExpenseAmountDistributionQuery extends BaseQuery {
  static readonly queryName = 'GetExpenseAmountDistributionQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date }
  ) {
    super(GetExpenseAmountDistributionQuery.queryName);
  }
}

========================================
FILE: modules/expenses/queries/get-expense-outliers.query.ts
========================================
// modules/expenses/queries/get-expense-outliers.query.ts
import { BaseQuery } from '@/server/cqrs/query';

export class GetExpenseOutliersQuery extends BaseQuery {
  static readonly queryName = 'GetExpenseOutliersQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly zThreshold: number = 2.5,
    public readonly limit: number = 25
  ) {
    super(GetExpenseOutliersQuery.queryName);
  }
}

========================================
FILE: modules/expenses/queries/get-daily-expense-totals.query.ts
========================================
// modules/expenses/queries/get-daily-expense-totals.query.ts
import { BaseQuery } from '@/server/cqrs/query';

export class GetDailyExpenseTotalsQuery extends BaseQuery {
  static readonly queryName = 'GetDailyExpenseTotalsQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date }
  ) {
    super(GetDailyExpenseTotalsQuery.queryName);
  }
}

========================================
FILE: modules/expenses/queries/get-top-expense-transactions.query.ts
========================================
// modules/expenses/queries/get-top-expense-transactions.query.ts
import { BaseQuery } from '@/server/cqrs/query';

export class GetTopExpenseTransactionsQuery extends BaseQuery {
  static readonly queryName = 'GetTopExpenseTransactionsQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly limit: number = 10
  ) {
    super(GetTopExpenseTransactionsQuery.queryName);
  }
}



========================================
FILE: modules/expenses/queries/get-top-vehicles-by-expense.query.ts
========================================
//modules/expenses/queries/get-top-vehicles-by-expense.query.ts
import { BaseQuery } from '@/server/cqrs/query';

export class GetTopVehiclesByExpenseQuery extends BaseQuery {
  static readonly queryName = 'GetTopVehiclesByExpenseQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly limit: number = 10
  ) {
    super(GetTopVehiclesByExpenseQuery.queryName);
  }
}

========================================
FILE: modules/expenses/queries/get-vehicle-expense-breakdown.query.ts
========================================
//modules/expenses/queries/get-vehicle-expense-breakdown.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetVehicleExpenseBreakdownQuery extends BaseQuery {
  static readonly queryName = 'GetVehicleExpenseBreakdownQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly vehicleLimit: number = 8
  ) {
    super(GetVehicleExpenseBreakdownQuery.queryName);
  }
}

========================================
FILE: modules/expenses/queries/get-job-trip-expense.query.ts
========================================
//modules/expenses/queries/get-job-trip-expense.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetJobTripExpenseQuery extends BaseQuery {
  static readonly queryName = 'GetJobTripExpenseQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly jobLimit: number = 10
  ) {
    super(GetJobTripExpenseQuery.queryName);
  }
}

========================================
FILE: modules/expenses/queries/handlers/get-expenses.handler.ts
========================================
// modules/expenses/queries/handlers/get-expenses.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetExpensesQuery } from '../get-expenses.query';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { Expense } from '@/shared/types/expense.types';
import { PaginatedResponse } from '@/shared/types/common.types';

export class GetExpensesHandler
  implements IQueryHandler<GetExpensesQuery, PaginatedResponse<Expense>>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(query: GetExpensesQuery): Promise<PaginatedResponse<Expense>> {
    return this.expenseRepo.getFilteredExpenses(
      query.filters,
      query.tenantId,
      query.pagination
    );
  }
}

========================================
FILE: modules/expenses/queries/handlers/get-expense-by-id.handler.ts
========================================
// modules/expenses/queries/handlers/get-expense-by-id.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetExpenseByIdQuery } from '../get-expense-by-id.query';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { Expense } from '@/shared/types/expense.types';
import { NotFoundError } from '@/server/errors/app.errors';

export class GetExpenseByIdHandler
  implements IQueryHandler<GetExpenseByIdQuery, Expense>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(query: GetExpenseByIdQuery): Promise<Expense> {
    const expense = await this.expenseRepo.findById(query.expenseId, query.tenantId);
    if (!expense) {
      throw new NotFoundError('Expense not found');
    }
    return expense;
  }
}

========================================
FILE: modules/expenses/queries/handlers/get-expense-analytics.handler.ts
========================================
// modules/expenses/queries/handlers/get-expense-analytics.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetExpenseAnalyticsQuery } from '../get-expense-analytics.query';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';

export class GetExpenseAnalyticsHandler
  implements IQueryHandler<GetExpenseAnalyticsQuery, unknown[]>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(query: GetExpenseAnalyticsQuery): Promise<unknown[]> {
    return this.expenseRepo.getExpenseAnalytics(
      query.tenantId,
      query.startDate,
      query.endDate
    );
  }
}

========================================
FILE: modules/expenses/queries/handlers/get-expense-stats.handler.ts
========================================
// modules/expenses/queries/handlers/get-expense-stats.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetExpenseStatsQuery } from '../get-expense-stats.query';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { ExpenseStats } from '@/shared/types/expense.types';

export class GetExpenseStatsHandler
  implements IQueryHandler<GetExpenseStatsQuery, ExpenseStats>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(query: GetExpenseStatsQuery): Promise<ExpenseStats> {
    return this.expenseRepo.getExpenseStats(query.tenantId, query.dateRange);
  }
}

========================================
FILE: modules/expenses/queries/handlers/get-monthly-trends.handler.ts
========================================
// modules/expenses/queries/handlers/get-monthly-trends.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetMonthlyTrendsQuery } from '../get-monthly-trends.query';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';

export class GetMonthlyTrendsHandler
  implements IQueryHandler<GetMonthlyTrendsQuery, Array<{ month: string; total: number }>>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(query: GetMonthlyTrendsQuery): Promise<Array<{ month: string; total: number }>> {
    return this.expenseRepo.getMonthlyTrends(query.tenantId, query.months);
  }
}

========================================
FILE: modules/expenses/queries/handlers/get-expense-category-summary.handler.ts
========================================
// modules/expenses/queries/handlers/get-expense-category-summary.handler.ts
import { IQueryHandler } from '@/server/cqrs/query';
import { GetExpenseCategorySummaryQuery } from '../get-expense-category-summary.query';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { CategorySummary } from '@/shared/types/expense.types';

export class GetExpenseCategorySummaryHandler
  implements IQueryHandler<GetExpenseCategorySummaryQuery, CategorySummary[]>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(query: GetExpenseCategorySummaryQuery): Promise<CategorySummary[]> {
    return this.expenseRepo.getExpenseCategorySummary(query.tenantId, query.dateRange);
  }
}

========================================
FILE: modules/expenses/queries/handlers/get-expense-category-over-time.handler.ts
========================================
//modules/expenses/queries/handlers/get-expense-category-over-time.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetExpenseCategoryOverTimeQuery } from '../get-expense-category-over-time.query';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { ExpenseCategoryOverTimePoint } from '@/shared/types/expense.types';

export class GetExpenseCategoryOverTimeHandler
  implements IQueryHandler<GetExpenseCategoryOverTimeQuery, ExpenseCategoryOverTimePoint[]>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(query: GetExpenseCategoryOverTimeQuery): Promise<ExpenseCategoryOverTimePoint[]> {
    return this.expenseRepo.getExpenseCategoryOverTime(query.tenantId, query.dateRange);
  }
}

========================================
FILE: modules/expenses/queries/handlers/get-expense-amount-distribution.handler.ts
========================================
//modules/expenses/queries/handlers/get-expense-amount-distribution.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetExpenseAmountDistributionQuery } from '../get-expense-amount-distribution.query';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { ExpenseAmountDistributionBucket } from '@/shared/types/expense.types';

export class GetExpenseAmountDistributionHandler
  implements IQueryHandler<GetExpenseAmountDistributionQuery, ExpenseAmountDistributionBucket[]>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(query: GetExpenseAmountDistributionQuery): Promise<ExpenseAmountDistributionBucket[]> {
    return this.expenseRepo.getExpenseAmountDistribution(query.tenantId, query.dateRange);
  }
}

========================================
FILE: modules/expenses/queries/handlers/get-expense-outliers.handler.ts
========================================
// modules/expenses/queries/handlers/get-expense-outliers.handler.ts
import { IQueryHandler } from '@/server/cqrs/query';
import { GetExpenseOutliersQuery } from '../get-expense-outliers.query';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { ExpenseOutlierRow } from '@/shared/types/expense.types';

export class GetExpenseOutliersHandler
  implements IQueryHandler<GetExpenseOutliersQuery, ExpenseOutlierRow[]>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(query: GetExpenseOutliersQuery): Promise<ExpenseOutlierRow[]> {
    return this.expenseRepo.getExpenseOutliers(query.tenantId, query.dateRange, query.zThreshold, query.limit);
  }
}

========================================
FILE: modules/expenses/queries/handlers/get-daily-expense-totals.handler.ts
========================================
// modules/expenses/queries/handlers/get-daily-expense-totals.handler.ts
import { IQueryHandler } from '@/server/cqrs/query';
import { GetDailyExpenseTotalsQuery } from '../get-daily-expense-totals.query';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { DailyExpenseTotal } from '@/shared/types/expense.types';

export class GetDailyExpenseTotalsHandler
  implements IQueryHandler<GetDailyExpenseTotalsQuery, DailyExpenseTotal[]>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(query: GetDailyExpenseTotalsQuery): Promise<DailyExpenseTotal[]> {
    return this.expenseRepo.getDailyExpenseTotals(query.tenantId, query.dateRange);
  }
}

========================================
FILE: modules/expenses/queries/handlers/get-top-expense-transactions.handler.ts
========================================
// modules/expenses/queries/handlers/get-top-expense-transactions.handler.ts
import { IQueryHandler } from '@/server/cqrs/query';
import { GetTopExpenseTransactionsQuery } from '../get-top-expense-transactions.query';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { TopExpenseTransactionRow } from '@/shared/types/expense.types';

export class GetTopExpenseTransactionsHandler
  implements IQueryHandler<GetTopExpenseTransactionsQuery, TopExpenseTransactionRow[]>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(query: GetTopExpenseTransactionsQuery): Promise<TopExpenseTransactionRow[]> {
    return this.expenseRepo.getTopExpenseTransactions(query.tenantId, query.dateRange, query.limit);
  }
}

========================================
FILE: modules/expenses/queries/handlers/get-top-vehicles-by-expense.handler.ts
========================================
//modules/expenses/queries/handlers/get-top-vehicles-by-expense.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetTopVehiclesByExpenseQuery } from '../get-top-vehicles-by-expense.query';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { TopVehicleExpenseRow } from '@/shared/types/expense.types';

export class GetTopVehiclesByExpenseHandler
  implements IQueryHandler<GetTopVehiclesByExpenseQuery, TopVehicleExpenseRow[]>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(query: GetTopVehiclesByExpenseQuery): Promise<TopVehicleExpenseRow[]> {
    return this.expenseRepo.getTopVehiclesByExpense(query.tenantId, query.dateRange, query.limit);
  }
}

========================================
FILE: modules/expenses/queries/handlers/get-vehicle-expense-breakdown.handler.ts
========================================
//modules/expenses/queries/handlers/get-vehicle-expense-breakdown.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetVehicleExpenseBreakdownQuery } from '../get-vehicle-expense-breakdown.query';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { VehicleExpenseBreakdownRow } from '@/shared/types/expense.types';

export class GetVehicleExpenseBreakdownHandler
  implements IQueryHandler<GetVehicleExpenseBreakdownQuery, VehicleExpenseBreakdownRow[]>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(query: GetVehicleExpenseBreakdownQuery): Promise<VehicleExpenseBreakdownRow[]> {
    return this.expenseRepo.getVehicleExpenseBreakdown(query.tenantId, query.dateRange, query.vehicleLimit);
  }
}

========================================
FILE: modules/expenses/queries/handlers/get-job-trip-expense.handler.ts
========================================
//modules/expenses/queries/handlers/get-job-trip-expense.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetJobTripExpenseQuery } from '../get-job-trip-expense.query';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { JobTripExpenseRow } from '@/shared/types/expense.types';

export class GetJobTripExpenseHandler
  implements IQueryHandler<GetJobTripExpenseQuery, JobTripExpenseRow[]>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(query: GetJobTripExpenseQuery): Promise<JobTripExpenseRow[]> {
    return this.expenseRepo.getJobTripExpenseAnalysis(query.tenantId, query.dateRange, query.jobLimit);
  }
}

========================================
FILE: modules/vehicles/repositories/vehicle.repository.ts
========================================
// modules/vehicles/repositories/vehicle.repository.ts

import { Filter, Document, ObjectId } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import {
  Vehicle,
  VehicleFilters,
  VehicleStats,
} from '@/shared/types/vehicle.types';
import {
  PaginationParams,
  PaginatedResponse,
} from '@/shared/types/common.types';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import { EXPORT_ROW_CAP, ExportDataset } from '@/shared/export';

export class VehicleRepository extends BaseRepository<Vehicle> {
  protected collectionName = 'tblvehicles';

  private isSuperAdminTenant(tenantId: string): boolean {
    return (
      tenantId === 'default' ||
      tenantId === 'system' ||
      tenantId === 'super_admin'
    );
  }

  async findByLicensePlate(
    licensePlate: string,
    tenantId: string
  ): Promise<Vehicle | null> {
    return this.findOne(
      { license_plate: licensePlate.toUpperCase() } as Filter<Vehicle>,
      tenantId,
      false,
      this.isSuperAdminTenant(tenantId)
    );
  }

  async findByLicensePlates(
    licensePlates: string[],
    tenantId: string
  ): Promise<Vehicle[]> {
    return this.findMany(
      {
        license_plate: { $in: licensePlates.map((p) => p.toUpperCase()) },
      } as Filter<Vehicle>,
      tenantId,
      {},
      false,
      this.isSuperAdminTenant(tenantId)
    );
  }

  async searchVehicles(
    searchTerm: string,
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<Vehicle>> {
    const filter: Filter<Vehicle> = {
      $or: [
        { license_plate: { $regex: searchTerm, $options: 'i' } },
        { make: { $regex: searchTerm, $options: 'i' } },
        { model: { $regex: searchTerm, $options: 'i' } },
        { vin: { $regex: searchTerm, $options: 'i' } },
      ],
    } as Filter<Vehicle>;
    return this.findWithPagination(
      filter,
      pagination,
      tenantId,
      false,
      this.isSuperAdminTenant(tenantId)
    );
  }

  async getFilteredVehicles(
    filters: VehicleFilters,
    pagination: PaginationParams,
    tenantId: string
  ): Promise<PaginatedResponse<Vehicle>> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);

    const query: Record<string, unknown> = {
      isDeleted: { $ne: true },
    };

    if (!isSuperAdmin) {
      query.tenantId = tenantId;
    }

    if (filters.license_plate) {
      query.license_plate = {
        $regex: `^${filters.license_plate}`,
        $options: 'i',
      };
    }
    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.make) {
      query.make = { $regex: `^${filters.make}`, $options: 'i' };
    }
    if (filters.model) {
      query.model = { $regex: `^${filters.model}`, $options: 'i' };
    }
    if (filters.year) {
      query.year = filters.year;
    }
    if (filters.vehicle_type) {
      query.vehicle_type = {
        $regex: `^${filters.vehicle_type}`,
        $options: 'i',
      };
    }

    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      collection
        .find(query as Filter<Vehicle>)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      collection.countDocuments(query as Filter<Vehicle>),
    ]);

    return {
      data: data as Vehicle[],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Single source of truth for the tenant + org-unit-scope + filter
   * query shared by getFilteredVehiclesInScope (paginated list) and
   * getFilteredVehiclesForExport (uncapped-by-pagination export).
   * Extracted during the Phase 2 Enterprise Export Framework work so
   * the two call sites can never drift on what "matches the filters,
   * in scope" means.
   */
  private buildScopedQuery(filters: VehicleFilters, context: TenantContext): Record<string, unknown> {
    const query: Record<string, unknown> = {
      isDeleted: { $ne: true },
    };

    // Tenant isolation â€” super admins skip this, same as getFilteredVehicles
    if (!this.isSuperAdminTenant(context.organizationId)) {
      query.tenantId = context.organizationId;
    }

    if (filters.license_plate) {
      query.license_plate = {
        $regex: `^${filters.license_plate}`,
        $options: 'i',
      };
    }
    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.make) {
      query.make = { $regex: `^${filters.make}`, $options: 'i' };
    }
    if (filters.model) {
      query.model = { $regex: `^${filters.model}`, $options: 'i' };
    }
    if (filters.year) {
      query.year = filters.year;
    }
    if (filters.vehicle_type) {
      query.vehicle_type = {
        $regex: `^${filters.vehicle_type}`,
        $options: 'i',
      };
    }

    // Apply org-unit scope filter on top of everything else
    const scopeFilter = tenantScopeService.buildFilter<Vehicle>(context, 'orgUnitId');
    Object.assign(query, scopeFilter);

    return query;
  }

  async getFilteredVehiclesInScope(
    filters: VehicleFilters,
    pagination: PaginationParams,
    context: TenantContext
  ): Promise<PaginatedResponse<Vehicle>> {
    const collection = await this.getCollection();
    const query = this.buildScopedQuery(filters, context);

    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      collection
        .find(query as Filter<Vehicle>)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      collection.countDocuments(query as Filter<Vehicle>),
    ]);

    return {
      data: data as Vehicle[],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Export variant of getFilteredVehiclesInScope: same filters, same
   * tenant + org-unit scope, but ignores UI pagination entirely and
   * instead returns up to `cap` matching records (default
   * EXPORT_ROW_CAP) plus the true total match count, so the caller can
   * tell whether the export is complete or was truncated. This is the
   * Phase 2 fix for the "export only exports the currently loaded
   * page" bug -- previously Vehicles had no export query at all,
   * exports were built client-side from whatever page of
   * getFilteredVehiclesInScope() happened to already be loaded in the
   * UI table.
   */
  async getFilteredVehiclesForExport(
    filters: VehicleFilters,
    context: TenantContext,
    cap: number = EXPORT_ROW_CAP
  ): Promise<ExportDataset<Vehicle>> {
    const collection = await this.getCollection();
    const query = this.buildScopedQuery(filters, context);

    const [rows, totalMatched] = await Promise.all([
      collection
        .find(query as Filter<Vehicle>)
        .sort({ createdAt: -1 })
        .limit(cap)
        .toArray(),
      collection.countDocuments(query as Filter<Vehicle>),
    ]);

    return {
      rows: rows as Vehicle[],
      totalMatched,
      truncated: totalMatched > rows.length,
      exportCap: cap,
    };
  }

  async getVehicleStats(tenantId: string): Promise<VehicleStats> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);

    const baseFilter: Record<string, unknown> = {
      isDeleted: { $ne: true },
    };
    if (!isSuperAdmin) {
      baseFilter.tenantId = tenantId;
    }

    const [total, active, inactive, maintenance] = await Promise.all([
      collection.countDocuments(baseFilter as Filter<Vehicle>),
      collection.countDocuments({
        ...baseFilter,
        status: 'active',
      } as Filter<Vehicle>),
      collection.countDocuments({
        ...baseFilter,
        status: 'inactive',
      } as Filter<Vehicle>),
      collection.countDocuments({
        ...baseFilter,
        status: 'maintenance',
      } as Filter<Vehicle>),
    ]);

    return { total, active, inactive, maintenance };
  }

  async getVehiclesByStatus(
    status: string,
    tenantId: string
  ): Promise<Vehicle[]> {
    return this.findMany(
      { status } as Filter<Vehicle>,
      tenantId,
      {},
      false,
      this.isSuperAdminTenant(tenantId)
    );
  }

  async getVehiclesDueForService(
    mileageThreshold: number,
    tenantId: string
  ): Promise<Vehicle[]> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);

    const baseFilter: Record<string, unknown> = {
      isDeleted: { $ne: true },
    };
    if (!isSuperAdmin) {
      baseFilter.tenantId = tenantId;
    }

    const pipeline = [
      { $match: baseFilter },
      {
        $lookup: {
          from: 'tblmeterlogs',
          let: { plate: '$license_plate' },
          pipeline: [
            {
              $match: { $expr: { $eq: ['$license_plate', '$$plate'] } },
            },
            { $sort: { date: -1 } },
            { $limit: 1 },
            { $project: { odometer: 1 } },
          ],
          as: 'latest_meter',
        },
      },
      {
        $addFields: {
          currentOdometer: {
            $ifNull: [{ $arrayElemAt: ['$latest_meter.odometer', 0] }, 0],
          },
        },
      },
      {
        $match: {
          $expr: {
            $gte: [
              {
                $subtract: [
                  '$currentOdometer',
                  { $ifNull: ['$last_service_odometer', 0] },
                ],
              },
              mileageThreshold,
            ],
          },
        },
      },
    ];

    return collection.aggregate<Vehicle>(pipeline).toArray();
  }

  async getVehicleAnalytics(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Document[]> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);

    const baseFilter: Record<string, unknown> = {
      isDeleted: { $ne: true },
    };
    if (!isSuperAdmin) {
      baseFilter.tenantId = tenantId;
    }

    const pipeline = [
      { $match: baseFilter },
      {
        $lookup: {
          from: 'tblexpenses',
          let: { plate: '$license_plate' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$license_plate', '$$plate'] },
                date: { $gte: startDate, $lte: endDate },
              },
            },
            { $group: { _id: null, total: { $sum: '$amount' } } },
          ],
          as: 'expense_total',
        },
      },
      {
        $lookup: {
          from: 'tblfuellogs',
          let: { plate: '$license_plate' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$license_plate', '$$plate'] },
                date: { $gte: startDate, $lte: endDate },
              },
            },
            {
              $group: {
                _id: null,
                totalFuel: { $sum: '$fuel_volume' },
                totalCost: { $sum: '$cost' },
              },
            },
          ],
          as: 'fuel_stats',
        },
      },
      {
        $addFields: {
          totalExpenses: {
            $ifNull: [
              { $arrayElemAt: ['$expense_total.total', 0] },
              0,
            ],
          },
          totalFuelCost: {
            $ifNull: [
              { $arrayElemAt: ['$fuel_stats.totalCost', 0] },
              0,
            ],
          },
          totalFuelVolume: {
            $ifNull: [
              { $arrayElemAt: ['$fuel_stats.totalFuel', 0] },
              0,
            ],
          },
        },
      },
      {
        $project: {
          _id: 1,
          license_plate: 1,
          make: 1,
          model: 1,
          year: 1,
          status: 1,
          totalExpenses: 1,
          totalFuelCost: 1,
          totalFuelVolume: 1,
          totalOperatingCost: {
            $add: ['$totalExpenses', '$totalFuelCost'],
          },
        },
      },
      { $sort: { totalOperatingCost: -1 } },
    ];

    return collection.aggregate(pipeline).toArray();
  }
}

export const vehicleRepository = new VehicleRepository();

========================================
FILE: modules/vehicles/services/vehicle-query.service.ts
========================================
// modules/vehicles/services/vehicle-query.service.ts

import { Document } from 'mongodb';
import { queryBus } from '@/server/cqrs/query-bus';
import { GetVehicleByIdQuery } from '../queries/get-vehicle-by-id.query';
import { GetVehicleByLicensePlateQuery } from '../queries/get-vehicle-by-license-plate.query';
import { GetVehiclesQuery } from '../queries/get-vehicles.query';
import { GetVehicleStatsQuery } from '../queries/get-vehicle-stats.query';
import { SearchVehiclesQuery } from '../queries/search-vehicles.query';
import { GetVehiclesByStatusQuery } from '../queries/get-vehicles-by-status.query';
import { GetVehiclesDueForServiceQuery } from '../queries/get-vehicles-due-for-service.query';
import { GetVehicleAnalyticsQuery } from '../queries/get-vehicle-analytics.query';
import {
  Vehicle,
  VehicleFilters,
  VehicleStats,
} from '@/shared/types/vehicle.types';
import { PaginatedResponse, PaginationParams } from '@/shared/types/common.types';

/**
 * Stable facade over the query bus for the Vehicles read side. Mirrors
 * VehicleCommandService's role on the write side.
 */
export class VehicleQueryService {
  async getVehicleById(vehicleId: string, tenantId: string): Promise<Vehicle> {
    return queryBus.execute<Vehicle>(new GetVehicleByIdQuery(vehicleId, tenantId));
  }

  async getVehicleByLicensePlate(
    licensePlate: string,
    tenantId: string
  ): Promise<Vehicle | null> {
    return queryBus.execute<Vehicle | null>(
      new GetVehicleByLicensePlateQuery(licensePlate, tenantId)
    );
  }

  async getFilteredVehicles(
    filters: VehicleFilters,
    pagination: PaginationParams,
    tenantId: string
  ): Promise<PaginatedResponse<Vehicle>> {
    return queryBus.execute<PaginatedResponse<Vehicle>>(
      new GetVehiclesQuery(filters, pagination, tenantId)
    );
  }

  async getVehicleStats(tenantId: string): Promise<VehicleStats> {
    return queryBus.execute<VehicleStats>(new GetVehicleStatsQuery(tenantId));
  }

  async searchVehicles(
    searchTerm: string,
    pagination: PaginationParams,
    tenantId: string
  ): Promise<PaginatedResponse<Vehicle>> {
    return queryBus.execute<PaginatedResponse<Vehicle>>(
      new SearchVehiclesQuery(searchTerm, pagination, tenantId)
    );
  }

  async getVehiclesByStatus(status: string, tenantId: string): Promise<Vehicle[]> {
    return queryBus.execute<Vehicle[]>(
      new GetVehiclesByStatusQuery(status, tenantId)
    );
  }

  async getVehiclesDueForService(
    mileageThreshold: number,
    tenantId: string
  ): Promise<Vehicle[]> {
    return queryBus.execute<Vehicle[]>(
      new GetVehiclesDueForServiceQuery(mileageThreshold, tenantId)
    );
  }

  async getVehicleAnalytics(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Document[]> {
    return queryBus.execute<Document[]>(
      new GetVehicleAnalyticsQuery(tenantId, startDate, endDate)
    );
  }
}

export const vehicleQueryService = new VehicleQueryService();

========================================
FILE: modules/drivers/repositories/driver.repository.ts
========================================
// modules/drivers/repositories/driver.repository.ts

import { BaseRepository } from '@/server/repositories/base.repository';
import { Driver, DriverFilters } from '@/shared/types/driver.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { Filter, ObjectId } from 'mongodb';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class DriverRepository extends BaseRepository<Driver> {
  protected collectionName = 'tbldrivers';

  async getFilteredDrivers(
    filters: DriverFilters,
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<Driver>> {
    const filter: Record<string, unknown> = {};

    if (filters.search) {
      filter.$or = [
        { name: { $regex: escapeRegex(filters.search), $options: 'i' } },
        { email: { $regex: escapeRegex(filters.search), $options: 'i' } },
        { driver_code: { $regex: escapeRegex(filters.search), $options: 'i' } },
      ];
    }
    if (filters.status) {
      filter.status = filters.status;
    }

    return this.findWithPagination(filter as Filter<Driver>, pagination, tenantId);
  }

  /**
   * All non-deleted drivers for a tenant, unpaginated, sorted by name.
   * Backs the controller's no-`page`-param fallback used by every picker
   * (FuelForm, FuelFilters, DriverSelect) -- mirrors
   * FuelStationRepository/FuelCardRepository, which return a bare array
   * the same way when no pagination is requested.
   */
  async findAll(tenantId: string): Promise<Driver[]> {
    const collection = await this.getCollection();
    return collection
      .find({ tenantId, isDeleted: { $ne: true } } as Filter<Driver>)
      .sort({ name: 1 })
      .toArray() as Promise<Driver[]>;
  }

  /**
   * Resolves a free-text `driver` cell from the Fuel import CSV/Excel
   * (a full name, a driver_code, or a raw ObjectId string) to exactly one
   * active, non-deleted driver. Used by FuelController.importFuelLogs.
   *
   * Deliberately conservative: an ObjectId match short-circuits and
   * returns immediately (unambiguous by definition); a name/code match
   * only resolves if there is EXACTLY one hit. Two drivers sharing a
   * name is treated as "not found" rather than guessing, so the caller
   * surfaces a specific, correctable row-level import error instead of
   * silently assigning fuel to the wrong person.
   */
  async findByNameOrCode(query: string, tenantId: string): Promise<Driver | null> {
    const trimmed = query.trim();
    if (!trimmed) return null;
    const collection = await this.getCollection();

    if (ObjectId.isValid(trimmed)) {
      const byId = await collection.findOne({
        _id: new ObjectId(trimmed) as unknown as Driver['_id'],
        tenantId,
        isDeleted: { $ne: true },
      } as Filter<Driver>);
      if (byId) return byId as Driver;
    }

    const matches = await collection
      .find({
        tenantId,
        isDeleted: { $ne: true },
        status: 'active',
        $or: [
          { name: { $regex: `^${escapeRegex(trimmed)}$`, $options: 'i' } },
          { driver_code: { $regex: `^${escapeRegex(trimmed)}$`, $options: 'i' } },
        ],
      } as Filter<Driver>)
      .limit(2)
      .toArray();

    return matches.length === 1 ? (matches[0] as Driver) : null;
  }
}

export const driverRepository = new DriverRepository();

========================================
FILE: modules/drivers/services/driver.service.ts
========================================
/* eslint-disable @typescript-eslint/no-unused-vars */
// modules/drivers/services/driver.service.ts

import { driverRepository, DriverRepository } from '../repositories/driver.repository';
import { driverCreateSchema, driverUpdateSchema } from '@/shared/validations/driver.schema';
import { validateWithZod } from '@/shared/utils/validation.utils';
import { ValidationError, NotFoundError } from '@/server/errors/app.errors';
import { Driver, DriverFilters } from '@/shared/types/driver.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { DriverCreatedEvent } from '../events/DriverCreatedEvent';
import { DriverUpdatedEvent } from '../events/DriverUpdatedEvent';
import { DriverDeletedEvent } from '../events/DriverDeletedEvent';

type DriverCreatePayload = Omit<
  Driver,
  '_id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'isDeleted' | 'deletedAt'
>;

export class DriverService {
  constructor(private readonly repo: DriverRepository) {}

  async list(
    filters: DriverFilters,
    pagination: PaginationParams,
    tenantId: string
  ): Promise<PaginatedResponse<Driver>> {
    return this.repo.getFilteredDrivers(filters, tenantId, pagination);
  }

  async getById(id: string, tenantId: string): Promise<Driver> {
    const driver = await this.repo.findById(id, tenantId);
    if (!driver) throw new NotFoundError('Driver not found');
    return driver;
  }

  async create(rawData: unknown, tenantId: string, userId?: string): Promise<Driver> {
    const result = await validateWithZod(driverCreateSchema, rawData);
    if (!result.success || !result.data) {
      throw new ValidationError('Validation failed', result.errors || {});
    }

    const payload: DriverCreatePayload = {
      tenantId,
      name: result.data.name,
      status: result.data.status ?? 'active',
      email: result.data.email ?? undefined,
      phone: result.data.phone ?? undefined,
      driver_code: result.data.driver_code ?? undefined,
      license_number: result.data.license_number ?? undefined,
      license_expiry: result.data.license_expiry
        ? new Date(result.data.license_expiry as string)
        : undefined,
      notes: result.data.notes ?? undefined,
    };

    const created = await this.repo.create(payload, tenantId, userId);

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new DriverCreatedEvent(created, { tenantId, userId }));

    return created;
  }

  async update(id: string, rawData: unknown, tenantId: string, userId?: string): Promise<Driver> {
    const result = await validateWithZod(driverUpdateSchema, {
      ...(rawData as Record<string, unknown>),
      _id: id,
    });
    if (!result.success || !result.data) {
      throw new ValidationError('Validation failed', result.errors || {});
    }

    const { _id, ...rest } = result.data;
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rest)) {
      updateData[key] = value === null ? undefined : value;
    }
    if (updateData.license_expiry) {
      updateData.license_expiry = new Date(updateData.license_expiry as string);
    }

    const updated = await this.repo.update(
      id,
      updateData as Partial<Omit<Driver, '_id' | 'tenantId' | 'createdAt' | 'createdBy'>>,
      tenantId,
      userId
    );
    if (!updated) throw new NotFoundError('Driver not found');

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new DriverUpdatedEvent(updated, updateData, { tenantId, userId }));

    return updated;
  }

  async remove(id: string, tenantId: string, userId?: string, soft: boolean = true): Promise<void> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Driver not found');

    if (soft) await this.repo.softDelete(id, tenantId, userId);
    else await this.repo.hardDelete(id, tenantId);

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new DriverDeletedEvent(id, existing.name, tenantId, { userId, soft }));
  }
}

export const driverService = new DriverService(driverRepository);


========================================
FILE: app/api/trips/route.ts
========================================
// app/api/trips/route.ts
//
// FIX (High â€” duplicate auth strategies): converted from legacy
// requireAuth() to withAuth + Permission, matching the rest of the
// mature modules. Permission.TRIP_VIEW / TRIP_CREATE confirmed against
// server/permissions/roles.ts.

import { NextRequest } from 'next/server';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { tripController } from '@/modules/trips/controllers/trip.controller';

export const GET = withAuth(
  async (req: NextRequest) => tripController.getTrips(req),
  { permission: Permission.TRIP_VIEW }
);

export const POST = withAuth(
  async (req: NextRequest) => tripController.createTrip(req),
  { permission: Permission.TRIP_CREATE }
);

========================================
FILE: app/api/trips/[id]/route.ts
========================================
/* eslint-disable @typescript-eslint/no-unused-vars */
// app/api/trips/[id]/route.ts
//
// FIX (Critical-adjacent â€” missing auth entirely): this route had no
// auth check of any kind â€” not even legacy requireAuth(). Any
// unauthenticated caller could read, update, or delete any trip by ID,
// with no permission or tenant check at the route layer. Converted to
// withAuth + Permission with the async params pattern (Next.js 15
// params is a Promise). Tenant scoping is already enforced inside
// tripController / trip-command.service via getTenantFromRequest.
//
// Permission.TRIP_VIEW / TRIP_EDIT / TRIP_DELETE confirmed against
// server/permissions/roles.ts.

import { NextRequest } from 'next/server';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { tripController } from '@/modules/trips/controllers/trip.controller';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req, _ctx, { params }) => {
    const { id } = await params;
    return tripController.getTrip(req, id);
  },
  { permission: Permission.TRIP_VIEW }
);

export const PUT = withAuth<RouteParams>(
  async (req, _ctx, { params }) => {
    const { id } = await params;
    return tripController.updateTrip(req, id);
  },
  { permission: Permission.TRIP_EDIT }
);

export const DELETE = withAuth<RouteParams>(
  async (req, _ctx, { params }) => {
    const { id } = await params;
    return tripController.deleteTrip(req, id);
  },
  { permission: Permission.TRIP_DELETE }
);

========================================
FILE: app/api/trips/kpis/route.ts
========================================
// app/api/trips/kpis/route.ts
//
// PHASE 1: executive KPI cards for the Trip Analytics page. Mirrors
// app/api/trips/stats/route.ts's auth wiring exactly (withAuth +
// Permission.TRIP_VIEW).

import { NextRequest } from 'next/server';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { tripController } from '@/modules/trips/controllers/trip.controller';

export const GET = withAuth(
  async (req: NextRequest) => tripController.getTripKpis(req),
  { permission: Permission.TRIP_VIEW }
);

========================================
FILE: app/api/trips/stats/route.ts
========================================
// app/api/trips/stats/route.ts
//
// FIX (High â€” duplicate auth strategies): converted from legacy
// requireAuth() to withAuth + Permission.

import { NextRequest } from 'next/server';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { tripController } from '@/modules/trips/controllers/trip.controller';

export const GET = withAuth(
  async (req: NextRequest) => tripController.getTripStats(req),
  { permission: Permission.TRIP_VIEW }
);

========================================
FILE: app/api/trips/exceptions/route.ts
========================================
// app/api/trips/exceptions/route.ts
//
// PHASE 1: exception analytics (duration outliers, odometer
// inconsistencies, possible duplicates, missing driver), equivalent in
// spirit to Expense's outliers endpoint. Mirrors
// app/api/trips/stats/route.ts's auth wiring exactly.

import { NextRequest } from 'next/server';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { tripController } from '@/modules/trips/controllers/trip.controller';

export const GET = withAuth(
  async (req: NextRequest) => tripController.getTripExceptions(req),
  { permission: Permission.TRIP_VIEW }
);

========================================
FILE: app/api/trips/import/route.ts
========================================
// app/api/trips/import/route.ts
import { NextRequest } from 'next/server';
import { tripController } from '@/modules/trips/controllers/trip.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth(
  async (req: NextRequest) => tripController.importTrips(req),
  { permission: Permission.TRIP_CREATE }
);

========================================
FILE: app/api/trips/export/route.ts
========================================
// app/api/trips/export/route.ts

import { NextRequest } from 'next/server';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { tripController } from '@/modules/trips/controllers/trip.controller';

export const GET = withAuth(
  async (req: NextRequest) => tripController.exportTrips(req),
  { permission: Permission.TRIP_VIEW }
);

========================================
FILE: app/api/fuellogs/route.ts
========================================
// app/api/fuellogs/route.ts

import { NextRequest } from 'next/server';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { fuelController } from '@/modules/fuel/controllers/fuel.controller';
import { errorResponse } from '@/server/utils/response.utils';

export const GET = withAuth(
  async (req: NextRequest) => {
    const searchParams = req.nextUrl.searchParams;
    const action = searchParams.get('action');
    const id = searchParams.get('id');

    if (action === 'stats') return fuelController.getFuelStats(req);
    if (action === 'kpis') return fuelController.getFuelKpis(req);
    if (action === 'abnormal') return fuelController.getAbnormalConsumption(req);
    if (action === 'monthly') return fuelController.getMonthlyConsumption(req);
    if (action === 'top-consumers') return fuelController.getTopConsumers(req);
    if (action === 'by-driver') return fuelController.getFuelByDriver(req);

    // NEW -- enterprise Fuel Analytics Enhancement
    if (action === 'vehicle-timeline') return fuelController.getVehicleFuelTimeline(req);
    if (action === 'by-station') return fuelController.getFuelByStation(req);
    if (action === 'activity-trend') return fuelController.getFuelActivityTrend(req);
    if (action === 'price-trend') return fuelController.getAverageFuelPriceTrend(req);
    if (action === 'type-distribution') return fuelController.getFuelTypeDistribution(req);
    if (action === 'frequency-by-vehicle') return fuelController.getFuelingFrequencyByVehicle(req);
    if (action === 'cost-distribution') return fuelController.getFuelCostDistribution(req);
    if (action === 'heatmap') return fuelController.getFuelEntryHeatmap(req);

    // Phase 2 Enterprise Export Framework
    if (action === 'export') return fuelController.exportFuelLogs(req);

    if (id) return fuelController.getFuelLog(req, id);

    return fuelController.getFuelLogs(req);
  },
  { permission: Permission.FUEL_VIEW }
);

export const POST = withAuth(
  async (req: NextRequest) => fuelController.createFuelLog(req),
  { permission: Permission.FUEL_CREATE }
);

export const PUT = withAuth(
  async (req: NextRequest) => {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return errorResponse('Missing fuel log ID', 'VALIDATION_ERROR', 400);
    }
    return fuelController.updateFuelLog(req, id);
  },
  { permission: Permission.FUEL_EDIT }
);

export const DELETE = withAuth(
  async (req: NextRequest) => {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return errorResponse('Missing fuel log ID', 'VALIDATION_ERROR', 400);
    }
    return fuelController.deleteFuelLog(req, id);
  },
  { permission: Permission.FUEL_DELETE }
);

========================================
FILE: app/api/fuellogs/import/route.ts
========================================
// app/api/fuellogs/import/route.ts
//
// FIX (ðŸŸ  High -- missing route / broken feature): FuelController
// already implements importFuelLogs(), unreachable with no route.
import { NextRequest } from 'next/server';
import { fuelController } from '@/modules/fuel/controllers/fuel.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth(
  async (req: NextRequest) => fuelController.importFuelLogs(req),
  { permission: Permission.FUEL_CREATE }
);

========================================
FILE: app/api/expenses/route.ts
========================================
// app/api/expenses/route.ts

import { NextRequest } from 'next/server';
import { expenseController } from '@/modules/expenses/controllers/expense.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { errorResponse } from '@/server/utils/response.utils';

export const GET = withAuth(
  async (req: NextRequest) => {
    const searchParams = req.nextUrl.searchParams;
    const action = searchParams.get('action');
    const id = searchParams.get('id');

    if (action === 'stats') return expenseController.getExpenseStats(req);
    if (action === 'monthly') return expenseController.getMonthlyTrends(req);
    if (action === 'analytics') return expenseController.getExpenseAnalytics(req);
    if (action === 'category-over-time') return expenseController.getCategoryOverTime(req);
    if (action === 'top-vehicles') return expenseController.getTopVehicles(req);
    if (action === 'vehicle-breakdown') return expenseController.getVehicleBreakdown(req);
    if (action === 'amount-distribution') return expenseController.getAmountDistribution(req);
    if (action === 'job-trip') return expenseController.getJobTripExpense(req);
    if (action === 'category-summary') return expenseController.getCategorySummary(req);
    if (action === 'top-transactions') return expenseController.getTopTransactions(req);
    if (action === 'daily-totals') return expenseController.getDailyTotals(req);
    if (action === 'outliers') return expenseController.getOutliers(req);

    // Phase 2 Enterprise Export Framework
    if (action === 'export') return expenseController.exportExpenses(req);

    if (id) return expenseController.getExpense(req, id);

    return expenseController.getExpenses(req);
  },
  { permission: Permission.EXPENSE_VIEW }
);

export const POST = withAuth(
  async (req: NextRequest) => expenseController.createExpense(req),
  { permission: Permission.EXPENSE_CREATE }
);

export const PUT = withAuth(
  async (req: NextRequest) => {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return errorResponse('Missing expense ID', 'VALIDATION_ERROR', 400);
    return expenseController.updateExpense(req, id);
  },
  { permission: Permission.EXPENSE_EDIT }
);

export const DELETE = withAuth(
  async (req: NextRequest) => {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return errorResponse('Missing expense ID', 'VALIDATION_ERROR', 400);
    return expenseController.deleteExpense(req, id);
  },
  { permission: Permission.EXPENSE_DELETE }
);

========================================
FILE: app/api/expenses/[id]/route.ts
========================================
// app/api/expenses/[id]/route.ts

import { expenseController } from '@/modules/expenses/controllers/expense.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

/**
 * FIX (critical -- permission bypass + missing tenant scoping): this
 * route used to be a hand-rolled handler that called only requireAuth()
 * (proves a session exists, checks NOTHING about permission) and wrote
 * directly to MongoDB, bypassing expenseCommandService entirely. Two
 * distinct critical bugs from that:
 *
 *   1. Permission bypass -- app/api/expenses/route.ts's DELETE (same
 *      logical operation, reached via `?id=` instead of a path segment)
 *      correctly requires Permission.EXPENSE_DELETE via withAuth. This
 *      route accepted the identical DELETE operation with NO permission
 *      check at all -- any authenticated user of any role (viewer,
 *      driver, anyone) could soft-delete any expense in their tenant by
 *      hitting this path instead of the query-param one.
 *   2. Bypassed the command service -- writing `$set: {isDeleted:true}`
 *      directly meant deletes through this path never published
 *      ExpenseDeletedEvent, never invalidated the analytics query
 *      cache (see AnalyticsHandler), and never appeared in the audit
 *      log, silently diverging from every other delete in the app.
 *
 * Now a thin withAuth-wrapped delegate to the same expenseController
 * used by app/api/expenses/route.ts, so both paths to "delete this
 * expense" go through identical permission checks, tenant scoping, and
 * event publication. The tenant-scoping fix that was already here is
 * preserved -- it now happens inside expenseCommandService instead of
 * ad-hoc in this file.
 */
interface RouteParams {
  params: Promise<{ id: string }>;
}

export const DELETE = withAuth<RouteParams>(
  async (req, _context, { params }) => {
    const { id } = await params;
    return expenseController.deleteExpense(req, id);
  },
  { permission: Permission.EXPENSE_DELETE }
);

========================================
FILE: app/api/expenses/bulk/route.ts
========================================

// app/api/expenses/bulk/route.ts
//
// Rewired onto the existing CQRS bulk-import pipeline
// (BulkImportExpensesCommand -> BulkImportExpensesHandler), which already
// existed in modules/expenses/commands/ but had no route calling it. The
// previous version of this file did its own raw db.collection() writes,
// bypassing the command bus, tenant-scoped repository, and audit/event
// pipeline that every other write in this module goes through.

import { NextRequest } from 'next/server';
import { expenseController } from '@/modules/expenses/controllers/expense.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth(
  async (req: NextRequest) => expenseController.bulkImport(req),
  { permission: Permission.EXPENSE_CREATE }
);

========================================
FILE: app/api/expenses/import/route.ts
========================================


// app/api/expenses/import/route.ts

import { NextRequest } from 'next/server';
import { expenseController } from '@/modules/expenses/controllers/expense.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth(
  async (req: NextRequest) => expenseController.importExpenses(req),
  { permission: Permission.EXPENSE_CREATE }
);

========================================
FILE: app/api/vehicles/route.ts
========================================
//app/api/vehicles/route.ts

import { vehicleController } from '@/modules/vehicles/controllers/vehicle.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req) => vehicleController.getVehicles(req),
  { permission: Permission.VEHICLE_VIEW }
);

export const POST = withAuth(
  (req) => vehicleController.createVehicle(req),
  { permission: Permission.VEHICLE_CREATE }
);

========================================
FILE: app/api/drivers/route.ts
========================================
// app/api/drivers/route.ts
//
// PERMISSION STOPGAP: there is no Permission.DRIVER_* enum member yet in
// server/permissions/roles.ts. Following the same documented stopgap
// already applied to meter logs / UOM (mapped onto Permission.VEHICLE_*
// per the July 12 audit), driver reads/writes are gated on the closest
// existing fleet-data permissions: VEHICLE_VIEW to read, VEHICLE_EDIT to
// write. Replace with dedicated DRIVER_VIEW / DRIVER_CREATE / DRIVER_EDIT
// / DRIVER_DELETE entries (and matching rolePermissions rows) once added.

import { NextRequest } from 'next/server';
import { driverController } from '@/modules/drivers/controllers/driver.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => driverController.list(req),
  { permission: Permission.VEHICLE_VIEW }
);

export const POST = withAuth(
  (req: NextRequest) => driverController.create(req),
  { permission: Permission.VEHICLE_EDIT }
);

========================================
FILE: frontend/modules/trips/components/index.ts
========================================
// frontend/modules/trips/components/index.ts

export { TripFilters } from './TripFilters';
export { TripForm } from './TripForm';
export { TripModal } from './TripModal';
export type { TripModalMode } from './TripModal';
export { TripsTable } from './TripsTable';
export { TripStatsCards } from './TripStatsCards';
export { TripKpiCards } from './TripKpiCards';

========================================
FILE: frontend/modules/trips/components/TripFilters.tsx
========================================
// frontend/modules/trips/components/TripFilters.tsx

'use client';

import { FilterBar } from '@/shared/ui/filters/FilterBar';
import { Input } from '@/frontend/shared/ui/forms/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { X } from 'lucide-react';
import { TRIP_MODES, type TripTableFilters } from '../types';
import { tripModeLabel } from '../utils';

interface TripFiltersProps {
  filters: TripTableFilters;
  onChange: (filters: TripTableFilters) => void;
}

const ALL = '__all__';

function toDateInputValue(value: Date | string | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function TripFilters({ filters, onChange }: TripFiltersProps) {
  const hasActiveFilters = Boolean(
    filters.mode || filters.driver_id || filters.startDate || filters.endDate
  );

  function clearAll() {
    onChange({});
  }

  return (
    <FilterBar
      searchPlaceholder="Search by license plate..."
      searchValue={filters.license_plate ?? ''}
      onSearchChange={(value) => onChange({ ...filters, license_plate: value })}
      onSearchClear={() => onChange({ ...filters, license_plate: '' })}
      filters={
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={filters.mode ?? ALL}
            onValueChange={(value) =>
              onChange({ ...filters, mode: value === ALL ? undefined : (value as TripTableFilters['mode']) })
            }
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All modes</SelectItem>
              {TRIP_MODES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {tripModeLabel(mode)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            placeholder="Driver ID"
            className="w-32"
            value={filters.driver_id ?? ''}
            onChange={(e) => onChange({ ...filters, driver_id: e.target.value || undefined })}
          />

          <Input
            type="date"
            className="w-36"
            value={toDateInputValue(filters.startDate)}
            onChange={(e) => onChange({ ...filters, startDate: e.target.value ? new Date(e.target.value) : undefined })}
            aria-label="From date"
          />

          <Input
            type="date"
            className="w-36"
            value={toDateInputValue(filters.endDate)}
            onChange={(e) => onChange({ ...filters, endDate: e.target.value ? new Date(e.target.value) : undefined })}
            aria-label="To date"
          />

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>
      }
    />
  );
}

========================================
FILE: frontend/modules/trips/components/TripForm.tsx
========================================
// frontend/modules/trips/components/TripForm.tsx

'use client';

import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Textarea } from '@/frontend/shared/ui/forms/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Spinner } from '@/frontend/shared/ui/feedback/spinner';
import { tripFormSchema, type TripFormValues } from '../schemas';
import { TRIP_MODES } from '../types';
import { tripModeLabel } from '../utils';

interface TripFormProps {
  defaultValues?: Partial<TripFormValues>;
  unitOptions: { value: string; label: string }[];
  onSubmit: (values: TripFormValues) => Promise<unknown>;
  onCancel: () => void;
  submitLabel?: string;
}

const FALLBACK_DEFAULTS: TripFormValues = {
  license_plate: '',
  date: new Date().toISOString().slice(0, 10),
  unit_id: '',
  mode: 'distance',
  trip_distance: undefined,
  start_odometer: undefined,
  end_odometer: undefined,
  notes: '',
  start_location: '',
  end_location: '',
  driver_id: '',
};

export function TripForm({
  defaultValues,
  unitOptions,
  onSubmit,
  onCancel,
  submitLabel = 'Log trip',
}: TripFormProps) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<TripFormValues>({
    resolver: zodResolver(tripFormSchema),
    defaultValues: { ...FALLBACK_DEFAULTS, ...defaultValues },
  });

  useEffect(() => {
    reset({ ...FALLBACK_DEFAULTS, ...defaultValues });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValues]);

  const mode = watch('mode');

  const submit = handleSubmit(async (values) => {
    await onSubmit(values);
  });

  const numericFieldOptions = {
    setValueAs: (v: unknown) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="license_plate" className="form-label form-required">
            License plate
          </Label>
          <Input
            id="license_plate"
            className={errors.license_plate ? 'input-error' : undefined}
            {...register('license_plate')}
          />
          {errors.license_plate && <p className="form-error" role="alert">{errors.license_plate.message}</p>}
        </div>

        <div>
          <Label htmlFor="date" className="form-label form-required">Date</Label>
          <Input id="date" type="date" className={errors.date ? 'input-error' : undefined} {...register('date')} />
          {errors.date && <p className="form-error" role="alert">{errors.date.message}</p>}
        </div>

        <div>
          <Label htmlFor="mode" className="form-label form-required">Trip mode</Label>
          <Controller
            control={control}
            name="mode"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="mode" className="w-full">
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  {TRIP_MODES.map((m) => (
                    <SelectItem key={m} value={m}>{tripModeLabel(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div>
          <Label htmlFor="unit_id" className="form-label form-required">Distance unit</Label>
          <Controller
            control={control}
            name="unit_id"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="unit_id" className="w-full">
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {unitOptions.map((u) => (
                    <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.unit_id && <p className="form-error" role="alert">{errors.unit_id.message}</p>}
        </div>

        {mode === 'distance' ? (
          <div>
            <Label htmlFor="trip_distance" className="form-label form-required">Trip distance</Label>
            <Input
              id="trip_distance"
              type="number"
              step="0.01"
              className={errors.trip_distance ? 'input-error' : undefined}
              {...register('trip_distance', numericFieldOptions)}
            />
            {errors.trip_distance && <p className="form-error" role="alert">{errors.trip_distance.message}</p>}
          </div>
        ) : (
          <>
            <div>
              <Label htmlFor="start_odometer" className="form-label form-required">Start odometer</Label>
              <Input
                id="start_odometer"
                type="number"
                step="0.01"
                className={errors.start_odometer ? 'input-error' : undefined}
                {...register('start_odometer', numericFieldOptions)}
              />
              {errors.start_odometer && <p className="form-error" role="alert">{errors.start_odometer.message}</p>}
            </div>
            <div>
              <Label htmlFor="end_odometer" className="form-label form-required">End odometer</Label>
              <Input
                id="end_odometer"
                type="number"
                step="0.01"
                className={errors.end_odometer ? 'input-error' : undefined}
                {...register('end_odometer', numericFieldOptions)}
              />
              {errors.end_odometer && <p className="form-error" role="alert">{errors.end_odometer.message}</p>}
            </div>
          </>
        )}

        <div>
          <Label htmlFor="driver_id" className="form-label">Driver ID</Label>
          <Input id="driver_id" {...register('driver_id')} />
        </div>

        <div>
          <Label htmlFor="start_location" className="form-label">Start location</Label>
          <Input id="start_location" {...register('start_location')} />
        </div>

        <div>
          <Label htmlFor="end_location" className="form-label">End location</Label>
          <Input id="end_location" {...register('end_location')} />
        </div>
      </div>

      <div>
        <Label htmlFor="notes" className="form-label">Notes</Label>
        <Textarea id="notes" rows={3} {...register('notes')} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Spinner className="w-4 h-4 mr-2" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

========================================
FILE: frontend/modules/trips/components/TripKpiCards.tsx
========================================
// frontend/modules/trips/components/TripKpiCards.tsx

'use client';

import { TrendingUp, TrendingDown, Route, Clock, Users, Trophy } from 'lucide-react';
import { StatisticCard, StatisticCards } from '@/frontend/shared/ui/data-display/StatisticCards';
import { useTripKpis } from '../hooks/useTrips';

/**
 * PHASE 1: executive KPI cards for the Trip Analytics page, mirroring
 * FuelKpiCards' layout/loading/error handling exactly so the two
 * analytics pages feel like the same product. Only the metrics differ
 * (operational: distance/duration/utilization vs. Fuel's cost/efficiency).
 */
export function TripKpiCards() {
  const { data: kpis, isLoading, error } = useTripKpis();

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl skeleton" />)}
      </div>
    );
  }

  if (error || !kpis) {
    return <div className="text-sm text-muted-foreground">Unable to load trip KPIs</div>;
  }

  const trendIcon = (trend: number, goodWhenPositive: boolean) => {
    if (trend === 0) return null;
    const positive = trend > 0;
    const good = positive === goodWhenPositive;
    return positive ? (
      <TrendingUp className={`w-4 h-4 ${good ? 'text-success' : 'text-danger'}`} />
    ) : (
      <TrendingDown className={`w-4 h-4 ${good ? 'text-success' : 'text-danger'}`} />
    );
  };

  return (
    <StatisticCards>
      <StatisticCard
        title="Total distance"
        value={`${kpis.totalDistance.toLocaleString()} km`}
        description={`${kpis.totalTrips.toLocaleString()} trips \u00B7 avg ${kpis.averageDistance.toFixed(1)} km`}
        icon={trendIcon(kpis.distanceTrend, true)}
      />
      <StatisticCard
        title="Driving hours"
        value={kpis.totalDrivingHours.toFixed(1)}
        description={
          kpis.averageDurationMinutes > 0
            ? `avg ${kpis.averageDurationMinutes.toFixed(0)} min/trip`
            : 'No timing data yet'
        }
        icon={<Clock className="w-4 h-4 text-muted-foreground" />}
      />
      <StatisticCard
        title="Trip status"
        value={`${kpis.completedTrips.toLocaleString()} completed`}
        description={`${kpis.ongoingTrips} ongoing \u00B7 ${kpis.cancelledTrips} cancelled`}
        icon={trendIcon(kpis.tripCountTrend, true)}
      />
      <StatisticCard
        title="Fleet utilization"
        value={`${kpis.activeVehicles} vehicles \u00B7 ${kpis.activeDrivers} drivers`}
        description={
          kpis.mostUtilizedVehicle
            ? `Most utilized: ${kpis.mostUtilizedVehicle.license_plate} (${kpis.mostUtilizedVehicle.trips} trips)`
            : 'No trips in this period'
        }
        icon={<Users className="w-4 h-4 text-muted-foreground" />}
      />
      <StatisticCard
        title="Longest trip"
        value={kpis.longestTrip ? `${kpis.longestTrip.distance.toLocaleString()} km` : 'N/A'}
        description={kpis.longestTrip ? kpis.longestTrip.license_plate : 'No trips in this period'}
        icon={<Route className="w-4 h-4 text-muted-foreground" />}
      />
      <StatisticCard
        title="Top driver"
        value={kpis.mostUtilizedDriver ? `${kpis.mostUtilizedDriver.trips} trips` : 'N/A'}
        description={kpis.mostUtilizedDriver ? kpis.mostUtilizedDriver.driver_id : 'No driver data yet'}
        icon={<Trophy className="w-4 h-4 text-muted-foreground" />}
      />
    </StatisticCards>
  );
}

========================================
FILE: frontend/modules/trips/components/TripModal.tsx
========================================
// frontend/modules/trips/components/TripModal.tsx

'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/shared/ui/feedback/dialog';
import { TripForm } from './TripForm';
import { useDistanceUnits } from '../hooks/useTrips';
import type { Trip } from '../types';
import type { TripFormValues } from '../schemas';

export type TripModalMode = 'create' | 'edit';

interface TripModalProps {
  open: boolean;
  mode: TripModalMode;
  trip?: Trip | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: TripFormValues) => Promise<unknown>;
}

const TITLES: Record<TripModalMode, string> = {
  create: 'Log a trip',
  edit: 'Edit trip',
};

const DESCRIPTIONS: Record<TripModalMode, string> = {
  create: 'Record a new trip for a vehicle in your fleet.',
  edit: "Update this trip's details.",
};

function toFormValues(trip: Trip | null | undefined): Partial<TripFormValues> | undefined {
  if (!trip) return undefined;
  const dateStr = typeof trip.date === 'string' ? trip.date : new Date(trip.date).toISOString();
  return {
    license_plate: trip.license_plate,
    date: dateStr.slice(0, 10),
    unit_id: trip.unit_id,
    mode: trip.mode,
    trip_distance: trip.trip_distance,
    start_odometer: trip.start_odometer,
    end_odometer: trip.end_odometer,
    notes: trip.notes ?? '',
    start_location: trip.start_location ?? '',
    end_location: trip.end_location ?? '',
    driver_id: trip.driver_id ?? '',
  };
}

export function TripModal({ open, mode, trip, onOpenChange, onSubmit }: TripModalProps) {
  const { data: units = [] } = useDistanceUnits();
  const unitOptions = units.map((u) => ({ value: u.unit_id, label: `${u.name} (${u.symbol})` }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-form-wide">
        <DialogHeader>
          <DialogTitle>{TITLES[mode]}</DialogTitle>
          <DialogDescription>{DESCRIPTIONS[mode]}</DialogDescription>
        </DialogHeader>
        <TripForm
          key={`${mode}-${trip?._id ?? 'new'}`}
          defaultValues={toFormValues(trip)}
          unitOptions={unitOptions}
          onSubmit={async (values) => {
            await onSubmit(values);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
          submitLabel={mode === 'edit' ? 'Save changes' : 'Log trip'}
        />
      </DialogContent>
    </Dialog>
  );
}

========================================
FILE: frontend/modules/trips/components/TripsTable.tsx
========================================
// frontend/modules/trips/components/TripsTable.tsx

'use client';

import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/shared/ui/tables/DataTable';
import { Checkbox } from '@/frontend/shared/ui/forms/checkbox';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/frontend/shared/ui/navigation/NestedMenu';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { MoreHorizontal, Eye, Pencil, Trash2 } from 'lucide-react';
import { formatDate } from '@/shared/utils/date.utils';
import { formatDistance } from '@/shared/utils/distance.utils';
import type { PaginatedResponse } from '@/shared/types/common.types';
import type { Trip } from '../types';
import { tripModeLabel, getTripModeBadgeClass, tripSummaryLabel } from '../utils';
import { cn } from '@/lib/utils';

interface TripsTableProps {
  result: PaginatedResponse<Trip> | undefined;
  isLoading: boolean;
  pageSize: number;
  onPageChange: (page: number) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (ids: string[]) => void;
  onView: (trip: Trip) => void;
  onEdit: (trip: Trip) => void;
  onDelete: (trip: Trip) => void;
  canManage: boolean;
  canDelete: boolean;
}

export function TripsTable({
  result,
  isLoading,
  pageSize,
  onPageChange,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onView,
  onEdit,
  onDelete,
  canManage,
  canDelete,
}: TripsTableProps) {
  const data = useMemo(() => result?.data ?? [], [result?.data]);

  const columns = useMemo<ColumnDef<Trip>[]>(() => {
    const cols: ColumnDef<Trip>[] = [];

    if (canDelete) {
      const allSelected = data.length > 0 && data.every((t) => selectedIds.has(t._id!));
      cols.push({
        id: 'select',
        header: () => (
          <Checkbox
            checked={allSelected}
            onCheckedChange={() => onToggleSelectAll(data.map((t) => t._id!))}
            aria-label="Select all trips on this page"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selectedIds.has(row.original._id!)}
            onCheckedChange={() => onToggleSelect(row.original._id!)}
            aria-label={`Select trip on ${row.original.license_plate}`}
          />
        ),
      });
    }

    cols.push(
      {
        accessorKey: 'date',
        header: 'Date',
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => onView(row.original)}
            className="font-medium text-primary hover:underline"
          >
            {formatDate(row.original.date)}
          </button>
        ),
      },
      { accessorKey: 'license_plate', header: 'Vehicle' },
      {
        accessorKey: 'mode',
        header: 'Mode',
        cell: ({ row }) => (
          <span className={cn('badge-status', getTripModeBadgeClass(row.original.mode))}>
            {tripModeLabel(row.original.mode)}
          </span>
        ),
      },
      {
        accessorKey: 'distance_calculated',
        header: 'Distance',
        cell: ({ row }) => (
          <span className="tabular-nums">{formatDistance(row.original.distance_calculated)}</span>
        ),
      },
      {
        id: 'route',
        header: 'Route',
        cell: ({ row }) => (
          <span className="text-muted-foreground">{tripSummaryLabel(row.original)}</span>
        ),
      },
      {
        accessorKey: 'driver_id',
        header: 'Driver',
        cell: ({ row }) => row.original.driver_id || 'Unassigned',
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const trip = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Trip actions">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onView(trip)}>
                  <Eye className="mr-2 h-3.5 w-3.5" /> View details
                </DropdownMenuItem>
                {canManage && (
                  <DropdownMenuItem onSelect={() => onEdit(trip)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => onDelete(trip)} className="text-destructive">
                      <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      }
    );

    return cols;
  }, [data, selectedIds, onToggleSelect, onToggleSelectAll, onView, onEdit, onDelete, canManage, canDelete]);

  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      emptyMessage="No trips found. Try adjusting your filters or log a new trip."
      pagination={
        result
          ? {
              page: result.pagination.page,
              pageSize,
              total: result.pagination.total,
              totalPages: result.pagination.totalPages,
              onPageChange,
            }
          : undefined
      }
    />
  );
}

========================================
FILE: frontend/modules/trips/components/TripStatsCards.tsx
========================================
// frontend/modules/trips/components/TripStatsCards.tsx

'use client';

import { Route, TrendingUp, Gauge, Users } from 'lucide-react';
import { StatisticCard, StatisticCards } from '@/frontend/shared/ui/data-display/StatisticCards';
import { useTripStats } from '../hooks/useTrips';
import { formatDistance } from '@/shared/utils/distance.utils';

export function TripStatsCards() {
  const { data, isLoading } = useTripStats();

  // FIX (crash, all list pages): Object.keys(data.byDriver) threw
  // "Cannot convert undefined or null to object" whenever byDriver was
  // undefined -- during the loading->data transition, or if the stats
  // response envelope isn't shaped exactly as expected. Every other
  // stats consumer in this codebase (dashboard's expense/fuel widgets)
  // defensively falls back to {} before calling Object.keys/entries;
  // this component was the one place that didn't, and it took down the
  // whole page via the nearest error boundary instead of just rendering
  // "0 active drivers".
  const byDriver = data?.byDriver ?? {};
  const driverCount = Object.keys(byDriver).length;
  const averageDistance = data?.averageDistance ?? 0;

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl skeleton" />
        ))}
      </div>
    );
  }

  return (
    <StatisticCards>
      <StatisticCard
        title="Total trips"
        value={data?.totalTrips ?? 0}
        icon={<Route className="w-4 h-4 text-muted-foreground" />}
      />
      <StatisticCard
        title="Total distance"
        value={formatDistance(data?.totalDistance ?? 0)}
        icon={<TrendingUp className="w-4 h-4 text-muted-foreground" />}
      />
      <StatisticCard
        title="Average trip distance"
        value={formatDistance(averageDistance)}
        icon={<Gauge className="w-4 h-4 text-muted-foreground" />}
      />
      <StatisticCard
        title="Active drivers"
        value={driverCount}
        icon={<Users className="w-4 h-4 text-muted-foreground" />}
      />
    </StatisticCards>
  );
}

========================================
FILE: frontend/modules/trips/hooks/index.ts
========================================
// frontend/modules/trips/hooks/index.ts

export * from './useTrips';
export * from './useTripMutations';

========================================
FILE: frontend/modules/trips/hooks/useTripMutations.ts
========================================
// frontend/modules/trips/hooks/useTripMutations.ts

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { tripsApi } from '../services/trips.api';
import { tripKeys } from './useTrips';
import type { TripFormOutput } from '../schemas';

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useCreateTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TripFormOutput) => tripsApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.lists() });
      queryClient.invalidateQueries({ queryKey: tripKeys.stats() });
      toast.success('Trip logged');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to log trip')),
  });
}

export function useUpdateTrip(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<TripFormOutput>) => tripsApi.update(id, payload),
    onSuccess: (trip) => {
      queryClient.setQueryData(tripKeys.detail(id), trip);
      queryClient.invalidateQueries({ queryKey: tripKeys.lists() });
      queryClient.invalidateQueries({ queryKey: tripKeys.stats() });
      toast.success('Trip updated');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to update trip')),
  });
}

export function useDeleteTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tripsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.lists() });
      queryClient.invalidateQueries({ queryKey: tripKeys.stats() });
      toast.success('Trip deleted');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to delete trip')),
  });
}

export function useBulkDeleteTrips() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => tripsApi.remove(id)));
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: tripKeys.lists() });
      queryClient.invalidateQueries({ queryKey: tripKeys.stats() });
      toast.success(`${ids.length} trip${ids.length === 1 ? '' : 's'} deleted`);
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to delete selected trips')),
  });
}

========================================
FILE: frontend/modules/trips/hooks/useTrips.ts
========================================
// frontend/modules/trips/hooks/useTrips.ts

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { apiClient } from '@/shared/utils/api-client.utils';
import { tripsApi, type TripListParams } from '../services/trips.api';
import type { Trip, DistanceUnitOption } from '../types';

type DateRange = { startDate?: Date; endDate?: Date };

function rangeKey(dateRange?: DateRange): string | undefined {
  if (!dateRange) return undefined;
  return `${dateRange.startDate?.toISOString() ?? ''}-${dateRange.endDate?.toISOString() ?? ''}`;
}

export const tripKeys = {
  all: ['trips'] as const,
  lists: () => [...tripKeys.all, 'list'] as const,
  list: (params: Partial<TripListParams>) => [...tripKeys.lists(), params] as const,
  details: () => [...tripKeys.all, 'detail'] as const,
  detail: (id: string) => [...tripKeys.details(), id] as const,
  stats: (range?: string) => [...tripKeys.all, 'stats', range] as const,
  kpis: (range?: string) => [...tripKeys.all, 'kpis', range] as const,
  exceptions: (range?: string, zThreshold?: number) =>
    [...tripKeys.all, 'exceptions', range, zThreshold] as const,
};

export function useTripsList(params: Partial<TripListParams>) {
  return useQuery({
    queryKey: tripKeys.list(params),
    queryFn: () => tripsApi.list(params),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

export function useTrip(id: string | undefined, options?: Partial<UseQueryOptions<Trip>>) {
  return useQuery({
    queryKey: tripKeys.detail(id ?? ''),
    queryFn: () => tripsApi.getById(id as string),
    enabled: Boolean(id),
    staleTime: 30_000,
    ...options,
  });
}

export function useTripStats(dateRange?: DateRange) {
  return useQuery({
    queryKey: tripKeys.stats(rangeKey(dateRange)),
    queryFn: () => tripsApi.getStats(dateRange),
    staleTime: 60_000,
  });
}

/** PHASE 1: executive KPI cards for the Trip Analytics page. */
export function useTripKpis(dateRange?: DateRange) {
  return useQuery({
    queryKey: tripKeys.kpis(rangeKey(dateRange)),
    queryFn: () => tripsApi.getKpis(dateRange),
    staleTime: 60_000,
  });
}

/** PHASE 1: exception analytics (duration outliers, odometer
 *  inconsistencies, possible duplicates, missing driver). */
export function useTripExceptions(dateRange?: DateRange, zThreshold: number = 2.5, limit: number = 50) {
  return useQuery({
    queryKey: tripKeys.exceptions(rangeKey(dateRange), zThreshold),
    queryFn: () => tripsApi.getExceptions(dateRange, zThreshold, limit),
    staleTime: 60_000,
  });
}

/**
 * Distance-type units for the trip form's unit selector. Reuses the
 * existing /api/units endpoint (shared with vehicles/fuel/meter logs)
 * rather than inventing a trips-specific one.
 */
export function useDistanceUnits() {
  return useQuery({
    queryKey: ['units'],
    queryFn: () => apiClient.get<DistanceUnitOption[]>('/api/units'),
    staleTime: 5 * 60_000,
    select: (units) => units.filter((u) => u.type === 'distance'),
  });
}

========================================
FILE: frontend/modules/trips/pages/index.ts
========================================
// frontend/modules/trips/pages/index.ts

export { TripsListPage } from './TripsListPage';
export { TripDetailPage } from './TripDetailPage';

========================================
FILE: frontend/modules/trips/pages/TripDetailPage.tsx
========================================
// frontend/modules/trips/pages/TripDetailPage.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { useTrip } from '../hooks/useTrips';
import { useDeleteTrip, useUpdateTrip } from '../hooks/useTripMutations';
import { TripModal, type TripModalMode } from '../components/TripModal';
import { tripModeLabel, getTripModeBadgeClass, canManageTrips, canDeleteTrips } from '../utils';
import { formatDate } from '@/shared/utils/date.utils';
import { formatDistance } from '@/shared/utils/distance.utils';
import { TRIP_ROUTES } from '../routes';
import type { TripFormValues } from '../schemas';
import { cn } from '@/lib/utils';

interface TripDetailPageProps {
  tripId: string;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-body-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

export function TripDetailPage({ tripId }: TripDetailPageProps) {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canManage = canManageTrips(roles);
  const canDelete = canDeleteTrips(roles);

  const { data: trip, isLoading, isError } = useTrip(tripId);
  const deleteTrip = useDeleteTrip();
  const updateTrip = useUpdateTrip(tripId);
  const [modalOpen, setModalOpen] = useState(false);
  const modalMode: TripModalMode = 'edit';

  if (isLoading) return <PageLoader label="Loading trip" />;

  if (isError || !trip) {
    return (
      <EmptyState
        title="Trip not found"
        description="This trip may have been removed or you don't have access to it."
        action={{ label: 'Back to trips', onClick: () => router.push(TRIP_ROUTES.list) }}
      />
    );
  }

  async function handleDelete() {
    if (!window.confirm('Delete this trip?')) return;
    await deleteTrip.mutateAsync(tripId);
    router.push(TRIP_ROUTES.list);
  }

  async function handleSubmit(values: TripFormValues) {
    await updateTrip.mutateAsync(values);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Trip Â· ${trip.license_plate}`}
        description={formatDate(trip.date, 'MMM dd, yyyy')}
        breadcrumbs={[{ label: 'Trips', href: TRIP_ROUTES.list }, { label: trip.license_plate }]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push(TRIP_ROUTES.list)}>
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Button>
            {canManage && (
              <Button size="sm" onClick={() => setModalOpen(true)}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            )}
            {canDelete && (
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('badge-status', getTripModeBadgeClass(trip.mode))}>
          {tripModeLabel(trip.mode)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Trip overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Vehicle" value={trip.license_plate} />
            <DetailRow label="Date" value={formatDate(trip.date)} />
            <DetailRow label="Mode" value={tripModeLabel(trip.mode)} />
            <DetailRow label="Distance" value={formatDistance(trip.distance_calculated)} />
            <DetailRow label="Driver" value={trip.driver_id || 'Unassigned'} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Route &amp; readings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Start location" value={trip.start_location || 'Not recorded'} />
            <DetailRow label="End location" value={trip.end_location || 'Not recorded'} />
            {trip.mode === 'odometer' ? (
              <>
                <DetailRow
                  label="Start odometer"
                  value={trip.start_odometer != null ? formatDistance(trip.start_odometer) : 'N/A'}
                />
                <DetailRow
                  label="End odometer"
                  value={trip.end_odometer != null ? formatDistance(trip.end_odometer) : 'N/A'}
                />
              </>
            ) : (
              <DetailRow
                label="Logged distance"
                value={trip.trip_distance != null ? formatDistance(trip.trip_distance) : 'N/A'}
              />
            )}
          </CardContent>
        </Card>

        {trip.notes && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-body-sm text-foreground">{trip.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>

      <TripModal open={modalOpen} mode={modalMode} trip={trip} onOpenChange={setModalOpen} onSubmit={handleSubmit} />
    </div>
  );
}

========================================
FILE: frontend/modules/trips/pages/TripsListPage.tsx
========================================
// frontend/modules/trips/pages/TripsListPage.tsx

'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Download, FileSpreadsheet, Trash2, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/frontend/shared/ui/navigation/NestedMenu';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { TripStatsCards } from '../components/TripStatsCards';
import { TripFilters } from '../components/TripFilters';
import { TripsTable } from '../components/TripsTable';
import { TripModal, type TripModalMode } from '../components/TripModal';
import { useTripsList } from '../hooks/useTrips';
import { useCreateTrip, useUpdateTrip, useDeleteTrip, useBulkDeleteTrips } from '../hooks/useTripMutations';
import { exportTrips, printTrips, canManageTrips, canDeleteTrips } from '../utils';
import { TRIP_ROUTES } from '../routes';
import type { Trip, TripTableFilters } from '../types';
import type { TripFormValues } from '../schemas';

const PAGE_SIZE = 10;

export function TripsListPage() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canManage = canManageTrips(roles);
  const canDelete = canDeleteTrips(roles);

  const [filters, setFilters] = useState<TripTableFilters>({});
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modalMode, setModalMode] = useState<TripModalMode>('create');
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);

  const listParams = useMemo(() => ({ ...filters, page, limit: PAGE_SIZE }), [filters, page]);
  const { data: result, isLoading } = useTripsList(listParams);

  const createTrip = useCreateTrip();
  const updateTripMutation = useUpdateTrip(activeTrip?._id ?? '');
  const deleteTrip = useDeleteTrip();
  const bulkDeleteTrips = useBulkDeleteTrips();

  function handleFiltersChange(next: TripTableFilters) {
    setFilters(next);
    setPage(1);
  }

  function openCreate() {
    setModalMode('create');
    setActiveTrip(null);
    setModalOpen(true);
  }

  function openEdit(trip: Trip) {
    setModalMode('edit');
    setActiveTrip(trip);
    setModalOpen(true);
  }

  async function handleSubmit(values: TripFormValues) {
    if (modalMode === 'edit' && activeTrip?._id) {
      await updateTripMutation.mutateAsync(values);
    } else {
      await createTrip.mutateAsync(values as Required<TripFormValues>);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(ids: string[]) {
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...ids]);
    });
  }

  async function handleDelete(trip: Trip) {
    if (!trip._id) return;
    if (!window.confirm(`Delete this trip for ${trip.license_plate}?`)) return;
    await deleteTrip.mutateAsync(trip._id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(trip._id!);
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected trip(s)?`)) return;
    await bulkDeleteTrips.mutateAsync(Array.from(selectedIds));
    setSelectedIds(new Set());
  }

  async function handleExport(format: 'csv' | 'xlsx') {
    try {
      const { truncated, totalMatched, rowsExported } = await exportTrips(filters, format);
      if (truncated) {
        toast.warning(
          `Export limited to ${rowsExported.toLocaleString()} of ${totalMatched.toLocaleString()} matching trips. Narrow your filters to export the rest.`
        );
      } else {
        toast.success(`Exported ${rowsExported.toLocaleString()} trip${rowsExported === 1 ? '' : 's'}`);
      }
    } catch {
      toast.error('Failed to export trips');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trips"
        description="Track vehicle trips, distances, and driver activity across your fleet."
        actions={
          <div className="flex items-center gap-2">
            {canDelete && selectedIds.size > 0 && (
              <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                <Trash2 className="h-3.5 w-3.5" />
                Delete ({selectedIds.size})
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-3.5 w-3.5" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void handleExport('csv')}>
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void handleExport('xlsx')}>
                  <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />
                  Export as Excel
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => printTrips()}>
                  <Printer className="mr-2 h-3.5 w-3.5" />
                  Print
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {canManage && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" />
                Log trip
              </Button>
            )}
          </div>
        }
      />

      <TripStatsCards />

      <div className="p-4 space-y-4 surface-card">
        <TripFilters filters={filters} onChange={handleFiltersChange} />
        <TripsTable
          result={result}
          isLoading={isLoading}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onView={(trip) => router.push(TRIP_ROUTES.detail(trip._id!))}
          onEdit={openEdit}
          onDelete={handleDelete}
          canManage={canManage}
          canDelete={canDelete}
        />
      </div>

      <TripModal open={modalOpen} mode={modalMode} trip={activeTrip} onOpenChange={setModalOpen} onSubmit={handleSubmit} />
    </div>
  );
}

========================================
FILE: frontend/modules/trips/routes/index.ts
========================================
// frontend/modules/trips/routes/index.ts

export const TRIP_ROUTES = {
  list: '/trips',
  detail: (id: string) => `/trips/${id}`,
} as const;

========================================
FILE: frontend/modules/trips/schemas/index.ts
========================================
// frontend/modules/trips/schemas/index.ts

import { z } from 'zod';

export const tripModeEnum = z.enum(['distance', 'odometer']);

export const tripFormSchema = z
  .object({
    license_plate: z.string().min(1, 'License plate is required').max(20, 'License plate is too long'),
    date: z.string().min(1, 'Date is required'),
    unit_id: z.string().min(1, 'Distance unit is required'),
    mode: tripModeEnum,
    trip_distance: z.number().positive('Must be greater than 0').optional(),
    start_odometer: z.number().nonnegative('Cannot be negative').optional(),
    end_odometer: z.number().nonnegative('Cannot be negative').optional(),
    notes: z.string().max(500).optional().or(z.literal('')),
    start_location: z.string().max(200).optional().or(z.literal('')),
    end_location: z.string().max(200).optional().or(z.literal('')),
    driver_id: z.string().optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    if (data.mode === 'distance') {
      if (!data.trip_distance || data.trip_distance <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Trip distance is required and must be positive for distance mode',
          path: ['trip_distance'],
        });
      }
    }
    if (data.mode === 'odometer') {
      if (data.start_odometer == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Start odometer is required for odometer mode',
          path: ['start_odometer'],
        });
      }
      if (data.end_odometer == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'End odometer is required for odometer mode',
          path: ['end_odometer'],
        });
      }
      if (
        data.start_odometer != null &&
        data.end_odometer != null &&
        data.end_odometer < data.start_odometer
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'End odometer cannot be less than start odometer',
          path: ['end_odometer'],
        });
      }
    }
  });

export type TripFormValues = z.input<typeof tripFormSchema>;
export type TripFormOutput = z.output<typeof tripFormSchema>;

========================================
FILE: frontend/modules/trips/services/index.ts
========================================
// frontend/modules/trips/services/index.ts

export * from './trips.api';

========================================
FILE: frontend/modules/trips/services/trips.api.ts
========================================
// frontend/modules/trips/services/trips.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import type { PaginatedResponse } from '@/shared/types/common.types';
import type { ExportFormat } from '@/shared/export/export.types';
import type { ExportBlobResponse } from '@/shared/utils/export-download.utils';
import type { Trip, TripStats, TripTableFilters, TripKpis, TripExceptionRow } from '../types';
import type { TripFormOutput } from '../schemas';

const BASE = '/api/trips';

export interface TripListParams extends TripTableFilters {
  page?: number;
  limit?: number;
}

function toIso(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function buildListQuery(params: Partial<TripListParams>) {
  return {
    license_plate: params.license_plate,
    mode: params.mode,
    driver_id: params.driver_id,
    status: params.status,
    trip_type: params.trip_type,
    routeId: params.routeId,
    start: toIso(params.startDate),
    end: toIso(params.endDate),
    page: params.page,
    limit: params.limit,
  };
}

export const tripsApi = {
  async list(params: Partial<TripListParams>): Promise<PaginatedResponse<Trip>> {
    return apiClient.get<PaginatedResponse<Trip>>(BASE, { params: buildListQuery(params) });
  },

  async getById(id: string): Promise<Trip> {
    return apiClient.get<Trip>(`${BASE}/${id}`);
  },

  async getStats(dateRange?: { startDate?: Date; endDate?: Date }): Promise<TripStats> {
    const params: Record<string, string | undefined> = {};
    if (dateRange?.startDate) params.startDate = dateRange.startDate.toISOString();
    if (dateRange?.endDate) params.endDate = dateRange.endDate.toISOString();
    return apiClient.get<TripStats>(`${BASE}/stats`, { params });
  },

  /** PHASE 1 */
  async getKpis(dateRange?: { startDate?: Date; endDate?: Date }): Promise<TripKpis> {
    const params: Record<string, string | undefined> = {};
    if (dateRange?.startDate) params.startDate = dateRange.startDate.toISOString();
    if (dateRange?.endDate) params.endDate = dateRange.endDate.toISOString();
    return apiClient.get<TripKpis>(`${BASE}/kpis`, { params });
  },

  /** PHASE 1 */
  async getExceptions(
    dateRange?: { startDate?: Date; endDate?: Date },
    zThreshold: number = 2.5,
    limit: number = 50
  ): Promise<TripExceptionRow[]> {
    const params: Record<string, string | number | undefined> = { zThreshold, limit };
    if (dateRange?.startDate) params.startDate = dateRange.startDate.toISOString();
    if (dateRange?.endDate) params.endDate = dateRange.endDate.toISOString();
    return apiClient.get<TripExceptionRow[]>(`${BASE}/exceptions`, { params });
  },

  async create(payload: TripFormOutput): Promise<Trip> {
    return apiClient.post<Trip>(BASE, payload);
  },

  async update(id: string, payload: Partial<TripFormOutput>): Promise<Trip> {
    return apiClient.put<Trip>(`${BASE}/${id}`, payload);
  },

  async remove(id: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`${BASE}/${id}`);
  },

  /**
   * Enterprise Export Framework (Phase 2). Hits GET /api/trips/export
   * with the same filter fields as list(), so the backend re-queries the
   * full authorized, filtered result set (capped at EXPORT_ROW_CAP)
   * rather than exporting only the currently-loaded page.
   */
  async exportFile(filters: Partial<TripTableFilters>, format: ExportFormat = 'csv'): Promise<ExportBlobResponse> {
    return apiClient.getBlob(`${BASE}/export`, {
      params: {
        license_plate: filters.license_plate,
        mode: filters.mode,
        driver_id: filters.driver_id,
        status: filters.status,
        trip_type: filters.trip_type,
        routeId: filters.routeId,
        start: toIso(filters.startDate),
        end: toIso(filters.endDate),
        format,
      },
    });
  },
};

========================================
FILE: frontend/modules/trips/store/index.ts
========================================
// frontend/modules/trips/store/index.ts

export * from './trip-table.store';

========================================
FILE: frontend/modules/trips/store/trip-table.store.ts
========================================
// frontend/modules/trips/store/trip-table.store.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_TRIP_COLUMN_VISIBILITY,
  type TripColumnVisibility,
  type TripTableFilters,
} from '../types';

export interface SavedTripView {
  id: string;
  name: string;
  filters: TripTableFilters;
}

interface TripTableState {
  columnVisibility: TripColumnVisibility;
  density: 'comfortable' | 'compact';
  savedViews: SavedTripView[];
  toggleColumn: (key: keyof TripColumnVisibility) => void;
  setDensity: (density: 'comfortable' | 'compact') => void;
  saveView: (name: string, filters: TripTableFilters) => void;
  deleteView: (id: string) => void;
  resetColumns: () => void;
}

export const useTripTableStore = create<TripTableState>()(
  persist(
    (set, get) => ({
      columnVisibility: DEFAULT_TRIP_COLUMN_VISIBILITY,
      density: 'comfortable',
      savedViews: [],

      toggleColumn: (key) =>
        set({ columnVisibility: { ...get().columnVisibility, [key]: !get().columnVisibility[key] } }),

      setDensity: (density) => set({ density }),

      saveView: (name, filters) =>
        set({
          savedViews: [
            ...get().savedViews.filter((v) => v.name !== name),
            { id: crypto.randomUUID(), name, filters },
          ],
        }),

      deleteView: (id) => set({ savedViews: get().savedViews.filter((v) => v.id !== id) }),

      resetColumns: () => set({ columnVisibility: DEFAULT_TRIP_COLUMN_VISIBILITY }),
    }),
    { name: 'fleet-trip-table' }
  )
);

========================================
FILE: frontend/modules/trips/types/index.ts
========================================
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
};

export type TripMode = 'distance' | 'odometer';

export const TRIP_MODES: TripMode[] = ['distance', 'odometer'];

export const TRIP_STATUS_OPTIONS: TripStatus[] = ['planned', 'ongoing', 'completed', 'cancelled'];
export const TRIP_TYPE_OPTIONS: TripType[] = ['delivery', 'pickup', 'transfer', 'service_call', 'other'];

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

========================================
FILE: frontend/modules/trips/utils/index.ts
========================================
/* eslint-disable @typescript-eslint/no-unused-vars */
// frontend/modules/trips/utils/index.ts

import { formatDistance } from '@/shared/utils/distance.utils';
import { formatDate } from '@/shared/utils/date.utils';
import type { ExportFormat } from '@/shared/export/export.types';
import { triggerExport, type ExportDownloadResult } from '@/shared/utils/export-download.utils';
import { tripsApi } from '../services/trips.api';
import type { Trip, TripTableFilters } from '../types';

export function tripModeLabel(mode: Trip['mode']): string {
  return mode === 'distance' ? 'Direct distance' : 'Odometer reading';
}

export function getTripModeBadgeClass(mode: Trip['mode']): string {
  return mode === 'distance' ? 'badge-info' : 'badge-neutral';
}

export function tripSummaryLabel(trip: Trip): string {
  if (trip.start_location && trip.end_location) {
    return `${trip.start_location} â†’ ${trip.end_location}`;
  }
  return trip.start_location || trip.end_location || 'No route recorded';
}

const MANAGE_ROLES = ['organization_owner', 'fleet_manager', 'dispatcher', 'super_admin'];
const DELETE_ROLES = ['organization_owner', 'fleet_manager', 'super_admin'];

export function canManageTrips(roles: string[] = []): boolean {
  return roles.some((r) => MANAGE_ROLES.includes(r));
}

export function canDeleteTrips(roles: string[] = []): boolean {
  return roles.some((r) => DELETE_ROLES.includes(r));
}

/**
 * Enterprise Export Framework (Phase 2). Replaces exportTripsToCSV/
 * exportTripsToExcel, which only ever exported the currently-loaded page
 * of trips. Sends the user's current filters to GET /api/trips/export,
 * which re-runs the same scoped/filtered query server-side with no page
 * limit (capped at EXPORT_ROW_CAP) and returns a real file.
 */
export async function exportTrips(
  filters: TripTableFilters,
  format: ExportFormat = 'csv'
): Promise<ExportDownloadResult> {
  return triggerExport(
    () => tripsApi.exportFile(filters, format),
    `trips-export.${format}`
  );
}

export function printTrips(): void {
  window.print();
}

========================================
FILE: frontend/modules/trips/index.ts
========================================
// frontend/modules/trips/index.ts

export type * from './types';
export type * from './schemas';
export * from './services';
export * from './hooks';
export * from './store';
export * from './utils';
export * from './routes';

export {
  TripFilters,
  TripForm,
  TripModal,
  TripsTable,
  TripStatsCards,
} from './components';
export type { TripModalMode } from './components';

export * from './pages';

========================================
FILE: frontend/modules/fuel/components/FuelAnalyticsFilterBar.tsx
========================================
// frontend/modules/fuel/components/FuelAnalyticsFilterBar.tsx
//
// Shared date-range control for every enterprise analytics chart on
// FuelAnalyticsPage. Deliberately reuses the same "from/to" input pattern
// as FuelFilters.tsx rather than introducing a second date-picker
// convention.

'use client';

import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { X } from 'lucide-react';

export interface FuelAnalyticsDateRange {
  startDate?: Date;
  endDate?: Date;
}

interface FuelAnalyticsFilterBarProps {
  value: FuelAnalyticsDateRange;
  onChange: (value: FuelAnalyticsDateRange) => void;
}

function toDateInputValue(value: Date | undefined): string {
  if (!value) return '';
  return value.toISOString().slice(0, 10);
}

export function FuelAnalyticsFilterBar({ value, onChange }: FuelAnalyticsFilterBarProps) {
  const hasFilters = Boolean(value.startDate || value.endDate);

  return (
    <div className="flex flex-wrap items-end gap-4 p-4 surface-card">
      <div className="w-40">
        <Label htmlFor="analytics-from" className="text-sm">From</Label>
        <Input
          id="analytics-from"
          type="date"
          value={toDateInputValue(value.startDate)}
          onChange={(e) =>
            onChange({ ...value, startDate: e.target.value ? new Date(e.target.value) : undefined })
          }
        />
      </div>
      <div className="w-40">
        <Label htmlFor="analytics-to" className="text-sm">To</Label>
        <Input
          id="analytics-to"
          type="date"
          value={toDateInputValue(value.endDate)}
          onChange={(e) =>
            onChange({ ...value, endDate: e.target.value ? new Date(e.target.value) : undefined })
          }
        />
      </div>
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => onChange({})} className="h-9">
          <X className="h-3.5 w-3.5 mr-1" /> Clear
        </Button>
      )}
    </div>
  );
}

========================================
FILE: frontend/modules/fuel/components/FuelKpiCards.tsx
========================================
// frontend/modules/fuel/components/FuelKpiCards.tsx

'use client';

import { TrendingUp, TrendingDown, AlertTriangle, Calendar } from 'lucide-react';
import { StatisticCard, StatisticCards } from '@/frontend/shared/ui/data-display/StatisticCards';
import { useFuelKpis } from '../hooks/useFuel';
import { formatCurrency } from '@/shared/utils/currency.utils';

export function FuelKpiCards() {
  const { data: kpis, isLoading, error } = useFuelKpis();

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl skeleton" />)}
      </div>
    );
  }

  if (error || !kpis) {
    return <div className="text-sm text-muted-foreground">Unable to load fuel KPIs</div>;
  }

  const trendIcon = (trend: number, goodWhenPositive: boolean) => {
    if (trend === 0) return null;
    const positive = trend > 0;
    const good = positive === goodWhenPositive;
    return positive ? (
      <TrendingUp className={`w-4 h-4 ${good ? 'text-success' : 'text-danger'}`} />
    ) : (
      <TrendingDown className={`w-4 h-4 ${good ? 'text-success' : 'text-danger'}`} />
    );
  };

  return (
    <StatisticCards>
      <StatisticCard
        title="Fuel efficiency"
        value={`${kpis.averageFuelEfficiency.toFixed(2)} km/L`}
        description={`${kpis.totalDistance.toLocaleString()} km driven`}
        icon={trendIcon(kpis.efficiencyTrend, true)}
      />
      <StatisticCard
        title="Cost per km"
        value={formatCurrency(kpis.costPerKm)}
        description={`${kpis.vehiclesTracked} vehicles tracked`}
        icon={trendIcon(kpis.costTrend, false)}
      />
      {/*
        FIX: previously titled "Abnormal consumption" -- identical wording
        to AbnormalConsumptionWidget's "Abnormal consumption detected"
        below it on the same page, for a DIFFERENT algorithm (this counts
        fuel-log entries whose volume exceeds that vehicle's CURRENT
        PERIOD average x2, computed inside FuelRepository.getFuelKpis;
        the widget below uses each vehicle's ALL-TIME average via
        FuelRepository.getAbnormalConsumption). Same near-duplicate label
        for two different windows/algorithms reads as one inconsistent
        number to the user. Title and description now name the window
        explicitly so the two cards can never be mistaken for the same
        metric.
      */}
      <StatisticCard
        title="Abnormal consumption (this period)"
        value={kpis.abnormalConsumptionCount}
        description={`${kpis.abnormalConsumptionPercentage}% of entries vs. this period's average`}
        icon={<AlertTriangle className="w-4 h-4 text-warning" />}
      />
      <StatisticCard
        title="Days since last fill"
        value={kpis.daysSinceLastFill}
        description={kpis.mostRecentPlate ? `${kpis.mostRecentPlate}${kpis.mostRecentVehicle ? ` \u00B7 ${kpis.mostRecentVehicle}` : ''}` : 'N/A'}
        icon={<Calendar className="w-4 h-4 text-muted-foreground" />}
      />
    </StatisticCards>
  );
}

========================================
FILE: frontend/modules/fuel/components/FuelStatsCards.tsx
========================================
// frontend/modules/fuel/components/FuelStatsCards.tsx

'use client';

import { useMemo, useState } from 'react';
import { Fuel, DollarSign, Gauge, Hash, Banknote, CreditCard } from 'lucide-react';
import { StatisticCard, StatisticCards } from '@/frontend/shared/ui/data-display/StatisticCards';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { Label } from '@/frontend/shared/ui/forms/label';
import { useFuelStats } from '../hooks/useFuel';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { PAYMENT_METHOD_LABELS } from '../types';

type StatsPeriod = 'all' | 'month' | '30d' | 'year';

const PERIOD_LABELS: Record<StatsPeriod, string> = {
  all: 'All time',
  month: 'This month',
  '30d': 'Last 30 days',
  year: 'This year',
};

function getRangeForPeriod(period: StatsPeriod): { startDate?: Date; endDate?: Date } | undefined {
  if (period === 'all') return undefined;
  const end = new Date();
  let start = new Date();
  if (period === 'month') start = new Date(end.getFullYear(), end.getMonth(), 1);
  if (period === '30d') start.setDate(end.getDate() - 30);
  if (period === 'year') start = new Date(end.getFullYear(), 0, 1);
  return { startDate: start, endDate: end };
}

export function FuelStatsCards() {
  const [period, setPeriod] = useState<StatsPeriod>('all');
  const dateRange = useMemo(() => getRangeForPeriod(period), [period]);
  const { data: stats, isLoading, error } = useFuelStats(dateRange);

  // FIX (crash -- "Cannot read properties of undefined (reading 'find')"):
  // `stats?.paymentBreakdown.find(...)` only guarded against `stats` itself
  // being undefined. If `stats` resolves but `paymentBreakdown` is missing
  // (a stale cached response, a partial response shape, or any envelope
  // that doesn't carry every field the current UI expects), `.find` was
  // called directly on `undefined` and crashed the whole page instead of
  // just rendering zeros. Every access to `paymentBreakdown` below now
  // goes through a single `?? []` fallback so this can never happen again,
  // matching the defensive pattern already used elsewhere in this app
  // (see TripStatsCards.tsx's `data?.byDriver ?? {}`).
  const paymentBreakdown = stats?.paymentBreakdown ?? [];
  const cashRow = paymentBreakdown.find((p) => p.method === 'cash');
  const cardRow = paymentBreakdown.find((p) => p.method === 'fuel_card');
  const otherTotal = paymentBreakdown
    .filter((p) => p.method !== 'cash' && p.method !== 'fuel_card')
    .reduce((sum, p) => sum + p.totalCost, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm text-muted-foreground">
          Fleet fuel totals &middot; {PERIOD_LABELS[period]}
        </Label>
        <Select value={period} onValueChange={(v) => setPeriod(v as StatsPeriod)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(PERIOD_LABELS) as StatsPeriod[]).map((p) => (
              <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl skeleton" />)}
        </div>
      ) : error || !stats ? (
        <div className="text-sm text-muted-foreground">Unable to load fuel statistics</div>
      ) : (
        <>
          <StatisticCards>
            <StatisticCard title="Total fuel" value={`${stats.totalFuel.toFixed(1)} L`} icon={<Fuel className="w-4 h-4 text-muted-foreground" />} />
            <StatisticCard title="Total cost" value={formatCurrency(stats.totalCost)} icon={<DollarSign className="w-4 h-4 text-muted-foreground" />} />
            <StatisticCard title="Avg cost / L" value={formatCurrency(stats.averageCostPerUnit)} icon={<Gauge className="w-4 h-4 text-muted-foreground" />} />
            <StatisticCard title="Entries" value={stats.logCount} icon={<Hash className="w-4 h-4 text-muted-foreground" />} />
          </StatisticCards>

          {paymentBreakdown.length > 0 && (
            <div className="flex flex-wrap items-center gap-4 px-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Banknote className="w-3.5 h-3.5" />
                {PAYMENT_METHOD_LABELS.cash}: <span className="font-medium text-foreground">{formatCurrency(cashRow?.totalCost ?? 0)}</span>
                <span className="text-caption">({(cashRow?.totalVolume ?? 0).toFixed(1)} L)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" />
                {PAYMENT_METHOD_LABELS.fuel_card}: <span className="font-medium text-foreground">{formatCurrency(cardRow?.totalCost ?? 0)}</span>
                <span className="text-caption">({(cardRow?.totalVolume ?? 0).toFixed(1)} L)</span>
              </span>
              {otherTotal > 0 && (
                <span>
                  Other: <span className="font-medium text-foreground">{formatCurrency(otherTotal)}</span>
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

========================================
FILE: frontend/modules/fuel/components/FuelMonthlyTrendChart.tsx
========================================
// frontend/modules/fuel/components/FuelMonthlyTrendChart.tsx

'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useMonthlyFuelConsumption } from '../hooks/useFuel';
import { formatCurrency } from '@/shared/utils/currency.utils';

export function FuelMonthlyTrendChart() {
  const { data: monthlyData, isLoading, error } = useMonthlyFuelConsumption(12);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Monthly fuel consumption</CardTitle></CardHeader>
        <CardContent><div className="rounded-lg h-55 skeleton" /></CardContent>
      </Card>
    );
  }

  if (error || !monthlyData || monthlyData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Monthly fuel consumption</CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly fuel consumption</CardTitle>
        <CardDescription>Last 12 months</CardDescription>
      </CardHeader>
      <CardContent>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={monthlyData} margin={{ left: -20, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                formatter={(value: number, name: string) =>
                  name === 'cost' ? [formatCurrency(value), 'Cost'] : [`${value.toFixed(1)} L`, 'Volume']
                }
              />
              <Line type="monotone" dataKey="cost" stroke="var(--chart-1)" strokeWidth={2} dot={false} name="cost" />
              <Line type="monotone" dataKey="fuel" stroke="var(--chart-2)" strokeWidth={2} dot={false} name="fuel" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 mt-2 text-caption text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-chart-1" /> Cost</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-chart-2" /> Volume (L)</span>
        </div>
      </CardContent>
    </Card>
  );
}

========================================
FILE: frontend/modules/fuel/components/FuelActivityTrendChart.tsx
========================================
// frontend/modules/fuel/components/FuelActivityTrendChart.tsx
// Enterprise analytics #3

'use client';

import { useState } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { useFuelActivityTrend } from '../hooks/useFuel';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { FuelAnalyticsDateRange } from './FuelAnalyticsFilterBar';
import type { FuelTrendGranularity, FuelActivityTrendPoint } from '../types';

type LineMetric = 'volume' | 'cost' | 'avgCostPerLitre';

const GRANULARITY_LABELS: Record<FuelTrendGranularity, string> = {
  week: 'Week',
  month: 'Month',
  quarter: 'Quarter',
  year: 'Year',
};

const METRIC_LABELS: Record<LineMetric, string> = {
  volume: 'Fuel volume (L)',
  cost: 'Total cost',
  avgCostPerLitre: 'Average cost / L',
};

interface FuelActivityTrendChartProps {
  dateRange: FuelAnalyticsDateRange;
}

function ActivityTrendTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as FuelActivityTrendPoint;
  return (
    <div
      style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
      className="p-2.5 space-y-0.5"
    >
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">
        Entries: <span className="font-medium text-foreground">{row.entries}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Fuel volume: <span className="font-medium text-foreground">{row.volume.toFixed(1)} L</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Fuel cost: <span className="font-medium text-foreground">{formatCurrency(row.cost)}</span>
      </p>
    </div>
  );
}

export function FuelActivityTrendChart({ dateRange }: FuelActivityTrendChartProps) {
  const [granularity, setGranularity] = useState<FuelTrendGranularity>('month');
  const [metric, setMetric] = useState<LineMetric>('volume');
  const { data, isLoading, error } = useFuelActivityTrend(granularity, dateRange);

  const formatMetric = (value: number) => (metric === 'volume' ? `${value.toFixed(1)} L` : formatCurrency(value));

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Fuel activity trend</CardTitle>
          <CardDescription>Entries vs. {METRIC_LABELS[metric].toLowerCase()}, by {GRANULARITY_LABELS[granularity].toLowerCase()}</CardDescription>
        </div>
        <div className="flex gap-2">
          <Select value={granularity} onValueChange={(v) => setGranularity(v as FuelTrendGranularity)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(GRANULARITY_LABELS) as FuelTrendGranularity[]).map((g) => (
                <SelectItem key={g} value={g}>{GRANULARITY_LABELS[g]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={metric} onValueChange={(v) => setMetric(v as LineMetric)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(METRIC_LABELS) as LineMetric[]).map((m) => (
                <SelectItem key={m} value={m}>{METRIC_LABELS[m]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fuel entries in this range.</p>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="period" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis yAxisId="entries" stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                <YAxis yAxisId="metric" orientation="right" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={formatMetric} />
                <Tooltip content={<ActivityTrendTooltip />} />
                <Bar yAxisId="entries" dataKey="entries" fill="var(--chart-2)" radius={[4, 4, 0, 0]} name="entries" />
                <Line yAxisId="metric" type="monotone" dataKey={metric} stroke="var(--chart-1)" strokeWidth={2} dot={false} name={metric} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

========================================
FILE: frontend/modules/fuel/components/AverageFuelPriceTrendChart.tsx
========================================
// frontend/modules/fuel/components/AverageFuelPriceTrendChart.tsx
// Enterprise analytics #5

'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useAverageFuelPriceTrend } from '../hooks/useFuel';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { FuelAnalyticsDateRange } from './FuelAnalyticsFilterBar';

interface AverageFuelPriceTrendChartProps {
  dateRange: FuelAnalyticsDateRange;
}

export function AverageFuelPriceTrendChart({ dateRange }: AverageFuelPriceTrendChartProps) {
  const { data, isLoading, error } = useAverageFuelPriceTrend(dateRange, 'month');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Average fuel price trend</CardTitle>
        <CardDescription>Average cost per litre, by month</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fuel entries in this range.</p>
        ) : (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={data} margin={{ left: -10, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="period" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                  formatter={(value: number) => [formatCurrency(value), 'Avg. cost / L']}
                />
                <Line type="monotone" dataKey="avgCostPerLitre" stroke="var(--chart-3)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

========================================
FILE: frontend/modules/fuel/components/FuelByStationChart.tsx
========================================
// frontend/modules/fuel/components/FuelByStationChart.tsx
// Enterprise analytics #4 (Fuel Spend by Station) + #8 (Top Fuel Stations),
// backed by the single shared useFuelByStation query -- sorted by the
// selected metric client-side rather than issuing two separate queries.

'use client';

import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { useFuelByStation } from '../hooks/useFuel';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { FuelAnalyticsDateRange } from './FuelAnalyticsFilterBar';
import type { FuelByStationRow } from '../types';

type SortMode = 'spend' | 'visits';

const BAR_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

interface FuelByStationChartProps {
  dateRange: FuelAnalyticsDateRange;
}

function StationTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as FuelByStationRow;
  return (
    <div
      style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
      className="p-2.5 space-y-0.5"
    >
      <p className="text-sm font-medium">{row.stationName}</p>
      <p className="text-xs text-muted-foreground">
        Total spend: <span className="font-medium text-foreground">{formatCurrency(row.totalSpend)}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Total volume: <span className="font-medium text-foreground">{row.totalLitres.toFixed(1)} L</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Transactions: <span className="font-medium text-foreground">{row.visits}</span>
      </p>
    </div>
  );
}

export function FuelByStationChart({ dateRange }: FuelByStationChartProps) {
  const [sortMode, setSortMode] = useState<SortMode>('spend');
  const { data, isLoading, error } = useFuelByStation(dateRange, 15);

  const sorted = useMemo(() => {
    if (!data) return [];
    const rows = [...data];
    rows.sort((a, b) => (sortMode === 'spend' ? b.totalSpend - a.totalSpend : b.visits - a.visits));
    return rows.slice(0, 10);
  }, [data, sortMode]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>{sortMode === 'spend' ? 'Fuel spend by station' : 'Top fuel stations'}</CardTitle>
          <CardDescription>
            {sortMode === 'spend' ? 'Highest total spend, per station' : 'Most frequently used stations'}
          </CardDescription>
        </div>
        <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="spend">By spend</SelectItem>
            <SelectItem value="visits">By visits</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No station data in this range.</p>
        ) : (
          <div style={{ width: '100%', height: Math.max(260, sorted.length * 36) }}>
            <ResponsiveContainer>
              <BarChart data={sorted} layout="vertical" margin={{ left: 12, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis
                  type="number"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickFormatter={(v) => (sortMode === 'spend' ? formatCurrency(v) : String(v))}
                />
                <YAxis type="category" dataKey="stationName" stroke="var(--muted-foreground)" fontSize={11} width={130} />
                <Tooltip content={<StationTooltip />} />
                <Bar dataKey={sortMode === 'spend' ? 'totalSpend' : 'visits'} radius={[0, 4, 4, 0]}>
                  {sorted.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

========================================
FILE: frontend/modules/fuel/components/FuelCostByDriverChart.tsx
========================================
// frontend/modules/fuel/components/FuelCostByDriverChart.tsx
// Enterprise analytics #2 -- reuses useFuelByDriver (sortBy='cost')
// rather than a separate query, matching FuelRepository.getFuelByDriver.

'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useFuelByDriver } from '../hooks/useFuel';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { FuelAnalyticsDateRange } from './FuelAnalyticsFilterBar';
import type { DriverFuelConsumptionRow } from '../types';

const BAR_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

interface FuelCostByDriverChartProps {
  dateRange: FuelAnalyticsDateRange;
}

function DriverCostTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as DriverFuelConsumptionRow;
  return (
    <div
      style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
      className="p-2.5 space-y-0.5"
    >
      <p className="text-sm font-medium">{row.driverName}</p>
      <p className="text-xs text-muted-foreground">
        Total cost: <span className="font-medium text-foreground">{formatCurrency(row.totalCost)}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Total volume: <span className="font-medium text-foreground">{row.totalFuel.toFixed(1)} L</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Fuel entries: <span className="font-medium text-foreground">{row.logCount}</span>
      </p>
    </div>
  );
}

export function FuelCostByDriverChart({ dateRange }: FuelCostByDriverChartProps) {
  const { data, isLoading, error } = useFuelByDriver(dateRange, 10, 'cost');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fuel cost by driver</CardTitle>
        <CardDescription>Highest fuel spend, ranked by driver</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No driver-attributed fuel entries in this range.</p>
        ) : (
          <div style={{ width: '100%', height: Math.max(260, data.length * 36) }}>
            <ResponsiveContainer>
              <BarChart data={data} layout="vertical" margin={{ left: 12, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                <YAxis type="category" dataKey="driverName" stroke="var(--muted-foreground)" fontSize={11} width={120} />
                <Tooltip content={<DriverCostTooltip />} />
                <Bar dataKey="totalCost" radius={[0, 4, 4, 0]}>
                  {data.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

========================================
FILE: frontend/modules/fuel/components/FuelCostDistributionChart.tsx
========================================
// frontend/modules/fuel/components/FuelCostDistributionChart.tsx
// Enterprise analytics #9 (histogram)

'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useFuelCostDistribution } from '../hooks/useFuel';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { FuelAnalyticsDateRange } from './FuelAnalyticsFilterBar';

interface FuelCostDistributionChartProps {
  dateRange: FuelAnalyticsDateRange;
}

interface BucketDatum {
  min: number;
  max: number;
  count: number;
  label: string;
  percentage: number;
}

function DistributionTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as BucketDatum;
  return (
    <div
      style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
      className="p-2.5 space-y-0.5"
    >
      <p className="text-sm font-medium">{row.label}</p>
      <p className="text-xs text-muted-foreground">
        Transactions: <span className="font-medium text-foreground">{row.count}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Share of total: <span className="font-medium text-foreground">{row.percentage}%</span>
      </p>
    </div>
  );
}

export function FuelCostDistributionChart({ dateRange }: FuelCostDistributionChartProps) {
  const { data, isLoading, error } = useFuelCostDistribution(dateRange);

  const chartData = useMemo<BucketDatum[]>(() => {
    const buckets = data ?? [];
    const total = buckets.reduce((sum, b) => sum + b.count, 0);
    return buckets.map((bucket) => ({
      ...bucket,
      label: `${formatCurrency(bucket.min)}\u2013${formatCurrency(bucket.max)}`,
      percentage: total > 0 ? Math.round((bucket.count / total) * 1000) / 10 : 0,
    }));
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fuel cost distribution</CardTitle>
        <CardDescription>Transactions grouped by cost range -- flags unusually expensive purchases</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fuel entries in this range.</p>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={10} interval={0} angle={-30} textAnchor="end" height={60} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip content={<DistributionTooltip />} />
                <Bar dataKey="count" fill="var(--chart-5)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

========================================
FILE: frontend/modules/fuel/components/FuelEntryHeatmapChart.tsx
========================================
// frontend/modules/fuel/components/FuelEntryHeatmapChart.tsx
// Enterprise analytics #10 -- day-of-week x hour-of-day heatmap.
// Plain CSS grid rather than recharts, which has no native heatmap type.

'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useFuelEntryHeatmap } from '../hooks/useFuel';
import type { FuelAnalyticsDateRange } from './FuelAnalyticsFilterBar';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface FuelEntryHeatmapChartProps {
  dateRange: FuelAnalyticsDateRange;
}

export function FuelEntryHeatmapChart({ dateRange }: FuelEntryHeatmapChartProps) {
  const { data, isLoading, error } = useFuelEntryHeatmap(dateRange);

  const { grid, max } = useMemo(() => {
    const cells = new Map<string, number>();
    let maxCount = 0;
    for (const cell of data ?? []) {
      cells.set(`${cell.dayOfWeek}-${cell.hour}`, cell.count);
      if (cell.count > maxCount) maxCount = cell.count;
    }
    return { grid: cells, max: maxCount };
  }, [data]);

  function intensity(count: number): string {
    if (max === 0 || count === 0) return 'transparent';
    const ratio = count / max;
    return `color-mix(in srgb, var(--chart-1) ${Math.round(ratio * 90) + 10}%, transparent)`;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fuel entry heatmap</CardTitle>
        <CardDescription>When fueling activity happens most -- day of week vs. hour of day</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fuel entries in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="inline-grid gap-0.5" style={{ gridTemplateColumns: `40px repeat(24, 20px)` }}>
              <div />
              {HOURS.map((h) => (
                <div key={h} className="text-[9px] text-center text-muted-foreground">{h}</div>
              ))}
              {DAY_LABELS.map((label, dayIndex) => (
                <div key={label} className="contents">
                  <div className="flex items-center text-xs text-muted-foreground">{label}</div>
                  {HOURS.map((h) => {
                    const count = grid.get(`${dayIndex}-${h}`) ?? 0;
                    return (
                      <div
                        key={h}
                        title={`${label} ${h}:00 \u2014 ${count} ${count === 1 ? 'entry' : 'entries'}`}
                        className="w-5 h-5 border rounded-sm border-border/40"
                        style={{ backgroundColor: intensity(count) }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Note: entries logged without a specific time default to hour 0 -- the hour axis is most useful once imported/telematics data carries real timestamps.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

========================================
FILE: frontend/modules/fuel/components/FuelFrequencyByVehicleChart.tsx
========================================
// frontend/modules/fuel/components/FuelFrequencyByVehicleChart.tsx
// Enterprise analytics #7

'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useFuelingFrequencyByVehicle } from '../hooks/useFuel';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { FuelAnalyticsDateRange } from './FuelAnalyticsFilterBar';
import type { FuelFrequencyByVehicleRow } from '../types';

interface FuelFrequencyByVehicleChartProps {
  dateRange: FuelAnalyticsDateRange;
}

function FrequencyTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as FuelFrequencyByVehicleRow;
  return (
    <div
      style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
      className="p-2.5 space-y-0.5"
    >
      <p className="text-sm font-medium">{row.license_plate}</p>
      <p className="text-xs text-muted-foreground">
        Fuel events: <span className="font-medium text-foreground">{row.count}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Total volume: <span className="font-medium text-foreground">{row.totalVolume.toFixed(1)} L</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Total cost: <span className="font-medium text-foreground">{formatCurrency(row.totalCost)}</span>
      </p>
    </div>
  );
}

export function FuelFrequencyByVehicleChart({ dateRange }: FuelFrequencyByVehicleChartProps) {
  const { data, isLoading, error } = useFuelingFrequencyByVehicle(dateRange, 20);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fueling frequency by vehicle</CardTitle>
        <CardDescription>Number of fuel events per vehicle -- useful for spotting abnormal fueling behaviour</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fuel entries in this range.</p>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={data} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="license_plate" stroke="var(--muted-foreground)" fontSize={11} interval={0} angle={-35} textAnchor="end" height={60} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip content={<FrequencyTooltip />} />
                <Bar dataKey="count" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

========================================
FILE: frontend/modules/fuel/components/FuelTopConsumersChart.tsx
========================================
// frontend/modules/fuel/components/FuelTopConsumersChart.tsx

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { useTopFuelConsumers } from '../hooks/useFuel';
import { formatCurrency } from '@/shared/utils/currency.utils';

export function FuelTopConsumersChart() {
  const { data: topConsumers, isLoading, error } = useTopFuelConsumers(5);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top Fuel Consumers</CardTitle>
        </CardHeader>
        <CardContent>
          <LoadingState type="card" count={1} />
        </CardContent>
      </Card>
    );
  }

  if (error || !topConsumers || topConsumers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top Fuel Consumers</CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const maxFuel = topConsumers[0]?.totalFuel || 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Fuel Consumers</CardTitle>
        <CardDescription>Highest fuel consumption this period</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {topConsumers.map((consumer, index) => (
          <div key={consumer.license_plate} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  #{index + 1} {consumer.license_plate}
                </span>
              </div>
              <div className="text-right">
                <span className="font-medium">{consumer.totalFuel.toFixed(1)} L</span>
                <span className="ml-2 text-muted-foreground">
                  {formatCurrency(consumer.totalCost)}
                </span>
              </div>
            </div>
            <div className="w-full h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full transition-all rounded-full bg-primary"
                style={{
                  width: `${(consumer.totalFuel / maxFuel) * 100}%`,
                }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

========================================
FILE: frontend/modules/fuel/components/FuelTypeDistributionChart.tsx
========================================
// frontend/modules/fuel/components/FuelTypeDistributionChart.tsx
// Enterprise analytics #6

'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useFuelTypeDistribution } from '../hooks/useFuel';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { FuelAnalyticsDateRange } from './FuelAnalyticsFilterBar';

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

interface FuelTypeDistributionChartProps {
  dateRange: FuelAnalyticsDateRange;
}

export function FuelTypeDistributionChart({ dateRange }: FuelTypeDistributionChartProps) {
  const { data, isLoading, error } = useFuelTypeDistribution(dateRange);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fuel type distribution</CardTitle>
        <CardDescription>Share of litres purchased, by fuel type</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fuel entries in this range.</p>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="litres"
                  nameKey="fuelType"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                  formatter={(value: number, _name, props) => [
                    `${value.toFixed(1)} L (${props.payload.percentage}%) \u00B7 ${formatCurrency(props.payload.cost)}`,
                    props.payload.fuelType,
                  ]}
                />
                <Legend
                  formatter={(value, entry) => {
                    const payload = (entry as any)?.payload;
                    return `${value}${payload ? ` (${payload.percentage}%)` : ''}`;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

========================================
FILE: frontend/modules/fuel/components/AbnormalConsumptionWidget.tsx
========================================
// frontend/modules/fuel/components/AbnormalConsumptionWidget.tsx

'use client';

import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { useAbnormalFuelConsumption } from '../hooks/useFuel';
import { formatDate } from '@/shared/utils/date.utils';

/**
 * FIX: title changed from "Abnormal consumption detected" to
 * "Abnormal consumption (all-time pattern)" and the description now
 * spells out the comparison window. This card reads
 * FuelRepository.getAbnormalConsumption(), which compares each fuel log
 * against that VEHICLE'S ALL-TIME average volume (no date range) --
 * a different algorithm/window than FuelKpiCards' "Abnormal consumption
 * (this period)" card, which compares against the CURRENT PERIOD average
 * only. The two previously used near-identical wording ("Abnormal
 * consumption" / "Abnormal consumption detected") for different
 * underlying numbers, which read as a bug/inconsistency to anyone
 * viewing both on the Fuel dashboard at once.
 */
export function AbnormalConsumptionWidget() {
  const { data: abnormalLogs, isLoading, error } = useAbnormalFuelConsumption(2);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Abnormal consumption (all-time pattern)</CardTitle></CardHeader>
        <CardContent><div className="h-24 rounded-lg skeleton" /></CardContent>
      </Card>
    );
  }

  if (error || !abnormalLogs || abnormalLogs.length === 0) return null;

  return (
    <Card className="border-warning/40 bg-warning-bg">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning" />
            <CardTitle>Abnormal consumption (all-time pattern)</CardTitle>
          </div>
          <Badge variant="outline" className="border-warning text-warning">{abnormalLogs.length} alerts</Badge>
        </div>
        <CardDescription>
          Vehicles with fuel consumption {abnormalLogs[0]?.threshold ?? 2}x above their own all-time average
          &mdash; a separate check from the period-based KPI above
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {abnormalLogs.slice(0, 5).map((log) => (
          <div key={log._id} className="flex items-center justify-between p-2 rounded-lg surface-card">
            <div>
              <p className="font-medium">{log.license_plate}</p>
              <p className="text-sm text-muted-foreground">{log.volume}L @ {log.station_name || 'Unknown station'}</p>
            </div>
            <div className="text-right">
              <p className="font-medium text-warning">{log.anomalyScore}x above avg</p>
              <p className="text-sm text-muted-foreground">{formatDate(log.date)}</p>
            </div>
          </div>
        ))}
        {abnormalLogs.length > 5 && (
          <p className="text-sm text-center text-muted-foreground">+{abnormalLogs.length - 5} more alerts</p>
        )}
      </CardContent>
    </Card>
  );
}

========================================
FILE: frontend/modules/fuel/components/VehicleFuelActivityTimelineChart.tsx
========================================
// frontend/modules/fuel/components/VehicleFuelActivityTimelineChart.tsx
// Enterprise analytics #1

'use client';

import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { useVehiclesList } from '@/frontend/modules/vehicles/hooks/useVehicles';
import { useVehicleFuelTimeline } from '../hooks/useFuel';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { FuelAnalyticsDateRange } from './FuelAnalyticsFilterBar';
import type { VehicleFuelTimelinePoint } from '../types';

const ALL_VEHICLES = '__all__';

interface VehicleFuelActivityTimelineChartProps {
  dateRange: FuelAnalyticsDateRange;
}

function TimelineTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as VehicleFuelTimelinePoint;
  return (
    <div
      style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
      className="p-2.5 space-y-0.5"
    >
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">
        Fuel entries: <span className="font-medium text-foreground">{row.count}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Fuel volume: <span className="font-medium text-foreground">{row.volume.toFixed(1)} L</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Fuel cost: <span className="font-medium text-foreground">{formatCurrency(row.cost)}</span>
      </p>
    </div>
  );
}

export function VehicleFuelActivityTimelineChart({ dateRange }: VehicleFuelActivityTimelineChartProps) {
  const [vehicle, setVehicle] = useState<string>(ALL_VEHICLES);
  const { data: vehicles } = useVehiclesList({ limit: 1000 });
  const { data, isLoading, error } = useVehicleFuelTimeline(
    vehicle === ALL_VEHICLES ? undefined : vehicle,
    dateRange
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Vehicle fuel activity timeline</CardTitle>
          <CardDescription>Fuel entries over time, per vehicle or fleet-wide</CardDescription>
        </div>
        <Select value={vehicle} onValueChange={(value) => setVehicle(value ?? ALL_VEHICLES)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VEHICLES}>All vehicles</SelectItem>
            {vehicles?.data?.map((v) => (
              <SelectItem key={v._id} value={v.license_plate}>{v.license_plate}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fuel entries in this range.</p>
        ) : (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={data} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip content={<TimelineTooltip />} />
                <Line type="monotone" dataKey="count" stroke="var(--chart-1)" strokeWidth={2} dot={false} name="Entries" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

========================================
FILE: frontend/modules/fuel/components/FuelImportModal.tsx
========================================
// frontend/modules/fuel/components/FuelImportModal.tsx
//
// Enterprise CSV/Excel import for fuel logs. Talks to POST /api/fuellogs/import
// (FuelController.importFuelLogs -> fuelCommandService.createFuelLog per
// row). That endpoint takes plain JSON records regardless of what file
// format they came from, so adding Excel (.xlsx/.xls) support is purely
// a client-side parsing change: readTabularFile() dispatches to either
// the existing CSV parser or the new Excel parser and returns the same
// { headers, rows } shape either way, so everything downstream (column
// validation, coerceRow, the import mutation) is unchanged.
//
// Client side row cap (2000) mirrors MAX_IMPORT_ROWS in fuel.controller.ts
// so oversized files fail fast instead of round-tripping to the server.
//
// FIX (data-quality gap, not a code bug): real-world source files
// routinely have no reliable per-row volume unit -- e.g. exported/
// consolidated spreadsheets where "litres" was implicit and never
// entered as a column value. Since unit_id is required, every such row
// previously failed validation with "unit_id: Invalid input: expected
// string, received undefined". This adds a required "Default volume
// unit" selector: any row whose unit_id cell is blank is filled in with
// this selection before import. Rows that DO have a non-blank unit_id
// value are left untouched (not silently overwritten) -- if that value
// doesn't match a real unit, the existing server-side error for that
// row will still surface, which is correct: a garbage non-blank value
// (e.g. an equipment name shifted into the wrong column) is a real data
// problem the person should look at, not something to paper over.

'use client';

import { useMemo, useRef, useState } from 'react';
import { Upload, X, FileDown, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Label } from '@/frontend/shared/ui/forms/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { buildCsvText, downloadCsvText } from '@/shared/utils/csv-parser.utils';
import { readTabularFile, downloadXlsxTemplate, IMPORT_FILE_ACCEPT } from '@/shared/utils/excel-parser.utils';
import { useImportFuelLogs } from '../hooks/useFuelMutations';
import { useFuelVolumeUnits } from '../hooks/useFuel';
import type { FuelImportResponse } from '../services/fuel.api';

const MAX_IMPORT_ROWS = 2000;

const IMPORT_COLUMNS = [
  'license_plate',
  'date',
  'fuel_volume',
  'unit_id',
  'cost',
  'odometer',
  'station_name',
  'fuel_station_id',
  'fuel_type',
  'notes',
  'currency',
  'is_full_tank',
  'receipt_url',
  'payment_method',
  'fuel_card_id',
] as const;

const PREVIEW_COLUMNS = IMPORT_COLUMNS.slice(0, 5);
const REQUIRED_COLUMNS = ['license_plate', 'date', 'fuel_volume', 'unit_id', 'cost'];
const NUMERIC_FIELDS = new Set(['fuel_volume', 'cost', 'odometer']);
const BOOLEAN_FIELDS = new Set(['is_full_tank']);

// Column reference shown to the user before they upload anything, so
// they know what's required and what format each column expects
// without having to trial-and-error against server validation errors.
interface ColumnHint {
  column: string;
  required: boolean;
  description: string;
}

const COLUMN_HINTS: ColumnHint[] = [
  { column: 'license_plate', required: true, description: "Vehicle's license plate â€“ must match an existing vehicle" },
  { column: 'date', required: true, description: 'Fill-up date, format YYYY-MM-DD (e.g. 2026-07-01)' },
  { column: 'fuel_volume', required: true, description: 'Amount of fuel purchased, numeric' },
  { column: 'unit_id', required: true, description: 'Volume unit id (e.g. litres, gallons). If blank, the "Default volume unit" selected below is used instead.' },
  { column: 'cost', required: true, description: 'Total amount paid, numeric' },
  { column: 'odometer', required: false, description: 'Odometer reading in km' },
  { column: 'station_name', required: false, description: 'Station name, if not a registered fuel station' },
  { column: 'fuel_station_id', required: false, description: 'ID of a registered fuel station' },
  { column: 'fuel_type', required: false, description: 'diesel, petrol, electric, or hybrid' },
  { column: 'notes', required: false, description: 'Free text notes (max 500 characters)' },
  { column: 'currency', required: false, description: '3-letter currency code, e.g. USD (defaults to USD)' },
  { column: 'is_full_tank', required: false, description: 'true or false' },
  { column: 'receipt_url', required: false, description: 'Link to a receipt image, if any' },
  { column: 'payment_method', required: false, description: 'cash, fuel_card, credit_card, company_account, or other (defaults to cash)' },
  { column: 'fuel_card_id', required: false, description: 'Required only when payment_method is fuel_card' },
];

function coerceRow(row: Record<string, string>, defaultUnitId: string): Record<string, unknown> {
  const coerced: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    const raw = row[key]?.trim();
    if (!raw) continue; // omit empty optional cells rather than sending ""
    if (NUMERIC_FIELDS.has(key)) {
      const num = Number(raw);
      coerced[key] = Number.isNaN(num) ? raw : num;
    } else if (BOOLEAN_FIELDS.has(key)) {
      coerced[key] = ['true', '1', 'yes', 'y'].includes(raw.toLowerCase());
    } else {
      coerced[key] = raw;
    }
  }
  // FIX: fall back to the batch-level default only when the cell was
  // genuinely blank. A non-blank-but-wrong value is left alone so the
  // server's real validation error for that specific row still surfaces.
  if (!coerced.unit_id && defaultUnitId) {
    coerced.unit_id = defaultUnitId;
  }
  return coerced;
}

function buildExampleRow(): Record<string, string> {
  return {
    license_plate: 'ABC1234',
    date: '2026-07-01',
    fuel_volume: '45.5',
    unit_id: 'litres',
    cost: '68.20',
    odometer: '125000',
    station_name: 'Total Borrowdale',
    fuel_station_id: '',
    fuel_type: 'diesel',
    notes: '',
    currency: 'USD',
    is_full_tank: 'true',
    receipt_url: '',
    payment_method: 'fuel_card',
    fuel_card_id: '',
  };
}

function downloadCsvTemplate() {
  const csv = buildCsvText([...IMPORT_COLUMNS], [buildExampleRow()]);
  downloadCsvText(csv, 'fuel-logs-import-template.csv');
}

function downloadExcelTemplate() {
  downloadXlsxTemplate([...IMPORT_COLUMNS], [buildExampleRow()], 'fuel-logs-import-template.xlsx', 'Fuel Logs');
}

export interface FuelImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FuelImportModal({ open, onOpenChange }: FuelImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<FuelImportResponse | null>(null);
  const [showColumnHints, setShowColumnHints] = useState(false);
  const [defaultUnitId, setDefaultUnitId] = useState<string>('');
  const importMutation = useImportFuelLogs();
  const { data: volumeUnits } = useFuelVolumeUnits();

  const blankUnitCount = useMemo(
    () => rows.filter((r) => !r.unit_id || !r.unit_id.trim()).length,
    [rows]
  );
  const invalidNonBlankUnitCount = useMemo(() => {
    if (!volumeUnits) return 0;
    const validIds = new Set(volumeUnits.map((u) => u.unit_id));
    return rows.filter((r) => r.unit_id && r.unit_id.trim() && !validIds.has(r.unit_id.trim())).length;
  }, [rows, volumeUnits]);

  if (!open) return null;

  function reset() {
    setFileName(null);
    setRows([]);
    setParseError(null);
    setResult(null);
    setDefaultUnitId('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleClose() {
    reset();
    onOpenChange(false);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    setParseError(null);
    setFileName(file.name);

    try {
      const parsed = await readTabularFile(file);
      if (parsed.rows.length === 0) {
        setParseError('No data rows found in this file.');
        setRows([]);
        return;
      }
      const missingRequired = REQUIRED_COLUMNS.filter((col) => !parsed.headers.includes(col));
      if (missingRequired.length > 0) {
        setParseError(`Missing required column(s): ${missingRequired.join(', ')}`);
        setRows([]);
        return;
      }
      if (parsed.rows.length > MAX_IMPORT_ROWS) {
        setParseError(`This file has ${parsed.rows.length} rows; the maximum per import is ${MAX_IMPORT_ROWS}.`);
        setRows([]);
        return;
      }
      setRows(parsed.rows);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Failed to read the selected file');
      setRows([]);
    }
  }

  async function handleImport() {
    if (rows.length === 0) return;
    const records = rows.map((row) => coerceRow(row, defaultUnitId));
    try {
      const response = await importMutation.mutateAsync(records);
      setResult(response);
    } catch {
      // toast already shown by the mutation's onError
    }
  }

  function handleDownloadErrors() {
    if (!result) return;
    const skippedOrFailedRows = result.results.filter((r) => !r.success);
    if (skippedOrFailedRows.length === 0) return;
    const csv = buildCsvText(
      ['row', 'identifier', 'status', 'error'],
      skippedOrFailedRows.map((r) => ({
        row: r.row,
        identifier: r.identifier ?? '',
        status: r.duplicate ? 'duplicate' : 'failed',
        error: r.error ?? '',
      }))
    );
    downloadCsvText(csv, 'fuel-logs-import-errors.csv');
  }

  const needsDefaultUnit = blankUnitCount > 0;
  const canImport = rows.length > 0 && (!needsDefaultUnit || Boolean(defaultUnitId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-2xl p-0 overflow-hidden shadow-xl surface-card">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Import Fuel Logs</h2>
          <button onClick={handleClose} className="p-1 rounded text-muted-foreground hover:bg-muted" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto px-6 py-4">
          <div className="flex flex-col gap-2 p-3 text-sm rounded-md bg-muted/50 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-muted-foreground">Need the column layout? Download a starter file.</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={downloadCsvTemplate}>
                <FileDown className="h-3.5 w-3.5" /> CSV template
              </Button>
              <Button variant="ghost" size="sm" onClick={downloadExcelTemplate}>
                <FileDown className="h-3.5 w-3.5" /> Excel template
              </Button>
            </div>
          </div>

          <div className="border rounded-md">
            <button
              type="button"
              onClick={() => setShowColumnHints((v) => !v)}
              className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium text-left"
            >
              <span className="flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                Required &amp; optional columns
              </span>
              <span className="text-xs text-muted-foreground">{showColumnHints ? 'Hide' : 'Show'}</span>
            </button>
            {showColumnHints && (
              <div className="overflow-x-auto border-t">
                <table className="min-w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 font-medium text-left text-muted-foreground">Column</th>
                      <th className="px-3 py-2 font-medium text-left text-muted-foreground">Required</th>
                      <th className="px-3 py-2 font-medium text-left text-muted-foreground">Expected format</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COLUMN_HINTS.map((hint) => (
                      <tr key={hint.column} className="border-t">
                        <td className="px-3 py-2 font-mono">{hint.column}</td>
                        <td className="px-3 py-2">
                          {hint.required ? (
                            <span className="font-medium text-destructive">Required</span>
                          ) : (
                            <span className="text-muted-foreground">Optional</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{hint.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!showColumnHints && (
              <p className="px-3 pb-2 -mt-1 text-xs text-muted-foreground">
                Required: {REQUIRED_COLUMNS.join(', ')}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium">CSV or Excel file</label>
            <input
              ref={fileInputRef}
              type="file"
              accept={IMPORT_FILE_ACCEPT}
              onChange={handleFileChange}
              className="block w-full mt-1 text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20"
            />
            <p className="mt-1 text-xs text-muted-foreground">Accepted formats: .csv, .xlsx, .xls</p>
            {fileName && !parseError && rows.length > 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                {fileName}: {rows.length} row{rows.length === 1 ? '' : 's'} ready to import.
              </p>
            )}
            {parseError && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {parseError}
              </p>
            )}
          </div>

          {/* FIX: batch-level fallback for rows with no unit_id at all --
              the common case for consolidated/legacy spreadsheets where
              the volume unit was implicit and never entered per row. */}
          {rows.length > 0 && !result && needsDefaultUnit && (
            <div className="p-3 space-y-2 border rounded-md border-warning/40 bg-warning-bg">
              <div className="flex items-start gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning" />
                <div>
                  <p className="font-medium">
                    {blankUnitCount} of {rows.length} row{rows.length === 1 ? '' : 's'} {blankUnitCount === 1 ? 'has' : 'have'} no volume unit specified.
                  </p>
                  <p className="text-muted-foreground">
                    Choose a default below to apply only to those blank rows. Rows that already have a value are left as-is.
                  </p>
                </div>
              </div>
              <div className="max-w-xs">
                <Label htmlFor="default_unit_id" className="text-sm">Default volume unit</Label>
                <Select value={defaultUnitId} onValueChange={(value) => setDefaultUnitId(value ?? '')}>
                  <SelectTrigger id="default_unit_id"><SelectValue placeholder="Select a unit" /></SelectTrigger>
                  <SelectContent>
                    {volumeUnits?.map((u) => (
                      <SelectItem key={u.unit_id} value={u.unit_id}>{u.name} ({u.symbol})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {rows.length > 0 && !result && invalidNonBlankUnitCount > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {invalidNonBlankUnitCount} row{invalidNonBlankUnitCount === 1 ? '' : 's'} {invalidNonBlankUnitCount === 1 ? 'has' : 'have'} a unit_id value that doesn&apos;t match a registered unit â€” those rows will fail individually and won&apos;t use the default above. Check the error report after importing.
            </p>
          )}

          {rows.length > 0 && !result && (
            <div className="overflow-x-auto border rounded-md">
              <table className="min-w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    {PREVIEW_COLUMNS.map((col) => (
                      <th key={col} className="px-3 py-2 font-medium text-left text-muted-foreground">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-t">
                      {PREVIEW_COLUMNS.map((col) => (
                        <td key={col} className="px-3 py-2">{row[col] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 5 && (
                <p className="px-3 py-2 text-xs border-t text-muted-foreground">
                  + {rows.length - 5} more row{rows.length - 5 === 1 ? '' : 's'}
                </p>
              )}
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-3">
                <div className="p-3 text-center rounded-md bg-muted/50">
                  <div className="text-xl font-semibold">{result.summary.total}</div>
                  <div className="text-xs text-muted-foreground">Total rows</div>
                </div>
                <div className="p-3 text-center rounded-md bg-green-50 dark:bg-green-900/30">
                  <div className="text-xl font-semibold text-green-700 dark:text-green-400">{result.summary.succeeded}</div>
                  <div className="text-xs text-green-600 dark:text-green-500">Succeeded</div>
                </div>
                <div className="p-3 text-center rounded-md bg-amber-50 dark:bg-amber-900/30">
                  <div className="text-xl font-semibold text-amber-700 dark:text-amber-400">{result.summary.duplicates}</div>
                  <div className="text-xs text-amber-600 dark:text-amber-500">Duplicates skipped</div>
                </div>
                <div className="p-3 text-center rounded-md bg-red-50 dark:bg-red-900/30">
                  <div className="text-xl font-semibold text-red-700 dark:text-red-400">{result.summary.failed}</div>
                  <div className="text-xs text-red-600 dark:text-red-500">Failed</div>
                </div>
              </div>

              {(result.summary.failed > 0 || result.summary.duplicates > 0) && (
                <>
                  <div className="overflow-x-auto border rounded-md">
                    <table className="min-w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 font-medium text-left text-muted-foreground">Row</th>
                          <th className="px-3 py-2 font-medium text-left text-muted-foreground">Plate</th>
                          <th className="px-3 py-2 font-medium text-left text-muted-foreground">Status</th>
                          <th className="px-3 py-2 font-medium text-left text-muted-foreground">Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.results.filter((r) => !r.success).map((r) => (
                          <tr key={r.row} className="border-t">
                            <td className="px-3 py-2">{r.row}</td>
                            <td className="px-3 py-2">{r.identifier || 'Ã¢â‚¬â€'}</td>
                            <td className="px-3 py-2">
                              {r.duplicate ? (
                                <span className="font-medium text-amber-600 dark:text-amber-400">Duplicate</span>
                              ) : (
                                <span className="font-medium text-destructive">Failed</span>
                              )}
                            </td>
                            <td className={r.duplicate ? 'px-3 py-2 text-muted-foreground' : 'px-3 py-2 text-destructive'}>
                              {r.error}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleDownloadErrors}>
                    <FileDown className="h-3.5 w-3.5" /> Download report
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t">
          {!result ? (
            <>
              <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
              <Button
                size="sm"
                onClick={handleImport}
                disabled={!canImport || importMutation.isPending}
              >
                <Upload className="h-3.5 w-3.5" />
                {importMutation.isPending ? 'Importingâ€¦' : `Import ${rows.length || ''} row${rows.length === 1 ? '' : 's'}`}
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={handleClose}>Done</Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default FuelImportModal;

========================================
FILE: frontend/modules/fuel/components/FuelForm.tsx
========================================
// frontend/modules/fuel/components/FuelForm.tsx

'use client';

import { useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Paperclip, X } from 'lucide-react';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Textarea } from '@/frontend/shared/ui/forms/textarea';
import { Checkbox } from '@/frontend/shared/ui/forms/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Spinner } from '@/frontend/shared/ui/feedback/spinner';
import { fuelFormSchema, type FuelFormValues } from '../schemas';
import { PAYMENT_METHOD_LABELS, FUEL_PAYMENT_METHODS } from '../types';
import { useVehiclesList } from '@/frontend/modules/vehicles/hooks/useVehicles';
import { useFuelVolumeUnits } from '../hooks/useFuel';
import { useUploadReceipt } from '../hooks/useFuelMutations';
import { useFuelStationsList } from '@/frontend/modules/fuel-stations/hooks/useFuelStations';
import { useFuelCardsList } from '@/frontend/modules/fuel-cards/hooks/useFuelCards';
import { useDriversList } from '@/frontend/modules/drivers/hooks/useDrivers';

const CURRENCIES = ['USD', 'ZWG', 'ZAR', 'EUR', 'GBP'];
const FUEL_TYPES = ['diesel', 'petrol', 'electric', 'hybrid'];
const NO_STATION = '__none__';
const NO_DRIVER = '__unassigned__';

interface FuelFormProps {
  defaultValues?: Partial<FuelFormValues>;
  onSubmit: (values: FuelFormValues) => Promise<unknown>;
  onCancel: () => void;
  submitLabel?: string;
  readOnly?: boolean;
}

const FALLBACK_DEFAULTS: FuelFormValues = {
  license_plate: '',
  unit_id: '',
  date: new Date(),
  fuel_volume: 0,
  cost: 0,
  currency: 'USD',
  odometer: 0,
  is_full_tank: false,
  station_name: '',
  fuel_station_id: '',
  fuel_type: '',
  notes: '',
  receipt_url: '',
  payment_method: 'cash',
  fuel_card_id: '',
  driver_id: '',
};

export function FuelForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel = 'Log fuel entry',
  readOnly = false,
}: FuelFormProps) {
  const { data: vehicles } = useVehiclesList({ limit: 1000 });
  const { data: volumeUnits } = useFuelVolumeUnits();
  const { data: stations } = useFuelStationsList({ isActive: true });
  const { data: cards } = useFuelCardsList({ status: 'active' });
  const { data: drivers } = useDriversList({ status: 'active', limit: 1000 });
  const uploadReceipt = useUploadReceipt();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FuelFormValues>({
    // Type casting the resolver is necessary because ZodEffects (.refine) inference 
    // can break RHF's generic constraints. Form values remain fully strictly-typed.
    resolver: zodResolver(fuelFormSchema) as any,
    defaultValues: { ...FALLBACK_DEFAULTS, ...defaultValues },
  });

  const paymentMethod = watch('payment_method');
  const receiptUrl = watch('receipt_url');

  const submit = handleSubmit(async (values) => {
    await onSubmit(values);
  });

  const numericFieldOptions = {
    setValueAs: (v: unknown) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
  };

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = await uploadReceipt.mutateAsync(file);
      setValue('receipt_url', result.url, { shouldValidate: true, shouldDirty: true });
      setUploadedName(file.name);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="license_plate" className="form-label form-required">License plate</Label>
          <Controller
            control={control}
            name="license_plate"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                <SelectTrigger id="license_plate" className="w-full"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                <SelectContent>
                  {vehicles?.data?.map((v) => (
                    <SelectItem key={v._id} value={v.license_plate}>{v.license_plate} - {v.make} {v.model}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.license_plate && <p className="form-error" role="alert">{errors.license_plate.message}</p>}
        </div>

        <div>
          <Label htmlFor="date" className="form-label form-required">Date</Label>
          <Input
            id="date"
            type="date"
            disabled={readOnly}
            className={errors.date ? 'input-error' : undefined}
            defaultValue={
              defaultValues?.date instanceof Date
                ? defaultValues.date.toISOString().slice(0, 10)
                : new Date().toISOString().slice(0, 10)
            }
            {...register('date', { setValueAs: (v) => (v ? new Date(v) : new Date()) })}
          />
          {errors.date && <p className="form-error" role="alert">{String(errors.date.message)}</p>}
        </div>

        <div>
          <Label htmlFor="fuel_volume" className="form-label form-required">Volume</Label>
          <Input
            id="fuel_volume"
            type="number"
            step="0.01"
            disabled={readOnly}
            className={errors.fuel_volume ? 'input-error' : undefined}
            {...register('fuel_volume', numericFieldOptions)}
          />
          {errors.fuel_volume && <p className="form-error" role="alert">{errors.fuel_volume.message}</p>}
        </div>

        <div>
          <Label htmlFor="unit_id" className="form-label form-required">Volume unit</Label>
          <Controller
            control={control}
            name="unit_id"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                <SelectTrigger id="unit_id" className="w-full"><SelectValue placeholder="Select unit" /></SelectTrigger>
                <SelectContent>
                  {volumeUnits?.map((u) => (
                    <SelectItem key={u.unit_id} value={u.unit_id}>{u.name} ({u.symbol})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.unit_id && <p className="form-error" role="alert">{errors.unit_id.message}</p>}
        </div>

        <div>
          <Label htmlFor="cost" className="form-label form-required">Cost</Label>
          <Input
            id="cost"
            type="number"
            step="0.01"
            disabled={readOnly}
            className={errors.cost ? 'input-error' : undefined}
            {...register('cost', numericFieldOptions)}
          />
          {errors.cost && <p className="form-error" role="alert">{errors.cost.message}</p>}
        </div>

        <div>
          <Label htmlFor="currency" className="form-label form-required">Currency</Label>
          <Controller
            control={control}
            name="currency"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                <SelectTrigger id="currency" className="w-full"><SelectValue placeholder="Currency" /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div>
          <Label htmlFor="payment_method" className="form-label form-required">Payment method</Label>
          <Controller
            control={control}
            name="payment_method"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                <SelectTrigger id="payment_method" className="w-full"><SelectValue placeholder="Payment method" /></SelectTrigger>
                <SelectContent>
                  {FUEL_PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        {paymentMethod === 'fuel_card' && (
          <div>
            <Label htmlFor="fuel_card_id" className="form-label form-required">Fuel card</Label>
            <Controller
              control={control}
              name="fuel_card_id"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                  <SelectTrigger id="fuel_card_id" className="w-full"><SelectValue placeholder="Select fuel card" /></SelectTrigger>
                  <SelectContent>
                    {cards?.data?.map((c) => (
                      <SelectItem key={c._id} value={c._id!}>
                        {c.provider} â€¢â€¢â€¢â€¢ {c.card_last4}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.fuel_card_id && <p className="form-error" role="alert">{errors.fuel_card_id.message}</p>}
          </div>
        )}

        <div>
          <Label htmlFor="odometer" className="form-label">Odometer (km)</Label>
          <Input
            id="odometer"
            type="number"
            step="1"
            disabled={readOnly}
            className={errors.odometer ? 'input-error' : undefined}
            {...register('odometer', numericFieldOptions)}
          />
          {errors.odometer && <p className="form-error" role="alert">{errors.odometer.message}</p>}
        </div>

        {/* NEW: Driver -- optional, matches existing app's driver picker
            pattern used elsewhere (Trips module). Storing driver_id,
            displaying driver name, exactly like fuel_station_id/
            fuel_card_id above. */}
        <div>
          <Label htmlFor="driver_id" className="form-label">Driver</Label>
          <Controller
            control={control}
            name="driver_id"
            render={({ field }) => (
              <Select
                value={field.value || NO_DRIVER}
                onValueChange={(v) => field.onChange(v === NO_DRIVER ? '' : v)}
                disabled={readOnly}
              >
                <SelectTrigger id="driver_id" className="w-full"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_DRIVER}>Unassigned</SelectItem>
                  {drivers?.data?.map((d) => (
                    <SelectItem key={d._id} value={d._id!}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.driver_id && <p className="form-error" role="alert">{String(errors.driver_id.message)}</p>}
        </div>

        <div>
          <Label htmlFor="fuel_station_id" className="form-label">Fuel station</Label>
          <Controller
            control={control}
            name="fuel_station_id"
            render={({ field }) => (
              <Select
                value={field.value || NO_STATION}
                onValueChange={(v) => field.onChange(v === NO_STATION ? '' : v)}
                disabled={readOnly}
              >
                <SelectTrigger id="fuel_station_id" className="w-full"><SelectValue placeholder="Select a registered station" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_STATION}>Not registered / other</SelectItem>
                  {stations?.data?.map((s) => (
                    <SelectItem key={s._id} value={s._id!}>{s.name}{s.brand ? ` (${s.brand})` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div>
          <Label htmlFor="station_name" className="form-label">Station name (if not listed)</Label>
          <Input id="station_name" placeholder="e.g. Total Borrowdale" disabled={readOnly} {...register('station_name')} />
        </div>

        <div>
          <Label htmlFor="fuel_type" className="form-label">Fuel type</Label>
          <Controller
            control={control}
            name="fuel_type"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                <SelectTrigger id="fuel_type" className="w-full"><SelectValue placeholder="Select fuel type" /></SelectTrigger>
                <SelectContent>
                  {FUEL_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Controller
          control={control}
          name="is_full_tank"
          render={({ field }) => (
            <Checkbox id="is_full_tank" checked={field.value} onCheckedChange={field.onChange} disabled={readOnly} />
          )}
        />
        <Label htmlFor="is_full_tank" className="form-label mb-0!">Full tank fill-up</Label>
      </div>

      <div>
        <Label className="form-label">Receipt</Label>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={handleFileSelected}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={readOnly || uploadReceipt.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadReceipt.isPending ? <Spinner className="w-3.5 h-3.5 mr-1.5" /> : <Paperclip className="w-3.5 h-3.5 mr-1.5" />}
            {uploadReceipt.isPending ? 'Uploading...' : 'Attach receipt'}
          </Button>
          {receiptUrl && (
            <a href={receiptUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm text-primary hover:underline">
              {uploadedName || 'View attached receipt'}
            </a>
          )}
          {receiptUrl && !readOnly && (
            <button
              type="button"
              onClick={() => setValue('receipt_url', '', { shouldDirty: true })}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Remove receipt"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {errors.receipt_url && <p className="form-error" role="alert">{String(errors.receipt_url.message)}</p>}
      </div>

      <div>
        <Label htmlFor="notes" className="form-label">Notes</Label>
        <Textarea id="notes" rows={3} disabled={readOnly} {...register('notes')} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          {readOnly ? 'Close' : 'Cancel'}
        </Button>
        {!readOnly && (
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Spinner className="w-4 h-4 mr-2" />}
            {submitLabel}
          </Button>
        )}
      </div>
    </form>
  );
}

========================================
FILE: frontend/modules/fuel/components/FuelModal.tsx
========================================
// frontend/modules/fuel/components/FuelModal.tsx

'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/shared/ui/feedback/dialog';
import { FuelForm } from './FuelForm';
import type { FuelLog } from '../types';
import type { FuelFormValues } from '../schemas';

export type FuelModalMode = 'create' | 'edit' | 'view';

interface FuelModalProps {
  open: boolean;
  mode: FuelModalMode;
  fuelLog?: FuelLog | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: FuelFormValues) => Promise<unknown>;
}

const TITLES: Record<FuelModalMode, string> = {
  create: 'Log fuel entry',
  edit: 'Edit fuel entry',
  view: 'Fuel entry details',
};

const DESCRIPTIONS: Record<FuelModalMode, string> = {
  create: 'Record a new fuel purchase.',
  edit: "Update this fuel entry's details.",
  view: 'View fuel entry details.',
};

function toFormValues(log: FuelLog | null | undefined): Partial<FuelFormValues> | undefined {
  if (!log) return undefined;
  return {
    license_plate: log.license_plate,
    unit_id: log.unit_id,
    date: new Date(log.date),
    fuel_volume: log.fuel_volume,
    cost: log.cost,
    currency: log.currency ?? 'USD',
    odometer: log.odometer,
    is_full_tank: log.is_full_tank ?? false,
    station_name: log.station_name ?? '',
    fuel_station_id: log.fuel_station_id ?? '',
    fuel_type: log.fuel_type ?? '',
    notes: log.notes ?? '',
    receipt_url: log.receipt_url ?? '',
    payment_method: log.payment_method ?? 'cash',
    fuel_card_id: log.fuel_card_id ?? '',
    // NEW: falls back to '' (Unassigned) for legacy records with no driver.
    driver_id: log.driver_id ?? '',
  };
}

export function FuelModal({ open, mode, fuelLog, onOpenChange, onSubmit }: FuelModalProps) {
  const readOnly = mode === 'view';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-form-wide">
        <DialogHeader>
          <DialogTitle>{TITLES[mode]}</DialogTitle>
          <DialogDescription>{DESCRIPTIONS[mode]}</DialogDescription>
        </DialogHeader>
        <FuelForm
          key={`${mode}-${fuelLog?._id ?? 'new'}`}
          defaultValues={toFormValues(fuelLog)}
          onSubmit={async (values) => {
            await onSubmit(values);
            if (mode !== 'view') onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
          submitLabel={mode === 'edit' ? 'Save changes' : 'Log fuel entry'}
          readOnly={readOnly}
        />
      </DialogContent>
    </Dialog>
  );
}

========================================
FILE: frontend/modules/fuel/components/FuelTable.tsx
========================================
// frontend/modules/fuel/components/FuelTable.tsx

'use client';

import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/shared/ui/tables/DataTable';
import { Checkbox } from '@/frontend/shared/ui/forms/checkbox';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/frontend/shared/ui/navigation/NestedMenu';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { MoreHorizontal, Eye, Pencil, Trash2 } from 'lucide-react';
import { formatDate } from '@/shared/utils/date.utils';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { PaginatedResponse } from '@/shared/types/common.types';
import type { FuelLog } from '../types';
import { PAYMENT_METHOD_LABELS } from '../types';

interface FuelTableProps {
  result: PaginatedResponse<FuelLog> | undefined;
  isLoading: boolean;
  pageSize: number;
  onPageChange: (page: number) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (ids: string[]) => void;
  onView: (log: FuelLog) => void;
  onEdit: (log: FuelLog) => void;
  onDelete: (log: FuelLog) => void;
  canManage: boolean;
  canDelete: boolean;
}

const PAYMENT_BADGE_VARIANT: Record<string, 'outline' | 'secondary'> = {
  cash: 'secondary',
  fuel_card: 'outline',
  credit_card: 'outline',
  company_account: 'outline',
  other: 'outline',
};

export function FuelTable({
  result,
  isLoading,
  pageSize,
  onPageChange,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onView,
  onEdit,
  onDelete,
  canManage,
  canDelete,
}: FuelTableProps) {
  const data = useMemo(() => result?.data ?? [], [result?.data]);

  const columns = useMemo<ColumnDef<FuelLog>[]>(() => {
    const cols: ColumnDef<FuelLog>[] = [];

    if (canDelete) {
      const allSelected = data.length > 0 && data.every((log) => selectedIds.has(log._id!));
      cols.push({
        id: 'select',
        header: () => (
          <Checkbox
            checked={allSelected}
            onCheckedChange={() => onToggleSelectAll(data.map((log) => log._id!))}
            aria-label="Select all fuel entries on this page"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selectedIds.has(row.original._id!)}
            onCheckedChange={() => onToggleSelect(row.original._id!)}
            aria-label={`Select entry for ${row.original.license_plate}`}
          />
        ),
      });
    }

    cols.push(
      {
        accessorKey: 'date',
        header: 'Date',
        cell: ({ row }) => (
          <button type="button" onClick={() => onView(row.original)} className="font-medium text-primary hover:underline">
            {formatDate(row.original.date)}
          </button>
        ),
      },
      { accessorKey: 'license_plate', header: 'Vehicle' },
      {
        // NEW: Driver column. Shows "Unassigned" (muted) for legacy or
        // driver-less records rather than a blank cell, so it reads as
        // an intentional state, not missing data.
        id: 'driver',
        header: 'Driver',
        cell: ({ row }) =>
          row.original.driver?.name ? (
            <span>{row.original.driver.name}</span>
          ) : (
            <span className="text-muted-foreground">Unassigned</span>
          ),
      },
      {
        accessorKey: 'fuel_volume',
        header: 'Volume',
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.fuel_volume} {row.original.unit?.symbol ?? 'L'}</span>
        ),
      },
      {
        accessorKey: 'cost',
        header: 'Cost',
        cell: ({ row }) => (
          <span className="tabular-nums">{formatCurrency(row.original.cost, { currency: row.original.currency || 'USD' })}</span>
        ),
      },
      {
        accessorKey: 'payment_method',
        header: 'Payment',
        cell: ({ row }) => {
          const method = row.original.payment_method ?? 'cash';
          return (
            <Badge variant={PAYMENT_BADGE_VARIANT[method] ?? 'outline'}>
              {PAYMENT_METHOD_LABELS[method]}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'odometer',
        header: 'Odometer',
        cell: ({ row }) => (row.original.odometer != null ? row.original.odometer.toLocaleString() : 'N/A'),
      },
      {
        accessorKey: 'station_name',
        header: 'Station',
        cell: ({ row }) => row.original.fuel_station?.name || row.original.station_name || 'N/A',
      },
      {
        accessorKey: 'is_full_tank',
        header: 'Full tank',
        cell: ({ row }) =>
          row.original.is_full_tank ? (
            <Badge variant="outline" className="border-success text-success">Yes</Badge>
          ) : (
            <span className="text-muted-foreground">No</span>
          ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const log = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Fuel entry actions">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onView(log)}>
                  <Eye className="mr-2 h-3.5 w-3.5" /> View details
                </DropdownMenuItem>
                {canManage && (
                  <DropdownMenuItem onSelect={() => onEdit(log)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => onDelete(log)} className="text-destructive">
                      <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      }
    );

    return cols;
  }, [data, selectedIds, onToggleSelect, onToggleSelectAll, onView, onEdit, onDelete, canManage, canDelete]);

  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      emptyMessage="No fuel logs found. Try adjusting your filters or log a new fuel entry."
      pagination={
        result
          ? {
              page: result.pagination.page,
              pageSize,
              total: result.pagination.total,
              totalPages: result.pagination.totalPages,
              onPageChange,
            }
          : undefined
      }
    />
  );
}

========================================
FILE: frontend/modules/fuel/components/FuelFilters.tsx
========================================
// frontend/modules/fuel/components/FuelFilters.tsx

'use client';

import { Search, X } from 'lucide-react';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Label } from '@/frontend/shared/ui/forms/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { useVehiclesList } from '@/frontend/modules/vehicles/hooks/useVehicles';
import { useDriversList } from '@/frontend/modules/drivers/hooks/useDrivers';
import type { FuelTableFilters } from '../types';

interface FuelFiltersProps {
  filters: FuelTableFilters;
  onChange: (filters: FuelTableFilters) => void;
}

const ALL = '__all__';

function toDateInputValue(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function FuelFilters({ filters, onChange }: FuelFiltersProps) {
  const { data: vehicles } = useVehiclesList({ limit: 1000 });
  const { data: drivers } = useDriversList({ limit: 1000 });
  const hasFilters = Boolean(
    filters.license_plate || filters.unit_id || filters.startDate || filters.endDate || filters.driver_id
  );

  function handleChange<K extends keyof FuelTableFilters>(key: K, value: FuelTableFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex-1 min-w-55">
        <Label htmlFor="license_plate" className="text-sm">License plate</Label>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            id="license_plate"
            placeholder="Search by plate..."
            value={filters.license_plate || ''}
            onChange={(e) => handleChange('license_plate', e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <div className="w-55">
        <Label htmlFor="unit_id" className="text-sm">Vehicle</Label>
        <Select
          value={filters.unit_id ?? ALL}
          onValueChange={(value) => handleChange('unit_id', value === ALL ? undefined : value)}
        >
          <SelectTrigger id="unit_id"><SelectValue placeholder="All vehicles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All vehicles</SelectItem>
            {vehicles?.data?.map((v) => (
              <SelectItem key={v._id} value={v._id!}>{v.license_plate} - {v.make} {v.model}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* NEW: filter fuel logs by driver */}
      <div className="w-55">
        <Label htmlFor="driver_id" className="text-sm">Driver</Label>
        <Select
          value={filters.driver_id ?? ALL}
          onValueChange={(value) => handleChange('driver_id', value === ALL ? undefined : value)}
        >
          <SelectTrigger id="driver_id"><SelectValue placeholder="All drivers" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All drivers</SelectItem>
            {drivers?.data?.map((d) => (
              <SelectItem key={d._id} value={d._id!}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-40">
        <Label htmlFor="startDate" className="text-sm">From</Label>
        <Input
          id="startDate"
          type="date"
          value={toDateInputValue(filters.startDate)}
          onChange={(e) => handleChange('startDate', e.target.value ? new Date(e.target.value) : undefined)}
        />
      </div>

      <div className="w-40">
        <Label htmlFor="endDate" className="text-sm">To</Label>
        <Input
          id="endDate"
          type="date"
          value={toDateInputValue(filters.endDate)}
          onChange={(e) => handleChange('endDate', e.target.value ? new Date(e.target.value) : undefined)}
        />
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => onChange({})} className="h-9">
          <X className="h-3.5 w-3.5 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}

========================================
FILE: frontend/modules/fuel/components/index.ts
========================================
// frontend/modules/fuel/components/index.ts

export { FuelStatsCards } from './FuelStatsCards';
export { FuelFilters } from './FuelFilters';
export { FuelTable } from './FuelTable';
export { FuelModal, type FuelModalMode } from './FuelModal';
export { FuelForm } from './FuelForm';
export { FuelKpiCards } from './FuelKpiCards';
export { AbnormalConsumptionWidget } from './AbnormalConsumptionWidget';
export { FuelMonthlyTrendChart } from './FuelMonthlyTrendChart';
export { FuelTopConsumersChart } from './FuelTopConsumersChart';
export { FuelImportModal } from './FuelImportModal';

// Enterprise analytics
export { FuelAnalyticsFilterBar, type FuelAnalyticsDateRange } from './FuelAnalyticsFilterBar';
export { VehicleFuelActivityTimelineChart } from './VehicleFuelActivityTimelineChart';
export { FuelCostByDriverChart } from './FuelCostByDriverChart';
export { FuelActivityTrendChart } from './FuelActivityTrendChart';
export { FuelByStationChart } from './FuelByStationChart';
export { AverageFuelPriceTrendChart } from './AverageFuelPriceTrendChart';
export { FuelTypeDistributionChart } from './FuelTypeDistributionChart';
export { FuelFrequencyByVehicleChart } from './FuelFrequencyByVehicleChart';
export { FuelCostDistributionChart } from './FuelCostDistributionChart';
export { FuelEntryHeatmapChart } from './FuelEntryHeatmapChart';

========================================
FILE: frontend/modules/fuel/hooks/useFuel.ts
========================================
// frontend/modules/fuel/hooks/useFuel.ts

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { apiClient } from '@/shared/utils/api-client.utils';
import { fuelApi, type FuelListParams } from '../services/fuel.api';
import type {
  FuelLog,
  FuelVolumeUnitOption,
  FuelByDriverSort,
  FuelTrendGranularity,
} from '../types';

type DateRange = { startDate?: Date; endDate?: Date } | undefined;

function rangeKey(dateRange: DateRange): string | undefined {
  return dateRange
    ? `${dateRange.startDate?.toISOString() ?? ''}-${dateRange.endDate?.toISOString() ?? ''}`
    : undefined;
}

export const fuelKeys = {
  all: ['fuel'] as const,
  lists: () => [...fuelKeys.all, 'list'] as const,
  list: (params: Partial<FuelListParams>) => [...fuelKeys.lists(), params] as const,
  details: () => [...fuelKeys.all, 'detail'] as const,
  detail: (id: string) => [...fuelKeys.details(), id] as const,
  stats: (range?: string) => [...fuelKeys.all, 'stats', range] as const,
  kpis: (range?: string) => [...fuelKeys.all, 'kpis', range] as const,
  abnormal: (threshold: number) => [...fuelKeys.all, 'abnormal', threshold] as const,
  monthly: (months: number) => [...fuelKeys.all, 'monthly', months] as const,
  topConsumers: (limit: number) => [...fuelKeys.all, 'top-consumers', limit] as const,
  byDriver: (range?: string, limit?: number, sortBy?: FuelByDriverSort) =>
    [...fuelKeys.all, 'by-driver', range, limit, sortBy] as const,
  vehicleTimeline: (plate?: string, range?: string) =>
    [...fuelKeys.all, 'vehicle-timeline', plate, range] as const,
  byStation: (range?: string, limit?: number) => [...fuelKeys.all, 'by-station', range, limit] as const,
  activityTrend: (granularity: FuelTrendGranularity, range?: string) =>
    [...fuelKeys.all, 'activity-trend', granularity, range] as const,
  priceTrend: (range?: string, granularity?: FuelTrendGranularity) =>
    [...fuelKeys.all, 'price-trend', range, granularity] as const,
  typeDistribution: (range?: string) => [...fuelKeys.all, 'type-distribution', range] as const,
  frequencyByVehicle: (range?: string, limit?: number) =>
    [...fuelKeys.all, 'frequency-by-vehicle', range, limit] as const,
  costDistribution: (range?: string) => [...fuelKeys.all, 'cost-distribution', range] as const,
  heatmap: (range?: string) => [...fuelKeys.all, 'heatmap', range] as const,
};

export function useFuelLogsList(params: Partial<FuelListParams>) {
  return useQuery({
    queryKey: fuelKeys.list(params),
    queryFn: () => fuelApi.list(params),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

export function useFuelLog(id: string | undefined, options?: Partial<UseQueryOptions<FuelLog>>) {
  return useQuery({
    queryKey: fuelKeys.detail(id ?? ''),
    queryFn: () => fuelApi.getById(id as string),
    enabled: Boolean(id),
    staleTime: 30_000,
    ...options,
  });
}

export function useFuelStats(dateRange?: DateRange) {
  return useQuery({
    queryKey: fuelKeys.stats(rangeKey(dateRange)),
    queryFn: () => fuelApi.getStats(dateRange),
    staleTime: 60_000,
  });
}

export function useFuelKpis(dateRange?: DateRange) {
  return useQuery({
    queryKey: fuelKeys.kpis(rangeKey(dateRange)),
    queryFn: () => fuelApi.getKpis(dateRange),
    staleTime: 60_000,
  });
}

export function useAbnormalFuelConsumption(threshold: number = 2) {
  return useQuery({
    queryKey: fuelKeys.abnormal(threshold),
    queryFn: () => fuelApi.getAbnormalConsumption(threshold),
    staleTime: 60_000,
  });
}

export function useMonthlyFuelConsumption(months: number = 12) {
  return useQuery({
    queryKey: fuelKeys.monthly(months),
    queryFn: () => fuelApi.getMonthlyConsumption(months),
    staleTime: 60_000,
  });
}

export function useTopFuelConsumers(limit: number = 5) {
  return useQuery({
    queryKey: fuelKeys.topConsumers(limit),
    queryFn: () => fuelApi.getTopConsumers(limit),
    staleTime: 60_000,
  });
}

export function useFuelByDriver(
  dateRange?: DateRange,
  limit: number = 10,
  sortBy: FuelByDriverSort = 'volume'
) {
  return useQuery({
    queryKey: fuelKeys.byDriver(rangeKey(dateRange), limit, sortBy),
    queryFn: () => fuelApi.getByDriver(dateRange, limit, sortBy),
    staleTime: 60_000,
  });
}

export function useFuelVolumeUnits() {
  return useQuery({
    queryKey: ['units'],
    queryFn: () => apiClient.get<FuelVolumeUnitOption[]>('/api/units'),
    staleTime: 5 * 60_000,
    select: (units) => units.filter((u) => u.type === 'volume'),
  });
}

export function useVehicleFuelHistory(licensePlate: string | undefined, limit: number = 200) {
  return useQuery({
    queryKey: fuelKeys.list({ license_plate: licensePlate, limit }),
    queryFn: () => fuelApi.list({ license_plate: licensePlate, page: 1, limit }),
    enabled: Boolean(licensePlate),
    staleTime: 30_000,
  });
}

// ---- Enterprise analytics ----

/** #1 Vehicle Fuel Activity Timeline. Omit `license_plate` for "All Vehicles". */
export function useVehicleFuelTimeline(licensePlate: string | undefined, dateRange?: DateRange) {
  return useQuery({
    queryKey: fuelKeys.vehicleTimeline(licensePlate, rangeKey(dateRange)),
    queryFn: () => fuelApi.getVehicleFuelTimeline({ license_plate: licensePlate, ...dateRange }),
    staleTime: 60_000,
  });
}

/** #4 Fuel Spend by Station + #8 Top Fuel Stations share this hook/query. */
export function useFuelByStation(dateRange?: DateRange, limit: number = 15) {
  return useQuery({
    queryKey: fuelKeys.byStation(rangeKey(dateRange), limit),
    queryFn: () => fuelApi.getFuelByStation(dateRange, limit),
    staleTime: 60_000,
  });
}

/** #3 Fuel Activity Trend (combined bar + line) */
export function useFuelActivityTrend(granularity: FuelTrendGranularity, dateRange?: DateRange) {
  return useQuery({
    queryKey: fuelKeys.activityTrend(granularity, rangeKey(dateRange)),
    queryFn: () => fuelApi.getFuelActivityTrend(granularity, dateRange),
    staleTime: 60_000,
  });
}

/** #5 Average Fuel Price Trend */
export function useAverageFuelPriceTrend(dateRange?: DateRange, granularity: FuelTrendGranularity = 'month') {
  return useQuery({
    queryKey: fuelKeys.priceTrend(rangeKey(dateRange), granularity),
    queryFn: () => fuelApi.getAverageFuelPriceTrend(dateRange, granularity),
    staleTime: 60_000,
  });
}

/** #6 Fuel Type Distribution */
export function useFuelTypeDistribution(dateRange?: DateRange) {
  return useQuery({
    queryKey: fuelKeys.typeDistribution(rangeKey(dateRange)),
    queryFn: () => fuelApi.getFuelTypeDistribution(dateRange),
    staleTime: 60_000,
  });
}

/** #7 Fueling Frequency by Vehicle */
export function useFuelingFrequencyByVehicle(dateRange?: DateRange, limit: number = 20) {
  return useQuery({
    queryKey: fuelKeys.frequencyByVehicle(rangeKey(dateRange), limit),
    queryFn: () => fuelApi.getFuelingFrequencyByVehicle(dateRange, limit),
    staleTime: 60_000,
  });
}

/** #9 Fuel Cost Distribution (histogram) */
export function useFuelCostDistribution(dateRange?: DateRange) {
  return useQuery({
    queryKey: fuelKeys.costDistribution(rangeKey(dateRange)),
    queryFn: () => fuelApi.getFuelCostDistribution(dateRange),
    staleTime: 60_000,
  });
}

/** #10 Fuel Entry Heatmap */
export function useFuelEntryHeatmap(dateRange?: DateRange) {
  return useQuery({
    queryKey: fuelKeys.heatmap(rangeKey(dateRange)),
    queryFn: () => fuelApi.getFuelEntryHeatmap(dateRange),
    staleTime: 60_000,
  });
}

========================================
FILE: frontend/modules/fuel/hooks/useFuelMutations.ts
========================================
// frontend/modules/fuel/hooks/useFuelMutations.ts

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fuelApi } from '../services/fuel.api';
import { fuelKeys } from './useFuel';
import type { FuelFormOutput } from '../schemas';
import type { FuelImportResponse } from '../services/fuel.api';

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useCreateFuelLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: FuelFormOutput) => fuelApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fuelKeys.all });
      toast.success('Fuel entry logged');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to log fuel entry')),
  });
}

export function useUpdateFuelLog(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<FuelFormOutput>) => fuelApi.update(id, payload),
    onSuccess: (log) => {
      queryClient.setQueryData(fuelKeys.detail(id), log);
      queryClient.invalidateQueries({ queryKey: fuelKeys.lists() });
      queryClient.invalidateQueries({ queryKey: fuelKeys.all });
      toast.success('Fuel entry updated');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to update fuel entry')),
  });
}

export function useDeleteFuelLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, soft = true }: { id: string; soft?: boolean }) => fuelApi.remove(id, soft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fuelKeys.all });
      toast.success('Fuel entry deleted');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to delete fuel entry')),
  });
}

export function useBulkDeleteFuelLogs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => fuelApi.remove(id, true)));
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: fuelKeys.all });
      toast.success(`${ids.length} fuel entr${ids.length === 1 ? 'y' : 'ies'} deleted`);
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to delete selected fuel entries')),
  });
}

export function useUploadReceipt() {
  return useMutation({
    mutationFn: (file: File) => fuelApi.uploadReceipt(file),
    onError: (error) => toast.error(errMsg(error, 'Failed to upload receipt')),
  });
}

// NEW: drives FuelImportModal. Backend processes rows sequentially and
// never aborts the batch on a single row failure, so success here can
// still mean "some rows failed" â€” surface summary.failed accordingly.
export function useImportFuelLogs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (records: Record<string, unknown>[]) => fuelApi.importLogs(records),
    onSuccess: (data: FuelImportResponse) => {
      queryClient.invalidateQueries({ queryKey: fuelKeys.all });
      const { total, succeeded, duplicates, failed } = data.summary;
      if (failed === 0 && duplicates === 0) {
        toast.success(`Imported ${succeeded} of ${total} fuel logs`);
      } else if (succeeded === 0 && duplicates === total) {
        toast.warning(`All ${total} rows were already imported -- nothing new to add`);
      } else if (succeeded === 0) {
        toast.error(`Import failed for all ${total} rows`);
      } else {
        const parts = [`Imported ${succeeded} of ${total}`];
        if (duplicates > 0) parts.push(`${duplicates} duplicate${duplicates === 1 ? '' : 's'} skipped`);
        if (failed > 0) parts.push(`${failed} failed`);
        toast.warning(parts.join(' -- '));
      }
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to import fuel logs')),
  });
}

========================================
FILE: frontend/modules/fuel/pages/FuelAnalyticsPage.tsx
========================================
// frontend/modules/fuel/pages/FuelAnalyticsPage.tsx

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import {
  FuelAnalyticsFilterBar,
  type FuelAnalyticsDateRange,
  VehicleFuelActivityTimelineChart,
  FuelCostByDriverChart,
  FuelActivityTrendChart,
  FuelByStationChart,
  AverageFuelPriceTrendChart,
  FuelTypeDistributionChart,
  FuelFrequencyByVehicleChart,
  FuelCostDistributionChart,
  FuelEntryHeatmapChart,
} from '../components';
import { FUEL_ROUTES } from '../routes';

export function FuelAnalyticsPage() {
  const router = useRouter();
  const [dateRange, setDateRange] = useState<FuelAnalyticsDateRange>({});

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fuel analytics"
        description="Enterprise fuel insights -- fleet-wide trends, cost drivers, and anomaly signals."
        breadcrumbs={[{ label: 'Fuel', href: FUEL_ROUTES.dashboard }, { label: 'Analytics' }]}
        actions={
          <Button variant="outline" size="sm" onClick={() => router.push(FUEL_ROUTES.dashboard)}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to fuel
          </Button>
        }
      />

      <FuelAnalyticsFilterBar value={dateRange} onChange={setDateRange} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <VehicleFuelActivityTimelineChart dateRange={dateRange} />
        <FuelCostByDriverChart dateRange={dateRange} />
      </div>

      <FuelActivityTrendChart dateRange={dateRange} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <FuelByStationChart dateRange={dateRange} />
        <AverageFuelPriceTrendChart dateRange={dateRange} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <FuelTypeDistributionChart dateRange={dateRange} />
        <FuelFrequencyByVehicleChart dateRange={dateRange} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <FuelCostDistributionChart dateRange={dateRange} />
        <FuelEntryHeatmapChart dateRange={dateRange} />
      </div>
    </div>
  );
}

========================================
FILE: frontend/modules/fuel/pages/FuelDashboardPage.tsx
========================================
// frontend/modules/fuel/pages/FuelDashboardPage.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, List, MapPin, CreditCard, BarChart3 } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/frontend/shared/ui/navigation/NestedMenu';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { FuelStatsCards } from '../components/FuelStatsCards';
import { FuelKpiCards } from '../components/FuelKpiCards';
import { AbnormalConsumptionWidget } from '../components/AbnormalConsumptionWidget';
import { FuelMonthlyTrendChart } from '../components/FuelMonthlyTrendChart';
import { FuelTopConsumersChart } from '../components/FuelTopConsumersChart';
import { FuelModal, type FuelModalMode } from '../components/FuelModal';
import { useCreateFuelLog } from '../hooks/useFuelMutations';
import { canManageFuel } from '../utils';
import { FUEL_ROUTES } from '../routes';
import { FUEL_STATION_ROUTES } from '@/frontend/modules/fuel-stations/routes';
import { FUEL_CARD_ROUTES } from '@/frontend/modules/fuel-cards/routes';
import type { FuelFormValues } from '../schemas';

export function FuelDashboardPage() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canManage = canManageFuel(roles);

  const [modalOpen, setModalOpen] = useState(false);
  const modalMode: FuelModalMode = 'create';
  const createFuelLog = useCreateFuelLog();

  async function handleSubmit(values: FuelFormValues) {
    await createFuelLog.mutateAsync(values);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fuel"
        description="Monitor fuel consumption, costs, and efficiency across your fleet."
        breadcrumbs={[{ label: 'Fuel' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push(FUEL_ROUTES.analytics)}>
              <BarChart3 className="h-3.5 w-3.5" /> Analytics
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">Manage</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => router.push(FUEL_ROUTES.list)}>
                  <List className="mr-2 h-3.5 w-3.5" /> All fuel logs
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push(FUEL_STATION_ROUTES.list)}>
                  <MapPin className="mr-2 h-3.5 w-3.5" /> Fuel stations
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push(FUEL_CARD_ROUTES.list)}>
                  <CreditCard className="mr-2 h-3.5 w-3.5" /> Fuel cards
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {canManage && (
              <Button size="sm" onClick={() => setModalOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Log fuel entry
              </Button>
            )}
          </div>
        }
      />

      <FuelStatsCards />
      <FuelKpiCards />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <FuelMonthlyTrendChart />
        <FuelTopConsumersChart />
      </div>

      <AbnormalConsumptionWidget />

      <FuelModal open={modalOpen} mode={modalMode} onOpenChange={setModalOpen} onSubmit={handleSubmit} />
    </div>
  );
}

========================================
FILE: frontend/modules/fuel/pages/FuelListPage.tsx
========================================
// frontend/modules/fuel/pages/FuelListPage.tsx

'use client';

import { useMemo, useState } from 'react';
import { Plus, Download, FileSpreadsheet, Trash2, Printer, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/frontend/shared/ui/navigation/NestedMenu';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { FuelStatsCards } from '../components/FuelStatsCards';
import { FuelFilters } from '../components/FuelFilters';
import { FuelTable } from '../components/FuelTable';
import { FuelModal, type FuelModalMode } from '../components/FuelModal';
import { FuelImportModal } from '../components/FuelImportModal';
import { useFuelLogsList } from '../hooks/useFuel';
import { useCreateFuelLog, useUpdateFuelLog, useDeleteFuelLog, useBulkDeleteFuelLogs } from '../hooks/useFuelMutations';
import { exportFuelLogs, printFuelLogs, canManageFuel, canDeleteFuel } from '../utils';
import { FUEL_ROUTES } from '../routes';
import type { FuelLog, FuelTableFilters } from '../types';
import type { FuelFormValues } from '../schemas';

const PAGE_SIZE = 10;

export function FuelListPage() {
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canManage = canManageFuel(roles);
  const canDelete = canDeleteFuel(roles);

  const [filters, setFilters] = useState<FuelTableFilters>({});
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modalMode, setModalMode] = useState<FuelModalMode>('create');
  const [modalOpen, setModalOpen] = useState(false);
  const [activeLog, setActiveLog] = useState<FuelLog | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);

  const listParams = useMemo(() => ({ ...filters, page, limit: PAGE_SIZE }), [filters, page]);
  const { data: result, isLoading } = useFuelLogsList(listParams);

  const createFuelLog = useCreateFuelLog();
  const updateFuelLogMutation = useUpdateFuelLog(activeLog?._id ?? '');
  const deleteFuelLog = useDeleteFuelLog();
  const bulkDeleteFuelLogs = useBulkDeleteFuelLogs();

  function handleFiltersChange(next: FuelTableFilters) {
    setFilters(next);
    setPage(1);
  }

  function openCreate() {
    setModalMode('create');
    setActiveLog(null);
    setModalOpen(true);
  }

  function openView(log: FuelLog) {
    setModalMode('view');
    setActiveLog(log);
    setModalOpen(true);
  }

  function openEdit(log: FuelLog) {
    setModalMode('edit');
    setActiveLog(log);
    setModalOpen(true);
  }

  async function handleSubmit(values: FuelFormValues) {
    if (modalMode === 'edit' && activeLog?._id) {
      await updateFuelLogMutation.mutateAsync(values);
    } else if (modalMode === 'create') {
      await createFuelLog.mutateAsync(values);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(ids: string[]) {
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...ids]);
    });
  }

  async function handleDelete(log: FuelLog) {
    if (!log._id) return;
    if (!window.confirm(`Delete this fuel entry for ${log.license_plate}?`)) return;
    await deleteFuelLog.mutateAsync({ id: log._id, soft: true });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(log._id!);
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected fuel entr${selectedIds.size === 1 ? 'y' : 'ies'}?`)) return;
    await bulkDeleteFuelLogs.mutateAsync(Array.from(selectedIds));
    setSelectedIds(new Set());
  }

  async function handleExport(format: 'csv' | 'xlsx') {
    try {
      const { truncated, totalMatched, rowsExported } = await exportFuelLogs(filters, format);
      if (truncated) {
        toast.warning(
          `Export limited to ${rowsExported.toLocaleString()} of ${totalMatched.toLocaleString()} matching fuel logs. Narrow your filters to export the rest.`
        );
      } else {
        toast.success(`Exported ${rowsExported.toLocaleString()} fuel log${rowsExported === 1 ? '' : 's'}`);
      }
    } catch {
      toast.error('Failed to export fuel logs');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fuel logs"
        description="Every recorded fuel purchase across your fleet."
        breadcrumbs={[{ label: 'Fuel', href: FUEL_ROUTES.dashboard }, { label: 'Logs' }]}
        actions={
          <div className="flex items-center gap-2">
            {canDelete && selectedIds.size > 0 && (
              <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                <Trash2 className="h-3.5 w-3.5" /> Delete ({selectedIds.size})
              </Button>
            )}
            {canManage && (
              <Button variant="outline" size="sm" onClick={() => setImportModalOpen(true)}>
                <Upload className="h-3.5 w-3.5" /> Import
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm"><Download className="h-3.5 w-3.5" /> Export</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void handleExport('csv')}>Export as CSV</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void handleExport('xlsx')}>
                  <FileSpreadsheet className="mr-2 h-3.5 w-3.5" /> Export as Excel
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => printFuelLogs()}>
                  <Printer className="mr-2 h-3.5 w-3.5" /> Print
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {canManage && (
              <Button size="sm" onClick={openCreate}><Plus className="h-3.5 w-3.5" /> Log fuel entry</Button>
            )}
          </div>
        }
      />

      <FuelStatsCards />

      <div className="p-4 space-y-4 surface-card">
        <FuelFilters filters={filters} onChange={handleFiltersChange} />
        <FuelTable
          result={result}
          isLoading={isLoading}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onView={openView}
          onEdit={openEdit}
          onDelete={handleDelete}
          canManage={canManage}
          canDelete={canDelete}
        />
      </div>

      <FuelModal open={modalOpen} mode={modalMode} fuelLog={activeLog} onOpenChange={setModalOpen} onSubmit={handleSubmit} />
      <FuelImportModal open={importModalOpen} onOpenChange={setImportModalOpen} />
    </div>
  );
}

========================================
FILE: frontend/modules/fuel/pages/VehicleFuelHistoryPage.tsx
========================================
// frontend/modules/fuel/pages/VehicleFuelHistoryPage.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { useVehicleFuelHistory } from '../hooks/useFuel';
import { useCreateFuelLog } from '../hooks/useFuelMutations';
import { FuelTable } from '../components/FuelTable';
import { FuelModal, type FuelModalMode } from '../components/FuelModal';
import { canManageFuel, canDeleteFuel } from '../utils';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { FUEL_ROUTES } from '../routes';
import type { FuelLog } from '../types';
import type { FuelFormValues } from '../schemas';

interface VehicleFuelHistoryPageProps {
  licensePlate: string;
}

export function VehicleFuelHistoryPage({ licensePlate }: VehicleFuelHistoryPageProps) {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canManage = canManageFuel(roles);
  const canDelete = canDeleteFuel(roles);

  const { data: result, isLoading } = useVehicleFuelHistory(licensePlate, 200);
  const createFuelLog = useCreateFuelLog();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const modalMode: FuelModalMode = 'create';

  const logs = result?.data ?? [];
  const totalFuel = logs.reduce((sum, l) => sum + l.fuel_volume, 0);
  const totalCost = logs.reduce((sum, l) => sum + l.cost, 0);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(ids: string[]) {
    setSelectedIds((prev) => (ids.every((id) => prev.has(id)) ? new Set() : new Set(ids)));
  }

  async function handleSubmit(values: FuelFormValues) {
    await createFuelLog.mutateAsync({ ...values, license_plate: licensePlate });
  }

  const breadcrumbs = [{ label: 'Fuel', href: FUEL_ROUTES.dashboard }, { label: licensePlate }];
  const backButton = (
    <Button variant="outline" size="sm" onClick={() => router.push(FUEL_ROUTES.list)}>
      <ArrowLeft className="h-3.5 w-3.5" /> Back
    </Button>
  );

  if (!isLoading && logs.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={`Fuel history Â· ${licensePlate}`} breadcrumbs={breadcrumbs} actions={backButton} />
        <EmptyState title="No fuel history" description={`No fuel entries recorded for ${licensePlate} yet.`} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Fuel history Â· ${licensePlate}`}
        description={`${logs.length} entries Â· ${totalFuel.toFixed(1)} L Â· ${formatCurrency(totalCost)} total`}
        breadcrumbs={breadcrumbs}
        actions={
          <div className="flex items-center gap-2">
            {backButton}
            {canManage && (
              <Button size="sm" onClick={() => setModalOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Log fuel entry
              </Button>
            )}
          </div>
        }
      />

      <div className="p-4 surface-card">
        <FuelTable
          result={result}
          isLoading={isLoading}
          pageSize={200}
          onPageChange={() => {}}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onView={(log: FuelLog) => router.push(FUEL_ROUTES.detail(log._id!))}
          onEdit={(log: FuelLog) => router.push(FUEL_ROUTES.edit(log._id!))}
          onDelete={() => {}}
          canManage={canManage}
          canDelete={canDelete}
        />
      </div>

      <FuelModal open={modalOpen} mode={modalMode} onOpenChange={setModalOpen} onSubmit={handleSubmit} />
    </div>
  );
}

========================================
FILE: frontend/modules/fuel/services/fuel.api.ts
========================================
// frontend/modules/fuel/services/fuel.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import type { PaginatedResponse } from '@/shared/types/common.types';
import type { ExportFormat } from '@/shared/export/export.types';
import type { ExportBlobResponse } from '@/shared/utils/export-download.utils';
import type {
  FuelLog,
  FuelTableFilters,
  FuelStats,
  FuelKpis,
  AbnormalFuelConsumptionRow,
  MonthlyFuelConsumptionPoint,
  TopFuelConsumerRow,
  DriverFuelConsumptionRow,
  FuelByDriverSort,
  FuelTrendGranularity,
  VehicleFuelTimelinePoint,
  FuelByStationRow,
  FuelActivityTrendPoint,
  FuelPriceTrendPoint,
  FuelTypeDistributionRow,
  FuelFrequencyByVehicleRow,
  FuelCostDistributionBucket,
  FuelHeatmapCell,
} from '../types';
import type { FuelFormOutput } from '../schemas';

const BASE = '/api/fuellogs';

export interface FuelListParams extends FuelTableFilters {
  page?: number;
  limit?: number;
}

export interface FuelImportRowResult {
  row: number;
  success: boolean;
  identifier?: string;
  error?: string;
  /** True when the row was skipped as a duplicate rather than failing validation. */
  duplicate?: boolean;
}

export interface FuelImportResponse {
  summary: { total: number; succeeded: number; duplicates: number; failed: number };
  results: FuelImportRowResult[];
}

function toIso(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function buildListQuery(params: Partial<FuelListParams>) {
  return {
    license_plate: params.license_plate,
    unit_id: params.unit_id,
    payment_method: params.payment_method,
    fuel_station_id: params.fuel_station_id,
    fuel_card_id: params.fuel_card_id,
    driver_id: params.driver_id,
    start: toIso(params.startDate),
    end: toIso(params.endDate),
    page: params.page,
    limit: params.limit,
  };
}

function buildRangeParams(dateRange?: { startDate?: Date; endDate?: Date }) {
  return {
    startDate: dateRange?.startDate ? dateRange.startDate.toISOString() : undefined,
    endDate: dateRange?.endDate ? dateRange.endDate.toISOString() : undefined,
  };
}

export const fuelApi = {
  async list(params: Partial<FuelListParams>): Promise<PaginatedResponse<FuelLog>> {
    return apiClient.get<PaginatedResponse<FuelLog>>(BASE, { params: buildListQuery(params) });
  },

  async getById(id: string): Promise<FuelLog> {
    return apiClient.get<FuelLog>(BASE, { params: { id } });
  },

  async create(payload: FuelFormOutput): Promise<FuelLog> {
    return apiClient.post<FuelLog>(BASE, payload);
  },

  async update(id: string, payload: Partial<FuelFormOutput>): Promise<FuelLog> {
    return apiClient.put<FuelLog>(BASE, payload, { params: { id } });
  },

  async remove(id: string, soft: boolean = true): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(BASE, { params: { id, soft } });
  },

  /**
   * Enterprise Export Framework (Phase 2). Fuel logs export lives behind
   * ?action=export on the shared /api/fuellogs route (no dedicated
   * /export subroute), same as every other action on this module. Sends
   * the same filter fields as list() so the backend re-queries the full
   * authorized, filtered result set (capped at EXPORT_ROW_CAP).
   */
  async exportFile(filters: Partial<FuelTableFilters>, format: ExportFormat = 'csv'): Promise<ExportBlobResponse> {
    return apiClient.getBlob(BASE, {
      params: {
        action: 'export',
        license_plate: filters.license_plate,
        unit_id: filters.unit_id,
        payment_method: filters.payment_method,
        fuel_station_id: filters.fuel_station_id,
        fuel_card_id: filters.fuel_card_id,
        driver_id: filters.driver_id,
        start: toIso(filters.startDate),
        end: toIso(filters.endDate),
        format,
      },
    });
  },

  async getStats(dateRange?: { startDate?: Date; endDate?: Date }): Promise<FuelStats> {
    return apiClient.get<FuelStats>(BASE, { params: { action: 'stats', ...buildRangeParams(dateRange) } });
  },

  async getKpis(dateRange?: { startDate?: Date; endDate?: Date }): Promise<FuelKpis> {
    return apiClient.get<FuelKpis>(BASE, { params: { action: 'kpis', ...buildRangeParams(dateRange) } });
  },

  async getAbnormalConsumption(threshold: number = 2): Promise<AbnormalFuelConsumptionRow[]> {
    return apiClient.get<AbnormalFuelConsumptionRow[]>(BASE, { params: { action: 'abnormal', threshold } });
  },

  async getMonthlyConsumption(months: number = 12): Promise<MonthlyFuelConsumptionPoint[]> {
    return apiClient.get<MonthlyFuelConsumptionPoint[]>(BASE, { params: { action: 'monthly', months } });
  },

  async getTopConsumers(limit: number = 5): Promise<TopFuelConsumerRow[]> {
    return apiClient.get<TopFuelConsumerRow[]>(BASE, { params: { action: 'top-consumers', limit } });
  },

  async getByDriver(
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 10,
    sortBy: FuelByDriverSort = 'volume'
  ): Promise<DriverFuelConsumptionRow[]> {
    return apiClient.get<DriverFuelConsumptionRow[]>(BASE, {
      params: { action: 'by-driver', limit, sortBy, ...buildRangeParams(dateRange) },
    });
  },

  async uploadReceipt(file: File): Promise<{ url: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${BASE}/receipt`, { method: 'POST', body: formData });
    const body = await response.json();
    if (!response.ok || body?.success === false) {
      throw new Error(body?.error?.message || 'Failed to upload receipt');
    }
    return body.data;
  },

  async importLogs(records: Record<string, unknown>[]): Promise<FuelImportResponse> {
    // FIX: this call was using apiClient's default 30000ms timeout, so the
    // browser aborted the fetch (surfacing as "Request timeout") right as
    // the server was still working through the batch -- the server itself
    // finished fine (see the `200 in 30390ms` log), the client just wasn't
    // waiting long enough. Import is a bulk op scaling with row count
    // (MAX_IMPORT_ROWS = 2000), so it needs its own generous timeout.
    return apiClient.post<FuelImportResponse>(`${BASE}/import`, { records }, { timeout: 180_000 });
  },

  // ---- Enterprise analytics ----

  async getVehicleFuelTimeline(params: {
    license_plate?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<VehicleFuelTimelinePoint[]> {
    return apiClient.get<VehicleFuelTimelinePoint[]>(BASE, {
      params: {
        action: 'vehicle-timeline',
        license_plate: params.license_plate,
        ...buildRangeParams(params),
      },
    });
  },

  async getFuelByStation(
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 15
  ): Promise<FuelByStationRow[]> {
    return apiClient.get<FuelByStationRow[]>(BASE, {
      params: { action: 'by-station', limit, ...buildRangeParams(dateRange) },
    });
  },

  async getFuelActivityTrend(
    granularity: FuelTrendGranularity,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelActivityTrendPoint[]> {
    return apiClient.get<FuelActivityTrendPoint[]>(BASE, {
      params: { action: 'activity-trend', granularity, ...buildRangeParams(dateRange) },
    });
  },

  async getAverageFuelPriceTrend(
    dateRange?: { startDate?: Date; endDate?: Date },
    granularity: FuelTrendGranularity = 'month'
  ): Promise<FuelPriceTrendPoint[]> {
    return apiClient.get<FuelPriceTrendPoint[]>(BASE, {
      params: { action: 'price-trend', granularity, ...buildRangeParams(dateRange) },
    });
  },

  async getFuelTypeDistribution(
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelTypeDistributionRow[]> {
    return apiClient.get<FuelTypeDistributionRow[]>(BASE, {
      params: { action: 'type-distribution', ...buildRangeParams(dateRange) },
    });
  },

  async getFuelingFrequencyByVehicle(
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 20
  ): Promise<FuelFrequencyByVehicleRow[]> {
    return apiClient.get<FuelFrequencyByVehicleRow[]>(BASE, {
      params: { action: 'frequency-by-vehicle', limit, ...buildRangeParams(dateRange) },
    });
  },

  async getFuelCostDistribution(
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelCostDistributionBucket[]> {
    return apiClient.get<FuelCostDistributionBucket[]>(BASE, {
      params: { action: 'cost-distribution', ...buildRangeParams(dateRange) },
    });
  },

  async getFuelEntryHeatmap(dateRange?: { startDate?: Date; endDate?: Date }): Promise<FuelHeatmapCell[]> {
    return apiClient.get<FuelHeatmapCell[]>(BASE, {
      params: { action: 'heatmap', ...buildRangeParams(dateRange) },
    });
  },
};

export default fuelApi;

========================================
FILE: frontend/modules/fuel/types/index.ts
========================================
// frontend/modules/fuel/types/index.ts

import type {
  FuelLog,
  FuelFilters,
  FuelStats,
  FuelKpis,
  AbnormalFuelConsumptionRow,
  FuelPaymentMethod,
  FuelPaymentBreakdown,
  DriverFuelConsumptionRow,
  FuelTrendGranularity,
  VehicleFuelTimelinePoint,
  FuelByStationRow,
  FuelActivityTrendPoint,
  FuelPriceTrendPoint,
  FuelTypeDistributionRow,
  FuelFrequencyByVehicleRow,
  FuelCostDistributionBucket,
  FuelHeatmapCell,
} from '@/shared/types/fuel.types';
import type { DriverRef } from '@/shared/types/driver.types';
import type { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';

export type {
  FuelLog,
  FuelFilters,
  FuelStats,
  FuelKpis,
  AbnormalFuelConsumptionRow,
  FuelPaymentMethod,
  FuelPaymentBreakdown,
  DriverFuelConsumptionRow,
  DriverRef,
  PaginationParams,
  PaginatedResponse,
  FuelTrendGranularity,
  VehicleFuelTimelinePoint,
  FuelByStationRow,
  FuelActivityTrendPoint,
  FuelPriceTrendPoint,
  FuelTypeDistributionRow,
  FuelFrequencyByVehicleRow,
  FuelCostDistributionBucket,
  FuelHeatmapCell,
};

export { FUEL_PAYMENT_METHODS } from '@/shared/types/fuel.types';
export type { FuelByDriverSort } from '@/shared/types/fuel-by-driver-sort';

export type FuelTableFilters = FuelFilters;

export interface FuelColumnVisibility {
  date: boolean;
  unit: boolean;
  cost: boolean;
  odometer: boolean;
  station: boolean;
  fuel_type: boolean;
  payment_method: boolean;
  full_tank: boolean;
  notes: boolean;
  driver: boolean;
}

export const DEFAULT_FUEL_COLUMN_VISIBILITY: FuelColumnVisibility = {
  date: true,
  unit: true,
  cost: true,
  odometer: true,
  station: true,
  fuel_type: false,
  payment_method: true,
  full_tank: false,
  notes: false,
  driver: true,
};

export interface FuelVolumeUnitOption {
  unit_id: string;
  name: string;
  symbol: string;
  type: string;
}

export interface MonthlyFuelConsumptionPoint {
  month: string;
  fuel: number;
  cost: number;
}

export interface TopFuelConsumerRow {
  license_plate: string;
  totalFuel: number;
  totalCost: number;
}

export const PAYMENT_METHOD_LABELS: Record<FuelPaymentMethod, string> = {
  cash: 'Cash',
  fuel_card: 'Fuel card',
  credit_card: 'Credit card',
  company_account: 'Company account',
  other: 'Other',
};

========================================
FILE: frontend/modules/fuel/schemas/index.ts
========================================
// frontend/modules/fuel/schemas/index.ts

import { z } from 'zod';

const fuelFormBaseSchema = z.object({
  license_plate: z.string().min(1, 'License plate is required'),
  unit_id: z.string().min(1, 'Volume unit is required'),
  date: z.date({ message: 'Date is required' }),
  fuel_volume: z.number().positive('Volume must be positive'),
  cost: z.number().positive('Cost must be positive'),
  currency: z.string().min(1, 'Currency is required'),
  odometer: z.number().nonnegative('Odometer must be non-negative').optional(),
  is_full_tank: z.boolean().default(false),
  station_name: z.string().max(100).optional(),
  fuel_station_id: z.string().optional(),
  fuel_type: z.string().optional(),
  notes: z.string().max(500, 'Notes too long').optional(),
  receipt_url: z.union([z.string().url('Enter a valid URL'), z.literal('')]).optional(),
  payment_method: z
    .enum(['cash', 'fuel_card', 'credit_card', 'company_account', 'other'])
    .default('cash'),
  fuel_card_id: z.string().optional(),
  // NEW: optional -- a fuel entry does not require a driver, and every
  // existing record without one continues to work unchanged.
  driver_id: z.string().optional(),
});

export const fuelFormSchema = fuelFormBaseSchema.refine(
  (data) => data.payment_method !== 'fuel_card' || Boolean(data.fuel_card_id),
  { message: 'Select the fuel card used for this purchase', path: ['fuel_card_id'] }
);

export type FuelFormValues = z.infer<typeof fuelFormSchema>;
export type FuelFormOutput = z.output<typeof fuelFormSchema>;

========================================
FILE: frontend/modules/expenses/components/ExpenseAnalyticsFilterBar.tsx
========================================
// frontend/modules/expenses/components/ExpenseAnalyticsFilterBar.tsx

'use client';

import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { X } from 'lucide-react';

export interface ExpenseAnalyticsDateRange {
  startDate?: Date;
  endDate?: Date;
}

interface ExpenseAnalyticsFilterBarProps {
  value: ExpenseAnalyticsDateRange;
  onChange: (value: ExpenseAnalyticsDateRange) => void;
}

function toDateInputValue(value: Date | undefined): string {
  if (!value) return '';
  return value.toISOString().slice(0, 10);
}

export function ExpenseAnalyticsFilterBar({ value, onChange }: ExpenseAnalyticsFilterBarProps) {
  const hasFilters = Boolean(value.startDate || value.endDate);

  return (
    <div className="flex flex-wrap items-end gap-4 p-4 surface-card">
      <div className="w-40">
        <Label htmlFor="expense-analytics-from" className="text-sm">From</Label>
        <Input
          id="expense-analytics-from"
          type="date"
          value={toDateInputValue(value.startDate)}
          onChange={(e) =>
            onChange({ ...value, startDate: e.target.value ? new Date(e.target.value) : undefined })
          }
        />
      </div>
      <div className="w-40">
        <Label htmlFor="expense-analytics-to" className="text-sm">To</Label>
        <Input
          id="expense-analytics-to"
          type="date"
          value={toDateInputValue(value.endDate)}
          onChange={(e) =>
            onChange({ ...value, endDate: e.target.value ? new Date(e.target.value) : undefined })
          }
        />
      </div>
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => onChange({})} className="h-9">
          <X className="h-3.5 w-3.5 mr-1" /> Clear
        </Button>
      )}
    </div>
  );
}

========================================
FILE: frontend/modules/expenses/components/ExpenseStatsCards.tsx
========================================
// frontend/modules/expenses/components/ExpenseStatsCards.tsx

'use client';

import { useMemo, useState } from 'react';
import { Wallet, TrendingUp, Hash, Tag, CalendarRange, AlertCircle } from 'lucide-react';
import { StatisticCard, StatisticCards } from '@/frontend/shared/ui/data-display/StatisticCards';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { Label } from '@/frontend/shared/ui/forms/label';
import { useExpenseStats } from '../hooks/useExpenses';
import { formatCurrency } from '@/shared/utils/currency.utils';

type StatsPeriod = 'all' | 'month' | '30d' | 'year';

const PERIOD_LABELS: Record<StatsPeriod, string> = {
  all: 'All time',
  month: 'This month',
  '30d': 'Last 30 days',
  year: 'This year',
};

function getRangeForPeriod(period: StatsPeriod): { startDate?: Date; endDate?: Date } | undefined {
  if (period === 'all') return undefined;
  const end = new Date();
  let start = new Date();
  if (period === 'month') start = new Date(end.getFullYear(), end.getMonth(), 1);
  if (period === '30d') start.setDate(end.getDate() - 30);
  if (period === 'year') start = new Date(end.getFullYear(), 0, 1);
  return { startDate: start, endDate: end };
}

/**
 * Small colored icon badge, replacing the previous plain muted-foreground
 * icon. Each stat gets a distinct semantic accent (spend = primary,
 * average = success, category count = info, top category = accent) so
 * the four cards are scannable at a glance rather than four identical
 * gray icons.
 */
function StatIcon({
  icon: Icon,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: 'primary' | 'success' | 'info' | 'accent';
}) {
  const toneVar =
    tone === 'primary' ? 'var(--primary)' :
    tone === 'success' ? 'var(--success)' :
    tone === 'info' ? 'var(--info)' :
    'var(--accent)';

  return (
    <span
      className="flex items-center justify-center rounded-lg h-7 w-7 shrink-0"
      style={{ backgroundColor: `color-mix(in oklab, ${toneVar} 14%, transparent)`, color: toneVar }}
    >
      <Icon className="w-3.5 h-3.5" />
    </span>
  );
}

/**
 * Same deterministic hash used by ExpensesTable's CategoryBadge, so the
 * "Top category" figure here always matches the color that category
 * shows as in the table below -- one category, one color, everywhere.
 */
const CHART_COLOR_COUNT = 6;

function categoryColorIndex(label: string): number {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  return (hash % CHART_COLOR_COUNT) + 1;
}

export function ExpenseStatsCards() {
  /**
   * FIX: this previously defaulted to 'month', which silently scoped the
   * dashboard's KPI cards ("Total expenses", "Average expense",
   * "Categories used", "Top category") to the current calendar month on
   * every page load -- while the cards themselves read as if they were
   * showing all-time figures, and the paired KPIsWidget on the main
   * dashboard explicitly labels the same number "All recorded expenses".
   * That mismatch (a few current-month rows vs. the full 101-record
   * history going back to April) is exactly what produced the
   * dashboard-vs-list-page total discrepancy. Defaulting to 'all' makes
   * getRangeForPeriod() return `undefined`, which (paired with the fixed
   * useExpenseStats hook) sends no date filter at all and matches the
   * backend's own all-time aggregation. The selector still lets the
   * person narrow to This month / Last 30 days / This year on demand.
   */
  const [period, setPeriod] = useState<StatsPeriod>('all');
  const dateRange = useMemo(() => getRangeForPeriod(period), [period]);
  const { data: stats, isLoading, error } = useExpenseStats(dateRange);

  const topCategory = stats?.topCategories?.[0];

  // FIX (crash -- "Cannot convert undefined or null to object"):
  // `stats ? Object.keys(stats.byType).length : 0` only guarded against
  // `stats` itself being undefined -- it did not check whether `byType`
  // was present ON `stats`. If the response resolved but `byType` was
  // missing (stale cached response, partial envelope, or any shape drift
  // between deploys), `Object.keys(undefined)` threw and took down the
  // whole page. Guarding `stats?.byType` directly (not just `stats`)
  // makes this impossible regardless of what the rest of the object
  // looks like.
  const categoryCount = stats?.byType ? Object.keys(stats.byType).length : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm text-muted-foreground">
          Fleet expense totals &middot; {PERIOD_LABELS[period]}
        </Label>
        <Select value={period} onValueChange={(v) => setPeriod(v as StatsPeriod)}>
          <SelectTrigger className="w-40">
            <CalendarRange className="w-3.5 h-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PERIOD_LABELS) as StatsPeriod[]).map((p) => (
              <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl skeleton" />)}
        </div>
      ) : error || !stats ? (
        <div className="flex items-center gap-2 p-4 text-sm surface-card text-muted-foreground">
          <AlertCircle className="w-4 h-4 shrink-0 text-danger" />
          Unable to load expense statistics
        </div>
      ) : (
        <StatisticCards>
          <StatisticCard
            title="Total expenses"
            value={formatCurrency(stats.total)}
            icon={<StatIcon icon={Wallet} tone="primary" />}
          />
          <StatisticCard
            title="Average expense"
            value={formatCurrency(stats.average)}
            icon={<StatIcon icon={TrendingUp} tone="success" />}
          />
          <StatisticCard
            title="Categories used"
            value={categoryCount}
            icon={<StatIcon icon={Hash} tone="info" />}
          />
          <StatisticCard
            title="Top category"
            value={
              topCategory ? (
                <Badge
                  variant="outline"
                  className="text-base font-semibold border-transparent"
                  style={{
                    backgroundColor: `color-mix(in oklab, var(--chart-${categoryColorIndex(topCategory.name)}) 14%, transparent)`,
                    color: `var(--chart-${categoryColorIndex(topCategory.name)})`,
                  }}
                >
                  {topCategory.name}
                </Badge>
              ) : (
                'N/A'
              )
            }
            description={topCategory ? formatCurrency(topCategory.amount) : undefined}
            icon={<StatIcon icon={Tag} tone="accent" />}
          />
        </StatisticCards>
      )}
    </div>
  );
}

========================================
FILE: frontend/modules/expenses/components/ExpenseTransactionDrawer.tsx
========================================
// frontend/modules/expenses/components/ExpenseTransactionDrawer.tsx

'use client';

import { useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Printer, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/shared/ui/feedback/dialog';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/shared/ui/data-display/table';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/frontend/shared/ui/navigation/NestedMenu';
import { expensesApi, type ExpenseListParams } from '../services/expenses.api';
import { buildCsvText, downloadCsvText } from '@/shared/utils/csv-parser.utils';
import { downloadXlsxTemplate } from '@/shared/utils/excel-parser.utils';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { formatDate } from '@/shared/utils/date.utils';
import { EXPENSE_ROUTES } from '../routes';
import type { Expense } from '../types';

export interface ExpenseDrawerFilter extends Partial<ExpenseListParams> {
  /** Shown as the drawer title, e.g. "Maintenance -- Jul 2026" or "AFK4234". */
  label: string;
}

interface ExpenseTransactionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filter: ExpenseDrawerFilter | null;
}

const EXPORT_LIMIT = 5000;

export function ExpenseTransactionDrawer({ open, onOpenChange, filter }: ExpenseTransactionDrawerProps) {
  const router = useRouter();
  const printRef = useRef<HTMLDivElement>(null);

  // Lazy: this query only runs while the drawer is open AND a filter is set.
  // Clicking a chart element never fires a request until the drawer opens.
  const { data, isLoading, error } = useQuery({
    queryKey: ['expenses', 'drawer', filter],
    queryFn: () => expensesApi.list({ ...filter, page: 1, limit: EXPORT_LIMIT }),
    enabled: open && Boolean(filter),
    staleTime: 30_000,
  });

  const rows = data?.data ?? [];
  const total = useMemo(() => rows.reduce((sum, r) => sum + r.amount, 0), [rows]);

  function categoryLabel(expense: Expense): string {
    return expense.expense_type?.name || 'Uncategorized';
  }

  function handleExportCsv() {
    const csv = buildCsvText(
      ['date', 'license_plate', 'category', 'amount', 'jobTrip', 'description'],
      rows.map((r) => ({
        date: formatDate(r.date, 'yyyy-MM-dd'),
        license_plate: r.license_plate,
        category: categoryLabel(r),
        amount: r.amount,
        jobTrip: r.jobTrip ?? '',
        description: r.description ?? '',
      }))
    );
    downloadCsvText(csv, `${(filter?.label ?? 'expenses').toLowerCase().replace(/\s+/g, '-')}.csv`);
  }

  function handleExportExcel() {
    downloadXlsxTemplate(
      ['Date', 'Vehicle', 'Category', 'Amount', 'Job / Trip', 'Description'],
      rows.map((r) => ({
        Date: formatDate(r.date, 'yyyy-MM-dd'),
        Vehicle: r.license_plate,
        Category: categoryLabel(r),
        Amount: r.amount,
        'Job / Trip': r.jobTrip ?? '',
        Description: r.description ?? '',
      })),
      `${(filter?.label ?? 'expenses').toLowerCase().replace(/\s+/g, '-')}.xlsx`,
      'Transactions'
    );
  }

  function handlePrintPdf() {
    // Browser print-to-PDF: no additional dependency, works in every
    // modern browser via the native "Save as PDF" print destination.
    window.print();
  }

  function handleOpenFullList() {
    const params = new URLSearchParams();
    if (filter?.license_plate) params.set('license_plate', filter.license_plate);
    if (filter?.type) params.set('type', filter.type);
    if ((filter as any)?.jobTrip) params.set('jobTrip', (filter as any).jobTrip);
    if (filter?.startDate) params.set('start', new Date(filter.startDate).toISOString());
    if (filter?.endDate) params.set('end', new Date(filter.endDate).toISOString());
    router.push(`${EXPENSE_ROUTES.list}?${params.toString()}`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl print:max-h-none print:overflow-visible">
        <DialogHeader className="print:hidden">
          <DialogTitle>{filter?.label ?? 'Transactions'}</DialogTitle>
          <DialogDescription>
            {rows.length > 0
              ? `${rows.length} transaction${rows.length === 1 ? '' : 's'} \u00B7 ${formatCurrency(total)} total`
              : 'Transaction details'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-end gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={handleOpenFullList}>
            <ExternalLink className="h-3.5 w-3.5" /> Open full list
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={rows.length === 0}>
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={handleExportCsv}>Export as CSV</DropdownMenuItem>
              <DropdownMenuItem onSelect={handleExportExcel}>
                <FileSpreadsheet className="mr-2 h-3.5 w-3.5" /> Export as Excel
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handlePrintPdf}>
                <Printer className="mr-2 h-3.5 w-3.5" /> Print / Save as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div ref={printRef}>
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-10 rounded skeleton" />)}
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">Unable to load transactions.</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions match this selection.</p>
          ) : (
            <div className="overflow-x-auto border rounded-md border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Job / Trip</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r._id}>
                      <TableCell>{formatDate(r.date)}</TableCell>
                      <TableCell className="font-medium">{r.license_plate}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{categoryLabel(r)}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(r.amount)}</TableCell>
                      <TableCell>{r.jobTrip || '\u2014'}</TableCell>
                      <TableCell className="max-w-55 truncate" title={r.description}>
                        {r.description || '\u2014'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

========================================
FILE: frontend/modules/expenses/components/ExpenseMonthlyTrendChart.tsx
========================================

// frontend/modules/expenses/components/ExpenseMonthlyTrendChart.tsx

'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useExpenseMonthlyTrends } from '../hooks/useExpenses';
import { formatCurrency } from '@/shared/utils/currency.utils';

export function ExpenseMonthlyTrendChart() {
  const { data: monthlyData, isLoading, error } = useExpenseMonthlyTrends(12);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Monthly expense trend</CardTitle></CardHeader>
        <CardContent><div className="rounded-lg h-55 skeleton" /></CardContent>
      </Card>
    );
  }

  if (error || !monthlyData || monthlyData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Monthly expense trend</CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly expense trend</CardTitle>
        <CardDescription>Last 12 months</CardDescription>
      </CardHeader>
      <CardContent>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={monthlyData} margin={{ left: -20, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                formatter={(value: number) => [formatCurrency(value), 'Total']}
              />
              <Line type="monotone" dataKey="total" stroke="var(--chart-1)" strokeWidth={2} dot={false} name="total" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

========================================
FILE: frontend/modules/expenses/components/ExpenseCategoryChart.tsx
========================================
// frontend/modules/expenses/components/ExpenseCategoryChart.tsx

'use client';

import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useExpenseCategorySummary, useExpenseTypes } from '../hooks/useExpenses';
import { useExpenseDrawer } from '../hooks/useExpenseDrawer';
import { ExpenseTransactionDrawer } from './ExpenseTransactionDrawer';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { formatDate } from '@/shared/utils/date.utils';
import { getChartColor } from '@/shared/utils/chart.utils';
import type { CategorySummary } from '@/shared/types/expense.types';

function CategoryTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as CategorySummary;
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-3 space-y-0.5 max-w-64">
      <p className="text-sm font-medium">{row.category}</p>
      <p className="text-xs text-muted-foreground">
        Total: <span className="font-medium text-foreground">{formatCurrency(row.total)}</span> ({row.percentageOfTotal}% of total)
      </p>
      <p className="text-xs text-muted-foreground">
        Transactions: <span className="font-medium text-foreground">{row.count}</span> &middot; Avg: <span className="font-medium text-foreground">{formatCurrency(row.average)}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Range: <span className="font-medium text-foreground">{formatCurrency(row.min)} \u2013 {formatCurrency(row.max)}</span>
      </p>
      {row.topVehicle && (
        <p className="text-xs text-muted-foreground">
          Top vehicle: <span className="font-medium text-foreground">{row.topVehicle}</span>
        </p>
      )}
      {row.latestDate && (
        <p className="text-xs text-muted-foreground">
          Latest: <span className="font-medium text-foreground">{formatDate(row.latestDate)}</span>
        </p>
      )}
      {row.momChangePercent !== null && (
        <p className="text-xs text-muted-foreground">
          vs. prior period: <span className={`font-medium ${row.momChangePercent >= 0 ? 'text-danger' : 'text-success'}`}>
            {row.momChangePercent >= 0 ? '+' : ''}{row.momChangePercent}%
          </span>
        </p>
      )}
      <p className="pt-1 text-caption text-muted-foreground">Click to view transactions</p>
    </div>
  );
}

export function ExpenseCategoryChart() {
  const { data: summary, isLoading, error } = useExpenseCategorySummary();
  const { data: expenseTypes } = useExpenseTypes();
  const { open, setOpen, filter, openDrawer } = useExpenseDrawer();

  const chartData = useMemo(() => {
    if (!summary) return [];
    return [...summary].sort((a, b) => b.total - a.total).slice(0, 8);
  }, [summary]);

  function handleClick(row: CategorySummary) {
    const type = expenseTypes?.find((t) => t.name === row.category);
    openDrawer({ label: row.category, type: type?._id });
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Expense distribution</CardTitle></CardHeader>
        <CardContent><div className="rounded-lg h-55 skeleton" /></CardContent>
      </Card>
    );
  }

  if (error || chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Expense distribution</CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Expense distribution</CardTitle>
          <CardDescription>By category &mdash; click a slice for transaction details</CardDescription>
        </CardHeader>
        <CardContent>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="total"
                  nameKey="category"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                  cursor="pointer"
                  onClick={(entry: any) => handleClick(entry)}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={entry.category} fill={getChartColor(index)} />
                  ))}
                </Pie>
                <Tooltip content={<CategoryTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      <ExpenseTransactionDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}

========================================
FILE: frontend/modules/expenses/components/ExpenseCategoryOverTimeChart.tsx
========================================
// frontend/modules/expenses/components/ExpenseCategoryOverTimeChart.tsx

'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useExpenseCategoryOverTime, useExpenseTypes } from '../hooks/useExpenses';
import { useExpenseDrawer } from '../hooks/useExpenseDrawer';
import { ExpenseTransactionDrawer } from './ExpenseTransactionDrawer';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { getChartColor } from '@/shared/utils/chart.utils';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';

interface ExpenseCategoryOverTimeChartProps {
  dateRange: ExpenseAnalyticsDateRange;
}

function CategoryOverTimeTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const total = payload.reduce((sum: number, p: any) => sum + (p.value || 0), 0);
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-1">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">
        Total: <span className="font-medium text-foreground">{formatCurrency(total)}</span>
      </p>
      {payload
        .filter((p: any) => p.value > 0)
        .sort((a: any, b: any) => b.value - a.value)
        .map((p: any) => (
          <p key={p.dataKey} className="text-xs text-muted-foreground">
            {p.name}: <span className="font-medium text-foreground">{formatCurrency(p.value)}</span>{' '}
            ({total > 0 ? ((p.value / total) * 100).toFixed(1) : '0.0'}%)
          </p>
        ))}
    </div>
  );
}

export function ExpenseCategoryOverTimeChart({ dateRange }: ExpenseCategoryOverTimeChartProps) {
  const { data, isLoading, error } = useExpenseCategoryOverTime(dateRange);
  const { data: expenseTypes } = useExpenseTypes();
  const { open, setOpen, filter, openDrawer } = useExpenseDrawer();

  const { chartData, categories } = useMemo(() => {
    if (!data || data.length === 0) return { chartData: [], categories: [] as string[] };
    const categorySet = new Set<string>();
    const byMonth = new Map<string, Record<string, number>>();
    for (const point of data) {
      categorySet.add(point.category);
      if (!byMonth.has(point.month)) byMonth.set(point.month, {});
      byMonth.get(point.month)![point.category] = point.amount;
    }
    const cats = Array.from(categorySet);
    const rows = Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, values]) => ({ month, ...values }));
    return { chartData: rows, categories: cats };
  }, [data]);

  function handleBarClick(category: string, month: string) {
    const type = expenseTypes?.find((t) => t.name === category);
    const [year, m] = month.split('-');
    const startDate = new Date(Number(year), Number(m) - 1, 1);
    const endDate = new Date(Number(year), Number(m), 0);
    openDrawer({ label: `${category} \u2014 ${month}`, type: type?._id, startDate, endDate });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Expense by category over time</CardTitle>
          <CardDescription>Monthly spend, broken down by category &mdash; click a segment for transactions</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="rounded-lg h-72 skeleton" />
          ) : error || chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses in this range.</p>
          ) : (
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip content={<CategoryOverTimeTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {categories.map((cat, i) => (
                    <Bar
                      key={cat}
                      dataKey={cat}
                      stackId="expenses"
                      fill={getChartColor(i)}
                      radius={i === categories.length - 1 ? [4, 4, 0, 0] : undefined}
                      cursor="pointer"
                      onClick={(entry: any) => handleBarClick(cat, entry.month)}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
      <ExpenseTransactionDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}

========================================
FILE: frontend/modules/expenses/components/ExpenseAmountDistributionChart.tsx
========================================
// frontend/modules/expenses/components/ExpenseAmountDistributionChart.tsx

'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useExpenseAmountDistribution } from '../hooks/useExpenses';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';

interface ExpenseAmountDistributionChartProps {
  dateRange: ExpenseAnalyticsDateRange;
}

interface BucketDatum {
  min: number;
  max: number;
  count: number;
  label: string;
  totalValue: number;
}

function DistributionTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as BucketDatum;
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-0.5">
      <p className="text-sm font-medium">{row.label}</p>
      <p className="text-xs text-muted-foreground">
        Expenses: <span className="font-medium text-foreground">{row.count}</span>
      </p>
    </div>
  );
}

export function ExpenseAmountDistributionChart({ dateRange }: ExpenseAmountDistributionChartProps) {
  const { data, isLoading, error } = useExpenseAmountDistribution(dateRange);

  const chartData = useMemo<BucketDatum[]>(() => {
    return (data ?? []).map((bucket) => ({
      ...bucket,
      totalValue: bucket.count * ((bucket.min + bucket.max) / 2),
      label: `${formatCurrency(bucket.min)}\u2013${formatCurrency(bucket.max)}`,
    }));
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Expense amount distribution</CardTitle>
        <CardDescription>How many expenses fall in each cost range</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expenses in this range.</p>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={10} interval={0} angle={-30} textAnchor="end" height={60} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip content={<DistributionTooltip />} />
                <Bar dataKey="count" fill="var(--chart-5)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

========================================
FILE: frontend/modules/expenses/components/ExpenseCalendarHeatmapChart.tsx
========================================
// frontend/modules/expenses/components/ExpenseCalendarHeatmapChart.tsx

'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useDailyExpenseTotals } from '../hooks/useExpenses';
import { useExpenseDrawer } from '../hooks/useExpenseDrawer';
import { ExpenseTransactionDrawer } from './ExpenseTransactionDrawer';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';

interface ExpenseCalendarHeatmapChartProps {
  dateRange: ExpenseAnalyticsDateRange;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ExpenseCalendarHeatmapChart({ dateRange }: ExpenseCalendarHeatmapChartProps) {
  const { data, isLoading, error } = useDailyExpenseTotals(dateRange);
  const { open, setOpen, filter, openDrawer } = useExpenseDrawer();

  const { weeks, max, rangeStart, rangeEnd } = useMemo(() => {
    if (!data || data.length === 0) {
      return { weeks: [] as { date: string; amount: number; count: number }[][], max: 0, rangeStart: null as Date | null, rangeEnd: null as Date | null };
    }

    const byDate = new Map(data.map((d) => [d.date, d]));
    const sortedDates = data.map((d) => new Date(d.date)).sort((a, b) => a.getTime() - b.getTime());
    const start = new Date(sortedDates[0]);
    const end = new Date(sortedDates[sortedDates.length - 1]);

    // Align the grid to start on a Sunday for a clean weekly-column layout.
    const gridStart = new Date(start);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());

    const days: { date: string; amount: number; count: number }[] = [];
    const cursor = new Date(gridStart);
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10);
      const entry = byDate.get(key);
      days.push({ date: key, amount: entry?.amount ?? 0, count: entry?.count ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    const weekChunks: { date: string; amount: number; count: number }[][] = [];
    for (let i = 0; i < days.length; i += 7) weekChunks.push(days.slice(i, i + 7));

    const maxAmount = Math.max(...data.map((d) => d.amount), 0);
    return { weeks: weekChunks, max: maxAmount, rangeStart: start, rangeEnd: end };
  }, [data]);

  function intensity(amount: number): string {
    if (max === 0 || amount === 0) return 'transparent';
    const ratio = amount / max;
    return `color-mix(in srgb, var(--chart-1) ${Math.round(ratio * 90) + 10}%, transparent)`;
  }

  function handleDayClick(day: { date: string; amount: number; count: number }) {
    if (day.count === 0) return;
    const start = new Date(day.date);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
    openDrawer({ label: day.date, startDate: start, endDate: end });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Expense calendar heatmap</CardTitle>
          <CardDescription>
            {rangeStart && rangeEnd
              ? `Daily spending intensity, ${rangeStart.toLocaleDateString()} \u2013 ${rangeEnd.toLocaleDateString()}`
              : 'Daily spending intensity'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="rounded-lg h-40 skeleton" />
          ) : error || weeks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses in this range.</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="inline-flex gap-0.5">
                <div className="flex flex-col justify-around pr-1 text-[9px] text-muted-foreground">
                  {WEEKDAY_LABELS.map((d) => <div key={d} className="h-3.5">{d}</div>)}
                </div>
                {weeks.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-0.5">
                    {week.map((day) => (
                      <div
                        key={day.date}
                        title={`${day.date}: ${day.count > 0 ? `${formatCurrency(day.amount)} across ${day.count} expense${day.count === 1 ? '' : 's'}` : 'no expenses'}`}
                        onClick={() => handleDayClick(day)}
                        className={`h-3.5 w-3.5 rounded-sm border border-border/40 ${day.count > 0 ? 'cursor-pointer' : ''}`}
                        style={{ backgroundColor: intensity(day.amount) }}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Darker cells indicate higher daily spend. Click a day with activity for its transactions.</p>
            </div>
          )}
        </CardContent>
      </Card>
      <ExpenseTransactionDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}

========================================
FILE: frontend/modules/expenses/components/ExpenseHeatmapChart.tsx
========================================
// frontend/modules/expenses/components/ExpenseHeatmapChart.tsx

'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useExpenseCategoryOverTime } from '../hooks/useExpenses';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';

interface ExpenseHeatmapChartProps {
  dateRange: ExpenseAnalyticsDateRange;
}

export function ExpenseHeatmapChart({ dateRange }: ExpenseHeatmapChartProps) {
  const { data, isLoading, error } = useExpenseCategoryOverTime(dateRange);

  const { months, categories, cellMap, max } = useMemo(() => {
    const monthSet = new Set<string>();
    const categorySet = new Set<string>();
    const cells = new Map<string, { amount: number; count: number }>();
    let maxAmount = 0;

    for (const point of data ?? []) {
      monthSet.add(point.month);
      categorySet.add(point.category);
      cells.set(`${point.category}__${point.month}`, { amount: point.amount, count: point.count });
      if (point.amount > maxAmount) maxAmount = point.amount;
    }

    return {
      months: Array.from(monthSet).sort(),
      categories: Array.from(categorySet),
      cellMap: cells,
      max: maxAmount,
    };
  }, [data]);

  function intensity(amount: number): string {
    if (max === 0 || amount === 0) return 'transparent';
    const ratio = amount / max;
    return `color-mix(in srgb, var(--chart-2) ${Math.round(ratio * 90) + 10}%, transparent)`;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Expense heatmap</CardTitle>
        <CardDescription>Spending intensity by category and month</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || categories.length === 0 || months.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expenses in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="inline-grid gap-0.5" style={{ gridTemplateColumns: `110px repeat(${months.length}, 56px)` }}>
              <div />
              {months.map((m) => (
                <div key={m} className="text-[10px] text-center text-muted-foreground">{m}</div>
              ))}
              {categories.map((cat) => (
                <div key={cat} className="contents">
                  <div className="flex items-center pr-2 text-xs truncate text-muted-foreground" title={cat}>{cat}</div>
                  {months.map((m) => {
                    const cell = cellMap.get(`${cat}__${m}`);
                    return (
                      <div
                        key={m}
                        title={cell ? `${cat} \u2014 ${m}: ${formatCurrency(cell.amount)} (${cell.count} expenses)` : `${cat} \u2014 ${m}: no expenses`}
                        className="h-8 border rounded-sm border-border/40"
                        style={{ backgroundColor: intensity(cell?.amount ?? 0) }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

========================================
FILE: frontend/modules/expenses/components/ExpenseOutliersWidget.tsx
========================================
// frontend/modules/expenses/components/ExpenseOutliersWidget.tsx

'use client';

import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { useExpenseOutliers } from '../hooks/useExpenses';
import { useExpenseDrawer } from '../hooks/useExpenseDrawer';
import { ExpenseTransactionDrawer } from './ExpenseTransactionDrawer';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { formatDate } from '@/shared/utils/date.utils';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';
import type { ExpenseOutlierRow } from '@/shared/types/expense.types';

interface ExpenseOutliersWidgetProps {
  dateRange: ExpenseAnalyticsDateRange;
}

export function ExpenseOutliersWidget({ dateRange }: ExpenseOutliersWidgetProps) {
  const { data: outliers, isLoading, error } = useExpenseOutliers(dateRange, 2.5);
  const { open, setOpen, filter, openDrawer } = useExpenseDrawer();

  function handleClick(row: ExpenseOutlierRow) {
    const day = new Date(row.date);
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
    openDrawer({ label: `${row.license_plate} \u2014 ${formatDate(row.date)}`, license_plate: row.license_plate, startDate: start, endDate: end });
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Expense outliers</CardTitle></CardHeader>
        <CardContent><div className="h-24 rounded-lg skeleton" /></CardContent>
      </Card>
    );
  }

  if (error || !outliers || outliers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Expense outliers</CardTitle>
          <CardDescription>No unusual expenses detected in this range.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-warning/40 bg-warning-bg">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              <CardTitle>Expense outliers</CardTitle>
            </div>
            <Badge variant="outline" className="border-warning text-warning">{outliers.length} flagged</Badge>
          </div>
          <CardDescription>Expenses more than 2.5 standard deviations from their category&rsquo;s typical amount</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {outliers.slice(0, 6).map((row) => (
            <button
              key={row._id}
              type="button"
              onClick={() => handleClick(row)}
              className="flex items-center justify-between w-full p-2 text-left transition-colors rounded-lg surface-card hover:bg-muted/40"
            >
              <div>
                <p className="font-medium">{row.license_plate} &middot; {row.category}</p>
                <p className="text-sm text-muted-foreground">
                  Category typical: {formatCurrency(row.categoryMean)} &middot; {formatDate(row.date)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium text-warning">{formatCurrency(row.amount)}</p>
                <p className="text-sm text-muted-foreground">{row.zScore > 0 ? '+' : ''}{row.zScore}\u03C3</p>
              </div>
            </button>
          ))}
          {outliers.length > 6 && (
            <p className="text-sm text-center text-muted-foreground">+{outliers.length - 6} more flagged</p>
          )}
        </CardContent>
      </Card>
      <ExpenseTransactionDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}

========================================
FILE: frontend/modules/expenses/components/ExpenseParetoChart.tsx
========================================
// frontend/modules/expenses/components/ExpenseParetoChart.tsx

'use client';

import { useMemo } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useExpenseStats, useExpenseTypes } from '../hooks/useExpenses';
import { useExpenseDrawer } from '../hooks/useExpenseDrawer';
import { ExpenseTransactionDrawer } from './ExpenseTransactionDrawer';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';

interface ExpenseParetoChartProps {
  dateRange: ExpenseAnalyticsDateRange;
}

interface ParetoRow {
  category: string;
  spend: number;
  cumulativePercent: number;
}

function ParetoTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as ParetoRow;
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-0.5">
      <p className="text-sm font-medium">{row.category}</p>
      <p className="text-xs text-muted-foreground">
        Spend: <span className="font-medium text-foreground">{formatCurrency(row.spend)}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Cumulative: <span className="font-medium text-foreground">{row.cumulativePercent.toFixed(1)}%</span>
      </p>
      <p className="pt-1 text-caption text-muted-foreground">Click to view transactions</p>
    </div>
  );
}

export function ExpenseParetoChart({ dateRange }: ExpenseParetoChartProps) {
  const { data: stats, isLoading, error } = useExpenseStats(dateRange);
  const { data: expenseTypes } = useExpenseTypes();
  const { open, setOpen, filter, openDrawer } = useExpenseDrawer();

  const chartData = useMemo<ParetoRow[]>(() => {
    if (!stats) return [];
    const entries = Object.entries(stats.byType).sort(([, a], [, b]) => b - a);
    const total = entries.reduce((sum, [, v]) => sum + v, 0);
    let running = 0;
    return entries.map(([category, spend]) => {
      running += spend;
      return { category, spend, cumulativePercent: total > 0 ? (running / total) * 100 : 0 };
    });
  }, [stats]);

  function handleClick(row: ParetoRow) {
    const type = expenseTypes?.find((t) => t.name === row.category);
    openDrawer({ label: row.category, type: type?._id, startDate: dateRange.startDate, endDate: dateRange.endDate });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Pareto analysis</CardTitle>
          <CardDescription>Which categories drive the majority of cost (80/20 view) &mdash; click a bar for transactions</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="rounded-lg h-72 skeleton" />
          ) : error || chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses in this range.</p>
          ) : (
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <ComposedChart data={chartData} margin={{ left: -10, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="category" stroke="var(--muted-foreground)" fontSize={10} interval={0} angle={-30} textAnchor="end" height={60} />
                  <YAxis yAxisId="spend" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                  <YAxis yAxisId="cumulative" orientation="right" stroke="var(--muted-foreground)" fontSize={11} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip content={<ParetoTooltip />} />
                  <Bar
                    yAxisId="spend"
                    dataKey="spend"
                    fill="var(--chart-2)"
                    radius={[4, 4, 0, 0]}
                    cursor="pointer"
                    onClick={(entry: any) => handleClick(entry)}
                  />
                  <Line yAxisId="cumulative" type="monotone" dataKey="cumulativePercent" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
      <ExpenseTransactionDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}

========================================
FILE: frontend/modules/expenses/components/ExpenseWaterfallChart.tsx
========================================
// frontend/modules/expenses/components/ExpenseWaterfallChart.tsx

'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useExpenseCategorySummary, useExpenseTypes } from '../hooks/useExpenses';
import { useExpenseDrawer } from '../hooks/useExpenseDrawer';
import { ExpenseTransactionDrawer } from './ExpenseTransactionDrawer';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';

interface ExpenseWaterfallChartProps {
  dateRange: ExpenseAnalyticsDateRange;
}

interface WaterfallStep {
  name: string;
  /** Invisible spacer bar that pushes the visible segment to the right height. */
  base: number;
  /** The visible colored segment. */
  value: number;
  isTotal: boolean;
  category?: string;
}

function WaterfallTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload.find((p: any) => p.dataKey === 'value')?.payload as WaterfallStep | undefined;
  if (!row) return null;
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-0.5">
      <p className="text-sm font-medium">{row.name}</p>
      <p className="text-xs text-muted-foreground">
        {row.isTotal ? 'Grand total' : 'Contribution'}: <span className="font-medium text-foreground">{formatCurrency(row.value)}</span>
      </p>
      {!row.isTotal && <p className="pt-1 text-caption text-muted-foreground">Click to view transactions</p>}
    </div>
  );
}

export function ExpenseWaterfallChart({ dateRange }: ExpenseWaterfallChartProps) {
  const { data: summary, isLoading, error } = useExpenseCategorySummary(dateRange);
  const { data: expenseTypes } = useExpenseTypes();
  const { open, setOpen, filter, openDrawer } = useExpenseDrawer();

  const steps = useMemo<WaterfallStep[]>(() => {
    if (!summary || summary.length === 0) return [];
    const sorted = [...summary].sort((a, b) => b.total - a.total);
    let running = 0;
    const rows: WaterfallStep[] = sorted.map((s) => {
      const step: WaterfallStep = { name: s.category, base: running, value: s.total, isTotal: false, category: s.category };
      running += s.total;
      return step;
    });
    rows.push({ name: 'Grand total', base: 0, value: running, isTotal: true });
    return rows;
  }, [summary]);

  function handleClick(step: WaterfallStep) {
    if (step.isTotal) return;
    const type = expenseTypes?.find((t) => t.name === step.category);
    openDrawer({ label: step.name, type: type?._id, startDate: dateRange.startDate, endDate: dateRange.endDate });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Executive expense waterfall</CardTitle>
          <CardDescription>How total spend is composed, category by category</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="rounded-lg h-72 skeleton" />
          ) : error || steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses in this range.</p>
          ) : (
            <div style={{ width: '100%', height: 340 }}>
              <ResponsiveContainer>
                <BarChart data={steps} margin={{ left: -10, right: 12, top: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={10} interval={0} angle={-30} textAnchor="end" height={70} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip content={<WaterfallTooltip />} />
                  <Bar dataKey="base" stackId="waterfall" fill="transparent" isAnimationActive={false} />
                  <Bar dataKey="value" stackId="waterfall" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(entry: any) => handleClick(entry)}>
                    {steps.map((s) => (
                      <Cell key={s.name} fill={s.isTotal ? 'var(--foreground)' : 'var(--chart-1)'} />
                    ))}
                    <LabelList
                      dataKey="value"
                      position="top"
                      formatter={(v: number) => formatCurrency(v)}
                      style={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
      <ExpenseTransactionDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}

========================================
FILE: frontend/modules/expenses/components/RunningMonthlySpendChart.tsx
========================================
// frontend/modules/expenses/components/RunningMonthlySpendChart.tsx

'use client';

import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useExpenseMonthlyTrends } from '../hooks/useExpenses';
import { formatCurrency } from '@/shared/utils/currency.utils';

interface RunningRow {
  month: string;
  total: number;
  running: number;
}

function RunningTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as RunningRow;
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-0.5">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">
        This month: <span className="font-medium text-foreground">{formatCurrency(row.total)}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Running total: <span className="font-medium text-foreground">{formatCurrency(row.running)}</span>
      </p>
    </div>
  );
}

export function RunningMonthlySpendChart() {
  const { data, isLoading, error } = useExpenseMonthlyTrends(12);

  const chartData = useMemo<RunningRow[]>(() => {
    if (!data) return [];
    let running = 0;
    return data.map((d) => {
      running += d.total;
      return { month: d.month, total: d.total, running };
    });
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Running monthly spend</CardTitle>
        <CardDescription>Cumulative expenses over the last 12 months</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expenses in this range.</p>
        ) : (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <AreaChart data={chartData} margin={{ left: -20, right: 8 }}>
                <defs>
                  <linearGradient id="runningSpendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                <Tooltip content={<RunningTooltip />} />
                <Area type="monotone" dataKey="running" stroke="var(--chart-1)" strokeWidth={2} fill="url(#runningSpendFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

========================================
FILE: frontend/modules/expenses/components/TopExpenseTransactionsChart.tsx
========================================
// frontend/modules/expenses/components/TopExpenseTransactionsChart.tsx

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/shared/ui/data-display/table';
import { useTopExpenseTransactions } from '../hooks/useExpenses';
import { useExpenseDrawer } from '../hooks/useExpenseDrawer';
import { ExpenseTransactionDrawer } from './ExpenseTransactionDrawer';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { formatDate } from '@/shared/utils/date.utils';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';
import type { TopExpenseTransactionRow } from '@/shared/types/expense.types';

interface TopExpenseTransactionsChartProps {
  dateRange: ExpenseAnalyticsDateRange;
}

export function TopExpenseTransactionsChart({ dateRange }: TopExpenseTransactionsChartProps) {
  const { data, isLoading, error } = useTopExpenseTransactions(dateRange, 10);
  const { open, setOpen, filter, openDrawer } = useExpenseDrawer();

  function handleRowClick(row: TopExpenseTransactionRow) {
    const day = new Date(row.date);
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
    openDrawer({ label: `${row.license_plate} \u2014 ${formatDate(row.date)}`, license_plate: row.license_plate, startDate: start, endDate: end });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Top 10 highest expense transactions</CardTitle>
          <CardDescription>The single biggest individual expenses in this range</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="rounded-lg h-60 skeleton" />
          ) : error || !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses in this range.</p>
          ) : (
            <div className="overflow-x-auto border rounded-md border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((row) => (
                    <TableRow key={row._id} className="cursor-pointer hover:bg-muted/40" onClick={() => handleRowClick(row)}>
                      <TableCell>{formatDate(row.date)}</TableCell>
                      <TableCell className="font-medium">{row.license_plate}</TableCell>
                      <TableCell><Badge variant="outline">{row.category}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(row.amount)}</TableCell>
                      <TableCell className="max-w-55 truncate" title={row.description ?? undefined}>
                        {row.description || '\u2014'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <ExpenseTransactionDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}

========================================
FILE: frontend/modules/expenses/components/TopVehiclesByExpenseChart.tsx
========================================
// frontend/modules/expenses/components/TopVehiclesByExpenseChart.tsx

'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useTopVehiclesByExpense } from '../hooks/useExpenses';
import { useExpenseDrawer } from '../hooks/useExpenseDrawer';
import { ExpenseTransactionDrawer } from './ExpenseTransactionDrawer';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { formatDate } from '@/shared/utils/date.utils';
import { getChartColor } from '@/shared/utils/chart.utils';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';
import type { TopVehicleExpenseRow } from '@/shared/types/expense.types';

interface TopVehiclesByExpenseChartProps {
  dateRange: ExpenseAnalyticsDateRange;
}

function TopVehiclesTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as TopVehicleExpenseRow;
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-3 space-y-0.5 max-w-64">
      <p className="text-sm font-medium">{row.license_plate}</p>
      <p className="text-xs text-muted-foreground">
        Total: <span className="font-medium text-foreground">{formatCurrency(row.totalAmount)}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        {row.expenseCount} expenses &middot; avg {formatCurrency(row.average)}
      </p>
      <p className="text-xs text-muted-foreground">
        Range: {formatCurrency(row.min)} \u2013 {formatCurrency(row.max)}
      </p>
      <p className="text-xs text-muted-foreground">Top category: {row.topCategory}</p>
      {row.latestDate && <p className="text-xs text-muted-foreground">Latest: {formatDate(row.latestDate)}</p>}
      {row.momChangePercent !== null && (
        <p className="text-xs text-muted-foreground">
          vs. prior period: <span className={row.momChangePercent >= 0 ? 'text-danger' : 'text-success'}>
            {row.momChangePercent >= 0 ? '+' : ''}{row.momChangePercent}%
          </span>
        </p>
      )}
      <p className="pt-1 text-caption text-muted-foreground">Click to view transactions</p>
    </div>
  );
}

export function TopVehiclesByExpenseChart({ dateRange }: TopVehiclesByExpenseChartProps) {
  const { data, isLoading, error } = useTopVehiclesByExpense(dateRange, 10);
  const { open, setOpen, filter, openDrawer } = useExpenseDrawer();

  function handleClick(row: TopVehicleExpenseRow) {
    openDrawer({
      label: row.license_plate,
      license_plate: row.license_plate,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Top vehicles by expense</CardTitle>
          <CardDescription>Highest-cost vehicles &mdash; click a bar for transactions</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="rounded-lg h-60 skeleton" />
          ) : error || !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses in this range.</p>
          ) : (
            <div style={{ width: '100%', height: Math.max(260, data.length * 36) }}>
              <ResponsiveContainer>
                <BarChart data={data} layout="vertical" margin={{ left: 12, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                  <YAxis type="category" dataKey="license_plate" stroke="var(--muted-foreground)" fontSize={11} width={90} />
                  <Tooltip content={<TopVehiclesTooltip />} />
                  <Bar dataKey="totalAmount" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(entry: any) => handleClick(entry)}>
                    {data.map((row, i) => (
                      <Cell key={row.license_plate} fill={getChartColor(i)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
      <ExpenseTransactionDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}

========================================
FILE: frontend/modules/expenses/components/VehicleAverageCostChart.tsx
========================================
// frontend/modules/expenses/components/VehicleAverageCostChart.tsx

'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useTopVehiclesByExpense } from '../hooks/useExpenses';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';
import type { TopVehicleExpenseRow } from '@/shared/types/expense.types';

interface VehicleAverageCostChartProps {
  dateRange: ExpenseAnalyticsDateRange;
}

function AverageCostTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as TopVehicleExpenseRow;
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-0.5">
      <p className="text-sm font-medium">{row.license_plate}</p>
      <p className="text-xs text-muted-foreground">
        Average per expense: <span className="font-medium text-foreground">{formatCurrency(row.average)}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Based on {row.expenseCount} expense{row.expenseCount === 1 ? '' : 's'}
      </p>
    </div>
  );
}

export function VehicleAverageCostChart({ dateRange }: VehicleAverageCostChartProps) {
  const { data, isLoading, error } = useTopVehiclesByExpense(dateRange, 10);
  const sorted = [...(data ?? [])].sort((a, b) => b.average - a.average);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Average expense per vehicle</CardTitle>
        <CardDescription>Typical cost per transaction, per vehicle -- flags vehicles with high per-visit cost</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expenses in this range.</p>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={sorted} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="license_plate" stroke="var(--muted-foreground)" fontSize={11} interval={0} angle={-35} textAnchor="end" height={60} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                <Tooltip content={<AverageCostTooltip />} />
                <Bar dataKey="average" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

========================================
FILE: frontend/modules/expenses/components/VehicleExpenseBreakdownChart.tsx
========================================
// frontend/modules/expenses/components/VehicleExpenseBreakdownChart.tsx

'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useVehicleExpenseBreakdown, useExpenseTypes } from '../hooks/useExpenses';
import { useExpenseDrawer } from '../hooks/useExpenseDrawer';
import { ExpenseTransactionDrawer } from './ExpenseTransactionDrawer';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { getChartColor } from '@/shared/utils/chart.utils';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';

interface VehicleExpenseBreakdownChartProps {
  dateRange: ExpenseAnalyticsDateRange;
}

function VehicleBreakdownTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const total = payload.reduce((sum: number, p: any) => sum + (p.value || 0), 0);
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-1">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">
        Total: <span className="font-medium text-foreground">{formatCurrency(total)}</span>
      </p>
      {payload
        .filter((p: any) => p.value > 0)
        .sort((a: any, b: any) => b.value - a.value)
        .map((p: any) => (
          <p key={p.dataKey} className="text-xs text-muted-foreground">
            {p.name}: <span className="font-medium text-foreground">{formatCurrency(p.value)}</span>
          </p>
        ))}
    </div>
  );
}

export function VehicleExpenseBreakdownChart({ dateRange }: VehicleExpenseBreakdownChartProps) {
  const { data, isLoading, error } = useVehicleExpenseBreakdown(dateRange, 8);
  const { data: expenseTypes } = useExpenseTypes();
  const { open, setOpen, filter, openDrawer } = useExpenseDrawer();

  const { chartData, categories } = useMemo(() => {
    if (!data || data.length === 0) return { chartData: [], categories: [] as string[] };
    const categorySet = new Set<string>();
    const byVehicle = new Map<string, Record<string, number>>();
    for (const row of data) {
      categorySet.add(row.category);
      if (!byVehicle.has(row.license_plate)) byVehicle.set(row.license_plate, {});
      byVehicle.get(row.license_plate)![row.category] = row.amount;
    }
    const cats = Array.from(categorySet);
    const rows = Array.from(byVehicle.entries())
      .map(([plate, values]) => ({
        license_plate: plate,
        ...values,
        __total: Object.values(values).reduce((s, v) => s + v, 0),
      }))
      .sort((a, b) => b.__total - a.__total);
    return { chartData: rows, categories: cats };
  }, [data]);

  function handleClick(plate: string, category: string) {
    const type = expenseTypes?.find((t) => t.name === category);
    openDrawer({
      label: `${plate} \u2014 ${category}`,
      license_plate: plate,
      type: type?._id,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Vehicle expense breakdown</CardTitle>
          <CardDescription>Category spend, per vehicle &mdash; click a segment for transactions</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="rounded-lg h-72 skeleton" />
          ) : error || chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses in this range.</p>
          ) : (
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="license_plate" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip content={<VehicleBreakdownTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {categories.map((cat, i) => (
                    <Bar
                      key={cat}
                      dataKey={cat}
                      stackId="vehicle-expenses"
                      fill={getChartColor(i)}
                      cursor="pointer"
                      onClick={(entry: any) => handleClick(entry.license_plate, cat)}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
      <ExpenseTransactionDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}

========================================
FILE: frontend/modules/expenses/components/JobTripExpenseChart.tsx
========================================
// frontend/modules/expenses/components/JobTripExpenseChart.tsx

'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useJobTripExpense, useExpenseTypes } from '../hooks/useExpenses';
import { useExpenseDrawer } from '../hooks/useExpenseDrawer';
import { ExpenseTransactionDrawer } from './ExpenseTransactionDrawer';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { getChartColor } from '@/shared/utils/chart.utils';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';

interface JobTripExpenseChartProps {
  dateRange: ExpenseAnalyticsDateRange;
}

function JobTripTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const total = payload.reduce((sum: number, p: any) => sum + (p.value || 0), 0);
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-1">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">
        Total: <span className="font-medium text-foreground">{formatCurrency(total)}</span>
      </p>
      {payload
        .filter((p: any) => p.value > 0)
        .sort((a: any, b: any) => b.value - a.value)
        .map((p: any) => (
          <p key={p.dataKey} className="text-xs text-muted-foreground">
            {p.name}: <span className="font-medium text-foreground">{formatCurrency(p.value)}</span>
          </p>
        ))}
    </div>
  );
}

export function JobTripExpenseChart({ dateRange }: JobTripExpenseChartProps) {
  const { data, isLoading, error } = useJobTripExpense(dateRange, 10);
  const { data: expenseTypes } = useExpenseTypes();
  const { open, setOpen, filter, openDrawer } = useExpenseDrawer();

  const { chartData, categories } = useMemo(() => {
    if (!data || data.length === 0) return { chartData: [], categories: [] as string[] };
    const categorySet = new Set<string>();
    const byJob = new Map<string, Record<string, number>>();
    for (const row of data) {
      categorySet.add(row.category);
      if (!byJob.has(row.jobTrip)) byJob.set(row.jobTrip, {});
      byJob.get(row.jobTrip)![row.category] = row.amount;
    }
    const cats = Array.from(categorySet);
    const rows = Array.from(byJob.entries()).map(([jobTrip, values]) => ({ jobTrip, ...values }));
    return { chartData: rows, categories: cats };
  }, [data]);

  function handleClick(jobTrip: string, category: string) {
    const type = expenseTypes?.find((t) => t.name === category);
    openDrawer({
      label: `${jobTrip} \u2014 ${category}`,
      jobTrip,
      type: type?._id,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    } as any);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Job / Trip expense analysis</CardTitle>
          <CardDescription>Category spend, per job or trip reference &mdash; click a segment for transactions</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="rounded-lg h-72 skeleton" />
          ) : error || chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No job/trip-tagged expenses in this range.</p>
          ) : (
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} layout="vertical" margin={{ left: 12, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                  <YAxis type="category" dataKey="jobTrip" stroke="var(--muted-foreground)" fontSize={11} width={110} />
                  <Tooltip content={<JobTripTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {categories.map((cat, i) => (
                    <Bar
                      key={cat}
                      dataKey={cat}
                      stackId="job-trip"
                      fill={getChartColor(i)}
                      cursor="pointer"
                      onClick={(entry: any) => handleClick(entry.jobTrip, cat)}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
      <ExpenseTransactionDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}

========================================
FILE: frontend/modules/expenses/hooks/useExpenseDrawer.ts
========================================
// frontend/modules/expenses/hooks/useExpenseDrawer.ts

import { useState, useCallback } from 'react';
import type { ExpenseDrawerFilter } from '../components/ExpenseTransactionDrawer';

export function useExpenseDrawer() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<ExpenseDrawerFilter | null>(null);

  const openDrawer = useCallback((f: ExpenseDrawerFilter) => {
    setFilter(f);
    setOpen(true);
  }, []);

  return { open, setOpen, filter, openDrawer };
}

========================================
FILE: frontend/modules/expenses/hooks/useExpenses.ts
========================================
// frontend/modules/expenses/hooks/useExpenses.ts

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { expensesApi, type ExpenseListParams } from '../services/expenses.api';
import type { Expense } from '../types';

type DateRange = { startDate?: Date; endDate?: Date } | undefined;

function rangeKey(dateRange: DateRange): string | undefined {
  return dateRange
    ? `${dateRange.startDate?.toISOString() ?? ''}-${dateRange.endDate?.toISOString() ?? ''}`
    : undefined;
}

export const expenseKeys = {
  all: ['expenses'] as const,
  lists: () => [...expenseKeys.all, 'list'] as const,
  list: (params: Partial<ExpenseListParams>) => [...expenseKeys.lists(), params] as const,
  details: () => [...expenseKeys.all, 'detail'] as const,
  detail: (id: string) => [...expenseKeys.details(), id] as const,
  stats: (range?: string) => [...expenseKeys.all, 'stats', range] as const,
  monthly: (months: number) => [...expenseKeys.all, 'monthly', months] as const,
  types: () => [...expenseKeys.all, 'types'] as const,
  categoryOverTime: (range?: string) => [...expenseKeys.all, 'category-over-time', range] as const,
  topVehicles: (range?: string, limit?: number) => [...expenseKeys.all, 'top-vehicles', range, limit] as const,
  vehicleBreakdown: (range?: string, limit?: number) => [...expenseKeys.all, 'vehicle-breakdown', range, limit] as const,
  amountDistribution: (range?: string) => [...expenseKeys.all, 'amount-distribution', range] as const,
  jobTrip: (range?: string, limit?: number) => [...expenseKeys.all, 'job-trip', range, limit] as const,
  categorySummary: (range?: string) => [...expenseKeys.all, 'category-summary', range] as const,
  topTransactions: (range?: string, limit?: number) => [...expenseKeys.all, 'top-transactions', range, limit] as const,
  dailyTotals: (range?: string) => [...expenseKeys.all, 'daily-totals', range] as const,
  outliers: (range?: string, z?: number) => [...expenseKeys.all, 'outliers', range, z] as const,
};

export function useExpensesList(params: Partial<ExpenseListParams>) {
  return useQuery({
    queryKey: expenseKeys.list(params),
    queryFn: () => expensesApi.list(params),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

export function useExpense(id: string | undefined, options?: Partial<UseQueryOptions<Expense>>) {
  return useQuery({
    queryKey: expenseKeys.detail(id ?? ''),
    queryFn: () => expensesApi.getById(id as string),
    enabled: Boolean(id),
    staleTime: 30_000,
    ...options,
  });
}

export function useExpenseStats(dateRange?: { startDate?: Date; endDate?: Date }) {
  const hasCompleteRange = Boolean(dateRange?.startDate && dateRange?.endDate);
  const effectiveRange = hasCompleteRange ? dateRange : undefined;
  const key = effectiveRange
    ? `${effectiveRange.startDate!.toISOString()}-${effectiveRange.endDate!.toISOString()}`
    : undefined;

  return useQuery({
    queryKey: expenseKeys.stats(key),
    queryFn: () => expensesApi.getStats(effectiveRange),
    staleTime: 60_000,
  });
}

export function useExpenseMonthlyTrends(months: number = 12) {
  return useQuery({
    queryKey: expenseKeys.monthly(months),
    queryFn: () => expensesApi.getMonthlyTrends(months),
    staleTime: 60_000,
  });
}

export function useExpenseTypes(grouped: boolean = false) {
  return useQuery({
    queryKey: [...expenseKeys.types(), grouped],
    queryFn: () => expensesApi.getExpenseTypes(grouped),
    staleTime: 5 * 60_000,
  });
}

export function useVehicleExpenseHistory(licensePlate: string | undefined, page = 1, limit = 20) {
  return useQuery({
    queryKey: expenseKeys.list({ license_plate: licensePlate, page, limit }),
    queryFn: () => expensesApi.list({ license_plate: licensePlate, page, limit }),
    enabled: Boolean(licensePlate),
    staleTime: 30_000,
  });
}

export function useExpenseCategoryOverTime(dateRange?: DateRange) {
  return useQuery({
    queryKey: expenseKeys.categoryOverTime(rangeKey(dateRange)),
    queryFn: () => expensesApi.getCategoryOverTime(dateRange),
    staleTime: 60_000,
  });
}

export function useTopVehiclesByExpense(dateRange?: DateRange, limit: number = 10) {
  return useQuery({
    queryKey: expenseKeys.topVehicles(rangeKey(dateRange), limit),
    queryFn: () => expensesApi.getTopVehicles(dateRange, limit),
    staleTime: 60_000,
  });
}

export function useVehicleExpenseBreakdown(dateRange?: DateRange, vehicleLimit: number = 8) {
  return useQuery({
    queryKey: expenseKeys.vehicleBreakdown(rangeKey(dateRange), vehicleLimit),
    queryFn: () => expensesApi.getVehicleBreakdown(dateRange, vehicleLimit),
    staleTime: 60_000,
  });
}

export function useExpenseAmountDistribution(dateRange?: DateRange) {
  return useQuery({
    queryKey: expenseKeys.amountDistribution(rangeKey(dateRange)),
    queryFn: () => expensesApi.getAmountDistribution(dateRange),
    staleTime: 60_000,
  });
}

export function useJobTripExpense(dateRange?: DateRange, jobLimit: number = 10) {
  return useQuery({
    queryKey: expenseKeys.jobTrip(rangeKey(dateRange), jobLimit),
    queryFn: () => expensesApi.getJobTripExpense(dateRange, jobLimit),
    staleTime: 60_000,
  });
}

/** Rich per-category stats -- feeds hover tooltips with zero extra network calls per hover. */
export function useExpenseCategorySummary(dateRange?: DateRange) {
  return useQuery({
    queryKey: expenseKeys.categorySummary(rangeKey(dateRange)),
    queryFn: () => expensesApi.getCategorySummary(dateRange),
    staleTime: 60_000,
  });
}

export function useTopExpenseTransactions(dateRange?: DateRange, limit: number = 10) {
  return useQuery({
    queryKey: expenseKeys.topTransactions(rangeKey(dateRange), limit),
    queryFn: () => expensesApi.getTopTransactions(dateRange, limit),
    staleTime: 60_000,
  });
}

export function useDailyExpenseTotals(dateRange?: DateRange) {
  return useQuery({
    queryKey: expenseKeys.dailyTotals(rangeKey(dateRange)),
    queryFn: () => expensesApi.getDailyTotals(dateRange),
    staleTime: 60_000,
  });
}

export function useExpenseOutliers(dateRange?: DateRange, zThreshold: number = 2.5) {
  return useQuery({
    queryKey: expenseKeys.outliers(rangeKey(dateRange), zThreshold),
    queryFn: () => expensesApi.getOutliers(dateRange, zThreshold),
    staleTime: 60_000,
  });
}

========================================
FILE: frontend/modules/expenses/hooks/useExpenseMutations.ts
========================================

// frontend/modules/expenses/hooks/useExpenseMutations.ts

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { expensesApi } from '../services/expenses.api';
import { expenseKeys } from './useExpenses';
import type { ExpenseFormOutput } from '../schemas';

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ExpenseFormOutput) => expensesApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.all });
      toast.success('Expense recorded');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to record expense')),
  });
}

export function useUpdateExpense(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<ExpenseFormOutput>) => expensesApi.update(id, payload),
    onSuccess: (expense) => {
      queryClient.setQueryData(expenseKeys.detail(id), expense);
      queryClient.invalidateQueries({ queryKey: expenseKeys.lists() });
      queryClient.invalidateQueries({ queryKey: expenseKeys.all });
      toast.success('Expense updated');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to update expense')),
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, soft = true }: { id: string; soft?: boolean }) => expensesApi.remove(id, soft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.all });
      toast.success('Expense deleted');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to delete expense')),
  });
}

export function useBulkDeleteExpenses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => expensesApi.remove(id, true)));
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.all });
      toast.success(`${ids.length} expense${ids.length === 1 ? '' : 's'} deleted`);
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to delete selected expenses')),
  });
}

export function useBulkImportExpenses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (records: Array<Record<string, unknown>>) => expensesApi.bulkImport(records),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.all });
      toast.success(result.message);
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to import expenses')),
  });
}

export function useCreateExpenseType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; category: string; description?: string }) =>
      expensesApi.createExpenseType(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.types() });
      toast.success('Expense category created');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to create expense category')),
  });
}

========================================
FILE: frontend/modules/expenses/pages/ExpenseAnalyticsPage.tsx
========================================
// frontend/modules/expenses/pages/ExpenseAnalyticsPage.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileSpreadsheet, Printer } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { downloadXlsxTemplate } from '@/shared/utils/excel-parser.utils';
import {
  ExpenseAnalyticsFilterBar,
  type ExpenseAnalyticsDateRange,
  ExpenseWaterfallChart,
  RunningMonthlySpendChart,
  ExpenseCategoryOverTimeChart,
  ExpenseTopCategoriesChart,
  TopVehiclesByExpenseChart,
  VehicleExpenseBreakdownChart,
  VehicleAverageCostChart,
  ExpenseOutliersWidget,
  TopExpenseTransactionsChart,
  ExpenseAmountDistributionChart,
  ExpenseParetoChart,
  ExpenseCalendarHeatmapChart,
  ExpenseHeatmapChart,
  JobTripExpenseChart,
} from '../components';
import {
  useExpenseCategorySummary,
  useTopVehiclesByExpense,
  useTopExpenseTransactions,
  useExpenseMonthlyTrends,
} from '../hooks/useExpenses';
import { formatDate } from '@/shared/utils/date.utils';
import { EXPENSE_ROUTES } from '../routes';

export function ExpenseAnalyticsPage() {
  const router = useRouter();
  const [dateRange, setDateRange] = useState<ExpenseAnalyticsDateRange>({});

  // Reuses the same cached queries the charts below already populate --
  // this does not add extra network calls.
  const { data: categorySummary } = useExpenseCategorySummary(dateRange);
  const { data: topVehicles } = useTopVehiclesByExpense(dateRange, 10);
  const { data: topTransactions } = useTopExpenseTransactions(dateRange, 10);
  const { data: monthlyTrends } = useExpenseMonthlyTrends(12);

  function handleExportReport() {
    const wb: Array<{ sheet: string; headers: string[]; rows: Array<Record<string, unknown>> }> = [];

    wb.push({
      sheet: 'Monthly Trend',
      headers: ['Month', 'Total'],
      rows: (monthlyTrends ?? []).map((m) => ({ Month: m.month, Total: m.total })),
    });
    wb.push({
      sheet: 'Category Summary',
      headers: ['Category', 'Total', 'Count', 'Average', 'Min', 'Max', 'Top Vehicle', '% of Total', 'Latest Date'],
      rows: (categorySummary ?? []).map((c) => ({
        Category: c.category,
        Total: c.total,
        Count: c.count,
        Average: c.average,
        Min: c.min,
        Max: c.max,
        'Top Vehicle': c.topVehicle ?? '',
        '% of Total': c.percentageOfTotal,
        'Latest Date': c.latestDate ? formatDate(c.latestDate, 'yyyy-MM-dd') : '',
      })),
    });
    wb.push({
      sheet: 'Top Vehicles',
      headers: ['Vehicle', 'Total', 'Count', 'Average', 'Top Category'],
      rows: (topVehicles ?? []).map((v) => ({
        Vehicle: v.license_plate,
        Total: v.totalAmount,
        Count: v.expenseCount,
        Average: v.average,
        'Top Category': v.topCategory,
      })),
    });
    wb.push({
      sheet: 'Top Transactions',
      headers: ['Date', 'Vehicle', 'Category', 'Amount', 'Description'],
      rows: (topTransactions ?? []).map((t) => ({
        Date: formatDate(t.date, 'yyyy-MM-dd'),
        Vehicle: t.license_plate,
        Category: t.category,
        Amount: t.amount,
        Description: t.description ?? '',
      })),
    });

    // downloadXlsxTemplate writes one sheet per call; build a single
    // workbook with multiple sheets by writing the first one via the
    // shared helper's underlying SheetJS calls would require exposing
    // book_append_sheet -- simplest reuse here is one file per sheet
    // group is unnecessary; call per-sheet exports instead so nothing
    // new needs to be added to excel-parser.utils.ts.
    wb.forEach((s) => downloadXlsxTemplate(s.headers, s.rows, `expense-report-${s.sheet.toLowerCase().replace(/\s+/g, '-')}.xlsx`, s.sheet));
  }

  return (
    <div className="space-y-6 print:space-y-4">
      <PageHeader
        title="Expense analytics"
        description="Executive expense insights -- cost composition, drivers, and anomalies."
        breadcrumbs={[{ label: 'Expenses', href: EXPENSE_ROUTES.dashboard }, { label: 'Analytics' }]}
        actions={
          <div className="flex items-center gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={handleExportReport}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> Export report (Excel)
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" /> Print / PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push(EXPENSE_ROUTES.dashboard)}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back to expenses
            </Button>
          </div>
        }
      />

      <div className="print:hidden">
        <ExpenseAnalyticsFilterBar value={dateRange} onChange={setDateRange} />
      </div>

      {/* Executive summary: how total spend is composed, and its trajectory */}
      <ExpenseWaterfallChart dateRange={dateRange} />
      <RunningMonthlySpendChart />

      {/* Category and vehicle drivers */}
      <ExpenseCategoryOverTimeChart dateRange={dateRange} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ExpenseTopCategoriesChart dateRange={dateRange} />
        <TopVehiclesByExpenseChart dateRange={dateRange} />
      </div>
      <VehicleExpenseBreakdownChart dateRange={dateRange} />
      <VehicleAverageCostChart dateRange={dateRange} />

      {/* Needs-attention: outliers and the biggest single transactions */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ExpenseOutliersWidget dateRange={dateRange} />
        <TopExpenseTransactionsChart dateRange={dateRange} />
      </div>

      {/* Patterns: distribution, concentration, timing */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ExpenseAmountDistributionChart dateRange={dateRange} />
        <ExpenseParetoChart dateRange={dateRange} />
      </div>
      <ExpenseCalendarHeatmapChart dateRange={dateRange} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ExpenseHeatmapChart dateRange={dateRange} />
        <JobTripExpenseChart dateRange={dateRange} />
      </div>
    </div>
  );
}

========================================
FILE: frontend/modules/expenses/services/expenses.api.ts
========================================
// frontend/modules/expenses/services/expenses.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import type { PaginatedResponse } from '@/shared/types/common.types';
import type { ExportFormat } from '@/shared/export/export.types';
import type { ExportBlobResponse } from '@/shared/utils/export-download.utils';
import type { Expense, ExpenseType, ExpenseTableFilters, ExpenseStats } from '../types';
import type { ExpenseFormOutput } from '../schemas';
import type {
  ExpenseCategoryOverTimePoint,
  TopVehicleExpenseRow,
  VehicleExpenseBreakdownRow,
  ExpenseAmountDistributionBucket,
  JobTripExpenseRow,
  CategorySummary,
  TopExpenseTransactionRow,
  DailyExpenseTotal,
  ExpenseOutlierRow,
} from '@/shared/types/expense.types';
import type { ImportResponse } from '@/frontend/shared/import/ImportModal';

const BASE = '/api/expenses';

export interface ExpenseListParams extends ExpenseTableFilters {
  page?: number;
  limit?: number;
}

export interface BulkImportResult {
  message: string;
  results: { inserted: number; errors: number; errorDetails: string[] };
}

type DateRange = { startDate?: Date; endDate?: Date } | undefined;

function toIso(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function buildListQuery(params: Partial<ExpenseListParams>) {
  return {
    license_plate: params.license_plate,
    type: params.type,
    jobTrip: (params as any).jobTrip,
    start: toIso(params.startDate),
    end: toIso(params.endDate),
    minAmount: params.minAmount,
    maxAmount: params.maxAmount,
    page: params.page,
    limit: params.limit,
  };
}

function rangeParams(dateRange?: DateRange) {
  return {
    startDate: dateRange?.startDate ? dateRange.startDate.toISOString() : undefined,
    endDate: dateRange?.endDate ? dateRange.endDate.toISOString() : undefined,
  };
}

export const expensesApi = {
  async list(params: Partial<ExpenseListParams> = {}): Promise<PaginatedResponse<Expense>> {
    return apiClient.get<PaginatedResponse<Expense>>(BASE, { params: buildListQuery(params) });
  },

  async getById(id: string): Promise<Expense> {
    return apiClient.get<Expense>(BASE, { params: { id } });
  },

  async getStats(dateRange?: DateRange): Promise<ExpenseStats> {
    const params: Record<string, string | undefined> = { action: 'stats' };
    if (dateRange?.startDate) params.startDate = dateRange.startDate.toISOString();
    if (dateRange?.endDate) params.endDate = dateRange.endDate.toISOString();
    return apiClient.get<ExpenseStats>(BASE, { params });
  },

  async getMonthlyTrends(months: number = 12): Promise<Array<{ month: string; total: number }>> {
    return apiClient.get<Array<{ month: string; total: number }>>(BASE, { params: { action: 'monthly', months } });
  },

  async getCategoryOverTime(dateRange?: DateRange): Promise<ExpenseCategoryOverTimePoint[]> {
    return apiClient.get<ExpenseCategoryOverTimePoint[]>(BASE, {
      params: { action: 'category-over-time', ...rangeParams(dateRange) },
    });
  },

  async getTopVehicles(dateRange?: DateRange, limit: number = 10): Promise<TopVehicleExpenseRow[]> {
    return apiClient.get<TopVehicleExpenseRow[]>(BASE, {
      params: { action: 'top-vehicles', limit, ...rangeParams(dateRange) },
    });
  },

  async getVehicleBreakdown(dateRange?: DateRange, vehicleLimit: number = 8): Promise<VehicleExpenseBreakdownRow[]> {
    return apiClient.get<VehicleExpenseBreakdownRow[]>(BASE, {
      params: { action: 'vehicle-breakdown', vehicleLimit, ...rangeParams(dateRange) },
    });
  },

  async getAmountDistribution(dateRange?: DateRange): Promise<ExpenseAmountDistributionBucket[]> {
    return apiClient.get<ExpenseAmountDistributionBucket[]>(BASE, {
      params: { action: 'amount-distribution', ...rangeParams(dateRange) },
    });
  },

  async getJobTripExpense(dateRange?: DateRange, jobLimit: number = 10): Promise<JobTripExpenseRow[]> {
    return apiClient.get<JobTripExpenseRow[]>(BASE, {
      params: { action: 'job-trip', jobLimit, ...rangeParams(dateRange) },
    });
  },

  async getCategorySummary(dateRange?: DateRange): Promise<CategorySummary[]> {
    return apiClient.get<CategorySummary[]>(BASE, {
      params: { action: 'category-summary', ...rangeParams(dateRange) },
    });
  },

  async getTopTransactions(dateRange?: DateRange, limit: number = 10): Promise<TopExpenseTransactionRow[]> {
    return apiClient.get<TopExpenseTransactionRow[]>(BASE, {
      params: { action: 'top-transactions', limit, ...rangeParams(dateRange) },
    });
  },

  async getDailyTotals(dateRange?: DateRange): Promise<DailyExpenseTotal[]> {
    return apiClient.get<DailyExpenseTotal[]>(BASE, {
      params: { action: 'daily-totals', ...rangeParams(dateRange) },
    });
  },

  async getOutliers(dateRange?: DateRange, zThreshold: number = 2.5, limit: number = 25): Promise<ExpenseOutlierRow[]> {
    return apiClient.get<ExpenseOutlierRow[]>(BASE, {
      params: { action: 'outliers', zThreshold, limit, ...rangeParams(dateRange) },
    });
  },

  async create(payload: ExpenseFormOutput): Promise<Expense> {
    return apiClient.post<Expense>(BASE, payload);
  },

  async update(id: string, payload: Partial<ExpenseFormOutput>): Promise<Expense> {
    return apiClient.put<Expense>(BASE, payload, { params: { id } });
  },

  async remove(id: string, soft: boolean = true): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(BASE, { params: { id, soft } });
  },

  /**
   * Enterprise Export Framework (Phase 2). Expense export lives behind
   * ?action=export on the shared /api/expenses route. Sends the same
   * filter fields as list() (including the jobTrip filter, which isn't
   * part of ExpenseTableFilters but is read straight through by both
   * the list and export controllers) so the backend re-queries the full
   * authorized, filtered result set (capped at EXPORT_ROW_CAP).
   */
  async exportFile(
    filters: Partial<ExpenseTableFilters> & { jobTrip?: string },
    format: ExportFormat = 'csv'
  ): Promise<ExportBlobResponse> {
    return apiClient.getBlob(BASE, {
      params: {
        action: 'export',
        license_plate: filters.license_plate,
        type: filters.type,
        jobTrip: filters.jobTrip,
        start: toIso(filters.startDate),
        end: toIso(filters.endDate),
        minAmount: filters.minAmount,
        maxAmount: filters.maxAmount,
        format,
      },
    });
  },

  async bulkImport(records: Array<Record<string, unknown>>): Promise<BulkImportResult> {
    return apiClient.post<BulkImportResult>(`${BASE}/bulk`, { records });
  },

  async importStandard(rows: Array<Record<string, unknown>>): Promise<ImportResponse> {
    return apiClient.post<ImportResponse>(`${BASE}/import`, { rows });
  },

  async getExpenseTypes(grouped: boolean = false): Promise<ExpenseType[]> {
    return apiClient.get<ExpenseType[]>('/api/expense-types', { params: { grouped } });
  },

  async createExpenseType(data: { name: string; category: string; description?: string }): Promise<ExpenseType> {
    return apiClient.post<ExpenseType>('/api/expense-types', data);
  },
};

export default expensesApi;

========================================
FILE: frontend/modules/expenses/types/index.ts
========================================

// frontend/modules/expenses/types/index.ts

import type { Expense, ExpenseType, ExpenseFilters, ExpenseStats } from '@/shared/types/expense.types';
import type { PaginatedResponse } from '@/shared/types/common.types';

export type { Expense, ExpenseType, ExpenseFilters, ExpenseStats, PaginatedResponse };

export interface ExpenseTableFilters {
  license_plate?: string;
  type?: string;
  startDate?: Date;
  endDate?: Date;
  minAmount?: number;
  maxAmount?: number;
}

export interface ExpenseTypeGroup {
  category: string;
  types: ExpenseType[];
}

/**
 * Suggested category groups shown when creating a new expense type.
 * These are NOT enforced server-side â€” expense_types are freeform records
 * (see modules/expenses/repositories/expense-type.repository.ts) grouped
 * by their own `category` string field. This list only seeds the "Group"
 * dropdown in the quick-add category dialog.
 */
export const DEFAULT_EXPENSE_CATEGORIES = [
  'Fuel',
  'Maintenance',
  'Repairs',
  'Insurance',
  'Licensing',
  'Registration',
  'Parking',
  'Toll Fees',
  'Driver Expenses',
  'Tires',
  'Cleaning',
  'Fines',
  'Parts',
  'Rentals',
  'Taxes',
  'Miscellaneous',
] as const;

export type ExpenseCategory = (typeof DEFAULT_EXPENSE_CATEGORIES)[number];

========================================
FILE: frontend/shared/import/ImportModal.tsx
========================================
// frontend/shared/import/ImportModal.tsx

'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/shared/ui/feedback/dialog';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/shared/ui/data-display/table';
import { UploadCloud, FileText, X, CheckCircle2, AlertTriangle, Download } from 'lucide-react';
import { buildCsvText, downloadCsvText } from '@/shared/utils/csv-parser.utils';
import { readTabularFile, IMPORT_FILE_ACCEPT } from '@/shared/utils/excel-parser.utils';

export type ImportColumnType = 'string' | 'number' | 'boolean' | 'date';

export interface ImportColumnDef {
  key: string;
  label: string;
  required?: boolean;
  type?: ImportColumnType;
  example?: string;
  description?: string;
}

export interface ImportRowResult {
  row: number;
  success: boolean;
  identifier?: string;
  /** Column that failed validation, when known. */
  column?: string;
  /** The raw value that failed validation, when known. */
  invalidValue?: string;
  error?: string;
  /** A suggested fix for the person reviewing the failed-row report. */
  suggestedFix?: string;
}

export interface ImportSummary {
  total: number;
  succeeded: number;
  failed: number;
}

export interface ImportResponse {
  summary: ImportSummary;
  results: ImportRowResult[];
}

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  columns: ImportColumnDef[];
  onImport: (records: Array<Record<string, unknown>>) => Promise<ImportResponse>;
  onImportComplete?: (response: ImportResponse) => void;
  maxPreviewRows?: number;
  maxRows?: number;
}

type Stage = 'select' | 'preview' | 'submitting' | 'report';

function coerceValue(raw: string, type: ImportColumnType | undefined): unknown {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;

  switch (type) {
    case 'number': {
      const num = Number(trimmed);
      return Number.isNaN(num) ? trimmed : num;
    }
    case 'boolean':
      return ['true', '1', 'yes', 'y'].includes(trimmed.toLowerCase());
    case 'date':
    case 'string':
    default:
      return trimmed;
  }
}

export function ImportModal({
  open,
  onOpenChange,
  title,
  description,
  columns,
  onImport,
  onImportComplete,
  maxPreviewRows = 25,
  maxRows = 2000,
}: ImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('select');
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [response, setResponse] = useState<ImportResponse | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const requiredColumns = useMemo(() => columns.filter((c) => c.required).map((c) => c.key), [columns]);

  const missingRequiredColumns = useMemo(() => {
    const lowerHeaders = new Set(headers.map((h) => h.toLowerCase()));
    return requiredColumns.filter((key) => !lowerHeaders.has(key.toLowerCase()));
  }, [headers, requiredColumns]);

  const rowsMissingRequiredValues = useMemo(() => {
    if (missingRequiredColumns.length > 0) return 0;
    return rows.filter((row) =>
      requiredColumns.some((key) => {
        const headerMatch = headers.find((h) => h.toLowerCase() === key.toLowerCase());
        const value = headerMatch ? row[headerMatch] : '';
        return !value || value.trim() === '';
      })
    ).length;
  }, [rows, requiredColumns, headers, missingRequiredColumns]);

  function reset() {
    setStage('select');
    setFileName(null);
    setHeaders([]);
    setRows([]);
    setParseError(null);
    setResponse(null);
  }

  const handleFile = useCallback(
    async (file: File) => {
      setParseError(null);
      try {
        const parsed = await readTabularFile(file);
        if (parsed.headers.length === 0 || parsed.rows.length === 0) {
          setParseError('The file appears to be empty or could not be parsed.');
          return;
        }
        if (parsed.rows.length > maxRows) {
          setParseError(`This file has ${parsed.rows.length} rows, which exceeds the ${maxRows}-row limit per import. Split it into smaller batches.`);
          return;
        }
        setFileName(file.name);
        setHeaders(parsed.headers);
        setRows(parsed.rows);
        setStage('preview');
      } catch (error) {
        setParseError(error instanceof Error ? error.message : 'Failed to read or parse this file.');
      }
    },
    [maxRows]
  );

  function handleDownloadTemplate() {
    const sampleRow: Record<string, unknown> = {};
    columns.forEach((col) => {
      sampleRow[col.key] = col.example ?? '';
    });
    const csv = buildCsvText(
      columns.map((c) => c.key),
      [sampleRow]
    );
    downloadCsvText(csv, `${title.toLowerCase().replace(/\s+/g, '-')}-template.csv`);
  }

  function buildRecordsForSubmission(): Array<Record<string, unknown>> {
    return rows.map((row, index) => {
      const record: Record<string, unknown> = { rowNumber: index + 2 }; // +2: header row is row 1
      columns.forEach((col) => {
        const headerMatch = headers.find((h) => h.toLowerCase() === col.key.toLowerCase());
        const rawValue = headerMatch ? row[headerMatch] : '';
        const value = coerceValue(rawValue ?? '', col.type);
        if (value !== undefined) record[col.key] = value;
      });
      return record;
    });
  }

  async function handleConfirmImport() {
    setStage('submitting');
    try {
      const records = buildRecordsForSubmission();
      const result = await onImport(records);
      setResponse(result);
      setStage('report');
      onImportComplete?.(result);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Import failed unexpectedly.');
      setStage('preview');
    }
  }

  function handleDownloadErrorReport() {
    if (!response) return;
    const failedRows = response.results.filter((r) => !r.success);
    const csv = buildCsvText(
      ['row', 'column', 'value', 'identifier', 'error', 'suggestedFix'],
      failedRows.map((r) => ({
        row: r.row,
        column: r.column ?? '',
        value: r.invalidValue ?? '',
        identifier: r.identifier ?? '',
        error: r.error ?? '',
        suggestedFix: r.suggestedFix ?? '',
      }))
    );
    downloadCsvText(csv, `${title.toLowerCase().replace(/\s+/g, '-')}-import-errors.csv`);
  }

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  const hasDetailedErrors = useMemo(
    () => (response?.results ?? []).some((r) => !r.success && (r.column || r.suggestedFix)),
    [response]
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {stage === 'select' && (
          <div className="space-y-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void handleFile(file);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
                dragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              }`}
            >
              <UploadCloud className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
              <p className="font-medium text-body-sm text-foreground">Drag and drop a CSV or Excel file, or click to browse</p>
              <p className="text-caption text-muted-foreground">Up to {maxRows.toLocaleString()} rows per import &middot; .csv, .xlsx, .xls</p>
              <input
                ref={fileInputRef}
                type="file"
                accept={IMPORT_FILE_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.target.value = '';
                }}
              />
            </div>

            {parseError && (
              <div className="flex items-start gap-2 p-3 border rounded-md border-destructive/30 bg-destructive/5 text-body-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{parseError}</span>
              </div>
            )}

            <div className="flex items-center justify-between p-3 border rounded-md border-border">
              <div>
                <p className="font-medium text-body-sm text-foreground">Need the column format?</p>
                <p className="text-caption text-muted-foreground">
                  Download a template with the expected headers and an example row.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                <Download className="h-3.5 w-3.5" />
                Template
              </Button>
            </div>

            <div>
              <p className="mb-2 font-semibold tracking-wide uppercase text-caption text-muted-foreground">Columns</p>
              <div className="flex flex-wrap gap-1.5">
                {columns.map((col) => (
                  <Badge key={col.key} variant={col.required ? 'default' : 'outline'}>
                    {col.label}
                    {col.required ? ' *' : ''}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        {stage === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 border rounded-md border-border">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                <div>
                  <p className="font-medium text-body-sm text-foreground">{fileName}</p>
                  <p className="text-caption text-muted-foreground">{rows.length} row(s) detected</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={reset}>
                <X className="h-3.5 w-3.5" />
                Choose different file
              </Button>
            </div>

            {missingRequiredColumns.length > 0 && (
              <div className="flex items-start gap-2 p-3 border rounded-md border-destructive/30 bg-destructive/5 text-body-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Missing required column(s): {missingRequiredColumns.join(', ')}. Download the template to see the
                  expected headers.
                </span>
              </div>
            )}

            {missingRequiredColumns.length === 0 && rowsMissingRequiredValues > 0 && (
              <div className="flex items-start gap-2 p-3 border rounded-md border-warning/40 bg-warning-bg text-body-sm text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {rowsMissingRequiredValues} row(s) are missing a required value and will likely be rejected during
                  import. You can still proceed -- valid rows will be imported and rejected rows will be reported.
                </span>
              </div>
            )}

            {parseError && (
              <div className="flex items-start gap-2 p-3 border rounded-md border-destructive/30 bg-destructive/5 text-body-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{parseError}</span>
              </div>
            )}

            <div className="overflow-x-auto border rounded-md border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((col) => (
                      <TableHead key={col.key}>
                        {col.label}
                        {col.required ? ' *' : ''}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, maxPreviewRows).map((row, i) => (
                    <TableRow key={i}>
                      {columns.map((col) => {
                        const headerMatch = headers.find((h) => h.toLowerCase() === col.key.toLowerCase());
                        return <TableCell key={col.key}>{headerMatch ? row[headerMatch] : ''}</TableCell>;
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {rows.length > maxPreviewRows && (
              <p className="text-caption text-muted-foreground">
                Showing first {maxPreviewRows} of {rows.length} rows. All {rows.length} will be submitted.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmImport} disabled={missingRequiredColumns.length > 0}>
                Import {rows.length} row{rows.length === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        )}

        {stage === 'submitting' && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <div className="w-8 h-8 border-2 rounded-full animate-spin border-primary border-t-transparent" />
            <p className="text-body-sm text-muted-foreground">Importing {rows.length} row(s)&hellip;</p>
          </div>
        )}

        {stage === 'report' && response && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 text-center border rounded-md border-border">
                <p className="text-h2 text-foreground">{response.summary.total}</p>
                <p className="text-caption text-muted-foreground">Total rows</p>
              </div>
              <div className="p-3 text-center border rounded-md border-success/40 bg-success-bg">
                <p className="text-h2 text-success">{response.summary.succeeded}</p>
                <p className="text-caption text-muted-foreground">Imported</p>
              </div>
              <div className="p-3 text-center border rounded-md border-destructive/30 bg-destructive/5">
                <p className="text-h2 text-destructive">{response.summary.failed}</p>
                <p className="text-caption text-muted-foreground">Failed</p>
              </div>
            </div>

            {response.summary.failed > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-body-sm text-foreground">Failed rows</p>
                  <Button variant="outline" size="sm" onClick={handleDownloadErrorReport}>
                    <Download className="h-3.5 w-3.5" />
                    Download error report
                  </Button>
                </div>
                <div className="overflow-y-auto border rounded-md max-h-64 border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Row</TableHead>
                        <TableHead>Identifier</TableHead>
                        {hasDetailedErrors && <TableHead>Column</TableHead>}
                        {hasDetailedErrors && <TableHead>Value</TableHead>}
                        <TableHead>Reason</TableHead>
                        {hasDetailedErrors && <TableHead>Suggested fix</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {response.results
                        .filter((r) => !r.success)
                        .map((r) => (
                          <TableRow key={r.row}>
                            <TableCell>{r.row}</TableCell>
                            <TableCell>{r.identifier ?? '\u2014'}</TableCell>
                            {hasDetailedErrors && <TableCell>{r.column ?? '\u2014'}</TableCell>}
                            {hasDetailedErrors && <TableCell>{r.invalidValue ?? '\u2014'}</TableCell>}
                            <TableCell className="text-destructive">{r.error}</TableCell>
                            {hasDetailedErrors && (
                              <TableCell className="text-muted-foreground">{r.suggestedFix ?? '\u2014'}</TableCell>
                            )}
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {response.summary.failed === 0 && (
              <div className="flex items-center gap-2 p-3 border rounded-md border-success/40 bg-success-bg text-body-sm text-success">
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                All rows imported successfully.
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={reset}>
                Import another file
              </Button>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

========================================
FILE: frontend/shared/tables/DataTable.tsx
========================================

'use client';

// FIX (Critical): this file re-exported `DataTable` from
// `@/frontend/shared/tables/DataTable`, which is an EMPTY stub file
// (frontend/shared/tables/DataTable.tsx has 0 bytes of implementation --
// confirmed during the Reports Center audit, along with every other file
// in frontend/shared/tables/ and frontend/shared/forms/, none of which
// have been implemented yet). Anything importing `DataGrid` from
// `@/frontend/shared/ui/data-display` (the barrel file re-exports it)
// was rendering `undefined`, i.e. nothing, silently.
//
// The actual working table implementation lives at
// `@/shared/ui/tables/DataTable` (root-level shared/, not frontend/shared/)
// -- it's a real TanStack Table wrapper with sorting, manual pagination,
// loading skeletons and an empty state, and is what the new Reports
// module's ReportResultTable is built on. Re-pointing DataGrid at it here
// so every existing caller of `DataGrid` picks up a real table for free.
//
// frontend/shared/tables/* remains unimplemented and out of scope for the
// Reports Center work -- flagging it as a separate Medium/High item since
// other modules may currently rely on it in the same broken way.

import { DataTable } from '@/shared/ui/tables/DataTable';

export { DataTable as DataGrid };

========================================
FILE: frontend/shared/tables/TableExports.tsx
========================================


========================================
FILE: frontend/shared/dashboards/widgets/TripsWidget.tsx
========================================

// frontend/shared/dashboards/widgets/TripsWidget.tsx

'use client';

import Link from 'next/link';
import { Route, ArrowUpRight } from 'lucide-react';
import { DashboardWidget } from '@/frontend/shared/dashboards/DashboardWidget';
import { useRecentTripsWidget } from '@/frontend/modules/dashboard/hooks/useDashboardData';
import { formatDistance } from '@/shared/utils/distance.utils';
import { formatDate } from '@/shared/utils/date.utils';

export function TripsWidget() {
  const { data, isLoading, isError, refetch } = useRecentTripsWidget();

  return (
    <DashboardWidget
      title="Recent trips"
      icon={<Route className="w-4 h-4" />}
      isLoading={isLoading}
      isError={isError}
      onRefresh={() => refetch()}
      footer={
        <Link href="/trips" className="flex items-center gap-1 text-body-sm text-primary hover:underline">
          View all trips
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      }
    >
      {!data || data.recent.length === 0 ? (
        <p className="py-6 text-center text-body-sm text-muted-foreground">No trips recorded yet.</p>
      ) : (
        <>
          <p className="mb-3 text-body-sm text-muted-foreground">
            {data.totalTrips} trips &middot; {formatDistance(data.totalDistance)} total
          </p>
          <ul className="divide-y divide-border">
            {data.recent.map((trip) => (
              <li key={trip._id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="font-medium truncate text-body-sm text-foreground">{trip.license_plate}</p>
                  <p className="truncate text-caption text-muted-foreground">{formatDate(trip.date)}</p>
                </div>
                <span className="shrink-0 text-body-sm tabular-nums text-foreground">
                  {formatDistance(trip.distance_calculated)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </DashboardWidget>
  );
}

========================================
FILE: frontend/shared/dashboards/widgets/FuelWidget.tsx
========================================

// frontend/shared/dashboards/widgets/FuelWidget.tsx

'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Fuel as FuelIcon } from 'lucide-react';
import { DashboardWidget } from '@/frontend/shared/dashboards/DashboardWidget';
import { useFuelTrendsWidget } from '@/frontend/modules/dashboard/hooks/useDashboardData';
import { formatCurrency } from '@/shared/utils/currency.utils';

export function FuelWidget() {
  const { data, isLoading, isError, refetch } = useFuelTrendsWidget();
  const points = data?.points ?? [];

  return (
    <DashboardWidget
      title="Fuel trends"
      icon={<FuelIcon className="w-4 h-4" />}
      isLoading={isLoading}
      isError={isError}
      onRefresh={() => refetch()}
    >
      {points.length === 0 ? (
        <p className="py-8 text-center text-body-sm text-muted-foreground">No fuel logs recorded yet.</p>
      ) : (
        <>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={points} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                  formatter={(value: number, name: string) =>
                    name === 'cost' ? [formatCurrency(value), 'Cost'] : [`${value} L`, 'Volume']
                  }
                />
                <Line type="monotone" dataKey="cost" stroke="var(--chart-1)" strokeWidth={2} dot={false} name="cost" />
                <Line type="monotone" dataKey="volume" stroke="var(--chart-2)" strokeWidth={2} dot={false} name="volume" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-2 text-caption text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-chart-1" /> Cost
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-chart-2" /> Volume (L)
            </span>
          </div>
        </>
      )}
    </DashboardWidget>
  );
}

========================================
FILE: frontend/shared/dashboards/widgets/ExpensesWidget.tsx
========================================
// frontend/shared/dashboards/widgets/ExpensesWidget.tsx

'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Wallet } from 'lucide-react';
import { DashboardWidget } from '@/frontend/shared/dashboards/DashboardWidget';
import { useExpenseBreakdownWidget } from '@/frontend/modules/dashboard/hooks/useDashboardData';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { getChartColor } from '@/shared/utils/chart.utils';

export function ExpensesWidget() {
  const { data, isLoading, isError, refetch } = useExpenseBreakdownWidget();
  const categories = data?.categories ?? [];

  return (
    <DashboardWidget
      title="Expense breakdown"
      icon={<Wallet className="w-4 h-4" />}
      isLoading={isLoading}
      isError={isError}
      onRefresh={() => refetch()}
    >
      {categories.length === 0 ? (
        <p className="py-8 text-center text-body-sm text-muted-foreground">No expenses recorded yet.</p>
      ) : (
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={categories} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={11} width={90} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                formatter={(value: number) => [formatCurrency(value), 'Amount']}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {categories.map((entry, index) => (
                  <Cell key={entry.name} fill={getChartColor(index)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </DashboardWidget>
  );
}

========================================
FILE: app/(protected)/trips/page.tsx
========================================
// app/(protected)/trips/page.tsx

import { TripsListPage } from '@/frontend/modules/trips/pages/TripsListPage';

export default function Page() {
  return <TripsListPage />;
}

========================================
FILE: app/(protected)/trips/error.tsx
========================================
// app/(protected)/trips/error.tsx

'use client';

import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/frontend/shared/ui/primitives/button';

export default function TripsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[TripsError]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-12 text-center">
      <h2 className="text-lg font-semibold text-foreground">Trips didn&apos;t load</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        The trips list took too long to respond. Try again, or narrow your date range if this
        keeps happening.
      </p>
      <Button onClick={() => reset()} size="sm">
        <RefreshCw className="h-3.5 w-3.5" />
        Try again
      </Button>
    </div>
  );
}

========================================
FILE: app/(protected)/fuel/analytics/page.tsx
========================================
// app/(protected)/fuel/analytics/page.tsx

import { FuelAnalyticsPage } from '@/frontend/modules/fuel/pages/FuelAnalyticsPage';

export default function Page() {
  return <FuelAnalyticsPage />;
}

========================================
FILE: app/(protected)/fuel/page.tsx
========================================
// app/(protected)/fuel/page.tsx

import { FuelDashboardPage } from '@/frontend/modules/fuel/pages/FuelDashboardPage';

export default function Page() {
  return <FuelDashboardPage />;
}


========================================
FILE: app/(protected)/expenses/analytics/page.tsx
========================================
// app/(protected)/expenses/analytics/page.tsx

import { ExpenseAnalyticsPage } from '@/frontend/modules/expenses/pages/ExpenseAnalyticsPage';

export default function Page() {
  return <ExpenseAnalyticsPage />;
}

========================================
FILE: app/(protected)/expenses/page.tsx
========================================

// app/(protected)/expenses/page.tsx

import { ExpenseDashboardPage } from '@/frontend/modules/expenses/pages/ExpenseDashboardPage';

export default function Page() {
  return <ExpenseDashboardPage />;
}
