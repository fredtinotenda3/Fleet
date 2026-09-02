// frontend/modules/workflows/hooks/useWorkflowMutations.ts

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { workflowApi } from '../services/workflow.api';
import { workflowKeys } from './useWorkflows';
import type {
  WorkflowCreatePayload,
  WorkflowUpdatePayload,
  WorkflowStartPayload,
  WorkflowApprovePayload,
  WorkflowRejectPayload,
} from '../types';

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

// ── Definitions (WORKFLOW_MANAGE) ─────────────────────────────────────

export function useCreateWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: WorkflowCreatePayload) => workflowApi.createWorkflow(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.lists() });
      toast.success('Workflow created');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to create workflow')),
  });
}

export function useUpdateWorkflow(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: WorkflowUpdatePayload) => workflowApi.updateWorkflow(id, payload),
    onSuccess: (workflow) => {
      queryClient.setQueryData(workflowKeys.detail(id), workflow);
      queryClient.invalidateQueries({ queryKey: workflowKeys.lists() });
      toast.success('Workflow updated');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to update workflow')),
  });
}

export function useDeleteWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => workflowApi.deleteWorkflow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.lists() });
      toast.success('Workflow deleted');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to delete workflow')),
  });
}

// ── Instances ────────────────────────────────────────────────────────

/** POST /api/workflows/instances (WORKFLOW_START). */
export function useStartWorkflowInstance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: WorkflowStartPayload) => workflowApi.startWorkflowInstance(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.instances() });
      toast.success('Workflow started');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to start workflow')),
  });
}

/**
 * DELETE /api/workflows/instances/[id] (WORKFLOW_CANCEL). Takes the
 * instance id as part of the mutation variables (rather than a hook
 * argument, as useChangeWorkOrderStatus does in the workorders module)
 * so a single hook instance can serve every row of a table -- binding
 * to a hook-argument id would go stale between the id being chosen and
 * the mutation firing, since state updates aren't visible until the
 * next render.
 */
export function useCancelWorkflowInstance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      workflowApi.cancelWorkflowInstance(id, reason),
    onSuccess: (_result, { id }) => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.instanceDetail(id) });
      queryClient.invalidateQueries({ queryKey: workflowKeys.instances() });
      queryClient.invalidateQueries({ queryKey: workflowKeys.myTasks() });
      toast.success('Workflow cancelled');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to cancel workflow')),
  });
}

/** POST .../approve (WORKFLOW_APPROVE). instanceId/stepId are supplied per-call so one hook instance can serve a whole task list. */
export function useApproveWorkflowStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      instanceId,
      stepId,
      payload,
    }: {
      instanceId: string;
      stepId: string;
      payload?: WorkflowApprovePayload;
    }) => workflowApi.approveWorkflowStep(instanceId, stepId, payload),
    onSuccess: (instance) => {
      queryClient.setQueryData(workflowKeys.instanceDetail(instance._id ?? ''), instance);
      queryClient.invalidateQueries({ queryKey: workflowKeys.instances() });
      queryClient.invalidateQueries({ queryKey: workflowKeys.myTasks() });
      toast.success('Step approved');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to approve step')),
  });
}

/** POST .../reject (WORKFLOW_REJECT). reason is required by the backend schema. */
export function useRejectWorkflowStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      instanceId,
      stepId,
      payload,
    }: {
      instanceId: string;
      stepId: string;
      payload: WorkflowRejectPayload;
    }) => workflowApi.rejectWorkflowStep(instanceId, stepId, payload),
    onSuccess: (instance) => {
      queryClient.setQueryData(workflowKeys.instanceDetail(instance._id ?? ''), instance);
      queryClient.invalidateQueries({ queryKey: workflowKeys.instances() });
      queryClient.invalidateQueries({ queryKey: workflowKeys.myTasks() });
      toast.success('Step rejected');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to reject step')),
  });
}
