// frontend/modules/workflows/services/workflow.api.ts
//
// Path-based REST wrapper matching the actual route contract exposed by
// app/api/workflows/**:
//
//   GET/POST   /api/workflows
//   GET/PUT/DELETE /api/workflows/[id]
//   GET        /api/workflows/metrics
//   GET/POST   /api/workflows/instances            (GET requires entityId + entityType)
//   GET/DELETE /api/workflows/instances/[id]
//   POST       /api/workflows/instances/[id]/steps/[stepId]/approve
//   POST       /api/workflows/instances/[id]/steps/[stepId]/reject
//   GET        /api/workflows/instances/my-tasks
//
// Every workflow API route is wrapped in withAuth(...) server-side (see
// app/api/workflows/route.ts and its siblings), so tenant scoping and
// permission checks are enforced entirely on the server from the
// session -- this client never sends or needs a tenantId itself.
//
// listInstances intentionally requires { entityId, entityType }: the
// backend route it calls (workflowController.getInstancesForEntity)
// throws a ValidationError without both, there is no general
// "list every instance in scope" endpoint wired up today (see the note
// in ../types/index.ts). Do not widen this to an optional-params list
// call -- it would just 400 against the real route.

import { apiClient } from '@/shared/utils/api-client.utils';
import type {
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowMetrics,
  WorkflowListParams,
  WorkflowInstanceListParams,
  WorkflowCreatePayload,
  WorkflowUpdatePayload,
  WorkflowStartPayload,
  WorkflowApprovePayload,
  WorkflowRejectPayload,
} from '../types';

const BASE = '/api/workflows';

export const workflowApi = {
  // ── Definitions ──────────────────────────────────────────────────────

  async listWorkflows(params: WorkflowListParams = {}): Promise<WorkflowDefinition[]> {
    return apiClient.get<WorkflowDefinition[]>(BASE, {
      params: { activeOnly: params.activeOnly },
    });
  },

  async getWorkflow(id: string): Promise<WorkflowDefinition> {
    return apiClient.get<WorkflowDefinition>(`${BASE}/${id}`);
  },

  async createWorkflow(payload: WorkflowCreatePayload): Promise<WorkflowDefinition> {
    return apiClient.post<WorkflowDefinition>(BASE, payload);
  },

  async updateWorkflow(id: string, payload: WorkflowUpdatePayload): Promise<WorkflowDefinition> {
    return apiClient.put<WorkflowDefinition>(`${BASE}/${id}`, payload);
  },

  async deleteWorkflow(id: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`${BASE}/${id}`);
  },

  async getWorkflowMetrics(days?: number): Promise<WorkflowMetrics> {
    return apiClient.get<WorkflowMetrics>(`${BASE}/metrics`, { params: { days } });
  },

  // ── Instances ────────────────────────────────────────────────────────

  /** GET /api/workflows/instances?entityId=&entityType= -- both params are required by the backend route. */
  async listWorkflowInstances(params: WorkflowInstanceListParams): Promise<WorkflowInstance[]> {
    return apiClient.get<WorkflowInstance[]>(`${BASE}/instances`, {
      params: { entityId: params.entityId, entityType: params.entityType },
    });
  },

  async startWorkflowInstance(payload: WorkflowStartPayload): Promise<WorkflowInstance> {
    return apiClient.post<WorkflowInstance>(`${BASE}/instances`, payload);
  },

  async getWorkflowInstance(id: string): Promise<WorkflowInstance> {
    return apiClient.get<WorkflowInstance>(`${BASE}/instances/${id}`);
  },

  async cancelWorkflowInstance(id: string, reason?: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`${BASE}/instances/${id}`, {
      body: reason ? JSON.stringify({ reason }) : undefined,
    });
  },

  async approveWorkflowStep(
    instanceId: string,
    stepId: string,
    payload: WorkflowApprovePayload = {}
  ): Promise<WorkflowInstance> {
    return apiClient.post<WorkflowInstance>(
      `${BASE}/instances/${instanceId}/steps/${stepId}/approve`,
      payload
    );
  },

  async rejectWorkflowStep(
    instanceId: string,
    stepId: string,
    payload: WorkflowRejectPayload
  ): Promise<WorkflowInstance> {
    return apiClient.post<WorkflowInstance>(
      `${BASE}/instances/${instanceId}/steps/${stepId}/reject`,
      payload
    );
  },

  async listMyWorkflowTasks(): Promise<WorkflowInstance[]> {
    return apiClient.get<WorkflowInstance[]>(`${BASE}/instances/my-tasks`);
  },
};

export default workflowApi;
