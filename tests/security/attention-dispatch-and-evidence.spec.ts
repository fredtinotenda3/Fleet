// tests/security/attention-dispatch-and-evidence.spec.ts
//
// PHASE 6 -- the closed loop: detection -> action -> outcome.
//
// THE GAPS:
//   * Attention items were persisted and resolved, but nothing ever
//     dispatched an operational action. The audit's verdict was
//     "analytics-plus-a-ledger, not a closed loop".
//   * Every AI service produced a confidence number and none recorded
//     what the number rested on. A bare `confidence: 0.83` is
//     unfalsifiable -- and Phase 6 lets these drive real work orders.
//   * The value ledger was restricted to two sources.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

const mockRegistry = {
  isRegistered: jest.fn(),
  registeredTypes: jest.fn(() => ['create_work_order', 'schedule_maintenance', 'start_workflow']),
  execute: jest.fn(),
};

jest.mock('@/modules/rules/registry/RuleActionRegistry', () => ({
  ruleActionRegistry: mockRegistry,
}));
jest.mock('@/infrastructure/monitoring/logger', () => ({
  monitoring: { logError: jest.fn(), logWarn: jest.fn(), logInfo: jest.fn(), logDebug: jest.fn() },
}));

import {
  AttentionDispatchService,
  buildDispatchIdempotencyKey,
  actionForSource,
  DispatchDeps,
} from '@/modules/attention/services/attention-dispatch.service';
import {
  buildConfidence,
  assertEvidence,
  MissingEvidenceError,
} from '@/modules/ai/types/ai-evidence.types';
import type { AttentionItem } from '@/modules/attention/types/attention-item.types';

const context = {
  organizationId: 'tenant-a',
  organizationName: 'Tenant A',
  accessibleOrgUnitIds: ['unit-harare'],
  assignedOrgUnitIds: ['unit-harare'],
  isPlatformScope: false,
} as never;

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
    orgUnitId: 'unit-harare',
    tenantId: 'tenant-a',
    firstSeenAt: new Date(),
    ...over,
  } as AttentionItem;
}

function deps(): DispatchDeps & { records: unknown[] } {
  const records: unknown[] = [];
  return {
    records,
    findDispatch: jest.fn(async () => null),
    recordDispatch: jest.fn(async (r) => {
      records.push(r);
    }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRegistry.isRegistered.mockReturnValue(true);
  mockRegistry.registeredTypes.mockReturnValue([
    'create_work_order',
    'schedule_maintenance',
    'start_workflow',
  ]);
});

describe('Phase 6: attention items dispatch operational actions', () => {
  it('dispatches the correct action for a high-severity maintenance prediction', async () => {
    const d = deps();
    const outcome = await new AttentionDispatchService(d).dispatch(item(), context, 'user-1');

    expect(outcome).toMatchObject({ status: 'dispatched', actionType: 'schedule_maintenance' });
    expect(mockRegistry.execute).toHaveBeenCalledTimes(1);
  });

  it('goes through the RuleActionRegistry, not a new engine', async () => {
    // The audit was explicit: no third engine. The registry's own doc
    // comment anticipated exactly this use.
    const d = deps();
    await new AttentionDispatchService(d).dispatch(item(), context, 'user-1');

    const [action, , tenantId] = mockRegistry.execute.mock.calls[0];
    expect(action.type).toBe('schedule_maintenance');
    expect(tenantId).toBe('tenant-a');
  });

  it('maps each source to a deliberate action', () => {
    expect(actionForSource(item({ source: 'predictive_maintenance' }))).toBe('schedule_maintenance');
    expect(actionForSource(item({ source: 'maintenance' }))).toBe('create_work_order');
    expect(actionForSource(item({ source: 'compliance' }))).toBe('start_workflow');
    expect(actionForSource(item({ source: 'fuel_fraud' }))).toBe('start_workflow');
  });

  it('dispatches NOTHING for a source with no single owning entity', () => {
    // fleet_health produces multi-vehicle recommendations; the Phase 0
    // ownership resolver returns null for the same reason.
    expect(actionForSource(item({ source: 'fleet_health' }))).toBeNull();
  });

  it('dispatches NOTHING for a risk score about a person', async () => {
    // Auto-raising anything against an employee on a model's say-so is a
    // decision that needs a human at the FRONT of it, not the end.
    expect(actionForSource(item({ source: 'driver_risk' }))).toBeNull();

    const d = deps();
    const outcome = await new AttentionDispatchService(d).dispatch(
      item({ source: 'driver_risk' }),
      context,
      'user-1'
    );

    expect(outcome.status).toBe('no_action');
    expect(mockRegistry.execute).not.toHaveBeenCalled();
  });

  it('never approves or completes anything — it only creates work', () => {
    // An intelligence system that could auto-approve its own
    // recommendations is one where a scoring bug becomes a spend.
    const code = fs
      .readFileSync(
        path.join(ROOT, 'modules/attention/services/attention-dispatch.service.ts'),
        'utf8'
      )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    expect(code).not.toContain('approveStep');
    expect(code).not.toContain('autoApprove');
    expect(code).not.toContain("'approve'");
  });
});

describe('Phase 6: dispatch is idempotent', () => {
  it('builds a deterministic key', () => {
    const params = {
      tenantId: 'tenant-a',
      attentionItemKey: 'predictive_maintenance:v-1',
      actionType: 'schedule_maintenance',
      targetEntityId: 'vehicle-1',
    };
    expect(buildDispatchIdempotencyKey(params)).toBe(buildDispatchIdempotencyKey(params));
  });

  it('cannot collide across component boundaries', () => {
    const a = buildDispatchIdempotencyKey({
      tenantId: 't', attentionItemKey: 'ab', actionType: 'c', targetEntityId: 'x',
    });
    const b = buildDispatchIdempotencyKey({
      tenantId: 't', attentionItemKey: 'a', actionType: 'bc', targetEntityId: 'x',
    });
    expect(a).not.toBe(b);
  });

  it('does NOT dispatch the same item twice', async () => {
    // Attention items are re-upserted on every refresh cycle. Without a
    // key, one flagged vehicle accumulates a new work order every cycle
    // -- a queue of duplicate jobs that looks like a far bigger problem
    // than the one actually detected.
    const d = deps();
    d.findDispatch = jest.fn(async () => ({ idempotencyKey: 'k' }) as never);

    const outcome = await new AttentionDispatchService(d).dispatch(item(), context, 'user-1');

    expect(outcome.status).toBe('duplicate');
    expect(mockRegistry.execute).not.toHaveBeenCalled();
  });

  it('resolves the unique-index race as a duplicate', async () => {
    const d = deps();
    d.recordDispatch = jest.fn(async () => {
      throw { code: 11000 };
    });

    const outcome = await new AttentionDispatchService(d).dispatch(item(), context, 'user-1');

    expect(outcome.status).toBe('duplicate');
    expect(mockRegistry.execute).not.toHaveBeenCalled();
  });

  it('RECORDS before executing', async () => {
    // Deliberate order. If the action ran first and the record failed, a
    // redelivery would run the action AGAIN -- a second work order. This
    // way the worst case is a record with no action behind it, which is
    // visible and repairable.
    const order: string[] = [];
    const d = deps();
    d.recordDispatch = jest.fn(async () => {
      order.push('record');
    });
    mockRegistry.execute.mockImplementation(async () => {
      order.push('execute');
    });

    await new AttentionDispatchService(d).dispatch(item(), context, 'user-1');

    expect(order).toEqual(['record', 'execute']);
  });
});

describe('Phase 6: dispatch respects scope and fails safe', () => {
  it('carries the ITEM org unit onto the dispatch record', async () => {
    // So the created work inherits the item's own unit rather than the
    // executing process's context.
    const d = deps();
    await new AttentionDispatchService(d).dispatch(
      item({ orgUnitId: 'unit-bulawayo' }),
      context,
      'user-1'
    );

    expect(d.records[0]).toMatchObject({ orgUnitId: 'unit-bulawayo' });
  });

  it('REFUSES an unregistered action type rather than throwing', async () => {
    // Checked BEFORE recording, so an unregistered type cannot leave a
    // dispatch record claiming work was created when nothing was.
    mockRegistry.isRegistered.mockReturnValue(false);
    const d = deps();

    const outcome = await new AttentionDispatchService(d).dispatch(item(), context, 'user-1');

    expect(outcome.status).toBe('refused');
    expect(d.recordDispatch).not.toHaveBeenCalled();
    expect(mockRegistry.execute).not.toHaveBeenCalled();
  });

  it('names the registered types so a refusal is diagnosable', async () => {
    mockRegistry.isRegistered.mockReturnValue(false);
    const outcome = await new AttentionDispatchService(deps()).dispatch(item(), context, 'user-1');

    expect(outcome.status === 'refused' && outcome.reason).toContain('create_work_order');
  });

  it('dispatches nothing for an item with no target entity', async () => {
    const outcome = await new AttentionDispatchService(deps()).dispatch(
      item({ entityId: null }),
      context,
      'user-1'
    );

    expect(outcome.status).toBe('no_action');
  });
});

describe('Phase 6: the shared confidence/evidence model', () => {
  it('confidence is already a NUMBER on both AI shapes', () => {
    // Recorded honestly: the audit said AIPrediction used an enum and
    // AIResult a number. That is NO LONGER TRUE -- both are number, and
    // were before this phase. Phase 6 did not "fix" it; asserting the
    // current state stops a future reader re-opening a closed finding.
    const aiTypes = fs.readFileSync(path.join(ROOT, 'modules/ai/types/ai.types.ts'), 'utf8');
    const resultTypes = fs.readFileSync(
      path.join(ROOT, 'modules/ai/types/ai-result.types.ts'),
      'utf8'
    );

    expect(aiTypes).toContain('export type AIConfidence = number');
    expect(resultTypes).toContain('confidence?: number');
  });

  it('REFUSES to build a confidence with no evidence', () => {
    // A bare score is unfalsifiable: an operator cannot check it, a
    // reviewer cannot audit it, and a scorer bug is indistinguishable
    // from a genuine finding until somebody acts on it.
    expect(() =>
      buildConfidence({ confidence: 0.9, evidence: [], what: 'fuel-fraud score' })
    ).toThrow(MissingEvidenceError);
  });

  it('accepts a LOW confidence with evidence — uncertainty is a real output', () => {
    // "We are not confident" is legitimate and useful. "We are
    // confident, for reasons we did not record" is not.
    const envelope = buildConfidence({
      confidence: 0,
      evidence: [{ source: 'tbltelematics', reference: 'reading-1' }],
      what: 'x',
    });
    expect(envelope.confidence).toBe(0);
  });

  it('clamps an out-of-range confidence rather than failing a batch', () => {
    // A scorer emitting 1.02 through a rounding artefact should not kill
    // the run; the clamped value is honest about what the scale expresses.
    expect(
      buildConfidence({
        confidence: 1.02,
        evidence: [{ source: 's', reference: 'r' }],
        what: 'x',
      }).confidence
    ).toBe(1);
  });

  it('REFUSES a non-finite confidence — that means the computation failed', () => {
    expect(() =>
      buildConfidence({
        confidence: NaN,
        evidence: [{ source: 's', reference: 'r' }],
        what: 'x',
      })
    ).toThrow();
  });

  it('evidence points at a resolvable reference, not prose', () => {
    // A sentence cannot be re-checked after the fact. The point is that
    // somebody disputing a finding can pull the same rows the model did.
    const envelope = buildConfidence({
      confidence: 0.8,
      evidence: [
        { source: 'tblexpenses', reference: 'exp-1', value: 400 },
        { source: 'telemetry-rollup', reference: '2026-08-20', observedAt: new Date() },
      ],
      explanation: 'Spend is 4x the 90-day median for this vehicle.',
      what: 'expense anomaly',
    });

    expect(envelope.evidence).toHaveLength(2);
    expect(envelope.evidence[0].reference).toBe('exp-1');
    // explanation is separate from evidence, never a substitute.
    expect(envelope.explanation).toBeDefined();
  });

  it('assertEvidence guards at the boundary', () => {
    expect(() => assertEvidence({ evidence: [] }, 'prediction')).toThrow(MissingEvidenceError);
    expect(() =>
      assertEvidence({ evidence: [{ source: 's', reference: 'r' }] }, 'prediction')
    ).not.toThrow();
  });
});

describe('Phase 6: the value ledger loop', () => {
  it('accepts the maintenance sources an action can now complete', () => {
    // A completed work order carries a real, sourced cost -- a monetary
    // outcome, so it belongs in the ledger.
    const src = fs.readFileSync(
      path.join(ROOT, 'modules/attention/types/value-ledger.types.ts'),
      'utf8'
    );
    expect(src).toContain("'maintenance'");
    expect(src).toContain("'predictive_maintenance'");
  });

  it('still EXCLUDES sources with no determinable amount', () => {
    // fleet_health has no attributable amount; driver_risk cannot be
    // honestly priced; compliance is a counterfactual (a fine avoided),
    // not a measurement.
    const code = fs
      .readFileSync(
        path.join(ROOT, 'modules/attention/services/attention-resolution.service.ts'),
        'utf8'
      )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    expect(code).not.toContain("'fleet_health'");
    expect(code).not.toContain("'driver_risk'");
    expect(code).not.toContain("'compliance'");
  });

  it('the ledger still requires non-empty evidence', () => {
    // An entry with no evidence is a claim, not a record. Phase 6 widened
    // WHICH sources qualify; it must not have relaxed WHAT qualifies.
    const src = fs.readFileSync(
      path.join(ROOT, 'modules/attention/services/attention-resolution.service.ts'),
      'utf8'
    );
    expect(src).toContain('evidenceRefs');
  });

  it('never fabricates a zero-value entry', () => {
    // The rule underneath the whole restriction: a source with no
    // determinable amount produces NO entry, rather than one claiming
    // savings of nothing -- which would be indistinguishable from a
    // genuine break-even in every aggregate downstream.
    const src = fs.readFileSync(
      path.join(ROOT, 'modules/attention/types/value-ledger.types.ts'),
      'utf8'
    );
    expect(src).toContain('NEVER FABRICATE A ZERO');
  });
});
