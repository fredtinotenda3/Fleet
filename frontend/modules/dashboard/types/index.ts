// frontend/modules/dashboard/types/index.ts

import type { VehicleStats } from '@/shared/types/vehicle.types';
import type { Reminder } from '@/shared/types/maintenance.types';
import type { FuelLog } from '@/shared/types/fuel.types';
import type { Expense } from '@/shared/types/expense.types';
import type { Trip } from '@/shared/types/trip.types';
import type {
  FleetHealthScore,
  PredictiveMaintenancePrediction,
  DriverRiskScore,
  FuelFraudAlert,
  ExpenseAnomalyAlert,
  AIBatchResult,
} from '@/modules/ai/types/ai.types';

export type { VehicleStats, Reminder, FuelLog, Expense, Trip };

export interface AIDashboardSummary {
  fleetHealth: FleetHealthScore | null;
  predictiveMaintenance: AIBatchResult<PredictiveMaintenancePrediction> | null;
  driverRisk: AIBatchResult<DriverRiskScore> | null;
  fuelFraud: AIBatchResult<FuelFraudAlert> | null;
  expenseAnomalies: AIBatchResult<ExpenseAnomalyAlert> | null;
  timestamp: string;
}

export interface NotificationFeedItem {
  _id: string;
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  read: boolean;
  sentAt: string;
  actionUrl?: string;
}

export interface FuelTrendPoint {
  month: string;
  volume: number;
  cost: number;
}

export interface ExpenseCategoryPoint {
  name: string;
  value: number;
  percentage: number;
}