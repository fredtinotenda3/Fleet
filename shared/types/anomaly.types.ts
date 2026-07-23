// shared/types/anomaly.types.ts
//
// Canonical persisted-anomaly shape. This is the DB entity written by
// AnomalyDetectionService and read by the /api/anomalies surface -- not
// to be confused with the transient `Anomaly` detection-result shape
// still returned by detectFuelAnomalies/detectExpenseAnomalies for
// backward compatibility with any existing in-memory callers.

import { BaseEntity } from './common.types';

export type AnomalyCategory = 'fuel' | 'expense' | 'maintenance';
export type AnomalySeverity = 'low' | 'medium' | 'high' | 'critical';
export type AnomalyStatus = 'open' | 'acknowledged' | 'resolved' | 'dismissed';

export interface Anomaly extends BaseEntity {
  category: AnomalyCategory;
  severity: AnomalySeverity;
  status: AnomalyStatus;
  title: string;
  message: string;
  recommendation: string;
  licensePlate?: string;
  /** Raw detection payload (efficiency figures, comparison values, etc.) for drill-down/debugging. */
  data: Record<string, unknown>;
  /**
   * Dedup key: `${category}:${licensePlate}:${dayBucket}` (or similar).
   * Used so re-running detection on the same event burst doesn't create
   * duplicate open anomalies for the same vehicle on the same day.
   */
  fingerprint: string;
  detectedAt: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
}

export interface AnomalyFilters {
  category?: AnomalyCategory;
  severity?: AnomalySeverity;
  status?: AnomalyStatus;
  licensePlate?: string;
}

export interface AnomalyStatusUpdateDTO {
  status: Exclude<AnomalyStatus, 'open'>;
}