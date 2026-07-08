// frontend/modules/organizations/services/advanced.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import type { Organization } from '../types';
import type {
  OrganizationAISettings,
  OrganizationReportingPreferences,
  OrganizationActivitySummary,
  PluginSummary,
  BillingPlan,
  Invoice,
  AuditLogPage,
  ChainVerificationResult,
} from '../types/advanced.types';
import type { FeatureFlagsFormValues } from '../schemas/advanced.schema';

const ORG_BASE = '/api/organizations';

export const advancedApi = {
  // ---- Feature flags / AI / reporting preferences ----
  updateFeatureFlags: (id: string, data: FeatureFlagsFormValues) =>
    apiClient.put<Organization>(`${ORG_BASE}/${id}/feature-flags`, data),

  updateAISettings: (id: string, data: OrganizationAISettings) =>
    apiClient.put<Organization>(`${ORG_BASE}/${id}/ai-settings`, data),

  updateReportingPreferences: (id: string, data: OrganizationReportingPreferences) =>
    apiClient.put<Organization>(`${ORG_BASE}/${id}/reporting-preferences`, data),

  getActivitySummary: (id: string) =>
    apiClient.get<OrganizationActivitySummary>(`${ORG_BASE}/${id}/analytics`),

  // ---- Audit log ----
  getAuditLog: (organizationId: string, page = 1, limit = 20) =>
    apiClient.get<AuditLogPage>(
      `/api/security/audit-log?entityType=organization&entityId=${organizationId}&page=${page}&limit=${limit}`
    ),

  /** Backing route: GET /api/security/audit-log/verify (not POST). */
  verifyAuditChain: () =>
    apiClient.get<ChainVerificationResult>('/api/security/audit-log/verify'),

  // ---- Plugins ----
  listPlugins: () => apiClient.get<PluginSummary[]>('/api/plugins'),

  /** Backing route: PUT /api/plugins/[id] (pluginController.update — no PATCH handler exists). */
  togglePlugin: (pluginId: string, enabled: boolean) =>
    apiClient.put<PluginSummary>(`/api/plugins/${pluginId}`, { enabled }),

  uninstallPlugin: (pluginId: string) => apiClient.delete<{ message: string }>(`/api/plugins/${pluginId}`),

  // ---- Billing ----
  listBillingPlans: () => apiClient.get<BillingPlan[]>('/api/billing/plans'),

  listInvoices: () => apiClient.get<Invoice[]>('/api/billing/invoices'),

  upgradePlan: (planId: string) => apiClient.post<{ message: string }>('/api/billing/upgrade', { planId }),
};