// frontend/modules/organizations/components/advanced/defaults.ts

import type {
  OrganizationAISettings,
  OrganizationReportingPreferences,
} from '../../types/advanced.types';

export const DEFAULT_AI_SETTINGS: OrganizationAISettings = {
  enabled: false,
  predictiveMaintenance: true,
  fuelFraudDetection: true,
  driverRiskScoring: true,
  expenseAnomalyDetection: true,
  confidenceThreshold: 0.7,
};

export const DEFAULT_REPORTING_PREFERENCES: OrganizationReportingPreferences = {
  defaultExportFormat: 'pdf',
  autoWeeklyDigest: false,
};