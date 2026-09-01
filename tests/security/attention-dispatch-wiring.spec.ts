// tests/security/attention-dispatch-wiring.spec.ts
//
// BACKLOG ITEM 6 (audit finding P6-N3) -- dispatch, actually wired.
//
// WHAT WAS MISSING: the dispatch DECISION and its idempotency key were
// built and tested, but no repository implemented `DispatchDeps`, no
// trigger point existed, and the two action executors were not on the
// registry -- so the service refused every dispatch with "No executor
// registered", correctly, and nothing ever called it.
//
// This suite covers the three things the brief asks for, in order:
//   * the DECISION (which trigger fires, and when it does not);
//   * IDEMPOTENCY (a second dispatch of the same finding creates
//     nothing);
//   * SAFE REFUSAL (missing executor, out-of-scope item, unresolvable
//     owner, resolved item, executor failure).
//
// The default that matters most is asserted first and repeatedly: with
// no configuration at all, the platform creates work ONLY when a person
// asks it to.

const mockRegistry = {
  isRegistered: jest.fn(() => true),
  registeredTypes: jest.fn(() => ['create_work_order', 'schedule_maintenance', 'start_workflow']),
  execute: jest.fn(async () => undefined),
  // The trigger module registers the executors at import time (see its
  // header: without that, dispatch is inert on the HTTP path because
  // the rule engine is never loaded there). The double has to accept
  // those calls; that behaviour is asserted for real in
  // attention-dispatch-executor-registration.spec.ts.
  register: jest.fn(),
};

const mockItemRepo = { findByItemKey: jest.fn() };
const mockDispatchRepo = {
  findDispatch: jest.fn(async () => null),
  recordDispatch: jest.fn(async () => undefined),
  listInScope: jest.fn(async () => []),
  markFailed: jest.fn(async () => true),
};

jest.mock('@/modules/rules/registry/RuleActionRegistry', () => ({
  ruleActionRegistry: mockRegistry,
}));
jest.mock('@/modules/attention/repositories/attention-item.repository', () => ({
  attentionItemRepository: mockItemRepo,
}));
jest.mock('@/modules/attention/repositories/attention-dispatch.repository', () => ({
  attentionDispatchRepository: mockDispatchRepo,
}));
jest.mock('@/infrastructure/monitoring/logger', () => ({
  monitoring: { logError: jest.fn(), logWarn: jest.fn(), logInfo: jest.fn(), logDebug: jest.fn() },
}));

import {
  AttentionDispatchTrigger,
} from '@/modules/attention/services/attention-dispatch.trigger';
import {
  AttentionDispatchService,
  buildDispatchIdempotencyKey,
} from '@/modules/attention/services/attention-dispatch.service';
import {
  getAttentionDispatchConfig,
  resetAttentionDispatchConfig,
  resolveAttentionDispatchConfig,
  severityAtLeast,
  AttentionDispatchConfigError,
} from '@/modules/attention/services/attention-dispatch.config';
import type { AttentionItem } from '@/modules/attention/types/attention-item.types';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { NotFoundError } from '@/server/errors/app.errors';

const TENANT = 'willsgrove-farm-enterprises-9e80ed';
const HARARE = 'unit-harare';
const BULAWAYO = 'unit-bulawayo';

function context(accessibleOrgUnitIds: string[] | null): TenantContext {
  return {
    organizationId: TENANT,
    organizationName: 'Willsgrove',
    accessibleOrgUnitIds,
    assignedOrgUnitIds: accessibleOrgUnitIds ?? [],
    isPlatformScope: false,
  } as unknown as TenantContext;
}

function item(over: Partial<AttentionItem> = {}): AttentionItem {
  return {
    itemKey: 'predictive_maintenance:v-1',
    source: 'predictive_maintenance',
    severity: 'high',
    urgency: 'soon',
    title: 'Brake pads due',
    description: 'Predicted within 500km',
    cost: 400,
    priorityScore: 80,
    entityId: 'vehicle-1',
    entityLabel: 'ADY2531',
    orgUnitId: HARARE,
    tenantId: TENANT,
    status: 'open',
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    ...over,
  } as AttentionItem;
}

function trigger(): AttentionDispatchTrigger {
  return new AttentionDispatchTrigger(
    new AttentionDispatchService(mockDispatchRepo as never)
  );
}

beforeEach(() => {
  // clearAllMocks clears CALLS but keeps implementations, so every
  // default is re-installed explicitly -- otherwise a `mockRejectedValue`
  // set by one test leaks into the next and quietly changes what the
  // later assertions are testing.
  jest.clearAllMocks();
  mockRegistry.isRegistered.mockReturnValue(true);
  mockRegistry.execute.mockImplementation(async () => undefined);
  mockDispatchRepo.findDispatch.mockResolvedValue(null);
  mockDispatchRepo.recordDispatch.mockImplementation(async () => undefined);
  mockDispatchRepo.markFailed.mockResolvedValue(true);
  mockDispatchRepo.listInScope.mockResolvedValue([]);
  delete process.env.ATTENTION_AUTO_DISPATCH_ENABLED;
  resetAttentionDispatchConfig();
});

afterEach(() => {
  delete process.env.ATTENTION_AUTO_DISPATCH_ENABLED;
  resetAttentionDispatchConfig();
});

// ─────────────────────────────────────────────────────────────────────
describe('the configured default', () => {
  it('automatic dispatch is OFF with no configuration', () => {
    expect(getAttentionDispatchConfig().autoDispatchEnabled).toBe(false);
  });

  it('is enabled only by the exact string "true"', () => {
    process.env.ATTENTION_AUTO_DISPATCH_ENABLED = 'true';
    expect(resolveAttentionDispatchConfig().autoDispatchEnabled).toBe(true);

    process.env.ATTENTION_AUTO_DISPATCH_ENABLED = 'false';
    expect(resolveAttentionDispatchConfig().autoDispatchEnabled).toBe(false);
  });

  it('refuses an ambiguous value rather than interpreting it', () => {
    // '1' and 'yes' are the values an operator most plausibly types.
    // Silently reading either as "off" gives a deployment that believes
    // automation is running; reading them as "on" is worse.
    for (const value of ['1', '0', 'yes', 'no', 'on', 'off', 'Trues', 'enabled']) {
      process.env.ATTENTION_AUTO_DISPATCH_ENABLED = value;
      expect(() => resolveAttentionDispatchConfig()).toThrow(AttentionDispatchConfigError);
    }
  });

  it('tolerates case and surrounding whitespace, which a .env file adds by accident', () => {
    // Deliberately NOT part of the ambiguity above: 'TRUE ' expresses
    // the same intent as 'true' and refusing it would be pedantry that
    // costs a deployment, not a safety property.
    for (const value of ['TRUE', ' true ', 'True']) {
      process.env.ATTENTION_AUTO_DISPATCH_ENABLED = value;
      expect(resolveAttentionDispatchConfig().autoDispatchEnabled).toBe(true);
    }
    for (const value of ['FALSE', ' false ']) {
      process.env.ATTENTION_AUTO_DISPATCH_ENABLED = value;
      expect(resolveAttentionDispatchConfig().autoDispatchEnabled).toBe(false);
    }
  });

  it('ranks severity so the threshold means what it says', () => {
    expect(severityAtLeast('critical', 'high')).toBe(true);
    expect(severityAtLeast('high', 'high')).toBe(true);
    expect(severityAtLeast('medium', 'high')).toBe(false);
    expect(severityAtLeast('low', 'high')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('operator-initiated dispatch (the default trigger)', () => {
  it('dispatches the action the item s source warrants', async () => {
    mockItemRepo.findByItemKey.mockResolvedValue(item());

    const outcome = await trigger().dispatchByOperator(
      'predictive_maintenance:v-1',
      context([HARARE]),
      'user-1'
    );

    expect(outcome.status).toBe('dispatched');
    expect((outcome as { actionType: string }).actionType).toBe('schedule_maintenance');
    expect(mockRegistry.execute).toHaveBeenCalledTimes(1);
  });

  it('records the dispatch BEFORE executing, so a redelivery cannot double-create', async () => {
    mockItemRepo.findByItemKey.mockResolvedValue(item());
    const order: string[] = [];
    mockDispatchRepo.recordDispatch.mockImplementation(async () => {
      order.push('record');
    });
    mockRegistry.execute.mockImplementation(async () => {
      order.push('execute');
    });

    await trigger().dispatchByOperator('predictive_maintenance:v-1', context([HARARE]), 'user-1');

    expect(order).toEqual(['record', 'execute']);
  });

  it('carries the ITEM s org unit into the action, not the caller s context', async () => {
    // An org-wide operator dispatching a Bulawayo item must create work
    // in Bulawayo's queue, not in nobody's.
    mockItemRepo.findByItemKey.mockResolvedValue(item({ orgUnitId: BULAWAYO }));

    await trigger().dispatchByOperator('predictive_maintenance:v-1', context(null), 'user-1');

    const [action] = mockRegistry.execute.mock.calls[0] as [{ params: Record<string, unknown> }];
    expect(action.params.orgUnitId).toBe(BULAWAYO);

    const [record] = mockDispatchRepo.recordDispatch.mock.calls[0] as [{ orgUnitId?: string }];
    expect(record.orgUnitId).toBe(BULAWAYO);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('idempotency', () => {
  it('a repeat dispatch of the same finding creates nothing', async () => {
    mockItemRepo.findByItemKey.mockResolvedValue(item());
    mockDispatchRepo.findDispatch.mockResolvedValue({ idempotencyKey: 'existing' } as never);

    const outcome = await trigger().dispatchByOperator(
      'predictive_maintenance:v-1',
      context([HARARE]),
      'user-1'
    );

    expect(outcome.status).toBe('duplicate');
    expect(mockRegistry.execute).not.toHaveBeenCalled();
    expect(mockDispatchRepo.recordDispatch).not.toHaveBeenCalled();
  });

  it('a lost race (unique index, code 11000) is a duplicate, not a failure', async () => {
    mockItemRepo.findByItemKey.mockResolvedValue(item());
    mockDispatchRepo.recordDispatch.mockRejectedValue(
      Object.assign(new Error('E11000 duplicate key'), { code: 11000 })
    );

    const outcome = await trigger().dispatchByOperator(
      'predictive_maintenance:v-1',
      context([HARARE]),
      'user-1'
    );

    expect(outcome.status).toBe('duplicate');
    // The index caught the race. Executing anyway would produce the
    // second work order the key exists to prevent.
    expect(mockRegistry.execute).not.toHaveBeenCalled();
  });

  it('uses the deterministic key, so two processes compute the same one', async () => {
    mockItemRepo.findByItemKey.mockResolvedValue(item());

    await trigger().dispatchByOperator('predictive_maintenance:v-1', context([HARARE]), 'user-1');

    const [record] = mockDispatchRepo.recordDispatch.mock.calls[0] as [{ idempotencyKey: string }];
    expect(record.idempotencyKey).toBe(
      buildDispatchIdempotencyKey({
        tenantId: TENANT,
        attentionItemKey: 'predictive_maintenance:v-1',
        actionType: 'schedule_maintenance',
        targetEntityId: 'vehicle-1',
      })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('safe refusal', () => {
  it('refuses -- and records nothing -- when no executor is registered', async () => {
    mockItemRepo.findByItemKey.mockResolvedValue(item());
    mockRegistry.isRegistered.mockReturnValue(false);

    const outcome = await trigger().dispatchByOperator(
      'predictive_maintenance:v-1',
      context([HARARE]),
      'user-1'
    );

    expect(outcome.status).toBe('refused');
    // Critical: no dispatch record claiming work was created when none
    // was. The check happens before the write, deliberately.
    expect(mockDispatchRepo.recordDispatch).not.toHaveBeenCalled();
  });

  it('404s an item belonging to another branch, rather than confirming it exists', async () => {
    mockItemRepo.findByItemKey.mockResolvedValue(item({ orgUnitId: BULAWAYO }));

    await expect(
      trigger().dispatchByOperator('predictive_maintenance:v-1', context([HARARE]), 'user-1')
    ).rejects.toBeInstanceOf(NotFoundError);

    // The material point: a branch manager who learns an item key must
    // not be able to create work against another branch's vehicle.
    expect(mockRegistry.execute).not.toHaveBeenCalled();
  });

  it('404s an item whose owning unit could not be resolved', async () => {
    // persistFeed writes orgUnitId: null when the owner is
    // unresolvable, so this is a live branch, not a defensive one.
    mockItemRepo.findByItemKey.mockResolvedValue(item({ orgUnitId: undefined }));

    await expect(
      trigger().dispatchByOperator('predictive_maintenance:v-1', context([HARARE]), 'user-1')
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('does not create work for an item that is already resolved', async () => {
    mockItemRepo.findByItemKey.mockResolvedValue(item({ status: 'resolved' }));

    const outcome = await trigger().dispatchByOperator(
      'predictive_maintenance:v-1',
      context([HARARE]),
      'user-1'
    );

    expect(outcome.status).toBe('no_action');
    expect(mockRegistry.execute).not.toHaveBeenCalled();
  });

  it('returns no_action for a source with no dispatchable action', async () => {
    // fleet_health spans several vehicles with no single owning entity,
    // and driver_risk is about a person. Both are deliberately absent
    // from actionForSource.
    for (const source of ['fleet_health', 'driver_risk'] as const) {
      mockItemRepo.findByItemKey.mockResolvedValue(item({ source, itemKey: `${source}:x` }));
      const outcome = await trigger().dispatchByOperator(`${source}:x`, context([HARARE]), 'u');
      expect(outcome.status).toBe('no_action');
    }
    expect(mockRegistry.execute).not.toHaveBeenCalled();
  });

  it('returns no_action when the item names no entity to act on', async () => {
    mockItemRepo.findByItemKey.mockResolvedValue(item({ entityId: null }));

    const outcome = await trigger().dispatchByOperator(
      'predictive_maintenance:v-1',
      context([HARARE]),
      'user-1'
    );

    expect(outcome.status).toBe('no_action');
    expect(mockDispatchRepo.recordDispatch).not.toHaveBeenCalled();
  });

  it('turns an executor refusal into action_failed, and annotates the record', async () => {
    mockItemRepo.findByItemKey.mockResolvedValue(item());
    mockRegistry.execute.mockRejectedValue(
      new Error('License plate "ADY2531" matches 2 active vehicles; refusing to guess.')
    );
    mockDispatchRepo.listInScope.mockResolvedValue([{ idempotencyKey: 'key-1' }] as never);

    const outcome = await trigger().dispatchByOperator(
      'predictive_maintenance:v-1',
      context([HARARE]),
      'user-1'
    );

    expect(outcome.status).toBe('action_failed');
    expect((outcome as { reason: string }).reason).toMatch(/matches 2 active vehicles/);
    // The record is NOT deleted -- record-before-execute is deliberate.
    // Annotating it is what stops "a dispatch record with no work
    // behind it" being a mystery.
    expect(mockDispatchRepo.markFailed).toHaveBeenCalledWith(
      'key-1',
      TENANT,
      expect.stringMatching(/matches 2 active vehicles/)
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('automatic dispatch is opt-in and severity-gated', () => {
  it('does nothing at all with the flag unset -- the shipped default', async () => {
    const outcome = await trigger().maybeAutoDispatch(item({ severity: 'critical' }), context(null));

    expect(outcome.status).toBe('no_action');
    expect((outcome as { reason: string }).reason).toMatch(/ATTENTION_AUTO_DISPATCH_ENABLED/);
    expect(mockDispatchRepo.recordDispatch).not.toHaveBeenCalled();
    expect(mockRegistry.execute).not.toHaveBeenCalled();
  });

  it('dispatches a high-severity item once the flag is on', async () => {
    process.env.ATTENTION_AUTO_DISPATCH_ENABLED = 'true';
    resetAttentionDispatchConfig();

    const outcome = await trigger().maybeAutoDispatch(item({ severity: 'high' }), context(null));

    expect(outcome.status).toBe('dispatched');
  });

  it('still refuses below the threshold with the flag on -- both conditions, not either', async () => {
    process.env.ATTENTION_AUTO_DISPATCH_ENABLED = 'true';
    resetAttentionDispatchConfig();

    for (const severity of ['medium', 'low'] as const) {
      const outcome = await trigger().maybeAutoDispatch(item({ severity }), context(null));
      expect(outcome.status).toBe('no_action');
      expect((outcome as { reason: string }).reason).toMatch(/below the automatic-dispatch threshold/);
    }
    expect(mockRegistry.execute).not.toHaveBeenCalled();
  });

  it('refuses an item with no owning unit even when enabled', async () => {
    process.env.ATTENTION_AUTO_DISPATCH_ENABLED = 'true';
    resetAttentionDispatchConfig();

    const outcome = await trigger().maybeAutoDispatch(
      item({ severity: 'critical', orgUnitId: undefined }),
      context([HARARE])
    );

    expect(outcome.status).toBe('refused');
    expect(mockRegistry.execute).not.toHaveBeenCalled();
  });

  it('never throws on the automatic path, so a refresh cycle cannot be poisoned', async () => {
    process.env.ATTENTION_AUTO_DISPATCH_ENABLED = 'true';
    resetAttentionDispatchConfig();
    mockRegistry.execute.mockRejectedValue(new Error('workshop service unavailable'));

    const outcome = await trigger().maybeAutoDispatch(item({ severity: 'critical' }), context(null));

    expect(outcome.status).toBe('action_failed');
  });
});
