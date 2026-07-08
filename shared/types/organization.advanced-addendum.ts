// shared/types/organization.advanced-addendum.ts
//
// Merge into shared/types/organization.types.ts's Organization interface:
//
//   aiSettings?: OrganizationAISettings;
//   reportingPreferences?: OrganizationReportingPreferences;
//
// `features` (OrganizationFeatures) already exists on Organization and is
// what the "Feature Flags" admin panel edits directly — no addition
// needed there.

export interface OrganizationAISettings {
  enabled: boolean;
  predictiveMaintenance: boolean;
  fuelFraudDetection: boolean;
  driverRiskScoring: boolean;
  expenseAnomalyDetection: boolean;
  /** 0-1. Below this confidence, AI insights are suppressed from dashboards. */
  confidenceThreshold: number;
}

export interface OrganizationReportingPreferences {
  defaultExportFormat: 'pdf' | 'csv' | 'excel' | 'word';
  autoWeeklyDigest: boolean;
  defaultDashboardId?: string;
}

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