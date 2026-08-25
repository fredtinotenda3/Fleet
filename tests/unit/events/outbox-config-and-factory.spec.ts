// tests/unit/events/outbox-config-and-factory.spec.ts
//
// PHASE 3 -- configuration boundary and bus selection.
//
// THE DEFECT (F-11): `EventBusFactory.getInstance()` returned
// `new InMemoryEventBus()` unconditionally. No environment branch, no
// configuration, no way to get anything else. Every domain event in the
// system was delivered in-process, best-effort, and lost on crash,
// redeploy or serverless instance recycle -- while a complete
// transactional outbox sat next to it, dead.

import {
  resolveOutboxConfig,
  resetOutboxConfig,
  OutboxConfigError,
} from '@/server/events/outbox/outbox.config';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { InMemoryEventBus } from '@/server/events/bus/InMemoryEventBus';

const ENV_KEYS = [
  'NODE_ENV',
  'EVENT_BUS_MODE',
  'OUTBOX_PROCESSOR_ENABLED',
  'OUTBOX_PROCESSOR_EXTERNAL',
  'OUTBOX_PROCESSOR_INTERVAL_MS',
  'OUTBOX_MAX_ATTEMPTS',
  'OUTBOX_LEASE_TIMEOUT_MS',
  'OUTBOX_BACKOFF_BASE_MS',
  'OUTBOX_BACKOFF_MAX_MS',
  'OUTBOX_BATCH_SIZE',
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  resetOutboxConfig();
  EventBusFactory.reset();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  resetOutboxConfig();
  EventBusFactory.reset();
});

describe('Phase 3: EVENT_BUS_MODE defaults', () => {
  it('defaults to memory outside production', () => {
    process.env.NODE_ENV = 'test';
    expect(resolveOutboxConfig().mode).toBe('memory');
  });

  it('defaults to OUTBOX in production', () => {
    // Because the alternative default is silent event loss, and a
    // default that loses data is not a safe default.
    process.env.NODE_ENV = 'production';
    process.env.OUTBOX_PROCESSOR_ENABLED = 'true';
    expect(resolveOutboxConfig().mode).toBe('outbox');
  });

  it('honours an explicit mode over the default', () => {
    process.env.NODE_ENV = 'production';
    process.env.EVENT_BUS_MODE = 'memory';
    expect(resolveOutboxConfig().mode).toBe('memory');
  });

  it('THROWS on an unrecognised mode rather than falling back', () => {
    // A silent fallback would resolve an unrecognised production mode to
    // whichever branch the default took -- and if that were 'memory',
    // the deployment would lose events while its config claimed
    // otherwise.
    process.env.EVENT_BUS_MODE = 'durable';
    expect(() => resolveOutboxConfig()).toThrow(OutboxConfigError);
  });
});

describe('Phase 3: the config refuses an undeliverable topology', () => {
  it('THROWS when outbox mode is selected but nothing will process it', () => {
    // THE most important refusal. Outbox mode without a processor means
    // events are durably recorded and delivered NEVER -- worse than the
    // in-memory bus it replaces, because it also looks healthy.
    process.env.EVENT_BUS_MODE = 'outbox';
    process.env.OUTBOX_PROCESSOR_ENABLED = 'false';
    process.env.OUTBOX_PROCESSOR_EXTERNAL = 'false';

    expect(() => resolveOutboxConfig()).toThrow(/no processor is configured/);
  });

  it('accepts outbox mode when the processor runs in this process', () => {
    process.env.EVENT_BUS_MODE = 'outbox';
    process.env.OUTBOX_PROCESSOR_ENABLED = 'true';
    expect(resolveOutboxConfig().processorEnabled).toBe(true);
  });

  it('accepts outbox mode when a processor is declared external', () => {
    process.env.EVENT_BUS_MODE = 'outbox';
    process.env.OUTBOX_PROCESSOR_ENABLED = 'false';
    process.env.OUTBOX_PROCESSOR_EXTERNAL = 'true';

    const config = resolveOutboxConfig();
    expect(config.mode).toBe('outbox');
    expect(config.processorExternal).toBe(true);
  });

  it('THROWS when the lease is shorter than the poll interval', () => {
    // A claim that expires while the claiming processor is still working
    // lets a second processor pick the row up mid-flight -- turning
    // at-least-once into reliably-twice for every slow handler.
    process.env.EVENT_BUS_MODE = 'outbox';
    process.env.OUTBOX_PROCESSOR_ENABLED = 'true';
    process.env.OUTBOX_PROCESSOR_INTERVAL_MS = '30000';
    process.env.OUTBOX_LEASE_TIMEOUT_MS = '5000';

    expect(() => resolveOutboxConfig()).toThrow(/must exceed/);
  });

  it('THROWS when backoff max is below backoff base', () => {
    process.env.EVENT_BUS_MODE = 'outbox';
    process.env.OUTBOX_PROCESSOR_ENABLED = 'true';
    process.env.OUTBOX_BACKOFF_BASE_MS = '5000';
    process.env.OUTBOX_BACKOFF_MAX_MS = '1000';

    expect(() => resolveOutboxConfig()).toThrow(/must be >=/);
  });
});

describe('Phase 3: numeric configuration is validated, not coerced', () => {
  it('THROWS on a non-numeric value rather than using the default', () => {
    // A typo'd OUTBOX_MAX_ATTEMPTS=O (letter O) would otherwise become
    // the default silently, and nobody would learn their setting was
    // ignored.
    process.env.OUTBOX_MAX_ATTEMPTS = 'five';
    expect(() => resolveOutboxConfig()).toThrow(OutboxConfigError);
  });

  it('THROWS on a value below the permitted minimum', () => {
    process.env.OUTBOX_MAX_ATTEMPTS = '0';
    expect(() => resolveOutboxConfig()).toThrow(/>= 1/);
  });

  it('THROWS on a non-boolean flag', () => {
    process.env.OUTBOX_PROCESSOR_ENABLED = 'maybe';
    expect(() => resolveOutboxConfig()).toThrow(/boolean/);
  });

  it('applies the documented defaults', () => {
    process.env.EVENT_BUS_MODE = 'outbox';
    process.env.OUTBOX_PROCESSOR_ENABLED = 'true';

    const config = resolveOutboxConfig();
    expect(config.intervalMs).toBe(5000);
    expect(config.maxAttempts).toBe(5);
    expect(config.leaseTimeoutMs).toBe(30_000);
    expect(config.backoffBaseMs).toBe(1000);
    expect(config.backoffMaxMs).toBe(60_000);
  });
});

describe('Phase 3: EventBusFactory selects on configuration', () => {
  it('returns InMemoryEventBus in memory mode', () => {
    process.env.EVENT_BUS_MODE = 'memory';
    expect(EventBusFactory.getInstance()).toBeInstanceOf(InMemoryEventBus);
    expect(EventBusFactory.isDurable()).toBe(false);
  });

  it('returns a DURABLE bus in outbox mode (the F-11 fix)', () => {
    // The headline regression: before Phase 3 this returned
    // InMemoryEventBus no matter what.
    process.env.EVENT_BUS_MODE = 'outbox';
    process.env.OUTBOX_PROCESSOR_ENABLED = 'true';

    const bus = EventBusFactory.getInstance();
    expect(bus).not.toBeInstanceOf(InMemoryEventBus);
    expect(EventBusFactory.isDurable()).toBe(true);
  });

  it('does NOT silently degrade to in-memory on a misconfiguration', () => {
    // There is deliberately no catch that falls back. Downgrading
    // durable delivery to best-effort in production on a bad env var is
    // exactly the failure Phase 3 removes.
    process.env.EVENT_BUS_MODE = 'outbox';
    process.env.OUTBOX_PROCESSOR_ENABLED = 'false';
    process.env.OUTBOX_PROCESSOR_EXTERNAL = 'false';

    expect(() => EventBusFactory.getInstance()).toThrow(OutboxConfigError);
  });

  it('memoises the instance so handlers register on the bus that publishes', () => {
    // A factory returning a fresh bus per call would register
    // bootstrap's handlers on one object and publish to another, and
    // nothing would ever be delivered.
    process.env.EVENT_BUS_MODE = 'memory';
    expect(EventBusFactory.getInstance()).toBe(EventBusFactory.getInstance());
  });

  it('still exposes the full IEventBus surface in outbox mode', () => {
    // 131 call sites plus bootstrap use subscribe/unsubscribe/use.
    // Returning a bare publisher would have broken all of them.
    process.env.EVENT_BUS_MODE = 'outbox';
    process.env.OUTBOX_PROCESSOR_ENABLED = 'true';

    const bus = EventBusFactory.getInstance();
    expect(typeof bus.publish).toBe('function');
    expect(typeof bus.subscribe).toBe('function');
    expect(typeof bus.unsubscribe).toBe('function');
    expect(typeof bus.use).toBe('function');
  });

  it('gives the processor the INNER bus, not the outbox wrapper', () => {
    // Dispatching to the wrapper would write each claimed event straight
    // back into the outbox it came from -- an infinite loop that grows a
    // collection.
    process.env.EVENT_BUS_MODE = 'outbox';
    process.env.OUTBOX_PROCESSOR_ENABLED = 'true';

    const bus = EventBusFactory.getInstance();
    const target = EventBusFactory.getDispatchTarget();

    expect(target).not.toBe(bus);
    expect(target).toBeInstanceOf(InMemoryEventBus);
  });

  it('returns the same bus as the dispatch target in memory mode', () => {
    process.env.EVENT_BUS_MODE = 'memory';
    expect(EventBusFactory.getDispatchTarget()).toBe(EventBusFactory.getInstance());
  });
});
