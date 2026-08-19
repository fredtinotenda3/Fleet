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

  it('handles the job name in the telemetry worker', () => {
    const src = read('workers/telemetry.worker.ts');
    expect(src).toContain("jobName === 'eagletrack-sync'");
    expect(src).toContain('eagletrackConfigRepository.listEnabledTenantIds()');
    expect(src).toContain('eagletrackAdapter.syncOrganization(tenantId)');
  });

  it('enumerates only tenants with the integration enabled, not every organization', () => {
    // Polling every org would mean building a client and issuing HTTP
    // requests for tenants that have never configured Eagle Track.
    const src = read('workers/telemetry.worker.ts');
    const branch = src.slice(src.indexOf("jobName === 'eagletrack-sync'"));
    expect(branch).toContain('listEnabledTenantIds');
    expect(branch).not.toContain('forEachOrganization');
  });

  it('isolates one tenant failure inside the per-tenant loop so the sweep continues', () => {
    // Each tenant points at a DIFFERENT host we do not operate, so one
    // unreachable deployment must not stop every other tenant syncing.
    const src = read('workers/telemetry.worker.ts');
    const branch = src.slice(src.indexOf("jobName === 'eagletrack-sync'"));
    const loopStart = branch.indexOf('for (const tenantId of tenantIds)');
    const loopBody = branch.slice(loopStart, branch.indexOf('\n  }', loopStart));

    expect(loopStart).toBeGreaterThan(-1);
    expect(loopBody).toContain('try {');
    expect(loopBody).toContain('} catch (error) {');
  });

  it('leaves the Cartrack branch intact and returning before the Eagle Track branch', () => {
    // Regression guard: adding a branch after Cartrack's without a
    // `return` would run both syncs on a cartrack-sync job.
    const src = read('workers/telemetry.worker.ts');
    const cartrackIndex = src.indexOf("jobName === 'cartrack-sync'");
    const eagletrackIndex = src.indexOf("jobName === 'eagletrack-sync'");

    expect(cartrackIndex).toBeGreaterThan(-1);
    expect(eagletrackIndex).toBeGreaterThan(cartrackIndex);
    expect(src.slice(cartrackIndex, eagletrackIndex)).toContain('return;');
  });
});
