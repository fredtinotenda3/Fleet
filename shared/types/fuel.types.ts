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