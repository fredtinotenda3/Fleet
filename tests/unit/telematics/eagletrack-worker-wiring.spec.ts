// tests/unit/telematics/eagletrack-worker-wiring.spec.ts
//
// A background job is wired in four separate places -- the JobType enum,
// the job-type -> queue map, the cron schedule, and the worker's
// dispatch branch. Miss any one and the integration is silently never
// polled: no error, no log, just an integration that appears configured
// and never syncs. That failure is invisible in every other test, so it
// is asserted structurally here.
//
// Deliberately filesystem-based rather than importing the worker:
// importing workers/telemetry.worker.ts pulls in BullMQ, Redis and the
// whole Mongo dependency graph, and the property being asserted is a
// structural one about the source -- the same reasoning
// tests/security/module-scope-conformance.spec.ts documents.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

describe('eagletrack-sync is wired end to end', () => {
  it('declares a JobType and routes it to the telemetry queue', () => {
    const src = read('infrastructure/queue/queue.service.ts');
    expect(src).toContain("EAGLETRACK_SYNC = 'eagletrack-sync'");
    expect(src).toContain("[JobType.EAGLETRACK_SYNC]: 'telemetry-jobs'");
  });

  it('registers a cron schedule', () => {
    const src = read('server/scheduler/bootstrap-schedules.ts');
    expect(src).toContain('JobType.EAGLETRACK_SYNC');
    expect(src).toContain('telemetry-eagletrack-sync');
  });

  it('is handled by the generic provider dispatch in the telemetry worker', () => {
    /**
     * PHASE 2 (cron/worker migration) -- THIS TEST WAS UPDATED.
     *
     * It previously asserted:
     *
     *   expect(src).toContain("jobName === 'eagletrack-sync'");
     *   expect(src).toContain('eagletrackConfigRepository.listEnabledTenantIds()');
     *   expect(src).toContain('eagletrackAdapter.syncOrganization(tenantId)');
     *
     * i.e. it required the worker to name a vendor three times -- which
     * is precisely the coupling Phase 2 removes, so leaving it would
     * have made the suite enforce the defect.
     *
     * The PROPERTY the original protected is still real and still
     * asserted: a background job is wired in four separate places
     * (JobType enum, job-type -> queue map, cron schedule, worker
     * dispatch), and missing any one means the integration appears
     * configured and silently never polls. What changed is only that the
     * fourth place is now a generic dispatch keyed on `<providerId>-sync`
     * rather than a hand-written branch per vendor.
     */
    const src = read('workers/telemetry.worker.ts');

    // The dispatch derives the provider id from the job name, so
    // 'eagletrack-sync' is handled without being named.
    expect(src).toContain('-sync$');
    expect(src).toContain('isKnownProvider(providerId)');
    expect(src).toContain('getTelematicsProvider(providerId)');
    expect(src).toContain('provider.syncTenant(tenantId)');

    // And it no longer names any vendor in executable code.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).not.toContain('eagletrackAdapter');
    expect(code).not.toContain('cartrackAdapter');
    expect(code).not.toContain('eagletrackConfigRepository');
    expect(code).not.toContain('cartrackConfigRepository');
  });

  it('the job name matches the generic dispatch pattern', () => {
    // The wiring only holds because JobType's value is literally
    // `<providerId>-sync`. If someone renames it to 'sync-eagletrack',
    // the dispatch silently stops matching and the integration stops
    // polling with no error -- exactly the invisible failure this suite
    // exists to catch.
    const jobName = 'eagletrack-sync';
    const match = /^(.+)-sync$/.exec(jobName);

    expect(match).not.toBeNull();
    expect(match![1]).toBe('eagletrack');

    const queue = read('infrastructure/queue/queue.service.ts');
    expect(queue).toContain(`EAGLETRACK_SYNC = '${jobName}'`);
  });

  it('enumerates only tenants with the integration enabled, not every organization', () => {
    // Polling every org would mean building a client and issuing HTTP
    // requests for tenants that have never configured a provider. The
    // enabled-tenant list now comes from the CONTRACT
    // (provider.listEnabledTenants) rather than a vendor config
    // repository, but the property is unchanged.
    const src = read('workers/telemetry.worker.ts');
    const branch = src.slice(src.indexOf('providerSyncMatch'));

    expect(branch).toContain('provider.listEnabledTenants()');
    expect(branch).not.toContain('forEachOrganization');
  });

  it('isolates one tenant failure inside the per-tenant loop so the sweep continues', () => {
    // Each tenant points at a DIFFERENT host we do not operate, so one
    // unreachable deployment must not stop every other tenant syncing.
    const src = read('workers/telemetry.worker.ts');
    const branch = src.slice(src.indexOf('providerSyncMatch'));
    const loopStart = branch.indexOf('for (const tenantId of tenantIds)');
    const loopBody = branch.slice(loopStart);

    expect(loopStart).toBeGreaterThan(-1);
    expect(loopBody).toContain('try {');
    expect(loopBody).toContain('} catch (error) {');
  });

  it('fails closed on an unregistered provider rather than silently skipping', () => {
    // A schedule that quietly stops ingesting is indistinguishable from
    // a fleet that stopped moving. It must never fall back to a default
    // provider -- the `return 'cartrack'` defect in another place.
    const src = read('workers/telemetry.worker.ts');
    const branch = src.slice(src.indexOf('providerSyncMatch'));

    expect(branch).toContain('throw new Error');
    expect(branch).toContain('unregistered telematics provider');
  });
});
