// tests/unit/telematics/stale-vehicle-job-wiring.spec.ts
//
// PHASE 7 FOLLOW-UP -- fleet_telematics_stale_vehicles{provider} is now
// populated by a scheduled job. A background job is wired in four
// separate places -- the JobType enum, the job-type -> queue map, the
// cron schedule, and the worker's dispatch branch. Miss any one and the
// gauge silently stays at zero forever, which looks identical to "every
// vehicle is fine" on a dashboard. Same technique and same reasoning as
// tests/unit/telematics/eagletrack-worker-wiring.spec.ts: filesystem-
// based rather than importing the worker, since importing
// workers/telemetry.worker.ts pulls in BullMQ/Redis/Mongo and the
// property under test is structural, about the source.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

describe('the stale-vehicle detection job is wired end to end', () => {
  it('declares a JobType and routes it to the telemetry queue', () => {
    const src = read('infrastructure/queue/queue.service.ts');
    expect(src).toContain("DETECT_STALE_VEHICLES = 'detect-stale-vehicles'");
    expect(src).toContain("[JobType.DETECT_STALE_VEHICLES]: 'telemetry-jobs'");
  });

  it('registers a cron schedule, defaulting to every 15 minutes', () => {
    const src = read('server/scheduler/bootstrap-schedules.ts');
    expect(src).toContain('JobType.DETECT_STALE_VEHICLES');
    expect(src).toContain('telemetry-stale-vehicles');

    const match = src.match(
      /jobType:\s*JobType\.DETECT_STALE_VEHICLES,\s*cron:\s*'([^']+)'/
    );
    expect(match).not.toBeNull();
    expect(match![1]).toBe('*/15 * * * *');
  });

  it('is dispatched by the telemetry worker', () => {
    const src = read('workers/telemetry.worker.ts');
    expect(src).toContain("jobName === 'detect-stale-vehicles'");
    expect(src).toContain('detectStaleVehicles');
  });

  it('records a scheduled-run heartbeat after the sweep, like every other scheduled sweep', () => {
    const src = read('workers/telemetry.worker.ts');
    const branchStart = src.indexOf("jobName === 'detect-stale-vehicles'");
    const branch = src.slice(branchStart, branchStart + 500);
    expect(branch).toContain('recordScheduledRun(jobName, true)');
  });

  it('the worker delegates to the pure, independently-testable detection service rather than inlining Mongo/metric calls', () => {
    const src = read('workers/telemetry.worker.ts');
    expect(src).toContain(
      "@/modules/telematics/services/stale-vehicle-detection.service"
    );
  });
});

describe('the stale-vehicle repository query never scopes by tenant', () => {
  it('countStaleDevicesByProvider filters by providerId and lastFixAt only, not tenantId', () => {
    const src = read('modules/telematics/repositories/telematics.repository.ts');
    const start = src.indexOf('countStaleDevicesByProvider');
    expect(start).toBeGreaterThan(-1);
    const method = src.slice(start, start + 600);

    expect(method).toContain('providerId');
    expect(method).toContain('lastFixAt');
    expect(method).not.toContain('tenantId');
  });
});
