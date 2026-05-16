// types/index.ts - Single source of truth

// This file consolidates all types from shared/types and modules
// to eliminate duplication and ensure consistency

export * from '@/shared/types/common.types';
export * from '@/shared/types/vehicle.types';
export * from '@/shared/types/expense.types';
export * from '@/shared/types/fuel.types';
export * from '@/shared/types/maintenance.types';
export * from '@/shared/types/trip.types';
export * from '@/shared/types/api.types';
export * from '@/shared/types/organization.types';
export * from '@/shared/types/unit.types';
export * from '@/shared/types/meter.types';  // ← ADD THIS LINE


// Deprecated - remove old type files
// @deprecated - Use types from @/types instead