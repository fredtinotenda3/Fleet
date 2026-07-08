// frontend/modules/organizations/schemas/advanced.schema.ts

import { z } from 'zod';

export const featureFlagsSchema = z.object({
  customBranding: z.boolean(),
  advancedAnalytics: z.boolean(),
  telematics: z.boolean(),
  apiAccess: z.boolean(),
  auditLogs: z.boolean(),
  prioritySupport: z.boolean(),
});
export type FeatureFlagsFormValues = z.infer<typeof featureFlagsSchema>;

export const aiSettingsSchema = z.object({
  enabled: z.boolean(),
  predictiveMaintenance: z.boolean(),
  fuelFraudDetection: z.boolean(),
  driverRiskScoring: z.boolean(),
  expenseAnomalyDetection: z.boolean(),
  confidenceThreshold: z.number().min(0).max(1),
});
export type AISettingsFormValues = z.infer<typeof aiSettingsSchema>;

export const reportingPreferencesSchema = z.object({
  defaultExportFormat: z.enum(['pdf', 'csv', 'excel', 'word']),
  autoWeeklyDigest: z.boolean(),
  defaultDashboardId: z.string().optional().or(z.literal('')),
});
export type ReportingPreferencesFormValues = z.infer<typeof reportingPreferencesSchema>;

export const auditLogFilterSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1).max(100),
});
export type AuditLogFilterValues = z.infer<typeof auditLogFilterSchema>;