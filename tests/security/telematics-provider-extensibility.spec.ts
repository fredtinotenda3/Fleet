// tests/security/telematics-provider-extensibility.spec.ts
//
// PHASE 2 -- the falsifiable test of whether the abstraction holds.
//
// ---------------------------------------------------------------------
// WHAT IS BEING PROVEN
// ---------------------------------------------------------------------
// Before Phase 2, adding a telematics provider required editing generic
// fleet code:
//
//   live-map.service.ts        providerSourceFor() -- and its `return
//                              'cartrack'` default, which silently
//                              attributed every unrecognised device to
//                              a vendor it had nothing to do with
//   live-map.types.ts          a CLOSED union of vendor names, so every
//                              new provider was a type change rippling
//                              into the frontend
//   telematics.repository.ts   a `^eagletrack-` $regex device lookup
//
// None of that is provider-adapter work. This suite asserts it is no
// longer necessary, in two ways:
//
//   1. BEHAVIOURAL -- a third provider (MockTelematicsProvider) is
//      registered and driven through the same registry, contract and
//      canonical shape as the two real ones, with no generic file
//      knowing it exists.
//   2. STRUCTURAL -- generic fleet modules are read from disk and
//      asserted not to name any provider. This is the assertion that
//      fails if someone reintroduces `if (providerId === 'cartrack')`
//      in six months, which no behavioural test would catch.

import * as fs from 'fs';
import * as path from 'path';

import { TelematicsProviderRegistry } from '@/modules/telematics/providers/provider.registry';
import {
  TelematicsCapability,
  SOURCE_UNKNOWN,
} from '@/modules/telematics/providers/provider.types';
import {
  MockTelematicsProvider,
  MOCK_PROVIDER_ID,
  mockPoint,
} from '@/modules/telematics/providers/mock/mock.provider';
import { CanonicalTelemetryPoint } from '@/modules/telematics/providers/canonical-telemetry';
import { TelematicsProvider } from '@/modules/telematics/providers/provider.contract';

const ROOT = path.resolve(__dirname, '../..');

function codeOf(rel: string): string {
  return fs
    .readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('Phase 2: a third provider needs no generic fleet change', () => {
  const TENANT = 'tenant-a';

  function seededMock() {
    return new MockTelematicsProvider({
      enabledTenants: [TENANT],
      devicesByTenant: {
        [TENANT]: [
          { externalDeviceId: 'MOCK-001', registration: 'ADY2531', online: true },
        ],
      },
      liveByTenant: {
        [TENANT]: [
          mockPoint({
            externalDeviceId: 'MOCK-001',
            vehicleId: 'vehicle-1',
            recordedAt: new Date('2026-08-20T09:15:00.000Z'),
            position: { latitude: -17.82, longitude: 31.05, speed: 54, heading: 91 },
          }),
        ],
      },
    });
  }

  it('registers and resolves through the same registry as the real providers', () => {
    const registry = new TelematicsProviderRegistry();
    registry.register(seededMock());

    expect(registry.resolve(MOCK_PROVIDER_ID).descriptor.providerId).toBe(
      MOCK_PROVIDER_ID
    );
  });

  it('is driven entirely through the TelematicsProvider contract', async () => {
    // Typed as the interface, NOT the concrete class. If the fleet layer
    // needed anything provider-specific, this would not compile.
    const provider: TelematicsProvider = seededMock();

    expect(await provider.getStatus(TENANT)).toBe('enabled');
    expect(await provider.testConnection(TENANT)).toBe(true);
    expect(await provider.listDevices(TENANT)).toHaveLength(1);

    const points = await provider.getLiveTelemetry(TENANT);
    expect(points).toHaveLength(1);
    expect(points[0].providerId).toBe(MOCK_PROVIDER_ID);
  });

  it('produces the SAME canonical shape as Cartrack and Eagle Track', () => {
    // The point of the contract: a consumer reads these fields without
    // knowing which vendor produced them.
    const point: CanonicalTelemetryPoint = mockPoint({
      externalDeviceId: 'MOCK-001',
      recordedAt: new Date(),
      position: { latitude: 1, longitude: 2 },
    });

    expect(point).toHaveProperty('providerId');
    expect(point).toHaveProperty('externalDeviceId');
    expect(point).toHaveProperty('recordedAt');
    // And critically NOT ownership: an adapter has no field in which to
    // express a tenant, so a buggy or compromised one cannot forge it.
    expect(point).not.toHaveProperty('tenantId');
    expect(point).not.toHaveProperty('orgUnitId');
  });

  it('declares a DIFFERENT capability set, and the platform copes', () => {
    const registry = new TelematicsProviderRegistry();
    registry.register(seededMock());

    // No fuel report, unlike Eagle Track. A caller asks the registry
    // rather than name-checking the provider.
    expect(registry.supports(MOCK_PROVIDER_ID, TelematicsCapability.LIVE_POSITION)).toBe(true);
    expect(registry.supports(MOCK_PROVIDER_ID, TelematicsCapability.FUEL_REPORT)).toBe(false);
    expect(registry.supports(MOCK_PROVIDER_ID, TelematicsCapability.DRIVER_SYNC)).toBe(false);
  });

  it('is NOT registered in production bootstrap', () => {
    // A provider that fabricates positions must never be resolvable in a
    // real deployment -- a registry entry is exactly the kind of thing
    // that gets copied into production "temporarily".
    const bootstrap = codeOf('modules/telematics/providers/provider.bootstrap.ts');
    expect(bootstrap).not.toContain(MOCK_PROVIDER_ID);
    expect(bootstrap).not.toContain('mock');
  });

  it('appears in NO file outside its own directory', () => {
    // The strongest form of the claim: adding this provider required
    // touching nothing else. Tests are excluded (they must name it) and
    // so is its own directory.
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.next') continue;
        const full = path.join(dir, entry.name);
        const rel = path.relative(ROOT, full).replace(/\\/g, '/'); // Windows fix
        if (entry.isDirectory()) {
          if (rel.startsWith('tests') || rel.includes('providers/mock')) continue;
          walk(full);
        } else if (/\.tsx?$/.test(entry.name)) {
          const content = fs.readFileSync(full, 'utf8');
          if (content.includes(MOCK_PROVIDER_ID)) offenders.push(rel);
        }
      }
    };

    for (const dir of ['modules', 'server', 'infrastructure', 'shared', 'app', 'frontend', 'workers']) {
      const full = path.join(ROOT, dir);
      if (fs.existsSync(full)) walk(full);
    }

    expect(offenders).toEqual([]);
  });
});

describe('Phase 2: generic fleet code names no provider', () => {
  /**
   * Modules that must be provider-agnostic.
   *
   * Deliberately EXCLUDES modules/telematics/adapters/** and
   * modules/telematics/providers/** (where provider knowledge belongs),
   * the vendor config repositories and controllers (legitimate
   * provider-specific admin surfaces, explicitly permitted by the Phase
   * 2 brief), and the vendor-named API routes.
   */
  const GENERIC_FILES = [
    'modules/telematics/services/telematics.service.ts',
    'modules/digital-twin/services/digital-twin.service.ts',
    'modules/ai/services/driver-risk.service.ts',
    'modules/ai/services/fleet-health.service.ts',
    'modules/ai/services/predictive-maintenance.service.ts',
    'modules/attention/services/attention-ownership.resolver.ts',
    'modules/reporting/services/report-query.engine.ts',
    'modules/vehicles/services/vehicle-identity-resolver.service.ts',
  ];

  const PROVIDER_NAMES = ['cartrack', 'eagletrack'];

  it.each(GENERIC_FILES)('%s mentions no provider by name', (rel) => {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) return; // tolerated: file set evolves

    const code = codeOf(rel).toLowerCase();
    for (const name of PROVIDER_NAMES) {
      expect(code).not.toContain(name);
    }
  });

  it('the shared ingestion service contains no provider branching', () => {
    // The Phase 2 rule in its most literal form:
    //   if (provider === 'cartrack')  /  deviceId.startsWith('eagletrack-')
    const code = codeOf('modules/telematics/services/telematics.service.ts');

    expect(code).not.toMatch(/startsWith\(\s*['"`](cartrack|eagletrack)/i);
    expect(code).not.toMatch(/===\s*['"`](cartrack|eagletrack)['"`]/i);
  });

  it('device-id prefix parsing lives in exactly ONE module', () => {
    // Before Phase 2 there were two independent copies -- live-map's
    // providerSourceFor and the repository's `^eagletrack-` regex --
    // which is how they were free to disagree. Consolidating them into
    // provider.resolve.ts is what makes the transitional fallback
    // deletable once the backfill has run.
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        const rel = path.relative(ROOT, full).replace(/\\/g, '/');
        if (entry.isDirectory()) {
          if (rel.includes('providers') || rel.includes('adapters')) continue;
          walk(full);
        } else if (/\.tsx?$/.test(entry.name)) {
          const code = codeOf(rel);
          if (/startsWith\(\s*['"`](cartrack|eagletrack|demo)-/.test(code)) {
            offenders.push(rel);
          }
          if (/slice\(\s*['"`](cartrack|eagletrack)-['"`]\.length\s*\)/.test(code)) {
            offenders.push(rel);
          }
        }
      }
    };
    walk(path.join(ROOT, 'modules'));

    expect(offenders).toEqual([]);
  });
});

describe('Phase 2: unknown provider identity is honest', () => {
  it("resolves an unrecognised device to 'unknown', never a vendor", async () => {
    const { resolveProviderSource } = await import(
      '@/modules/telematics/providers/provider.resolve'
    );

    // The exact regression: this used to return 'cartrack'.
    expect(resolveProviderSource(undefined, 'something-else-entirely')).toBe(
      SOURCE_UNKNOWN
    );
    expect(resolveProviderSource(undefined, undefined)).toBe(SOURCE_UNKNOWN);
    expect(resolveProviderSource({ deviceId: 'geotab-123' })).toBe(SOURCE_UNKNOWN);
  });

  it('prefers the stored providerId over any prefix parsing', async () => {
    const { resolveProviderSource } = await import(
      '@/modules/telematics/providers/provider.resolve'
    );

    // A device whose stored id disagrees with its prefix must trust the
    // FIELD -- the prefix is a legacy storage detail, not identity.
    expect(
      resolveProviderSource({ providerId: 'eagletrack', deviceId: 'cartrack-999' })
    ).toBe('eagletrack');
  });

  it('recovers the provider from a legacy prefix when no field is stored', async () => {
    const { resolveProviderSource } = await import(
      '@/modules/telematics/providers/provider.resolve'
    );

    expect(resolveProviderSource({ deviceId: 'eagletrack-1234' })).toBe('eagletrack');
    expect(resolveProviderSource({ deviceId: 'cartrack-ABC' })).toBe('cartrack');
    expect(resolveProviderSource({ deviceId: 'demo-veh1' })).toBe('demo');
  });

  it('returns the external id without a prefix', async () => {
    const { resolveExternalDeviceId } = await import(
      '@/modules/telematics/providers/provider.resolve'
    );

    // First-class field wins.
    expect(
      resolveExternalDeviceId({ externalDeviceId: 'uin-1', deviceId: 'eagletrack-uin-1' })
    ).toBe('uin-1');
    // Legacy fallback strips the recognised prefix only.
    expect(resolveExternalDeviceId({ deviceId: 'eagletrack-uin-1' })).toBe('uin-1');
    // Unrecognised: returned whole rather than mangled.
    expect(resolveExternalDeviceId({ deviceId: 'geotab-9' })).toBe('geotab-9');
  });
});

describe('Phase 2: polling callers go through the registry, not adapters', () => {
  /**
   * The cron/worker migration, asserted structurally.
   *
   * Before it, three polling paths imported a vendor adapter by name --
   * the worker sweep, the cron route and the read-through refresh -- and
   * the worker additionally imported two vendor config repositories to
   * enumerate tenants. Adding a third provider therefore required
   * editing generic scheduling code, which is the coupling Phase 2
   * exists to remove.
   *
   * These files may legitimately NAME a provider (the cron route's
   * schedule is vendor-specific, and a credential form is inherently
   * vendor-specific). What they must not do is import the adapter
   * SINGLETON and call it directly, bypassing the contract.
   */
  const POLLING_CALLERS = [
    'workers/telemetry.worker.ts',
    'app/api/cron/eagletrack-sync/route.ts',
    'modules/telematics/controllers/cartrack.controller.ts',
    'modules/telematics/controllers/eagletrack.controller.ts',
  ];

  /**
   * PHASE 4, F-16 -- the read-through service moved OUT of this list.
   *
   * It used to be a polling caller: it resolved the provider through the
   * registry and ran a full sync inline on the live-map read path. Phase
   * 4 removed the sync entirely, so it no longer resolves a provider
   * because it no longer calls one.
   *
   * The Phase 2 invariant it was here to protect (never import an
   * adapter singleton) is still asserted below, alongside the STRONGER
   * Phase 4 property: it performs no provider call whatsoever.
   */
  const READ_PATH_FILES = ['modules/telematics/services/eagletrack-read-through.service.ts'];

  it.each(POLLING_CALLERS)('%s imports no adapter singleton', (rel) => {
    const code = codeOf(rel);
    expect(code).not.toContain('cartrackAdapter');
    expect(code).not.toContain('eagletrackAdapter');
  });

  it.each(POLLING_CALLERS)('%s resolves through the registry', (rel) => {
    expect(codeOf(rel)).toContain('getTelematicsProvider');
  });

  it('the worker names no vendor in executable code at all', () => {
    // The strongest form: the scheduler is now fully provider-agnostic,
    // deriving the provider id from the job name.
    const code = codeOf('workers/telemetry.worker.ts').toLowerCase();
    expect(code).not.toContain('cartrack');
    expect(code).not.toContain('eagletrack');
  });

  it('the worker enumerates tenants via the contract, not a vendor config repo', () => {
    const code = codeOf('workers/telemetry.worker.ts');
    expect(code).toContain('listEnabledTenants()');
    expect(code).not.toContain('ConfigRepository');
  });

  it('every registered provider implements the polling surface', () => {
    // syncTenant and listEnabledTenants are non-optional on the
    // contract, so a provider that skipped them would not compile --
    // this guards against someone making them optional later to make a
    // partial adapter fit.
    const cartrack = require('@/modules/telematics/adapters/cartrack/cartrack.provider')
      .cartrackProvider;
    const eagletrack =
      require('@/modules/telematics/adapters/eagletrack/eagletrack.provider')
        .eagletrackProvider;
    const mock = new MockTelematicsProvider();

    for (const provider of [cartrack, eagletrack, mock]) {
      expect(typeof provider.syncTenant).toBe('function');
      expect(typeof provider.listEnabledTenants).toBe('function');
    }
  });

  it('a third provider is driven by the same sweep with no worker change', async () => {
    // The behavioural half: the worker's loop is
    //   listEnabledTenants() -> syncTenant(tenantId)
    // and the mock satisfies it without the worker knowing it exists.
    const mock = new MockTelematicsProvider({
      enabledTenants: ['tenant-a', 'tenant-b'],
      liveByTenant: {
        'tenant-a': [
          mockPoint({
            externalDeviceId: 'MOCK-001',
            vehicleId: 'vehicle-1',
            recordedAt: new Date('2026-08-20T09:15:00.000Z'),
          }),
        ],
      },
    });

    const tenants = await mock.listEnabledTenants();
    expect(tenants).toEqual(['tenant-a', 'tenant-b']);

    const result = await mock.syncTenant('tenant-a');
    expect(result.providerId).toBe(MOCK_PROVIDER_ID);
    expect(result.matched).toBe(1);
    expect(result.errors).toEqual([]);

    // The neutral result shape: no vendor vocabulary reaches a scheduler.
    expect(Object.keys(result).sort()).toEqual([
      'errors',
      'ingested',
      'matched',
      'providerId',
      'tenantId',
      'unmatchedCount',
      'unmatchedSample',
    ]);
  });
});

describe('Phase 4: the read path performs no provider work', () => {
  const READ_PATH_FILES = [
    'modules/telematics/services/eagletrack-read-through.service.ts',
    'modules/telematics/services/live-map.service.ts',
  ];

  it.each(READ_PATH_FILES)('%s imports no adapter singleton', (rel) => {
    const code = codeOf(rel);
    expect(code).not.toContain('cartrackAdapter');
    expect(code).not.toContain('eagletrackAdapter');
  });

  it('the read-through service never calls a provider', () => {
    // THE F-16 REGRESSION. A GET on the live map could previously
    // trigger a roster fetch, a status fetch, sub-syncs, device
    // registration and N telemetry inserts -- so p99 map latency was
    // bounded by vendor latency, and a fleet nobody was watching
    // ingested nothing at all.
    const code = codeOf('modules/telematics/services/eagletrack-read-through.service.ts');

    expect(code).not.toContain('syncTenant');
    expect(code).not.toContain('getTelematicsProvider');
    expect(code).not.toContain('getLiveTelemetry');
  });

  it('the read-through service enqueues instead of syncing', () => {
    const code = codeOf('modules/telematics/services/eagletrack-read-through.service.ts');
    expect(code).toContain('queueService.addJob');
    expect(code).toContain('JobType.EAGLETRACK_SYNC');
  });

  it('does not fall back to an in-process lock when the queue is unreachable', () => {
    // The old fallback ran the sync anyway with only in-process
    // de-duping, so N serverless instances made N concurrent vendor
    // calls. It now skips the refresh and reports stale.
    const code = codeOf('modules/telematics/services/eagletrack-read-through.service.ts');
    expect(code).not.toContain('inFlightByTenant');
    expect(code).not.toContain('acquireLock');
  });

  it('the live map reports staleness instead of blocking to remove it', () => {
    const code = codeOf('modules/telematics/services/live-map.service.ts');
    expect(code).toContain('checkEagleTrackStaleness');
    expect(code).toContain('dataStale');
  });
});
