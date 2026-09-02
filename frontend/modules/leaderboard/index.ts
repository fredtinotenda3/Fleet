// leaderboard Module
// Barrel exports for the Fleet Leaderboard feature module.
//
// Read-only. This module calls three EXISTING endpoints
// (GET /api/ai/dashboard and two /api/reminders analytics actions) and
// adds no backend route, permission or response shape. Three of its
// seven alert-category tiles ship deliberately disabled because no
// fleet-wide telematics alert aggregation exists -- see
// docs/leaderboard/BACKEND_AGGREGATION_GAPS.md for the contract that
// would fill them.

export { FleetLeaderboardPage } from './pages';
export {
  RankedBarChart,
  MetricToggle,
  AlertCategoryTiles,
  AlertCategoryTile,
  DriverLeaderboardCard,
  VehicleLeaderboardCard,
} from './components';
export type { MetricToggleOption, VehicleLeaderboardData } from './components';
export {
  leaderboardKeys,
  useLeaderboardAccess,
  useAiDashboard,
  useMaintenanceStats,
  useMostExpensiveVehicles,
  useRepairFrequencyByVehicle,
  vehicleMetricPermission,
} from './hooks';
export { leaderboardApi, MAX_LEADERBOARD_ROWS } from './services';
export { LEADERBOARD_ROUTES } from './routes';
export * from './utils';
export type * from './types';
