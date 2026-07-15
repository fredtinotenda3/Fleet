// frontend/modules/drivers/types/index.ts

import type { Driver, DriverFilters, DriverStatus, DriverRef } from '@/shared/types/driver.types';
import type { PaginatedResponse } from '@/shared/types/common.types';

export type { Driver, DriverFilters, DriverStatus, DriverRef, PaginatedResponse };

export const DRIVER_STATUSES: DriverStatus[] = ['active', 'inactive', 'suspended'];