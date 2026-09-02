// frontend/modules/leaderboard/types/index.ts

import type {
  MostExpensiveVehicleRow,
  RepairFrequencyByVehicleRow,
  MaintenanceStats,
} from '@/shared/types/maintenance.types';

/**
 * Re-exported as-is from the SHARED tree (not the server tree), which
 * is where these aggregation row shapes already live and where
 * frontend/modules/maintenance/types/index.ts already imports them
 * from. No local copy: a second definition of a shape this module does
 * not own could only drift from the aggregation that produces it.
 */
export type { MostExpensiveVehicleRow, RepairFrequencyByVehicleRow, MaintenanceStats };

export * from './ai-dashboard.types';
export * from './leaderboard.types';
