// frontend/modules/trips/types/index.ts

import type { Trip, TripFilters, TripStats, TripCreateDTO, TripUpdateDTO } from '@/shared/types/trip.types';
import type { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';

export type { Trip, TripFilters, TripStats, TripCreateDTO, TripUpdateDTO, PaginationParams, PaginatedResponse };

export type TripMode = 'distance' | 'odometer';

export const TRIP_MODES: TripMode[] = ['distance', 'odometer'];

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
}

export const DEFAULT_TRIP_COLUMN_VISIBILITY: TripColumnVisibility = {
  mode: true,
  date: true,
  distance: true,
  driver: true,
  start_location: false,
  end_location: false,
  notes: false,
};

export interface DistanceUnitOption {
  unit_id: string;
  name: string;
  symbol: string;
  type: string;
}