// shared/types/fuel.types.ts

import { BaseEntity } from './common.types';

export interface FuelLog extends BaseEntity {
  license_plate: string;
  date: Date;
  fuel_volume: number;
  unit_id: string;
  cost: number;
  odometer?: number;
  station_name?: string;
  fuel_type?: string;
  notes?: string;
  currency?: string;
  is_full_tank?: boolean;
  receipt_url?: string;
  unit?: {
    name: string;
    symbol: string;
    unit_id: string;
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
  fuel_type?: string;
  notes?: string;
  currency?: string;
  is_full_tank?: boolean;
  receipt_url?: string;
}

export interface FuelLogUpdateDTO extends Partial<FuelLogCreateDTO> {
  _id: string;
}

export interface FuelFilters {
  license_plate?: string;
  unit_id?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface FuelStats {
  totalFuel: number;
  totalCost: number;
  averageCostPerUnit: number;
  logCount: number;
  efficiency: number | null;
}

/** Enterprise analytics: fuel efficiency, cost/km, anomaly detection, freshness. */
export interface FuelKpis {
  averageFuelEfficiency: number; // km per L, derived from odometer deltas
  totalDistance: number;
  efficiencyTrend: number; // current-period efficiency minus previous-period
  costPerKm: number;
  costTrend: number; // current-period cost/km minus previous-period
  vehiclesTracked: number;
  abnormalConsumptionCount: number;
  abnormalConsumptionPercentage: number;
  daysSinceLastFill: number;
  mostRecentVehicle?: string;
  mostRecentPlate?: string;
}

/** Row returned by the abnormal-consumption detector: entries that exceed a vehicle's own rolling average volume by `threshold`x. */
export interface AbnormalFuelConsumptionRow {
  _id: string;
  license_plate: string;
  volume: number;
  station_name?: string;
  date: Date | string;
  anomalyScore: number;
  threshold: number;
}