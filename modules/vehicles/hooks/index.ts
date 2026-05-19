// modules/vehicles/hooks/index.ts - Centralized exports

export {
  useVehicles,
  useVehicle,
  useVehicleByLicensePlate,
  useVehicleStats,
  useVehicleSearch,
  useVehiclesByStatus,
  useVehiclesDueForService,
  useVehicleAnalytics,
} from './useVehicles';

export {
  useCreateVehicle,
  useUpdateVehicle,
  useUpdateVehicleStatus,
  useDeleteVehicle,
} from './useVehicleMutations';