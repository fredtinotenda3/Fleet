// modules/reports/types/report.types.ts

import { BaseEntity, DateRange } from '@/shared/types/common.types';

export type ReportType =
  | 'fleet_summary'
  | 'expense_analysis'
  | 'fuel_efficiency'
  | 'maintenance_history'
  | 'trip_logs';

export type ReportFormat = 'pdf' | 'csv' | 'excel';

export interface ReportConfig {
  type: ReportType;
  format: ReportFormat;
  dateRange: DateRange;
  filters?: Record<string, unknown>;
  includeCharts?: boolean;
  includeDetails?: boolean;
  schedule?: ReportSchedule;
}

export interface ReportSchedule {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  dayOfWeek?: number;
  dayOfMonth?: number;
  recipients: string[];
}

export interface Report extends BaseEntity {
  name: string;
  type: ReportType;
  format: ReportFormat;
  fileUrl: string;
  /** Storage key as returned by StorageService.uploadFile, needed to fetch
   *  the raw file later since signed URLs expire and can't be re-parsed. */
  fileKey: string;
  fileSize: number;
  generatedAt: Date;
  generatedBy: string;
  dateRange: DateRange;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  downloadCount: number;
  errorMessage?: string;
}

export interface FleetSummaryData {
  generatedAt: Date;
  dateRange: DateRange;
  summary: {
    totalVehicles: number;
    activeVehicles: number;
    maintenanceVehicles: number;
    totalDistance: number;
    totalExpenses: number;
    totalFuelCost: number;
    totalFuelVolume: number;
    avgFuelEfficiency: number | null;
    costPerKm: number | null;
    pendingMaintenance: number;
    overdueMaintenance: number;
  };
  costBreakdown: {
    byCategory: Record<string, number>;
    byVehicle: Array<{ license_plate: string; total: number }>;
  };
}