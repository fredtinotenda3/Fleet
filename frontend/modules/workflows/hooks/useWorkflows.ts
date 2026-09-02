// frontend/modules/workflows/hooks/useWorkflows.ts

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { workflowApi } from '../services/workflow.api';
import type {
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowMetrics,
  WorkflowListParams,
  WorkflowInstanceListParams,
} from '../types';

export const workflowKeys = {
  all: ['workflows'] as const,
  lists: () => [...workflowKeys.all, 'list'] as const,
  list: (params: WorkflowListParams) => [...workflowKeys.lists(), params] as const,
  details: () => [...workflowKeys.all, 'detail'] as const,
  detail: (id: string) => [...workflowKeys.details(), id] as const,
  instances: () => [...workflowKeys.all, 'instances'] as const,
  instanceList: (params: WorkflowInstanceListParams) => [...workflowKeys.instances(), 'list', params] as const,
  instanceDetail: (id: string) => [...workflowKeys.instances(), 'detail', id] as const,
  myTasks: () => [...workflowKeys.all, 'my-tasks'] as const,
  metrics: (days?: number) => [...workflowKeys.all, 'metrics', days ?? 30] as const,
};

/** GET /api/workflows -- the list of workflow definitions (WORKFLOW_VIEW). */
export function useWorkflows(params: WorkflowListParams = {}) {
  return useQuery({
    queryKey: workflowKeys.list(params),
    queryFn: () => workflowApi.listWorkflows(params),
    staleTime: 30_000,
  });
}

/** GET /api/workflows/[id] -- a single workflow definition. */
export function useWorkflow(id: string | undefined, options?: Partial<UseQueryOptions<WorkflowDefinition>>) {
  return useQuery({
    queryKey: workflowKeys.detail(id ?? ''),
    queryFn: () => workflowApi.getWorkflow(id as string),
    enabled: Boolean(id),
    staleTime: 30_000,
    ...options,
  });
}

/**
 * GET /api/workflows/instances -- requires an entityId + entityType
 * (see ../services/workflow.api.ts and ../types/index.ts for why this
 * endpoint cannot list "everything in scope"). Only enabled once both
 * are supplied.
 */
export function useWorkflowInstances(params: Partial<WorkflowInstanceListParams>) {
  const enabled = Boolean(params.entityId && params.entityType);
  return useQuery({
    queryKey: workflowKeys.instanceList(params as WorkflowInstanceListParams),
    queryFn: () =>
      workflowApi.listWorkflowInstances(params as WorkflowInstanceListParams),
    enabled,
    staleTime: 15_000,
  });
}

/** GET /api/workflows/instances/[id] -- a single instance. */
export function useWorkflowInstance(
  id: string | undefined,
  options?: Partial<UseQueryOptions<WorkflowInstance>>
) {
  return useQuery({
    queryKey: workflowKeys.instanceDetail(id ?? ''),
    queryFn: () => workflowApi.getWorkflowInstance(id as string),
    enabled: Boolean(id),
    staleTime: 15_000,
    ...options,
  });
}

/**
 * GET /api/workflows/instances/my-tasks -- the current user's
 * actionable steps. Polled every 30s: a pending approval sitting in
 * someone's queue is the kind of thing a page left open in a
 * background tab should surface without a manual refresh, but nothing
 * here changes faster than that.
 */
export function useMyWorkflowTasks(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: workflowKeys.myTasks(),
    queryFn: () => workflowApi.listMyWorkflowTasks(),
    enabled: options?.enabled ?? true,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/** GET /api/workflows/metrics -- aggregate approval throughput. */
export function useWorkflowMetrics(days?: number, options?: { enabled?: boolean }) {
  return useQuery<WorkflowMetrics>({
    queryKey: workflowKeys.metrics(days),
    queryFn: () => workflowApi.getWorkflowMetrics(days),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  });
}
