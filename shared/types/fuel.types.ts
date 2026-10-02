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
  /**
   * The driver who took this refuel.
   *
   * `null` (not merely absent) is a legitimate stored value: an update
   * that clears an incorrect attribution writes an explicit null rather
   * than leaving the wrong id in place. Every consumer treats falsy as
   * unattributed, and getFuelByDriver normalises null and '' into the
   * same bucket, so the two shapes are equivalent on read.
   *
   * NOT the vehicle's current driver. A fuel log records who fuelled the
   * vehicle on that date; back-filling the vehicle's present driver onto
   * historical logs would rewrite one person's fuel spend onto another.
   */
  driver_id?: string | null;
  cost: number;
  odometer?: number;
  station_name?: string;
  fuel_station_id?: string;
  fuel_type?: string;
  /**
   * Provenance sibling of `fuel_type`: exactly what was typed or
   * imported, untouched by normalization. `fuel_type` itself holds the
   * canonical, case-folded value (Diesel/Petrol/Electric/Hybrid) so
   * every existing reader keeps working unchanged; this field exists
   * purely for audit/display (see the "Fuel Type (as entered)" export
   * column) and is never client-submitted -- CreateFuelLogHandler/
   * UpdateFuelLogHandler derive it server-side via
   * modules/fuel/utils/fuel-type.utils.ts, which is why it is absent
   * from FuelLogCreateDTO/FuelLogUpdateDTO below. Absent on any row
   * written before this fix; see scripts/backfill-fuel-type-normalization.ts.
   */
  fuel_type_raw?: string;
  notes?: string;
  currency?: string;
  is_full_tank?: boolean;
  receipt_url?: string;
  payment_method?: FuelPaymentMethod;
  fuel_card_id?: string;
  /** Inherited from the referenced vehicle's orgUnitId at write time -- see
   *  CreateFuelLogHandler/UpdateFuelLogHandler. Not user-submitted. */
  orgUnitId?: string;
  /** Optional FK -> Trip. Populated by a future "link to trip" selector on the fuel form. */
  tripId?: string;
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
  /**
   * Display-only field, populated by FuelRepository.enrichFuelLogs.
   *
   * NOT derived from this log's own `driver_id` (see that field's doc
   * comment). Resolved instead from the vehicle's CURRENT Operational
   * Hub assignment (Vehicle.currentDriverId, set exclusively via
   * PATCH /api/vehicles/:id/driver) -- so this reflects "who is assigned
   * to this vehicle today," and updates immediately when that assignment
   * changes, with no backfill required. This is the field the Fuel Logs
   * table's Driver column, its CSV/PDF export, and the "Fuel cost by
   * driver" chart all read.
   */
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
  /** Optional FK -> Trip. Populated by a future "link to trip" selector on the fuel form. */
  tripId?: string;
}

export interface FuelLogUpdateDTO extends Partial<FuelLogCreateDTO> {
  _id: string;
}

export interface FuelFilters {
  license_plate?: string;
  unit_id?: string;
  /**
   * Filters to the vehicle(s) this driver is CURRENTLY assigned to via
   * the Vehicle Operational Hub (Vehicle.currentDriverId) -- not to logs
   * whose own transaction-time driver_id equals this id. See
   * FuelLog.driver's doc comment for why. Resolved server-side in
   * FuelRepository; mutually exclusive with unassignedOnly in practice
   * (both may be sent, but together they can only ever match nothing).
   */
  driver_id?: string;
  /**
   * Filters to fuel logs for vehicles that currently have NO Operational
   * Hub driver assignment -- backs the "Unassigned" bucket drill-through
   * on the "Fuel cost by driver" chart. See driver_id's doc comment.
   */
  unassignedOnly?: boolean;
  startDate?: Date;
  endDate?: Date;
  payment_method?: FuelPaymentMethod;
  fuel_station_id?: string;
  fuel_card_id?: string;
  /**
   * MODULE CONNECTIVITY UPGRADE (Trip <-> Fuel/Expense gap): filters to
   * fuel logs linked to one trip via FuelLog.tripId. The field has been
   * written at create/update time since the "link to trip" selector
   * shipped, but nothing read it back as a filter until now -- Trip
   * Detail had no way to show "what fuel was logged on this trip" even
   * though the data already exists.
   */
  tripId?: string;
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
  /**
   * License plate(s) behind this row's totals. For a resolved driver
   * (driver_id set), a driver can currently hold at most one vehicle
   * (partial unique index -- see Vehicle.currentDriverId), so this is
   * normally a single plate; consumers such as the chart's drill-through
   * use vehiclePlates[0] rather than assuming a driver_id-based filter
   * still applies. For the "Unassigned" row it lists every plate with no
   * current driver.
   */
  vehiclePlates?: string[];
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
/**
 * MODULE CONNECTIVITY UPGRADE (fuel/GL reconciliation gap). One fuel
 * log's reconciliation status against the allocation ledger -- see
 * AllocationPostingService.postSource and
 * OrganizationFinanceSettings.costCategoryGlAccountCodes.
 *
 * Deliberately a SEPARATE endpoint/type from FuelLog itself, not an
 * extra field returned by every list/detail read: it costs one scoped
 * ledger query, which is fine for a single detail view and wasteful for
 * a paginated list of hundreds of rows.
 */
export interface FuelLedgerReconciliation {
  /** The net (post-reversal) posting for this fuel log, or null if never posted. */
  posting: {
    id: string;
    amount: number;
    currency: string;
    postedAt: Date;
    glAccountCode: string | null;
  } | null;
  status: 'matched' | 'stale' | 'not_posted';
  /**
   * current fuel-log cost minus the net posted amount. Only meaningful
   * (non-null) when status is 'stale' -- a posted amount that no longer
   * agrees with the log's current cost, almost always because the log
   * was edited (UpdateFuelLogHandler never re-posts; see
   * AllocationPostingHandler's header on the ledger being append-only).
   */
  varianceFromCurrentCost: number | null;
  /** Populated only when status is 'not_posted'; a real, known refusal cause, never a guess at one. */
  notPostedReason: string | null;
  /**
   * Always 'not_applicable': the allocation ledger has no quantity
   * field for a 'direct' posting (fuel always posts direct -- see
   * AllocationPosting.quantity's own doc comment), so fuel VOLUME has
   * no ledger counterpart to reconcile against, structurally, not as a
   * missing feature. Only the fuel log's own recorded volume exists.
   */
  volumeReconciliation: 'not_applicable';
}
