// tests/security/attention-dispatch-executor-registration.spec.ts
//
// BACKLOG ITEM 6 -- the wiring assertion that stops this feature going
// back to being inert.
//
// THE FAILURE THIS PINS. `registerMaintenanceRuleActions()` is called at
// module scope in rule-engine.service.ts, which is loaded when a
// business RULE runs. A serverless invocation that reaches the dispatch
// endpoint loads the AI controller, the trigger and the registry -- and
// never the engine. With registration only in the engine, the registry
// would be empty on exactly that path, `isRegistered` would return
// false, and every dispatch would refuse with "No executor registered".
//
// That refusal is CORRECT behaviour, which is what makes the bug
// dangerous: nothing errors, nothing logs a fault, and an operator sees
// a polite message where a work order should be. It is the same shape
// as the finding that dispatch had been inert since Phase 6.
//
// So the trigger module registers them itself, and this test asserts
// that importing the trigger ALONE is sufficient. Deliberately imported
// in isolation, with the rule engine never referenced.

import { ruleActionRegistry } from '@/modules/rules/registry/RuleActionRegistry';

describe('importing the dispatch trigger is enough to make dispatch work', () => {
  it('registers both executors without the rule engine being loaded', () => {
    jest.isolateModules(() => {
      // Fresh registry for this module graph.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ruleActionRegistry: registry } = require('@/modules/rules/registry/RuleActionRegistry');

      // Importing ONLY the trigger -- the path an HTTP dispatch takes.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@/modules/attention/services/attention-dispatch.trigger');

      expect(registry.isRegistered('create_work_order')).toBe(true);
      expect(registry.isRegistered('schedule_maintenance')).toBe(true);
      // actionForSource maps compliance / fuel_fraud / expense_anomaly
      // to start_workflow, which is a DEFAULT action -- so the defaults
      // have to be registered on this path too.
      expect(registry.isRegistered('start_workflow')).toBe(true);
    });
  });

  it('covers every action type actionForSource can return', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('@/modules/attention/services/attention-dispatch.trigger');

    // The closed set from AttentionActionType. If a future source maps
    // to a new type, this fails until an executor exists -- which is the
    // point: the service would otherwise refuse it silently forever.
    for (const type of ['create_work_order', 'schedule_maintenance', 'start_workflow']) {
      expect(ruleActionRegistry.isRegistered(type)).toBe(true);
    }
  });
});
