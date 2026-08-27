// tests/security/workflow-org-unit-scope.spec.ts
//
// PHASE 5 -- automation scope, service-layer authorization, idempotency.
//
// THE DEFECTS:
//   F-14   Every WorkflowEngine method took a bare `tenantId`, so the
//          caller's accessible org units were discarded at the door. A
//          Bulawayo manager holding WORKFLOW_APPROVE was
//          indistinguishable from a Harare one at the permission layer.
//   N-4    WORKFLOW_* permissions were enforced only at the API
//          boundary, leaving every non-HTTP caller (rule action, event
//          handler) ungated.
//   P3-N1  `startWorkflow` had no dedupe key, so under Phase 3's
//          at-least-once delivery a redelivered event started a SECOND
//          approval instance for the same expense.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

const mockRepo = {
  getWorkflow: jest.fn(),
  getInstance: jest.fn(),
  createInstance: jest.fn(),
  findInstanceByIdempotencyKey: jest.fn(),
  advanceStep: jest.fn(),
  updateInstanceStatus: jest.fn(),
};

const mockResolveOrgUnit = jest.fn();

jest.mock('@/modules/workflows/repositories/workflow.repository', () => ({
  workflowRepository: mockRepo,
}));
jest.mock('@/modules/workflows/services/workflow-ownership.resolver', () => {
  const actual = jest.requireActual(
    '@/modules/workflows/services/workflow-ownership.resolver'
  );
  return {
    ...actual,
    resolveInstanceOrgUnit: (...args: unknown[]) => mockResolveOrgUnit(...args),
  };
});
jest.mock('@/modules/notifications/services/notification.service', () => ({
  notificationService: { sendNotification: jest.fn(), sendBulkNotification: jest.fn() },
}));
jest.mock('@/infrastructure/monitoring/audit.logger', () => ({
  auditLog: { log: jest.fn() },
}));

import { workflowEngine } from '@/modules/workflows/services/workflow-engine.service';
import { isInstanceInScope } from '@/modules/workflows/services/workflow-ownership.resolver';
import { buildWorkflowIdempotencyKey } from '@/modules/workflows/services/workflow-idempotency';
import { Role } from '@/server/permissions/roles';

const TENANT = 'tenant-a';
const ALL_PERMS = ['workflow:approve', 'workflow:reject', 'workflow:cancel'];

function actor(over: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    roles: [Role.BRANCH_MANAGER],
    accessibleOrgUnitIds: ['unit-harare'] as string[] | null,
    permissions: ALL_PERMS,
    ...over,
  };
}

function workflow() {
  return {
    _id: 'wf-1',
    status: 'active',
    steps: [{ id: 'step-1', name: 'Approve', type: 'approval', nextSteps: [], assignee: ['user-1'] }],
    config: {},
    tenantId: TENANT,
  };
}

function instance(over: Record<string, unknown> = {}) {
  return {
    _id: 'inst-1',
    workflowId: 'wf-1',
    entityId: 'exp-1',
    entityType: 'expense',
    orgUnitId: 'unit-harare',
    currentStepId: 'step-1',
    status: 'in_progress',
    steps: [{ stepId: 'step-1', status: 'pending', assignedTo: ['user-1'] }],
    metadata: {},
    createdBy: 'user-1',
    tenantId: TENANT,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRepo.getWorkflow.mockResolvedValue(workflow());
  mockRepo.getInstance.mockResolvedValue(instance());
  mockRepo.advanceStep.mockResolvedValue(instance());
  mockRepo.updateInstanceStatus.mockResolvedValue(instance());
  mockRepo.findInstanceByIdempotencyKey.mockResolvedValue(null);
  mockRepo.createInstance.mockImplementation(async (i: unknown) => ({ _id: 'inst-new', ...(i as object) }));
  mockResolveOrgUnit.mockResolvedValue('unit-harare');
});

describe('F-14: org-unit scope on instance operations', () => {
  it('DENIES approving an instance in another org unit', async () => {
    mockRepo.getInstance.mockResolvedValue(instance({ orgUnitId: 'unit-bulawayo' }));

    await expect(
      workflowEngine.approveStep('inst-1', 'step-1', actor(), 'ok', TENANT)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('reports 404, not 403, for another unit instance', async () => {
    // A 403 confirms the instance EXISTS, which tells a caller probing
    // ids something real about another branch's operations.
    mockRepo.getInstance.mockResolvedValue(instance({ orgUnitId: 'unit-bulawayo' }));

    await expect(
      workflowEngine.approveStep('inst-1', 'step-1', actor(), 'ok', TENANT)
    ).rejects.not.toMatchObject({ statusCode: 403 });
  });

  it('DENIES rejecting an instance in another org unit', async () => {
    mockRepo.getInstance.mockResolvedValue(instance({ orgUnitId: 'unit-bulawayo' }));

    await expect(
      workflowEngine.rejectStep('inst-1', 'step-1', actor(), 'no', TENANT)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('DENIES cancelling an instance in another org unit', async () => {
    mockRepo.getInstance.mockResolvedValue(
      instance({ orgUnitId: 'unit-bulawayo', createdBy: 'user-1' })
    );

    await expect(
      workflowEngine.cancelInstance('inst-1', actor(), TENANT)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('ALLOWS acting on an instance in the caller org unit', async () => {
    await expect(
      workflowEngine.approveStep('inst-1', 'step-1', actor(), 'ok', TENANT)
    ).resolves.toBeDefined();
  });

  it('ALLOWS a caller with MULTIPLE units to act in any of them', async () => {
    mockRepo.getInstance.mockResolvedValue(instance({ orgUnitId: 'unit-bulawayo' }));

    await expect(
      workflowEngine.approveStep(
        'inst-1',
        'step-1',
        actor({ accessibleOrgUnitIds: ['unit-harare', 'unit-bulawayo'] }),
        'ok',
        TENANT
      )
    ).resolves.toBeDefined();
  });

  it('ALLOWS an organization-wide caller (accessibleOrgUnitIds === null)', async () => {
    mockRepo.getInstance.mockResolvedValue(instance({ orgUnitId: 'unit-anywhere' }));

    await expect(
      workflowEngine.approveStep(
        'inst-1',
        'step-1',
        actor({ accessibleOrgUnitIds: null }),
        'ok',
        TENANT
      )
    ).resolves.toBeDefined();
  });

  it('FAILS CLOSED when the actor carries no scope at all', async () => {
    // The most important default. Before Phase 5 every caller was
    // implicitly organization-wide, so a partially-migrated caller that
    // forgets to pass scope must LOSE access, not gain it.
    await expect(
      workflowEngine.approveStep(
        'inst-1',
        'step-1',
        actor({ accessibleOrgUnitIds: undefined }),
        'ok',
        TENANT
      )
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('treats an instance with NO org unit as org-wide-only', () => {
    // Fail-closed like assertVehicleInScope, not shared like a geofence:
    // an unassigned instance is missing information, and showing it to
    // every unit would leak one branch's approval into another's queue.
    expect(isInstanceInScope(undefined, null)).toBe(true);
    expect(isInstanceInScope(undefined, ['unit-harare'])).toBe(false);
    expect(isInstanceInScope('unit-harare', [])).toBe(false);
  });
});

describe('F-14: definitions stay organization-level', () => {
  it('the repository has no scoped read for definitions', () => {
    // Deliberate asymmetry: every branch must see the same approval
    // policy, or a branch cannot see the rules it is held to.
    // Comments stripped: the repository's own doc comment NAMES
    // getWorkflowsInScope in order to explain why it deliberately does
    // not exist. An assertion that cannot tell code from prose would
    // force that explanation to be deleted to stay green.
    const code = fs
      .readFileSync(
        path.join(ROOT, 'modules/workflows/repositories/workflow.repository.ts'),
        'utf8'
      )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    expect(code).toContain('getInstancesInScope');
    expect(code).not.toContain('getWorkflowsInScope');
  });

  it('the registry records both levels and the reason', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'server/tenancy/module-scope.registry.ts'),
      'utf8'
    );
    expect(src).toContain('tblworkflow_instances');
    expect(src).toContain("orgUnitSource: 'explicit'");
  });
});

describe('N-4: authorization is enforced in the ENGINE, not only the route', () => {
  it('DENIES approve without WORKFLOW_APPROVE even inside scope', async () => {
    // A permission enforced in exactly one layer is enforced only for
    // callers that go through that layer -- rule actions and event
    // handlers do not.
    await expect(
      workflowEngine.approveStep(
        'inst-1',
        'step-1',
        actor({ permissions: ['workflow:view'] }),
        'ok',
        TENANT
      )
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('DENIES reject without WORKFLOW_REJECT', async () => {
    await expect(
      workflowEngine.rejectStep(
        'inst-1',
        'step-1',
        actor({ permissions: ['workflow:approve'] }),
        'no',
        TENANT
      )
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('DENIES cancel without WORKFLOW_CANCEL', async () => {
    await expect(
      workflowEngine.cancelInstance(
        'inst-1',
        actor({ permissions: ['workflow:approve'] }),
        TENANT
      )
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('FAILS CLOSED when the actor carries no permissions', async () => {
    // Absence must not read as "the caller already checked" -- that is
    // exactly the assumption that made isAuthorizedForStep fall through
    // to `return true` before Phase 0.
    await expect(
      workflowEngine.approveStep(
        'inst-1',
        'step-1',
        actor({ permissions: undefined }),
        'ok',
        TENANT
      )
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('the permission gate runs BEFORE the instance is loaded', async () => {
    // So an unauthorized caller cannot use timing or error shape to
    // learn whether an instance id exists.
    await expect(
      workflowEngine.approveStep('inst-1', 'step-1', actor({ permissions: [] }), 'ok', TENANT)
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(mockRepo.getInstance).not.toHaveBeenCalled();
  });

  it('step-level authorization still runs after the permission gate', async () => {
    // Both checks are needed: permission answers "may this role decide
    // steps at all", isAuthorizedForStep answers "is this the right
    // person for THIS step".
    mockRepo.getInstance.mockResolvedValue(
      instance({ steps: [{ stepId: 'step-1', status: 'pending', assignedTo: ['someone-else'] }] })
    );

    await expect(
      workflowEngine.approveStep('inst-1', 'step-1', actor(), 'ok', TENANT)
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('P3-N1: idempotent workflow starts', () => {
  it('builds a DETERMINISTIC key for the same cause', () => {
    // A UUID would be new on every retry and dedupe nothing. The key
    // must be a function of the cause.
    const input = {
      source: 'event' as const,
      workflowId: 'wf-1',
      entityId: 'exp-1',
      entityType: 'expense',
      causeId: 'evt-1',
    };
    expect(buildWorkflowIdempotencyKey(input)).toBe(buildWorkflowIdempotencyKey(input));
  });

  it('builds DIFFERENT keys for different entities and causes', () => {
    const base = {
      source: 'event' as const,
      workflowId: 'wf-1',
      entityId: 'exp-1',
      entityType: 'expense',
      causeId: 'evt-1',
    };
    expect(buildWorkflowIdempotencyKey(base)).not.toBe(
      buildWorkflowIdempotencyKey({ ...base, entityId: 'exp-2' })
    );
    expect(buildWorkflowIdempotencyKey(base)).not.toBe(
      buildWorkflowIdempotencyKey({ ...base, causeId: 'evt-2' })
    );
  });

  it('cannot collide across component boundaries', () => {
    // Naive concatenation makes ('ab','c') and ('a','bc') identical,
    // silently merging two different workflows.
    const a = buildWorkflowIdempotencyKey({
      source: 'event',
      workflowId: 'ab',
      entityId: 'c',
      entityType: 'x',
      causeId: 'e',
    });
    const b = buildWorkflowIdempotencyKey({
      source: 'event',
      workflowId: 'a',
      entityId: 'bc',
      entityType: 'x',
      causeId: 'e',
    });
    expect(a).not.toBe(b);
  });

  it('returns NO key for a manual start', () => {
    // A person may legitimately raise two approvals for one entity;
    // suppressing the second would look like a broken button.
    expect(
      buildWorkflowIdempotencyKey({
        source: 'manual',
        workflowId: 'wf-1',
        entityId: 'e',
        entityType: 'expense',
        causeId: 'c',
      })
    ).toBeNull();
  });

  it('returns NO key when a component is missing', () => {
    // A partial key would collapse unrelated starts -- worse than no
    // de-duplication.
    expect(
      buildWorkflowIdempotencyKey({
        source: 'event',
        workflowId: '',
        entityId: 'e',
        entityType: 'expense',
        causeId: 'c',
      })
    ).toBeNull();
  });

  it('returns the EXISTING instance instead of creating a second', async () => {
    // THE headline regression: a redelivered event must not raise a
    // second approval for the same expense.
    const existing = instance({ _id: 'inst-existing' });
    mockRepo.findInstanceByIdempotencyKey.mockResolvedValue(existing);

    const result = await workflowEngine.startWorkflow(
      'wf-1',
      'exp-1',
      'expense',
      'user-1',
      TENANT,
      'event:abc'
    );

    expect(result).toBe(existing);
    expect(mockRepo.createInstance).not.toHaveBeenCalled();
  });

  it('creates an instance when no key is supplied', async () => {
    await workflowEngine.startWorkflow('wf-1', 'exp-1', 'expense', 'user-1', TENANT);
    expect(mockRepo.createInstance).toHaveBeenCalledTimes(1);
  });

  it('resolves the duplicate-key RACE by returning the winner instance', async () => {
    // Two handlers can both pass the read before either writes. The
    // loser gets an 11000 and must return the winner's instance -- the
    // point is that exactly one exists, not that we created it.
    const winner = instance({ _id: 'inst-winner' });
    mockRepo.findInstanceByIdempotencyKey
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner);
    mockRepo.createInstance.mockRejectedValueOnce({ code: 11000 });

    const result = await workflowEngine.startWorkflow(
      'wf-1',
      'exp-1',
      'expense',
      'user-1',
      TENANT,
      'event:abc'
    );

    expect(result).toBe(winner);
  });

  it('rethrows a non-duplicate write failure', async () => {
    mockRepo.createInstance.mockRejectedValueOnce(new Error('mongo down'));

    await expect(
      workflowEngine.startWorkflow('wf-1', 'exp-1', 'expense', 'user-1', TENANT, 'event:abc')
    ).rejects.toThrow('mongo down');
  });

  it('stamps the instance with the resolved org unit and the key', async () => {
    await workflowEngine.startWorkflow(
      'wf-1',
      'exp-1',
      'expense',
      'user-1',
      TENANT,
      'event:abc'
    );

    const written = mockRepo.createInstance.mock.calls[0][0];
    expect(written.orgUnitId).toBe('unit-harare');
    expect(written.idempotencyKey).toBe('event:abc');
  });

  it('omits orgUnitId when ownership is unresolvable', async () => {
    // Unresolvable makes the instance HARDER to see, not easier.
    mockResolveOrgUnit.mockResolvedValue(null);

    await workflowEngine.startWorkflow('wf-1', 'exp-1', 'expense', 'user-1', TENANT);

    expect(mockRepo.createInstance.mock.calls[0][0].orgUnitId).toBeUndefined();
  });

  it('derives ownership from the ENTITY, never from a request body', async () => {
    await workflowEngine.startWorkflow('wf-1', 'exp-1', 'expense', 'user-1', TENANT);
    expect(mockResolveOrgUnit).toHaveBeenCalledWith('expense', 'exp-1', TENANT);
  });
});

describe('Phase 5: architecture guards', () => {
  const codeOf = (rel: string) =>
    fs
      .readFileSync(path.join(ROOT, rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('the engine scopes instance operations', () => {
    const code = codeOf('modules/workflows/services/workflow-engine.service.ts');
    expect(code).toContain('isInstanceInScope');
    expect(code).toContain('assertPermission');
  });

  it('the event handler passes the event id as the dedupe cause', () => {
    // Phase 3's StoredDomainEvent preserves eventId across redelivery,
    // which is the property that makes de-duplication possible at all.
    const code = codeOf('server/events/handlers/workflow/WorkflowTriggerHandler.ts');
    expect(code).toContain('event.eventId');
  });

  it('the rule action supplies an idempotency key', () => {
    const code = codeOf('modules/rules/actions/default-actions.ts');
    expect(code).toContain('buildWorkflowIdempotencyKey');
    expect(code).toContain("source: 'rule'");
  });

  it('the engines are NOT consolidated', () => {
    // The audit is explicit: they are correctly separated (stateless
    // condition->action vs stateful multi-step approval), and
    // RuleActionRegistry remains the action seam.
    expect(fs.existsSync(path.join(ROOT, 'modules/rules/services/rule-engine.service.ts'))).toBe(true);
    expect(
      fs.existsSync(path.join(ROOT, 'modules/workflows/services/workflow-engine.service.ts'))
    ).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'modules/rules/registry/RuleActionRegistry.ts'))).toBe(true);
  });

  it('the idempotency index is partial, not plain unique', () => {
    // Most instances legitimately have no key; a plain unique index
    // would collapse every keyless instance in a tenant into one and
    // break manual starts entirely.
    const {
      WORKFLOWS_INDEXES,
    } = require('@/infrastructure/database/indexes.workflows-addendum');

    const idx = WORKFLOWS_INDEXES.tblworkflow_instances.find(
      (i: { name: string }) => i.name === 'uniq_winstance_tenant_idempotency'
    );

    expect(idx).toBeDefined();
    expect(idx.unique).toBe(true);
    expect(idx.partialFilterExpression).toEqual({ idempotencyKey: { $exists: true } });
  });
});
