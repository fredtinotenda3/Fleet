// tests/security/predictive-maintenance-consolidation.spec.ts
//
// PHASE 0, ITEM 5: regression guard for the predictive-maintenance
// consolidation decision -- see
// modules/intelligence/services/DECISIONS.md for the full evidence
// trail. Two things must stay true going forward:
//
//   1. There is exactly ONE predictive-maintenance implementation
//      (modules/ai/services/predictive-maintenance.service.ts). The
//      duplicate previously at
//      modules/intelligence/services/predictive-maintenance.service.ts
//      is gone and must not silently reappear.
//   2. IntelligenceHandler no longer triggers ANY predictive-maintenance
//      work on TripCreated/TripCompleted/VehicleUpdated -- that
//      responsibility belongs solely to AIPredictionTriggerHandler,
//      which (unlike the removed code) scopes to the single vehicle
//      the event names and persists its result.

import * as fs from 'fs';
import * as path from 'path';
import { IntelligenceHandler } from '../../server/events/handlers/intelligence/IntelligenceHandler';
import { DomainEvent } from '../../server/events/base/DomainEvent';

class TestDomainEvent extends DomainEvent {
  constructor(eventName: string, payload: Record<string, unknown> = {}, metadata?: Record<string, unknown>) {
    super(eventName, payload, metadata);
  }
}

describe('Phase 0: predictive-maintenance consolidation', () => {
  it('the duplicate modules/intelligence predictive-maintenance service file no longer exists', () => {
    const removedPath = path.join(
      __dirname,
      '../../modules/intelligence/services/predictive-maintenance.service.ts'
    );
    expect(fs.existsSync(removedPath)).toBe(false);
  });

  it('the authoritative modules/ai predictive-maintenance service still exists', () => {
    const authoritativePath = path.join(
      __dirname,
      '../../modules/ai/services/predictive-maintenance.service.ts'
    );
    expect(fs.existsSync(authoritativePath)).toBe(true);
  });

  it('no source file references the removed intelligence predictive-maintenance service', () => {
    const repoRoot = path.join(__dirname, '../..');
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.') || entry.name === 'dist') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          const content = fs.readFileSync(full, 'utf-8');
          if (full === __filename) continue;
          if (content.includes('modules/intelligence/services/predictive-maintenance')) {
            offenders.push(full);
          }
        }
      }
    };
    walk(repoRoot);

    expect(offenders).toEqual([]);
  });

  it('IntelligenceHandler no longer does anything for TripCreated/TripCompleted/VehicleUpdated', async () => {
    const handler = new IntelligenceHandler();

    // These must resolve cleanly (not throw) and, per the source
    // comment left in IntelligenceHandler.handle(), fall through to
    // the default no-op branch. There is nothing further to assert
    // about side effects without re-adding a mock for the removed
    // dependency -- the absence of a crash on an event that used to
    // reach the now-deleted service (with its 'default' tenant
    // fallback that resolveTenantScope() hard-rejects) is itself the
    // regression this guards.
    await expect(handler.handle(new TestDomainEvent('TripCreated', {}))).resolves.toBeUndefined();
    await expect(handler.handle(new TestDomainEvent('TripCompleted', {}))).resolves.toBeUndefined();
    await expect(handler.handle(new TestDomainEvent('VehicleUpdated', {}))).resolves.toBeUndefined();
  });
});
