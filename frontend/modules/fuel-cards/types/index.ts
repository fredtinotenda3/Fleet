// frontend/modules/fuel-cards/types/index.ts

import type { FuelCard, FuelCardFilters, FuelCardStatus } from '@/shared/types/fuel-card.types';
import type { PaginatedResponse } from '@/shared/types/common.types';

export type { FuelCard, FuelCardFilters, FuelCardStatus, PaginatedResponse };

export const FUEL_CARD_STATUSES: FuelCardStatus[] = ['active', 'suspended', 'expired'];