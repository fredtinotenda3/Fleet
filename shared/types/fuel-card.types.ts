// shared/types/fuel-card.types.ts

import { BaseEntity } from './common.types';

export type FuelCardStatus = 'active' | 'suspended' | 'expired';

export interface FuelCard extends BaseEntity {
  /** Last 4 digits only. The full PAN is never stored. */
  card_last4: string;
  provider: string;
  currency: string;
  license_plate?: string;
  unit_id?: string;
  monthly_limit?: number;
  status: FuelCardStatus;
  expiry_date?: Date;
  notes?: string;
}

export interface FuelCardCreateDTO {
  card_last4: string;
  provider: string;
  currency?: string;
  license_plate?: string;
  unit_id?: string;
  monthly_limit?: number;
  status?: FuelCardStatus;
  expiry_date?: Date | string;
  notes?: string;
}

export interface FuelCardUpdateDTO extends Partial<FuelCardCreateDTO> {
  _id: string;
}

export interface FuelCardFilters {
  search?: string;
  status?: FuelCardStatus;
}