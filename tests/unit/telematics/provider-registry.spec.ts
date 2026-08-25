// tests/unit/telematics/provider-registry.spec.ts
//
// PHASE 2 -- registry, capability model and fail-closed resolution.
//
// THE DEFECT THIS GUARDS: provider identity was inferred from a device-id
// prefix, and the inference ended in `return 'cartrack'`. Every device
// that was not identifiably Eagle Track -- including devices posted
// through the generic ingest endpoint, and including any provider added
// later -- was silently labelled Cartrack. The default was invisible
// because it was plausible.

import {
  TelematicsProviderRegistry,
} from '@/modules/telematics/providers/provider.registry';
import {
  TelematicsCapability,
  PROVIDER_CARTRACK,
  PROVIDER_EAGLETRACK,
  supportsCapability,
} from '@/modules/telematics/providers/provider.types';
import { ProviderError } from '@/modules/telematics/providers/provider.errors';
import {
  MockTelematicsProvider,
  MOCK_PROVIDER_ID,
} from '@/modules/telematics/providers/mock/mock.provider';
import { CARTRACK_DESCRIPTOR } from '@/modules/telematics/adapters/cartrack/cartrack.provider';
import { EAGLETRACK_DESCRIPTOR } from '@/modules/telematics/adapters/eagletrack/eagletrack.provider';

/** An isolated registry per test — never the production singleton. */
function freshRegistry() {
  return new TelematicsProviderRegistry();
}

describe('Phase 2: registry resolution fails closed', () => {
  it('THROWS on an unknown provider id', () => {
    const registry = freshRegistry();
    registry.register(new MockTelematicsProvider());

    expect(() => registry.resolve('does-not-exist')).toThrow(ProviderError);
  });

  it('does NOT fall back to Cartrack for an unknown id', () => {
    // The headline regression. Before Phase 2 an unrecognised device
    // resolved to 'cartrack' with no error anywhere.
    const registry = freshRegistry();
    registry.register(new MockTelematicsProvider());

    let resolved: unknown = 'NOT THROWN';
    try {
      resolved = registry.resolve('unknown');
    } catch (error) {
      resolved = error;
    }

    expect(resolved).toBeInstanceOf(ProviderError);
    expect(resolved).not.toMatchObject({ descriptor: { providerId: PROVIDER_CARTRACK } });
  });

  it('names the registered providers in the error, to make a typo diagnosable', () => {
    const registry = freshRegistry();
    registry.register(new MockTelematicsProvider());

    expect(() => registry.resolve('mock-provdier')).toThrow(/mock-provider/);
  });

  it('tryResolve returns undefined rather than throwing', () => {
    const registry = freshRegistry();
    expect(registry.tryResolve('nope')).toBeUndefined();
  });

  it('has() is a pure predicate with no side effects', () => {
    const registry = freshRegistry();
    expect(registry.has('nope')).toBe(false);
    expect(registry.listIds()).toEqual([]);
  });

  it('resolves a registered provider deterministically', () => {
    const registry = freshRegistry();
    const provider = new MockTelematicsProvider();
    registry.register(provider);

    // Same instance every time -- a registry that constructed on each
    // resolve would give each caller its own credentials cache and its
    // own rate-limit state.
    expect(registry.resolve(MOCK_PROVIDER_ID)).toBe(provider);
    expect(registry.resolve(MOCK_PROVIDER_ID)).toBe(provider);
  });
});

describe('Phase 2: registration hygiene', () => {
  it('THROWS on a duplicate provider id rather than silently replacing', () => {
    // Two modules both believing they own 'cartrack', with the winner
    // decided by import order, is a bug that only appears in production
    // and only under a specific bundling.
    const registry = freshRegistry();
    registry.register(new MockTelematicsProvider());

    expect(() => registry.register(new MockTelematicsProvider())).toThrow(
      /already registered/
    );
  });

  it('rejects a provider with no id', () => {
    const registry = freshRegistry();
    const broken = new MockTelematicsProvider();
    (broken as unknown as { descriptor: { providerId: string } }).descriptor = {
      ...broken.descriptor,
      providerId: '   ',
    };

    expect(() => registry.register(broken)).toThrow(/non-empty providerId/);
  });

  it('lists ids in a deterministic order', () => {
    const registry = freshRegistry();
    registry.register(new MockTelematicsProvider());
    expect(registry.listIds()).toEqual([MOCK_PROVIDER_ID]);
  });
});

describe('Phase 2: capability model replaces provider name-checks', () => {
  it('answers "does provider X support Y" without a provider conditional', () => {
    const registry = freshRegistry();
    registry.register(new MockTelematicsProvider());

    expect(registry.supports(MOCK_PROVIDER_ID, TelematicsCapability.LIVE_POSITION)).toBe(
      true
    );
    expect(registry.supports(MOCK_PROVIDER_ID, TelematicsCapability.FUEL_REPORT)).toBe(
      false
    );
  });

  it('returns false (not a throw) for an unregistered provider', () => {
    // "Can X do Y" has a sensible answer for an X that does not exist.
    const registry = freshRegistry();
    expect(registry.supports('nope', TelematicsCapability.ALERTS)).toBe(false);
  });

  it('filters providers by capability', () => {
    const registry = freshRegistry();
    registry.register(new MockTelematicsProvider());

    expect(registry.withCapability(TelematicsCapability.LIVE_POSITION)).toHaveLength(1);
    expect(registry.withCapability(TelematicsCapability.FUEL_REPORT)).toHaveLength(0);
  });

  it('records the real capability asymmetry between the two shipped providers', () => {
    // This asymmetry is exactly why the fleet layer must not assume a
    // provider can do what another one can: Eagle Track has six
    // capabilities, Cartrack has two.
    expect(supportsCapability(CARTRACK_DESCRIPTOR, TelematicsCapability.LIVE_POSITION)).toBe(
      true
    );
    expect(
      supportsCapability(CARTRACK_DESCRIPTOR, TelematicsCapability.FUEL_REPORT)
    ).toBe(false);
    expect(
      supportsCapability(CARTRACK_DESCRIPTOR, TelematicsCapability.HISTORICAL_POSITION)
    ).toBe(false);

    expect(
      supportsCapability(EAGLETRACK_DESCRIPTOR, TelematicsCapability.FUEL_REPORT)
    ).toBe(true);
    expect(
      supportsCapability(EAGLETRACK_DESCRIPTOR, TelematicsCapability.HISTORICAL_POSITION)
    ).toBe(true);
  });

  it('declares no capability whose method is missing', () => {
    // A provider that advertises a capability it cannot honour is worse
    // than one that does not advertise it: a caller checks the
    // descriptor, is told yes, and then fails.
    const cartrack = require('@/modules/telematics/adapters/cartrack/cartrack.provider')
      .cartrackProvider;
    const eagletrack =
      require('@/modules/telematics/adapters/eagletrack/eagletrack.provider')
        .eagletrackProvider;

    for (const provider of [cartrack, eagletrack]) {
      const caps: TelematicsCapability[] = [...provider.descriptor.capabilities];

      if (caps.includes(TelematicsCapability.HISTORICAL_POSITION)) {
        expect(typeof provider.getHistoricalTelemetry).toBe('function');
      }
      // Every provider must implement the non-optional surface.
      expect(typeof provider.getLiveTelemetry).toBe('function');
      expect(typeof provider.listDevices).toBe('function');
      expect(typeof provider.getStatus).toBe('function');
      expect(typeof provider.testConnection).toBe('function');
    }
  });

  it('the two shipped providers use distinct ids', () => {
    expect(CARTRACK_DESCRIPTOR.providerId).toBe(PROVIDER_CARTRACK);
    expect(EAGLETRACK_DESCRIPTOR.providerId).toBe(PROVIDER_EAGLETRACK);
    expect(CARTRACK_DESCRIPTOR.providerId).not.toBe(EAGLETRACK_DESCRIPTOR.providerId);
  });
});

describe('Phase 2: the provider error model is provider-neutral', () => {
  it('classifies retryable and non-retryable categories differently', () => {
    const auth = new ProviderError('authentication_failed', 'x', { providerId: 'p' });
    const transient = new ProviderError('transient_error', 'x', { providerId: 'p' });

    // Retrying rejected credentials just burns the account's lockout
    // budget; retrying a socket reset is correct.
    expect(auth.retryable).toBe(false);
    expect(transient.retryable).toBe(true);
  });

  it('maps categories onto distinguishable status codes', () => {
    // 502 for an upstream failure rather than 500 -- so an operator can
    // tell "the vendor is down" from "we have a bug", which the previous
    // string-based handling could not express.
    expect(new ProviderError('provider_unavailable', 'x', { providerId: 'p' }).statusCode).toBe(502);
    expect(new ProviderError('authentication_failed', 'x', { providerId: 'p' }).statusCode).toBe(401);
    expect(new ProviderError('rate_limited', 'x', { providerId: 'p' }).statusCode).toBe(429);
    expect(new ProviderError('unsupported_capability', 'x', { providerId: 'p' }).statusCode).toBe(501);
  });

  it('exposes only enumerated fields to logs', () => {
    const error = new ProviderError('rate_limited', 'slow down', {
      providerId: 'p',
      operation: 'getLiveTelemetry',
      externalDeviceId: 'uin-1',
      providerDetail: 'HTTP 429',
    });

    // Enumerated rather than spreading `this`, so a field added to the
    // class later cannot silently start appearing in logs.
    expect(Object.keys(error.toLogContext()).sort()).toEqual([
      'category',
      'externalDeviceId',
      'operation',
      'providerDetail',
      'providerId',
      'retryable',
      'vehicleId',
    ]);
  });
});
