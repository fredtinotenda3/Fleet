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