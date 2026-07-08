// frontend/modules/organizations/hooks/useAdvancedSettings.ts

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { toast } from 'sonner';
import { advancedApi } from '../services/advanced.api';
import { organizationKeys } from './query-keys';
import type {
  OrganizationActivitySummary,
  OrganizationAISettings,
  OrganizationReportingPreferences,
  PluginSummary,
  BillingPlan,
  Invoice,
  AuditLogPage,
} from '../types/advanced.types';
import type { FeatureFlagsFormValues } from '../schemas/advanced.schema';

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useOrganizationActivitySummary(
  organizationId: string | undefined,
  options?: Partial<UseQueryOptions<OrganizationActivitySummary>>
) {
  return useQuery({
    queryKey: [...organizationKeys.all, 'activity-summary', organizationId ?? ''],
    queryFn: () => advancedApi.getActivitySummary(organizationId as string),
    enabled: Boolean(organizationId),
    staleTime: 5 * 60_000,
    ...options,
  });
}

export function useAuditLogPage(
  organizationId: string | undefined,
  page: number,
  limit: number,
  options?: Partial<UseQueryOptions<AuditLogPage>>
) {
  return useQuery({
    queryKey: [...organizationKeys.all, 'audit-log-page', organizationId ?? '', page, limit],
    queryFn: () => advancedApi.getAuditLog(organizationId as string, page, limit),
    enabled: Boolean(organizationId),
    staleTime: 15_000,
    ...options,
  });
}

/** GET-backed, but modeled as a mutation since it's triggered by a manual "Verify" button click, not cached list data. */
export function useVerifyAuditChain() {
  return useMutation({
    mutationFn: () => advancedApi.verifyAuditChain(),
    onSuccess: (result) => {
      if (result.valid) toast.success('Audit log integrity verified — no tampering detected');
      else toast.error(`Audit log integrity check failed at entry #${result.brokenAtSequence}`);
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Failed to verify audit log')),
  });
}

export function useUpdateFeatureFlags(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: FeatureFlagsFormValues) => advancedApi.updateFeatureFlags(organizationId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.detail(organizationId) });
      toast.success('Feature flags updated');
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Failed to update feature flags')),
  });
}

export function useUpdateAISettings(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: OrganizationAISettings) => advancedApi.updateAISettings(organizationId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.detail(organizationId) });
      toast.success('AI settings updated');
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Failed to update AI settings')),
  });
}

export function useUpdateReportingPreferences(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: OrganizationReportingPreferences) =>
      advancedApi.updateReportingPreferences(organizationId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.detail(organizationId) });
      toast.success('Reporting preferences updated');
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Failed to update reporting preferences')),
  });
}

export function usePlugins(options?: Partial<UseQueryOptions<PluginSummary[]>>) {
  return useQuery({
    queryKey: ['plugins', 'list'],
    queryFn: () => advancedApi.listPlugins(),
    staleTime: 60_000,
    ...options,
  });
}

export function useTogglePlugin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pluginId, enabled }: { pluginId: string; enabled: boolean }) =>
      advancedApi.togglePlugin(pluginId, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins', 'list'] });
      toast.success('Plugin updated');
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Failed to update plugin')),
  });
}

export function useUninstallPlugin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pluginId: string) => advancedApi.uninstallPlugin(pluginId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins', 'list'] });
      toast.success('Plugin uninstalled');
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Failed to uninstall plugin')),
  });
}

export function useBillingPlans(options?: Partial<UseQueryOptions<BillingPlan[]>>) {
  return useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: () => advancedApi.listBillingPlans(),
    staleTime: 5 * 60_000,
    ...options,
  });
}

export function useInvoices(options?: Partial<UseQueryOptions<Invoice[]>>) {
  return useQuery({
    queryKey: ['billing', 'invoices'],
    queryFn: () => advancedApi.listInvoices(),
    staleTime: 60_000,
    ...options,
  });
}

export function useUpgradePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => advancedApi.upgradePlan(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['billing', 'invoices'] });
      toast.success('Plan upgrade initiated');
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Failed to upgrade plan')),
  });
}