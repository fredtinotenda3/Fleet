// shared/validations/organization.advanced-addendum.schema.ts

import { z } from 'zod';

export const featureFlagsUpdateSchema = z.object({
  customBranding: z.boolean(),
  advancedAnalytics: z.boolean(),
  telematics: z.boolean(),
  apiAccess: z.boolean(),
  auditLogs: z.boolean(),
  prioritySupport: z.boolean(),
});

export const aiSettingsUpdateSchema = z.object({
  enabled: z.boolean(),
  predictiveMaintenance: z.boolean(),
  fuelFraudDetection: z.boolean(),
  driverRiskScoring: z.boolean(),
  expenseAnomalyDetection: z.boolean(),
  confidenceThreshold: z.number().min(0).max(1),
});

export const reportingPreferencesUpdateSchema = z.object({
  defaultExportFormat: z.enum(['pdf', 'csv', 'excel', 'word']),
  autoWeeklyDigest: z.boolean(),
  defaultDashboardId: z.string().optional(),
});

export type FeatureFlagsUpdateInput = z.infer<typeof featureFlagsUpdateSchema>;
export type AISettingsUpdateInput = z.infer<typeof aiSettingsUpdateSchema>;
export type ReportingPreferencesUpdateInput = z.infer<typeof reportingPreferencesUpdateSchema>;