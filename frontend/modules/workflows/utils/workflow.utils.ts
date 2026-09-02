// frontend/modules/workflows/utils/workflow.utils.ts
//
// Pure functions only -- no React, no fetch. Kept separate from the
// components so this logic can be unit tested under tests/unit (Jest,
// testEnvironment: 'node', no jsdom/RTL wired up in this repo) without
// rendering anything. Same discipline as
// observability/utils/provider-health.utils.ts.

import { Permission, permissionService } from '@/server/permissions/roles';
import type {
  WorkflowStatus,
  WorkflowInstanceStatus,
  WorkflowStepInstanceStatus,
  WorkflowStepInstance,
} from '../types';

export interface StatusPresentation {
  badgeVariant: 'outline' | 'destructive' | 'secondary' | 'default';
  badgeClassName: string;
  dotClassName: string;
}

// ── Definition status ──────────────────────────────────────────────────

const WORKFLOW_STATUS_PRESENTATION: Record<WorkflowStatus, StatusPresentation> = {
  active: {
    badgeVariant: 'outline',
    badgeClassName: 'border-success text-success',
    dotClassName: 'bg-success',
  },
  draft: {
    badgeVariant: 'secondary',
    badgeClassName: '',
    dotClassName: 'bg-muted-foreground',
  },
  inactive: {
    badgeVariant: 'outline',
    badgeClassName: 'border-muted-foreground text-muted-foreground',
    dotClassName: 'bg-muted-foreground',
  },
};

/** Maps a workflow definition's status to how it should render. Falls back to the 'inactive' (neutral) presentation for an unrecognized value. */
export function workflowStatusPresentation(status: WorkflowStatus): StatusPresentation {
  return WORKFLOW_STATUS_PRESENTATION[status] ?? WORKFLOW_STATUS_PRESENTATION.inactive;
}

export function workflowStatusLabel(status: WorkflowStatus): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'draft':
      return 'Draft';
    case 'inactive':
    default:
      return 'Inactive';
  }
}

// ── Instance status ────────────────────────────────────────────────────

const INSTANCE_STATUS_PRESENTATION: Record<WorkflowInstanceStatus, StatusPresentation> = {
  pending: {
    badgeVariant: 'secondary',
    badgeClassName: '',
    dotClassName: 'bg-muted-foreground',
  },
  in_progress: {
    badgeVariant: 'outline',
    badgeClassName: 'border-warning text-warning',
    dotClassName: 'bg-warning',
  },
  approved: {
    badgeVariant: 'outline',
    badgeClassName: 'border-success text-success',
    dotClassName: 'bg-success',
  },
  rejected: {
    badgeVariant: 'destructive',
    badgeClassName: '',
    dotClassName: 'bg-destructive',
  },
  cancelled: {
    badgeVariant: 'outline',
    badgeClassName: 'border-muted-foreground text-muted-foreground',
    dotClassName: 'bg-muted-foreground',
  },
};

/** Maps a workflow instance's status to how it should render. Falls back to the neutral 'pending' presentation for an unrecognized value. */
export function instanceStatusPresentation(status: WorkflowInstanceStatus): StatusPresentation {
  return INSTANCE_STATUS_PRESENTATION[status] ?? INSTANCE_STATUS_PRESENTATION.pending;
}

export function instanceStatusLabel(status: WorkflowInstanceStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'in_progress':
      return 'In progress';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Pending';
  }
}

// ── Step status ─────────────────────────────────────────────────────────

const STEP_STATUS_PRESENTATION: Record<WorkflowStepInstanceStatus, StatusPresentation> = {
  pending: {
    badgeVariant: 'secondary',
    badgeClassName: '',
    dotClassName: 'bg-muted-foreground',
  },
  in_progress: {
    badgeVariant: 'outline',
    badgeClassName: 'border-warning text-warning',
    dotClassName: 'bg-warning',
  },
  approved: {
    badgeVariant: 'outline',
    badgeClassName: 'border-success text-success',
    dotClassName: 'bg-success',
  },
  rejected: {
    badgeVariant: 'destructive',
    badgeClassName: '',
    dotClassName: 'bg-destructive',
  },
  skipped: {
    badgeVariant: 'outline',
    badgeClassName: 'border-muted-foreground text-muted-foreground',
    dotClassName: 'bg-muted-foreground',
  },
};

/** Maps a step instance's status to how it should render. Falls back to the neutral 'pending' presentation for an unrecognized value. */
export function stepStatusPresentation(status: WorkflowStepInstanceStatus): StatusPresentation {
  return STEP_STATUS_PRESENTATION[status] ?? STEP_STATUS_PRESENTATION.pending;
}

export function stepStatusLabel(status: WorkflowStepInstanceStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'in_progress':
      return 'In progress';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'skipped':
      return 'Skipped';
    default:
      return 'Pending';
  }
}

// ── Dates ────────────────────────────────────────────────────────────

/**
 * Formats an ISO timestamp (or null/undefined) for display. Returns
 * '—' rather than an empty string or 'Invalid Date' so an absent or
 * unparseable date reads as "not applicable" rather than a rendering
 * bug.
 */
export function formatWorkflowDate(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// ── Permission gating ───────────────────────────────────────────────────

/**
 * Whether the given roles hold WORKFLOW_APPROVE. This is the role-level
 * gate only -- it answers "may this role decide workflow steps at
 * all", the same first gate the backend applies
 * (app/api/workflows/instances/[id]/steps/[stepId]/approve/route.ts).
 * The backend ALSO checks step-level assignee/role membership
 * (workflowEngine.isAuthorizedForStep) before actually approving; that
 * second check depends on data this module does not have client-side
 * (the full actor context) and is NOT re-derived here. A user who
 * passes this check can still get a 403 from the API if they are not
 * the right person for that specific step -- this function only
 * controls whether the approve control is offered at all.
 */
export function canApproveStep(roles: string[]): boolean {
  return permissionService.hasPermission(roles, Permission.WORKFLOW_APPROVE);
}

/** Same caveat as canApproveStep, for WORKFLOW_REJECT. */
export function canRejectStep(roles: string[]): boolean {
  return permissionService.hasPermission(roles, Permission.WORKFLOW_REJECT);
}

export function canManageWorkflows(roles: string[]): boolean {
  return permissionService.hasPermission(roles, Permission.WORKFLOW_MANAGE);
}

export function canStartWorkflow(roles: string[]): boolean {
  return permissionService.hasPermission(roles, Permission.WORKFLOW_START);
}

export function canCancelWorkflowInstance(roles: string[]): boolean {
  return permissionService.hasPermission(roles, Permission.WORKFLOW_CANCEL);
}

/**
 * Only a step that is actually pending/in_progress is a legitimate
 * approve/reject target -- an already-decided step (approved/rejected/
 * skipped) cannot be re-decided, regardless of the caller's
 * permissions. Combine with canApproveStep/canRejectStep, which gate
 * on permission only.
 */
export function isStepActionable(step: Pick<WorkflowStepInstance, 'status'>): boolean {
  return step.status === 'pending' || step.status === 'in_progress';
}

// ── Org-unit display ─────────────────────────────────────────────────

/**
 * Formats an instance's orgUnitId for a table cell. orgUnitId is
 * optional (see WorkflowInstance's comment in ../types/index.ts) --
 * this module has no org-unit lookup service wired in, so it
 * deliberately renders the raw id rather than inventing a label; a
 * consuming page can pass a resolved label map in later if one becomes
 * available.
 */
export function formatOrgUnit(orgUnitId: string | null | undefined): string {
  return orgUnitId ?? 'Organization-wide';
}
