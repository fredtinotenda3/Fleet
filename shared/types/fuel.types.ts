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