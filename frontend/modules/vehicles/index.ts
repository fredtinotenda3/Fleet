// frontend/modules/vehicles/index.ts

// Re-export only what's needed, avoiding ambiguity
export type * from './types';
export type * from './schemas';
export * from './services';
export * from './hooks';
export * from './store';
export * from './utils';
export * from './routes';

// Explicitly re-export components to avoid ambiguity
export { 
  VehicleFilters,
  VehicleForm,
  VehicleModal,
  VehiclesTable,
  VehicleStatsCards 
} from './components';
export type { VehicleModalMode } from './components';

export * from './pages';