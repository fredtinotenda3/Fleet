// frontend/modules/vehicles/components/index.ts

export { VehicleFilters } from './VehicleFilters';
export { VehicleForm } from './VehicleForm';
export { VehicleModal } from './VehicleModal';
export type { VehicleModalMode } from './VehicleModal';
export { VehiclesTable } from './VehiclesTable';
export { VehicleStatsCards } from './VehicleStatsCards';
export { DriverAssignmentPanel } from './DriverAssignmentPanel';
// ROUND 4 (Dispatch <-> Vehicle/Driver): reusable id-keyed vehicle picker, see VehicleSelect.tsx's header for why it's new.
export { VehicleSelect } from './VehicleSelect';

// Vehicle-Level Analytics
export { VehicleFuelAnalyticsPanel, VehicleExpenseAnalyticsPanel, VehicleAnalyticsPanel } from './analytics';