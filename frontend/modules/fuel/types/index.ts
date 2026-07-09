// frontend/modules/fuel/types/index.ts

import type {
  FuelLog,
  FuelFilters,
  FuelStats,
  FuelKpis,
  AbnormalFuelConsumptionRow,
} from '@/shared/types/fuel.types';
import type { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';

export type {
  FuelLog,
  FuelFilters,
  FuelStats,
  FuelKpis,
  AbnormalFuelConsumptionRow,
  PaginationParams,
  PaginatedResponse,
};

export type FuelTableFilters = FuelFilters;

export interface FuelColumnVisibility {
  date: boolean;
  unit: boolean;
  cost: boolean;
  odometer: boolean;
  station: boolean;
  fuel_type: boolean;
  full_tank: boolean;
  notes: boolean;
}

export const DEFAULT_FUEL_COLUMN_VISIBILITY: FuelColumnVisibility = {
  date: true,
  unit: true,
  cost: true,
  odometer: true,
  station: true,
  fuel_type: false,
  full_tank: false,
  notes: false,
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