// modules/intelligence/types/anomaly.types.ts
//
// Module-local re-export of the shared anomaly entity, plus the
// transient detection-result shape used internally by
// AnomalyDetectionService before persistence. Keeping these distinct
// avoids conflating "what the detector found this pass" with "what's
// stored in the database."

export type {
  Anomaly,
  AnomalyCategory,
  AnomalySeverity,
  AnomalyStatus,
  AnomalyFilters,
  AnomalyStatusUpdateDTO,
} from '@/shared/types/anomaly.types';

export interface DetectedAnomaly {
  category: 'fuel' | 'expense' | 'maintenance';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  data: Record<string, unknown>;
  recommendation: string;
  licensePlate?: string;
}