// shared/types/fuel-station.types.ts

import { BaseEntity } from './common.types';

export interface FuelStation extends BaseEntity {
  name: string;
  brand?: string;
  address?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  notes?: string;
  isActive: boolean;
}

export interface FuelStationCreateDTO {
  name: string;
  brand?: string;
  address?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  notes?: string;
  isActive?: boolean;
}

export interface FuelStationUpdateDTO extends Partial<FuelStationCreateDTO> {
  _id: string;
}

export interface FuelStationFilters {
  search?: string;
  isActive?: boolean;
}