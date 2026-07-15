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
};

export { FUEL_PAYMENT_METHODS } from '@/shared/types/fuel.types';

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
  // NEW
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