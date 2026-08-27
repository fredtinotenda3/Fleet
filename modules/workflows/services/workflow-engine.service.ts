// modules/workflows/services/workflow-engine.service.ts

import { Workflow, WorkflowInstance, WorkflowStep, WorkflowStepInstance } from '../types/workflow.types';
import { workflowRepository } from '../repositories/workflow.repository';
import { notificationService } from '@/modules/notifications/services/notification.service';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { AppError, ConflictError, NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { Role } from '@/server/permissions/roles';
import { resolveInstanceOrgUnit, isInstanceInScope } from './workflow-ownership.resolver';

/**
 * PHASE 0, F-4: who is acting, as the engine sees them.
 *
 * The engine previously took only a bare `userId`, which is why it could
 * not evaluate a role-assigned step and fell through to `return true`.
 * Roles travel WITH the identity rather than being looked up here so the
 * engine stays free of a user-directory dependency, and so the caller's
 * already-authenticated context is the single source of truth about who
 * this is -- the same discipline getAuthContext() enforces everywhere
 * else.
 *
 * Passed as one object rather than two positional strings deliberately:
 * a `(userId: string, actorRoles: string[])` pair is easy to transpose
 * silently at a call site, and this is an authorization input.
 */
export interface WorkflowActor {
  userId: string;
  roles: string[];
  /**
   * PHASE 5, F-14 -- the actor's accessible org units.
   *
   * `null` means organization-wide visibility, the convention
   * TenantContext uses everywhere else. `[]` means scoped to nothing,
   * which correctly matches no instance.
   *
   * Optional so that a caller who genuinely has no org-unit context
   * (a background escalation sweep) can omit it -- but omitting is NOT
   * the same as `null`. See `scopeOf()`: an absent value is treated as
   * `[]`, i.e. scoped to nothing, so forgetting to pass scope DENIES
   * rather than grants. The old signature discarded scope entirely and
   * every caller was implicitly organization-wide; the fail-closed
   * default is what stops that regressing quietly.
   */
  accessibleOrgUnitIds?: string[] | null;
  /**
   * PHASE 5 -- permissions the actor holds.
   *
   * The engine checks these ITSELF rather than trusting that a route
   * wrapper already did. Phase 0 added the WORKFLOW_* permissions and
   * wired them at the API boundary; that leaves every non-HTTP caller
   * (a rule action, an event handler, a future service) ungated. A
   * permission enforced in exactly one layer is enforced only for
   * callers that go through that layer.
   */
  permissions?: string[];
}

/**
 * The actor's org-unit scope, failing closed on absence.
 *
 * `undefined` -> `[]` (nothing), NOT `null` (everything). This is the
 * single most important line in the file: before Phase 5 the engine
 * took a bare `tenantId` and every caller was implicitly org-wide, so a
 * partially-migrated caller that forgets to pass scope must lose
 * access, not gain it.
 */
/**
 * PHASE 5 -- the engine checks permission ITSELF.
 *
 * Phase 0 added the WORKFLOW_* permissions and enforced them at the API
 * boundary. That is necessary and not sufficient: a permission enforced
 * in exactly one layer is enforced only for callers that go through
 * that layer, and the rule engine's `start_workflow` action, the outbox
 * event handler and any future service all reach the engine directly.
 *
 * FAIL-CLOSED ON ABSENCE. An actor with no `permissions` array is
 * treated as holding nothing. The alternative -- treating absence as
 * "the caller already checked" -- is precisely the assumption that made
 * `isAuthorizedForStep` fall through to `return true` before Phase 0.
 *
 * NOT a replacement for isAuthorizedForStep. This answers "may this
 * role decide workflow steps at all"; that answers "is this the right
 * person for THIS step". Both run.
 */
const PERMISSION_FOR_OPERATION = {
  approve: 'workflow:approve',
  reject: 'workflow:reject',
  cancel: 'workflow:cancel',
} as const;

function assertPermission(
  actor: WorkflowActor,
  permission: string,
  operation: string
): void {
  const held = actor.permissions ?? [];
  if (!held.includes(permission)) {
    throw new AppError(
      `Missing permission '${permission}' for ${operation}.`,
      'FORBIDDEN',
      403
    );
  }
}

function scopeOf(actor: WorkflowActor): string[] | null {
  return actor.accessibleOrgUnitIds === null ? null : actor.accessibleOrgUnitIds ?? [];
}

/**
 * Organization-wide administrators satisfy any role-assigned step.
 *
 * Kept as an explicit list rather than a permission check because the
 * question here is role MEMBERSHIP ("is this actor a fleet_manager"),
 * not capability -- and every one of these three holds every permission
 * by construction in rolePermissions, so a permission-based test would
 * return true for a role-assigned step regardless of which role the step
 * named, defeating the point of naming one.
 */
const WORKFLOW_ADMIN_ROLES: string[] = [
  Role.SUPER_ADMIN,
  Role.ORGANIZATION_OWNER,
  Role.ORGANIZATION_ADMIN,
];

/**
 * Whether the actor holds the role a step requires.
 *
 * Compared case-insensitively after trimming, because step.role is
 * free text authored in the workflow builder while actor roles come
 * from the Role enum -- a step naming "Fleet_Manager" is describing
 * Role.FLEET_MANAGER and should not fail on capitalisation. No other
 * normalisation: this is an equality test, not a fuzzy match.
 */
function actorHoldsWorkflowRole(actorRoles: string[], requiredRole: string): boolean {
  const required = requiredRole.trim().toLowerCase();
  if (!required) return false;

  const held = actorRoles.map((r) => String(r).trim().toLowerCase());
  if (held.includes(required)) return true;

  return WORKFLOW_ADMIN_ROLES.some((adminRole) => held.includes(adminRole.toLowerCase()));
}

export class WorkflowEngine {
  /**
   * PHASE 5 -- starts an instance, once.
   *
   * `idempotencyKey` is the fix for the Phase 3 finding that
   * WorkflowTriggerHandler is non-idempotent under at-least-once
   * delivery. When supplied, an existing instance with that key is
   * RETURNED rather than a second one created -- so a redelivered event
   * finds the approval its first delivery already started.
   *
   * Two layers, because the fast path alone is not correct under
   * concurrency:
   *   1. a read on {tenantId, idempotencyKey}, which handles the common
   *      case cheaply;
   *   2. a partial UNIQUE INDEX, which handles two handlers racing past
   *      the read simultaneously. The duplicate-key error is caught
   *      below and resolved by re-reading -- the loser of the race gets
   *      the winner's instance, which is exactly right.
   *
   * Omitting the key (a human clicking start) is deliberate: a person
   * may legitimately raise two approvals for the same entity, and
   * silently suppressing the second would look like a broken button.
   */
  async startWorkflow(
    workflowId: string,
    entityId: string,
    entityType: string,
    userId: string,
    tenantId: string,
    idempotencyKey?: string | null
  ): Promise<WorkflowInstance> {
    if (idempotencyKey) {
      const existing = await workflowRepository.findInstanceByIdempotencyKey(
        idempotencyKey,
        tenantId
      );
      if (existing) return existing;
    }

    const workflow = await workflowRepository.getWorkflow(workflowId, tenantId);
    if (!workflow) {
      throw new NotFoundError('Workflow not found');
    }
    if (workflow.status !== 'active') {
      throw new AppError('Workflow is not active', 'WORKFLOW_INACTIVE', 400);
    }
    if (workflow.steps.length === 0) {
      throw new ValidationError('Workflow has no steps defined');
    }

    const firstStep = workflow.steps[0];

    /**
     * PHASE 5, F-14 -- ownership from the TARGET ENTITY, not the caller.
     *
     * A workflow instance is frequently started by a background handler
     * with no acting user and no active org unit, so the caller's
     * context is not merely the wrong source -- it is often absent.
     * The expense/work order/vehicle this workflow is about already
     * carries the correct unit, inherited from its own vehicle at write
     * time. Unresolvable returns null, which makes the instance visible
     * only to organization-wide callers rather than to everyone.
     */
    const orgUnitId = await resolveInstanceOrgUnit(entityType, entityId, tenantId);

    const instance: Omit<WorkflowInstance, '_id' | 'createdAt' | 'updatedAt'> = {
      tenantId,
      ...(orgUnitId ? { orgUnitId } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
      workflowId,
      entityId,
      entityType,
      currentStepId: firstStep.id,
      status: 'in_progress',
      steps: workflow.steps.map((step) => ({
        stepId: step.id,
        status: 'pending',
        assignedTo: step.assignee,
        ...(step.id === firstStep.id ? { startedAt: new Date() } : {}),
      })),
      metadata: {},
      createdBy: userId,
      isDeleted: false,
    };

    let created: WorkflowInstance;
    try {
      created = await workflowRepository.createInstance(instance, tenantId, userId);
    } catch (error) {
      // 11000 = duplicate key on the idempotency index: another handler
      // won the race between our read above and this write. Re-read and
      // return THEIR instance -- the whole point is that exactly one
      // exists, not that we created it.
      if ((error as { code?: number }).code === 11000 && idempotencyKey) {
        const existing = await workflowRepository.findInstanceByIdempotencyKey(
          idempotencyKey,
          tenantId
        );
        if (existing) return existing;
      }
      throw error;
    }

    await this.notifyStepAssignees(created._id!, firstStep, tenantId);

    await auditLog.log({
      action: 'WORKFLOW_STARTED',
      userId,
      tenantId,
      entityType: 'workflow_instance',
      entityId: created._id,
      metadata: { workflowId, entityId, entityType },
    });

    return created;
  }

  async approveStep(
    instanceId: string,
    stepId: string,
    actor: WorkflowActor,
    comment: string,
    tenantId: string
  ): Promise<WorkflowInstance> {
    assertPermission(actor, PERMISSION_FOR_OPERATION.approve, 'approveStep');

    const instance = await workflowRepository.getInstance(instanceId, tenantId);
    if (!instance) {
      throw new NotFoundError('Workflow instance not found');
    }

    /**
     * PHASE 5, F-14 -- ORG-UNIT SCOPE, enforced in the ENGINE.
     *
     * Before Phase 5 every method here took a bare `tenantId`, so the
     * caller's accessible org units were discarded at the door: a
     * Bulawayo manager holding WORKFLOW_APPROVE was indistinguishable
     * from a Harare one at the permission layer, and could approve or
     * cancel the other branch's requests.
     *
     * Checked here rather than only at the route because a permission
     * enforced in one layer is enforced only for callers that go
     * through that layer -- and rule actions, event handlers and future
     * services do not.
     *
     * 404, never 403: a 403 would confirm the instance EXISTS, which
     * tells a caller probing ids something real about another branch's
     * operations. Same reasoning as assertVehicleInScope (Phase 0).
     */
    if (!isInstanceInScope(instance.orgUnitId, scopeOf(actor))) {
      throw new NotFoundError('Workflow instance not found');
    }
    if (instance.status !== 'pending' && instance.status !== 'in_progress') {
      throw new ConflictError(`Workflow instance is already ${instance.status}`);
    }
    if (instance.currentStepId !== stepId) {
      throw new ConflictError('This step is not the current active step for this workflow');
    }

    const workflow = await workflowRepository.getWorkflow(instance.workflowId, tenantId);
    if (!workflow) {
      throw new NotFoundError('Workflow definition not found');
    }

    const step = workflow.steps.find((s) => s.id === stepId);
    if (!step) {
      throw new NotFoundError('Step definition not found');
    }

    const stepInstance = instance.steps.find((s) => s.stepId === stepId);
    if (!stepInstance) {
      throw new NotFoundError('Step instance not found');
    }
    if (stepInstance.status === 'approved') {
      throw new ConflictError('This step has already been approved');
    }

    if (!this.isAuthorizedForStep(step, stepInstance, actor, workflow, instance)) {
      throw new AppError('You are not authorized to approve this step', 'FORBIDDEN', 403);
    }

    const updatedStepInstance: WorkflowStepInstance = {
      ...stepInstance,
      status: 'approved',
      approvedBy: actor.userId,
      approvedAt: new Date(),
      comments: comment,
      completedAt: new Date(),
    };

    // Parallel approval support: if the workflow requires all approvals
    // and this step has multiple assignees, check whether every assignee
    // still needs to sign off before actually advancing.
    const requiresAllApprovals = workflow.config?.requireAllApprovals;
    const remainingApprovers = requiresAllApprovals
      ? (step.assignee || []).filter((a) => a !== actor.userId)
      : [];

    const stepFullyApproved = remainingApprovers.length === 0;

    const nextStepId = stepFullyApproved ? (step.nextSteps[0] ?? null) : stepId;
    const nextStatus: WorkflowInstance['status'] = nextStepId ? 'in_progress' : 'approved';

    const result = await workflowRepository.advanceStep(
      instanceId,
      tenantId,
      instance.currentStepId,
      updatedStepInstance,
      stepFullyApproved ? nextStepId : null,
      stepFullyApproved ? nextStatus : instance.status
    );

    if (!result) {
      // The optimistic-concurrency guard tripped: another request already
      // advanced this instance past `instance.currentStepId` since we
      // read it. Surface this as a conflict rather than silently retrying,
      // since blindly retrying could double-apply a side effect like
      // notifying assignees twice.
      throw new ConflictError(
        'This workflow step was already processed by another request. Please refresh and try again.'
      );
    }

    // Stamp startedAt on the newly-current step so processTimeouts measures
    // from when it actually became active, not from instance creation.
    if (stepFullyApproved && nextStepId) {
      const nextStepInstance = result.steps.find((s) => s.stepId === nextStepId);
      if (nextStepInstance && !nextStepInstance.startedAt) {
        await workflowRepository.updateInstanceStep(
          instanceId,
          nextStepId,
          { ...nextStepInstance, startedAt: new Date() },
          tenantId
        );
      }
    }

    await auditLog.log({
      action: 'WORKFLOW_STEP_APPROVED',
      userId: actor.userId,
      tenantId,
      entityType: 'workflow_instance',
      entityId: instanceId,
      metadata: { stepId, comment, fullyApproved: stepFullyApproved },
    });

    if (stepFullyApproved) {
      if (nextStepId) {
        const nextStep = workflow.steps.find((s) => s.id === nextStepId);
        if (nextStep) {
          await this.notifyStepAssignees(instanceId, nextStep, tenantId);
        }
      } else {
        await notificationService.sendNotification(instance.createdBy, tenantId, {
          userId: instance.createdBy,
          type: 'system',
          title: 'Workflow Completed',
          message: `Workflow "${workflow.name}" has been completed`,
          priority: 'medium',
          data: { workflowId: workflow._id, entityId: instance.entityId },
          actionUrl: `/${instance.entityType}/${instance.entityId}`,
          actionLabel: 'View',
        });
      }
    }

    return result;
  }

  async rejectStep(
    instanceId: string,
    stepId: string,
    actor: WorkflowActor,
    reason: string,
    tenantId: string
  ): Promise<WorkflowInstance> {
    assertPermission(actor, PERMISSION_FOR_OPERATION.reject, 'rejectStep');

    const instance = await workflowRepository.getInstance(instanceId, tenantId);
    if (!instance) {
      throw new NotFoundError('Workflow instance not found');
    }

    /**
     * PHASE 5, F-14 -- ORG-UNIT SCOPE, enforced in the ENGINE.
     *
     * Before Phase 5 every method here took a bare `tenantId`, so the
     * caller's accessible org units were discarded at the door: a
     * Bulawayo manager holding WORKFLOW_APPROVE was indistinguishable
     * from a Harare one at the permission layer, and could approve or
     * cancel the other branch's requests.
     *
     * Checked here rather than only at the route because a permission
     * enforced in one layer is enforced only for callers that go
     * through that layer -- and rule actions, event handlers and future
     * services do not.
     *
     * 404, never 403: a 403 would confirm the instance EXISTS, which
     * tells a caller probing ids something real about another branch's
     * operations. Same reasoning as assertVehicleInScope (Phase 0).
     */
    if (!isInstanceInScope(instance.orgUnitId, scopeOf(actor))) {
      throw new NotFoundError('Workflow instance not found');
    }
    if (instance.status !== 'pending' && instance.status !== 'in_progress') {
      throw new ConflictError(`Workflow instance is already ${instance.status}`);
    }
    if (instance.currentStepId !== stepId) {
      throw new ConflictError('This step is not the current active step for this workflow');
    }

    const stepInstance = instance.steps.find((s) => s.stepId === stepId);
    if (!stepInstance) {
      throw new NotFoundError('Step instance not found');
    }

    /**
     * PHASE 0, F-4 -- SECOND, INDEPENDENT HOLE.
     *
     * rejectStep called isAuthorizedForStep NOWHERE. approveStep at
     * least attempted a check (which then fell through to `return
     * true`); reject had no authorization of any kind, so any
     * authenticated caller could terminate any in-flight approval in
     * the tenant -- killing a purchase request, a compliance sign-off,
     * or a maintenance authorisation raised by someone else. Rejection
     * is not the "safe" direction of an approval gate: it is a denial
     * of service against the business process, and it writes a
     * permanent audited decision attributed to this actor.
     *
     * Gated identically to approve, deliberately -- the population
     * entitled to decide a step is the same population either way, and
     * two different answers to "whose step is this" is how an
     * inconsistency becomes an exploit.
     */
    const workflowDefinition = await workflowRepository.getWorkflow(instance.workflowId, tenantId);
    if (!workflowDefinition) {
      throw new NotFoundError('Workflow definition not found');
    }

    const stepDefinition = workflowDefinition.steps.find((s) => s.id === stepId);
    if (!stepDefinition) {
      throw new NotFoundError('Step definition not found');
    }

    if (
      !this.isAuthorizedForStep(stepDefinition, stepInstance, actor, workflowDefinition, instance)
    ) {
      throw new AppError('You are not authorized to reject this step', 'FORBIDDEN', 403);
    }

    const updatedStepInstance: WorkflowStepInstance = {
      ...stepInstance,
      status: 'rejected',
      comments: reason,
      completedAt: new Date(),
    };

    const result = await workflowRepository.advanceStep(
      instanceId,
      tenantId,
      instance.currentStepId,
      updatedStepInstance,
      null,
      'rejected'
    );

    if (!result) {
      throw new ConflictError(
        'This workflow step was already processed by another request. Please refresh and try again.'
      );
    }

    await auditLog.log({
      action: 'WORKFLOW_STEP_REJECTED',
      userId: actor.userId,
      tenantId,
      entityType: 'workflow_instance',
      entityId: instanceId,
      metadata: { stepId, reason },
    });

    await notificationService.sendNotification(instance.createdBy, tenantId, {
      userId: instance.createdBy,
      type: 'alert',
      title: 'Workflow Rejected',
      message: `Your request has been rejected: ${reason}`,
      priority: 'high',
      data: { workflowId: instance.workflowId, stepId, reason },
      actionUrl: `/${instance.entityType}/${instance.entityId}`,
      actionLabel: 'View',
    });

    return result;
  }

  /**
   * PHASE 0, F-4: cancellation previously had NO authorization check at
   * all -- any authenticated caller could terminate any in-flight
   * instance in the tenant.
   *
   * The rule is narrower than approve/reject on purpose. Cancelling is
   * not a step decision, so step assignment does not apply; it is
   * withdrawing the whole request. Two populations legitimately do
   * that: the person who raised it, and an organization-wide
   * administrator cleaning up. A branch manager who merely holds
   * WORKFLOW_CANCEL must not be able to kill another branch's
   * in-flight approval, which is why the route permission alone is not
   * the whole gate.
   */
  async cancelInstance(
    instanceId: string,
    actor: WorkflowActor,
    tenantId: string,
    reason?: string
  ): Promise<void> {
    assertPermission(actor, PERMISSION_FOR_OPERATION.cancel, 'cancelInstance');

    const instance = await workflowRepository.getInstance(instanceId, tenantId);
    if (!instance) {
      throw new NotFoundError('Workflow instance not found');
    }

    /**
     * PHASE 5, F-14 -- ORG-UNIT SCOPE, enforced in the ENGINE.
     *
     * Before Phase 5 every method here took a bare `tenantId`, so the
     * caller's accessible org units were discarded at the door: a
     * Bulawayo manager holding WORKFLOW_APPROVE was indistinguishable
     * from a Harare one at the permission layer, and could approve or
     * cancel the other branch's requests.
     *
     * Checked here rather than only at the route because a permission
     * enforced in one layer is enforced only for callers that go
     * through that layer -- and rule actions, event handlers and future
     * services do not.
     *
     * 404, never 403: a 403 would confirm the instance EXISTS, which
     * tells a caller probing ids something real about another branch's
     * operations. Same reasoning as assertVehicleInScope (Phase 0).
     */
    if (!isInstanceInScope(instance.orgUnitId, scopeOf(actor))) {
      throw new NotFoundError('Workflow instance not found');
    }
    if (instance.status === 'approved' || instance.status === 'rejected') {
      throw new ConflictError(`Cannot cancel a workflow that is already ${instance.status}`);
    }

    const isOriginator = instance.createdBy === actor.userId;
    const isAdministrator = actor.roles
      .map((r) => String(r).trim().toLowerCase())
      .some((r) => WORKFLOW_ADMIN_ROLES.some((admin) => admin.toLowerCase() === r));

    if (!isOriginator && !isAdministrator) {
      throw new AppError('You are not authorized to cancel this workflow', 'FORBIDDEN', 403);
    }

    await workflowRepository.updateInstanceStatus(instanceId, 'cancelled', tenantId);

    await auditLog.log({
      action: 'WORKFLOW_CANCELLED',
      userId: actor.userId,
      tenantId,
      entityType: 'workflow_instance',
      entityId: instanceId,
      metadata: { reason },
    });
  }

  /**
   * Scans for in-progress steps that have exceeded their `timeout` (hours)
   * and applies the configured escalation: notifies the configured
   * escalation timeout target (organization owner / fleet manager via
   * the createdBy chain) and marks the step escalated in metadata.
   * Intended to be called by a scheduled job (see Phase 1 Batch 8 scheduler).
   */
  async processTimeouts(tenantId: string): Promise<number> {
    const pending = await workflowRepository.getPendingInstances(tenantId, 500);
    let escalated = 0;

    for (const instance of pending) {
      const workflow = await workflowRepository.getWorkflow(instance.workflowId, tenantId);
      if (!workflow) continue;

      const step = workflow.steps.find((s) => s.id === instance.currentStepId);
      const stepInstance = instance.steps.find((s) => s.stepId === instance.currentStepId);
      if (!step?.timeout || !stepInstance || stepInstance.status !== 'pending') continue;

      const startedAt = stepInstance.startedAt ? new Date(stepInstance.startedAt) : new Date(instance.createdAt!);
      const elapsedHours = (Date.now() - startedAt.getTime()) / (1000 * 60 * 60);

      if (elapsedHours >= step.timeout && !instance.metadata?.escalated) {
        await workflowRepository.updateInstance(
          instance._id!,
          { metadata: { ...instance.metadata, escalated: true, escalatedAt: new Date() } },
          tenantId
        );

        await notificationService.sendNotification(instance.createdBy, tenantId, {
          userId: instance.createdBy,
          type: 'alert',
          title: 'Workflow Step Timed Out',
          message: `Step "${step.name}" in workflow "${workflow.name}" has exceeded its ${step.timeout}h timeout`,
          priority: 'high',
          data: { instanceId: instance._id, stepId: step.id },
          actionUrl: `/workflows/${instance._id}`,
          actionLabel: 'Review',
        });

        escalated++;
      }
    }

    return escalated;
  }

  /**
   * PHASE 0, F-4 -- the step-level authorization decision.
   *
   * WHAT THIS REPLACES, AND WHY IT WAS A PRIVILEGE ESCALATION
   * ---------------------------------------------------------
   * The previous implementation ended in a bare `return true` for any
   * step that had no explicit `assignee` array, with a comment saying
   * role resolution "happens at the API layer / permission middleware".
   * It did not: every workflow route was wrapped in withSession()
   * (authenticated only, no permission), and no WORKFLOW_* permission
   * existed in the Permission enum at all. So the deferral was to a
   * check that was never written, and the practical effect was that ANY
   * authenticated user in the tenant -- a driver, a viewer -- could
   * approve or reject any role-assigned step. Where a workflow gates
   * spend or compliance sign-off, that is unbounded escalation inside
   * the tenant.
   *
   * It also contained an inverted predicate:
   *
   *   const isSelfApproval = stepInstance.assignedTo?.includes(userId) === false;
   *
   * which is true when the actor is NOT among the resolved assignees --
   * the opposite of self-approval. With `allowSelfApproval: false` set,
   * that denied exactly the wrong population: it blocked non-assignees
   * (already blocked on the next line) and let the instance's own
   * creator through. Self-approval is now measured against
   * `instance.createdBy`, which is what the phrase actually means.
   *
   * THE MODEL
   * ---------
   * Three ordered cases, and the last one is the fix:
   *
   *   1. EXPLICIT ASSIGNMENT. If the step instance resolved a concrete
   *      assignee list (or the definition names one), the actor must be
   *      in it. `stepInstance.assignedTo` wins over `step.assignee`
   *      when present, because it is the list that was resolved when
   *      this instance actually started -- the definition may have been
   *      edited since, and an in-flight approval must not silently
   *      change hands because somebody rewrote the template.
   *
   *   2. ROLE ASSIGNMENT. If the step names a role, the actor must hold
   *      that role. Organization-wide administrators
   *      (SUPER_ADMIN / ORGANIZATION_OWNER / ORGANIZATION_ADMIN) also
   *      satisfy this, matching how every other authorization check in
   *      this codebase treats them -- they hold every permission by
   *      construction in rolePermissions.
   *
   *   3. NEITHER. DENY. A step with no assignee list and no role is a
   *      misconfigured approval gate, not an open one. Refusing is the
   *      fail-closed reading and it is consistent with the rest of the
   *      tenancy layer (see server/tenancy/tenant-scope.ts, which raises
   *      rather than widening a query when scope cannot be resolved).
   *      An operator who genuinely wants "anyone may approve" must say
   *      so by naming a role on the step.
   *
   * WHY THE ENGINE AND NOT ONLY THE ROUTE
   * The route now requires Permission.WORKFLOW_APPROVE, but a permission
   * answers "may this role approve steps at all", never "is this the
   * right person for THIS step". Only the engine holds the step, the
   * instance and the actor together, so only the engine can answer the
   * second question -- and it must keep answering it for callers that
   * do not arrive over HTTP (rule actions, workers, future services).
   */
  private isAuthorizedForStep(
    step: WorkflowStep,
    stepInstance: WorkflowStepInstance,
    actor: WorkflowActor,
    workflow: Workflow,
    instance: WorkflowInstance
  ): boolean {
    // Self-approval, measured correctly: the actor raised the thing they
    // are now signing off on. Checked BEFORE the assignment cases so an
    // explicitly-assigned creator is still blocked when the workflow
    // forbids it.
    if (workflow.config?.allowSelfApproval === false && instance.createdBy === actor.userId) {
      return false;
    }

    const explicitAssignees =
      stepInstance.assignedTo && stepInstance.assignedTo.length > 0
        ? stepInstance.assignedTo
        : step.assignee ?? [];

    if (explicitAssignees.length > 0) {
      return explicitAssignees.includes(actor.userId);
    }

    if (step.role) {
      return actorHoldsWorkflowRole(actor.roles, step.role);
    }

    // Case 3 -- fail closed.
    return false;
  }

  private async notifyStepAssignees(
    instanceId: string,
    step: WorkflowStep,
    tenantId: string
  ): Promise<void> {
    if (step.assignee && step.assignee.length > 0) {
      await notificationService.sendBulkNotification(step.assignee, tenantId, {
        type: 'alert',
        title: 'Action Required',
        message: `Your approval is required for "${step.name}"`,
        priority: 'high',
        data: { instanceId, stepId: step.id },
        actionUrl: `/workflows/${instanceId}`,
        actionLabel: 'Review',
      });
    }
    // step.role-based notification requires resolving role -> user IDs,
    // which depends on the organization member list; left to the caller
    // (controller layer) since the engine itself is tenant/org agnostic.
  }
}

export const workflowEngine = new WorkflowEngine();