// tests/unit/workflows/workflow-utils.spec.ts
//
// Pure-function tests for the Workflows module's formatting and
// permission-gating helpers. No React/jsdom involved -- this repo's
// jest.config.js runs under testEnvironment: 'node' with no React
// Testing Library wired up, so component rendering isn't exercised
// here (same discipline as tests/unit/observability/provider-health.utils.spec.ts).

import {
  workflowStatusPresentation,
  workflowStatusLabel,
  instanceStatusPresentation,
  instanceStatusLabel,
  stepStatusPresentation,
  stepStatusLabel,
  formatWorkflowDate,
  formatOrgUnit,
  canApproveStep,
  canRejectStep,
  canManageWorkflows,
  canStartWorkflow,
  canCancelWorkflowInstance,
  isStepActionable,
} from '@/frontend/modules/workflows/utils/workflow.utils';
import type {
  WorkflowStatus,
  WorkflowInstanceStatus,
  WorkflowStepInstanceStatus,
} from '@/frontend/modules/workflows/types';
import { Role } from '@/server/permissions/roles';

describe('workflow.utils', () => {
  describe('workflowStatusPresentation / workflowStatusLabel', () => {
    it('maps every known definition status to a distinct presentation', () => {
      const statuses: WorkflowStatus[] = ['active', 'inactive', 'draft'];
      const seen = new Set<string>();
      for (const status of statuses) {
        const presentation = workflowStatusPresentation(status);
        expect(presentation.badgeVariant).toBeTruthy();
        expect(presentation.dotClassName).toBeTruthy();
        seen.add(presentation.dotClassName + presentation.badgeVariant);
      }
      expect(seen.size).toBe(3);
    });

    it('falls back to the inactive presentation for an unrecognized value', () => {
      const presentation = workflowStatusPresentation('made-up' as WorkflowStatus);
      expect(presentation).toEqual(workflowStatusPresentation('inactive'));
    });

    it('produces human labels for each status', () => {
      expect(workflowStatusLabel('active')).toBe('Active');
      expect(workflowStatusLabel('draft')).toBe('Draft');
      expect(workflowStatusLabel('inactive')).toBe('Inactive');
    });
  });

  describe('instanceStatusPresentation / instanceStatusLabel', () => {
    it('maps every known instance status to a distinct presentation', () => {
      const statuses: WorkflowInstanceStatus[] = ['pending', 'in_progress', 'approved', 'rejected', 'cancelled'];
      const seen = new Set<string>();
      for (const status of statuses) {
        const presentation = instanceStatusPresentation(status);
        seen.add(presentation.dotClassName + presentation.badgeVariant);
      }
      expect(seen.size).toBe(5);
    });

    it('renders rejected as destructive', () => {
      expect(instanceStatusPresentation('rejected').badgeVariant).toBe('destructive');
    });

    it('renders approved as a positive outline, not destructive', () => {
      const presentation = instanceStatusPresentation('approved');
      expect(presentation.badgeVariant).not.toBe('destructive');
    });

    it('falls back to the pending presentation for an unrecognized value', () => {
      const presentation = instanceStatusPresentation('made-up' as WorkflowInstanceStatus);
      expect(presentation).toEqual(instanceStatusPresentation('pending'));
    });

    it('produces human labels for each status, including the in_progress special case', () => {
      expect(instanceStatusLabel('in_progress')).toBe('In progress');
      expect(instanceStatusLabel('pending')).toBe('Pending');
      expect(instanceStatusLabel('approved')).toBe('Approved');
      expect(instanceStatusLabel('rejected')).toBe('Rejected');
      expect(instanceStatusLabel('cancelled')).toBe('Cancelled');
    });
  });

  describe('stepStatusPresentation / stepStatusLabel', () => {
    it('maps every known step status to a distinct presentation', () => {
      const statuses: WorkflowStepInstanceStatus[] = ['pending', 'in_progress', 'approved', 'rejected', 'skipped'];
      const seen = new Set<string>();
      for (const status of statuses) {
        seen.add(JSON.stringify(stepStatusPresentation(status)));
      }
      expect(seen.size).toBe(5);
    });

    it('falls back to the pending presentation for an unrecognized value', () => {
      expect(stepStatusPresentation('made-up' as WorkflowStepInstanceStatus)).toEqual(
        stepStatusPresentation('pending')
      );
    });

    it('produces a human label for skipped', () => {
      expect(stepStatusLabel('skipped')).toBe('Skipped');
    });
  });

  describe('formatWorkflowDate', () => {
    it('returns an em dash for null, undefined, or an unparseable string', () => {
      expect(formatWorkflowDate(null)).toBe('—');
      expect(formatWorkflowDate(undefined)).toBe('—');
      expect(formatWorkflowDate('not-a-date')).toBe('—');
    });

    it('formats a valid ISO timestamp into a non-empty string', () => {
      const formatted = formatWorkflowDate('2026-01-15T10:30:00.000Z');
      expect(formatted).not.toBe('—');
      expect(formatted.length).toBeGreaterThan(0);
    });
  });

  describe('formatOrgUnit', () => {
    it('renders the raw org unit id when present', () => {
      expect(formatOrgUnit('org-unit-123')).toBe('org-unit-123');
    });

    it('falls back to a neutral label when absent', () => {
      expect(formatOrgUnit(null)).toBe('Organization-wide');
      expect(formatOrgUnit(undefined)).toBe('Organization-wide');
    });
  });

  describe('isStepActionable', () => {
    it('treats pending and in_progress as actionable', () => {
      expect(isStepActionable({ status: 'pending' })).toBe(true);
      expect(isStepActionable({ status: 'in_progress' })).toBe(true);
    });

    it('treats approved, rejected, and skipped as no longer actionable', () => {
      expect(isStepActionable({ status: 'approved' })).toBe(false);
      expect(isStepActionable({ status: 'rejected' })).toBe(false);
      expect(isStepActionable({ status: 'skipped' })).toBe(false);
    });
  });

  describe('permission gates', () => {
    // Role.ORGANIZATION_OWNER holds every non-platform-only permission
    // (rolePermissions[Role.ORGANIZATION_OWNER] in
    // server/permissions/roles.ts), so it's used here as a "has
    // everything" baseline. Role.BRANCH_MANAGER is explicitly granted
    // WORKFLOW_VIEW/START/APPROVE/REJECT/CANCEL but NOT WORKFLOW_MANAGE
    // (see that role's own comment in roles.ts: definitions are
    // organization-wide policy, kept out of branch-level reach), which
    // makes it a good case for asserting these gates don't just return
    // true for anyone.
    const owner = [Role.ORGANIZATION_OWNER];
    const branchManager = [Role.BRANCH_MANAGER];
    const noRoles: string[] = [];

    it('canManageWorkflows is true for a role with WORKFLOW_MANAGE and false otherwise', () => {
      expect(canManageWorkflows(owner)).toBe(true);
      expect(canManageWorkflows(branchManager)).toBe(false);
      expect(canManageWorkflows(noRoles)).toBe(false);
    });

    it('canApproveStep is true for a role with WORKFLOW_APPROVE', () => {
      expect(canApproveStep(owner)).toBe(true);
      expect(canApproveStep(branchManager)).toBe(true);
      expect(canApproveStep(noRoles)).toBe(false);
    });

    it('canRejectStep is true for a role with WORKFLOW_REJECT', () => {
      expect(canRejectStep(owner)).toBe(true);
      expect(canRejectStep(branchManager)).toBe(true);
      expect(canRejectStep(noRoles)).toBe(false);
    });

    it('canStartWorkflow is true for a role with WORKFLOW_START', () => {
      expect(canStartWorkflow(owner)).toBe(true);
      expect(canStartWorkflow(branchManager)).toBe(true);
      expect(canStartWorkflow(noRoles)).toBe(false);
    });

    it('canCancelWorkflowInstance is true for a role with WORKFLOW_CANCEL', () => {
      expect(canCancelWorkflowInstance(owner)).toBe(true);
      expect(canCancelWorkflowInstance(branchManager)).toBe(true);
      expect(canCancelWorkflowInstance(noRoles)).toBe(false);
    });

    it('never grants a permission to an empty role list', () => {
      expect(canManageWorkflows([])).toBe(false);
      expect(canApproveStep([])).toBe(false);
      expect(canRejectStep([])).toBe(false);
      expect(canStartWorkflow([])).toBe(false);
      expect(canCancelWorkflowInstance([])).toBe(false);
    });
  });
});
