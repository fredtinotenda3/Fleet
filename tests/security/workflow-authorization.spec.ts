// tests/security/workflow-authorization.spec.ts
//
// PHASE 0, F-4 regression suite.
//
// THE VULNERABILITY, in three independent parts:
//
//   1. workflowEngine.isAuthorizedForStep ended in a bare `return true`
//      for any step without an explicit assignee array, deferring to
//      "the API layer / permission middleware" that did not exist.
//   2. rejectStep called isAuthorizedForStep NOWHERE, and
//      cancelInstance had no authorization of any kind.
//   3. No WORKFLOW_* permission existed, and every route was wrapped in
//      withSession() -- authenticated only.
//
// Net effect: any authenticated user in the tenant -- a driver, a
// viewer -- could approve, reject or cancel any workflow, and create or
// delete workflow definitions.
//
// The engine is tested through its real repository seam (mocked), not
// through HTTP, because the step decision is a DOMAIN property: a future
// caller that is not a route (a rule action, a worker) must hit the same
// wall. Route-level permissions are asserted structurally alongside.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

/**
 * Source with comments removed.
 *
 * Several files here deliberately DESCRIBE the vulnerability they fixed
 * -- naming `withSession`, `cancelInstance`, the old fail-open idiom --
 * because that explanation is the most valuable thing in the file for
 * the next reader. An assertion that cannot tell code from prose would
 * force those explanations to be deleted to keep the suite green, which
 * is exactly the wrong trade.
 */
function codeOf(rel: string): string {
  return fs
    .readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const mockRepo = {
  getWorkflow: jest.fn(),
  getInstance: jest.fn(),
  advanceStep: jest.fn(),
  updateInstanceStatus: jest.fn(),
  createInstance: jest.fn(),
  getPendingInstances: jest.fn(),
};

jest.mock('@/modules/workflows/repositories/workflow.repository', () => ({
  workflowRepository: mockRepo,
}));
jest.mock('@/modules/notifications/services/notification.service', () => ({
  notificationService: {
    sendNotification: jest.fn(),
    sendBulkNotification: jest.fn(),
  },
}));
jest.mock('@/infrastructure/monitoring/audit.logger', () => ({
  auditLog: { log: jest.fn() },
}));

import { workflowEngine } from '@/modules/workflows/services/workflow-engine.service';
import { Permission, rolePermissions, Role } from '@/server/permissions/roles';

const TENANT = 'tenant-a';

function workflowWith(step: Record<string, unknown>, config?: Record<string, unknown>) {
  return {
    _id: 'wf-1',
    name: 'Purchase approval',
    steps: [{ id: 'step-1', name: 'Approve', type: 'approval', nextSteps: [], ...step }],
    config: config ?? {},
    tenantId: TENANT,
  };
}

function instanceWith(stepInstance: Record<string, unknown>, createdBy = 'originator') {
  return {
    _id: 'inst-1',
    workflowId: 'wf-1',
    entityId: 'entity-1',
    entityType: 'purchase_request',
    currentStepId: 'step-1',
    status: 'in_progress',
    steps: [{ stepId: 'step-1', status: 'pending', ...stepInstance }],
    metadata: {},
    createdBy,
    tenantId: TENANT,
  };
}

function arrange(workflow: unknown, instance: unknown) {
  mockRepo.getWorkflow.mockResolvedValue(workflow);
  mockRepo.getInstance.mockResolvedValue(instance);
  mockRepo.advanceStep.mockResolvedValue(instance);
  mockRepo.updateInstanceStatus.mockResolvedValue(instance);
}

async function expectForbidden(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({ statusCode: 403 });
}

describe('F-4: workflow step authorization (domain layer)', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('the `return true` fall-through is closed', () => {
    it('DENIES a step with neither an assignee list nor a role', async () => {
      // THE headline regression. Before Phase 0 this returned true and
      // any authenticated user could approve.
      arrange(workflowWith({}), instanceWith({}));

      await expectForbidden(
        workflowEngine.approveStep(
          'inst-1',
          'step-1',
          { userId: 'random-user', roles: [Role.DRIVER] },
          'lgtm',
          TENANT
        )
      );
    });

    it('DENIES a driver on a step assigned to fleet_manager', async () => {
      arrange(workflowWith({ role: Role.FLEET_MANAGER }), instanceWith({}));

      await expectForbidden(
        workflowEngine.approveStep(
          'inst-1',
          'step-1',
          { userId: 'driver-1', roles: [Role.DRIVER] },
          'lgtm',
          TENANT
        )
      );
    });
  });

  describe('explicit assignment', () => {
    it('ALLOWS the named assignee', async () => {
      arrange(workflowWith({ assignee: ['approver-1'] }), instanceWith({}));

      await expect(
        workflowEngine.approveStep(
          'inst-1',
          'step-1',
          { userId: 'approver-1', roles: [Role.SUPERVISOR] },
          'ok',
          TENANT
        )
      ).resolves.toBeDefined();
    });

    it('DENIES a different user, even one holding WORKFLOW_APPROVE', async () => {
      // Permission answers "may this role approve steps at all"; it can
      // never answer "is this the right person for THIS step".
      arrange(workflowWith({ assignee: ['approver-1'] }), instanceWith({}));

      await expectForbidden(
        workflowEngine.approveStep(
          'inst-1',
          'step-1',
          { userId: 'approver-2', roles: [Role.BRANCH_MANAGER] },
          'ok',
          TENANT
        )
      );
    });

    it('prefers the INSTANCE assignee list over the definition', async () => {
      // The definition may have been edited after this instance started.
      // An in-flight approval must not change hands because somebody
      // rewrote the template.
      arrange(
        workflowWith({ assignee: ['definition-user'] }),
        instanceWith({ assignedTo: ['instance-user'] })
      );

      await expectForbidden(
        workflowEngine.approveStep(
          'inst-1',
          'step-1',
          { userId: 'definition-user', roles: [] },
          'ok',
          TENANT
        )
      );

      await expect(
        workflowEngine.approveStep(
          'inst-1',
          'step-1',
          { userId: 'instance-user', roles: [] },
          'ok',
          TENANT
        )
      ).resolves.toBeDefined();
    });
  });

  describe('role-based assignment', () => {
    it('ALLOWS an actor holding the named role', async () => {
      arrange(workflowWith({ role: Role.FLEET_MANAGER }), instanceWith({}));

      await expect(
        workflowEngine.approveStep(
          'inst-1',
          'step-1',
          { userId: 'fm-1', roles: [Role.FLEET_MANAGER] },
          'ok',
          TENANT
        )
      ).resolves.toBeDefined();
    });

    it('matches the role case-insensitively', async () => {
      // step.role is free text from the workflow builder; actor roles
      // come from the Role enum. A step naming "Fleet_Manager" means
      // Role.FLEET_MANAGER and should not fail on capitalisation.
      arrange(workflowWith({ role: 'Fleet_Manager' }), instanceWith({}));

      await expect(
        workflowEngine.approveStep(
          'inst-1',
          'step-1',
          { userId: 'fm-1', roles: [Role.FLEET_MANAGER] },
          'ok',
          TENANT
        )
      ).resolves.toBeDefined();
    });

    it('ALLOWS an organization owner on any role-assigned step', async () => {
      arrange(workflowWith({ role: Role.WORKSHOP_MANAGER }), instanceWith({}));

      await expect(
        workflowEngine.approveStep(
          'inst-1',
          'step-1',
          { userId: 'owner-1', roles: [Role.ORGANIZATION_OWNER] },
          'ok',
          TENANT
        )
      ).resolves.toBeDefined();
    });

    it('DENIES an actor with no roles at all', async () => {
      arrange(workflowWith({ role: Role.FLEET_MANAGER }), instanceWith({}));

      await expectForbidden(
        workflowEngine.approveStep(
          'inst-1',
          'step-1',
          { userId: 'nobody', roles: [] },
          'ok',
          TENANT
        )
      );
    });
  });

  describe('self-approval', () => {
    it('DENIES the instance originator when allowSelfApproval is false', async () => {
      // The old predicate was inverted -- `assignedTo?.includes(userId)
      // === false` is true when the actor is NOT an assignee -- so it
      // blocked exactly the wrong population and let the creator
      // through.
      arrange(
        workflowWith({ assignee: ['originator'] }, { allowSelfApproval: false }),
        instanceWith({}, 'originator')
      );

      await expectForbidden(
        workflowEngine.approveStep(
          'inst-1',
          'step-1',
          { userId: 'originator', roles: [Role.BRANCH_MANAGER] },
          'ok',
          TENANT
        )
      );
    });

    it('ALLOWS the originator when allowSelfApproval is not disabled', async () => {
      arrange(workflowWith({ assignee: ['originator'] }), instanceWith({}, 'originator'));

      await expect(
        workflowEngine.approveStep(
          'inst-1',
          'step-1',
          { userId: 'originator', roles: [] },
          'ok',
          TENANT
        )
      ).resolves.toBeDefined();
    });
  });

  describe('rejectStep had NO authorization check at all', () => {
    it('DENIES an unauthorized rejecter', async () => {
      arrange(workflowWith({ assignee: ['approver-1'] }), instanceWith({}));

      await expectForbidden(
        workflowEngine.rejectStep(
          'inst-1',
          'step-1',
          { userId: 'saboteur', roles: [Role.DRIVER] },
          'because I said so',
          TENANT
        )
      );
    });

    it('DENIES rejection on an unassigned, role-less step', async () => {
      arrange(workflowWith({}), instanceWith({}));

      await expectForbidden(
        workflowEngine.rejectStep(
          'inst-1',
          'step-1',
          { userId: 'anyone', roles: [Role.VIEWER] },
          'no reason given at all',
          TENANT
        )
      );
    });

    it('ALLOWS the assigned approver to reject', async () => {
      arrange(workflowWith({ assignee: ['approver-1'] }), instanceWith({}));

      await expect(
        workflowEngine.rejectStep(
          'inst-1',
          'step-1',
          { userId: 'approver-1', roles: [] },
          'insufficient justification',
          TENANT
        )
      ).resolves.toBeDefined();
    });
  });

  describe('cancelInstance had NO authorization check at all', () => {
    it('DENIES a random authenticated user', async () => {
      arrange(workflowWith({}), instanceWith({}, 'originator'));

      await expectForbidden(
        workflowEngine.cancelInstance(
          'inst-1',
          { userId: 'random-user', roles: [Role.DRIVER] },
          TENANT
        )
      );
    });

    it('DENIES a branch manager who merely holds WORKFLOW_CANCEL', async () => {
      // The route permission is necessary but not sufficient: a branch
      // manager must not kill another branch's in-flight approval.
      arrange(workflowWith({}), instanceWith({}, 'originator'));

      await expectForbidden(
        workflowEngine.cancelInstance(
          'inst-1',
          { userId: 'bm-1', roles: [Role.BRANCH_MANAGER] },
          TENANT
        )
      );
    });

    it('ALLOWS the originator', async () => {
      arrange(workflowWith({}), instanceWith({}, 'originator'));

      await expect(
        workflowEngine.cancelInstance(
          'inst-1',
          { userId: 'originator', roles: [] },
          TENANT
        )
      ).resolves.toBeUndefined();
    });

    it('ALLOWS an organization owner', async () => {
      arrange(workflowWith({}), instanceWith({}, 'originator'));

      await expect(
        workflowEngine.cancelInstance(
          'inst-1',
          { userId: 'owner-1', roles: [Role.ORGANIZATION_OWNER] },
          TENANT
        )
      ).resolves.toBeUndefined();
    });
  });

  describe('cross-tenant', () => {
    it('cannot reach an instance in another tenant', async () => {
      // The repository is tenant-scoped, so a foreign id resolves to
      // nothing and the engine 404s before any authorization decision.
      mockRepo.getInstance.mockResolvedValue(null);

      await expect(
        workflowEngine.approveStep(
          'inst-in-tenant-b',
          'step-1',
          { userId: 'owner-1', roles: [Role.ORGANIZATION_OWNER] },
          'ok',
          TENANT
        )
      ).rejects.toMatchObject({ statusCode: 404 });

      expect(mockRepo.getInstance).toHaveBeenCalledWith('inst-in-tenant-b', TENANT);
    });
  });
});

describe('F-4: the permission model exists and is correctly distributed', () => {
  it('defines every workflow permission', () => {
    expect(Permission.WORKFLOW_VIEW).toBeDefined();
    expect(Permission.WORKFLOW_MANAGE).toBeDefined();
    expect(Permission.WORKFLOW_START).toBeDefined();
    expect(Permission.WORKFLOW_APPROVE).toBeDefined();
    expect(Permission.WORKFLOW_REJECT).toBeDefined();
    expect(Permission.WORKFLOW_CANCEL).toBeDefined();
  });

  it('does NOT grant WORKFLOW_MANAGE below organization level', () => {
    // Authoring a definition is organization-wide approval policy. A
    // manager who can approve within their own scope must not be able
    // to rewrite the chain that governs everyone.
    const belowOrgLevel = [
      Role.BRANCH_MANAGER,
      Role.DEPARTMENT_MANAGER,
      Role.FLEET_MANAGER,
      Role.WORKSHOP_MANAGER,
      Role.SUPERVISOR,
      Role.ACCOUNTANT,
      Role.DISPATCHER,
      Role.DRIVER,
      Role.MECHANIC,
      Role.AUDITOR,
      Role.VIEWER,
    ];

    for (const role of belowOrgLevel) {
      expect(rolePermissions[role]).not.toContain(Permission.WORKFLOW_MANAGE);
    }
  });

  it('does NOT grant any workflow action permission to DRIVER or MECHANIC', () => {
    for (const role of [Role.DRIVER, Role.MECHANIC]) {
      const perms = rolePermissions[role];
      expect(perms).not.toContain(Permission.WORKFLOW_APPROVE);
      expect(perms).not.toContain(Permission.WORKFLOW_REJECT);
      expect(perms).not.toContain(Permission.WORKFLOW_CANCEL);
      expect(perms).not.toContain(Permission.WORKFLOW_START);
    }
  });

  it('grants read-only roles WORKFLOW_VIEW but no action permission', () => {
    for (const role of [Role.AUDITOR, Role.VIEWER]) {
      const perms = rolePermissions[role];
      expect(perms).toContain(Permission.WORKFLOW_VIEW);
      expect(perms).not.toContain(Permission.WORKFLOW_APPROVE);
      expect(perms).not.toContain(Permission.WORKFLOW_MANAGE);
    }
  });
});

describe('F-4: every workflow route enforces a permission', () => {
  const EXPECTATIONS: Array<[string, string[]]> = [
    ['app/api/workflows/route.ts', ['WORKFLOW_VIEW', 'WORKFLOW_MANAGE']],
    ['app/api/workflows/[id]/route.ts', ['WORKFLOW_VIEW', 'WORKFLOW_MANAGE']],
    ['app/api/workflows/instances/route.ts', ['WORKFLOW_VIEW', 'WORKFLOW_START']],
    ['app/api/workflows/instances/[id]/route.ts', ['WORKFLOW_VIEW', 'WORKFLOW_CANCEL']],
    [
      'app/api/workflows/instances/[id]/steps/[stepId]/approve/route.ts',
      ['WORKFLOW_APPROVE'],
    ],
    [
      'app/api/workflows/instances/[id]/steps/[stepId]/reject/route.ts',
      ['WORKFLOW_REJECT'],
    ],
    ['app/api/workflows/instances/my-tasks/route.ts', ['WORKFLOW_VIEW']],
    ['app/api/workflows/metrics/route.ts', ['WORKFLOW_VIEW']],
  ];

  it.each(EXPECTATIONS)('%s requires %s', (rel, permissions) => {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const p of permissions) {
      expect(src).toContain(`Permission.${p}`);
    }
  });

  it('no workflow route relies on withSession() alone', () => {
    // withSession proves only that SOMEONE is logged in. That was the
    // whole of the API-layer protection before Phase 0.
    const dir = path.join(ROOT, 'app/api/workflows');
    const offenders: string[] = [];

    const walk = (d: string) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === 'route.ts') {
          const src = codeOf(path.relative(ROOT, full));
          if (src.includes('withSession')) offenders.push(path.relative(ROOT, full));
        }
      }
    };
    walk(dir);

    expect(offenders).toEqual([]);
  });

  it('approve and reject have real, distinct routes', () => {
    // Regression for the routing defect found during remediation: the
    // steps/[stepId] route contained a mis-pasted copy of the instance
    // route, so approve/reject had NO route and instance cancellation
    // was reachable at a path whose [stepId] segment was ignored.
    const approve = path.join(
      ROOT,
      'app/api/workflows/instances/[id]/steps/[stepId]/approve/route.ts'
    );
    const reject = path.join(
      ROOT,
      'app/api/workflows/instances/[id]/steps/[stepId]/reject/route.ts'
    );

    expect(fs.existsSync(approve)).toBe(true);
    expect(fs.existsSync(reject)).toBe(true);
    expect(fs.readFileSync(approve, 'utf8')).toContain('approveStep');
    expect(fs.readFileSync(reject, 'utf8')).toContain('rejectStep');

    // And the old mis-routed handlers are gone.
    const stale = codeOf('app/api/workflows/instances/[id]/steps/[stepId]/route.ts');
    expect(stale).not.toContain('cancelInstance');
    expect(stale).not.toContain('workflowController');
  });
});

describe('F-4: the observability decorator preserves the actor', () => {
  it('passes a WorkflowActor through rather than narrowing to a userId', () => {
    // Controllers import observableWorkflowEngine, NOT the engine. A
    // decorator that took a bare userId would silently disarm the
    // role-assigned-step check for every HTTP caller.
    const src = fs.readFileSync(
      path.join(ROOT, 'infrastructure/observability/workflow-observer.ts'),
      'utf8'
    );
    expect(src).toContain('WorkflowActor');
    expect(src).toContain('actor');
    expect(src).not.toMatch(/approveStep\([^)]*userId: string/s);
  });
});
