// tests/security/websocket-org-unit-isolation.spec.ts
//
// PHASE 0, F-7 regression suite.
//
// THE VULNERABILITY: every socket joined exactly one room,
// `tenant:${tenantId}`, and telematicsService emitted `vehicle:location`
// for EVERY ingested fix through emitToTenant(). So every user in a
// tenant received live positions for every vehicle in that tenant,
// regardless of org unit -- data the REST path deliberately withholds.
// A Bulawayo branch user was denied Harare vehicles over HTTP and
// pushed them over WebSocket, continuously.
//
// Tested against a fake Socket.IO server rather than a real one: the
// property under test is WHICH ROOMS an event is addressed to and which
// rooms a socket joined, both of which are decided in this file's own
// code. Standing up a real transport would test socket.io, not us.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

/**
 * STRUCTURAL, and deliberately so.
 *
 * The WebSocket module creates its Socket.IO instance inside
 * initialize(), keeps it in a module-private binding, and short-circuits
 * every emit when it is null. Asserting delivery behaviour would mean
 * booting a real HTTP server and a real transport, which would test
 * socket.io rather than this codebase -- and would still not observe
 * room membership, which is what actually decides the leak.
 *
 * So these read the source, the same technique
 * module-scope-conformance.spec.ts and export-scope-conformance.spec.ts
 * already use here, for the same reason: the property is "this code path
 * applies scope", it is visible in the source, and the failure mode
 * being guarded against is somebody REMOVING the scoping -- which a
 * source assertion catches precisely.
 *
 * The behavioural counterpart is left to the audit's Phase 4 item on
 * integration testing; see PHASE_0_REMAINING_FINDINGS.md.
 */
function codeOf(rel: string): string {
  return fs
    .readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('F-7: sockets join rooms from server-resolved scope only', () => {
  const src = () => codeOf('infrastructure/websocket/server.ts');

  it('resolves the org-unit closure at handshake from tenantContextService', () => {
    const code = src();
    expect(code).toContain('tenantContextService.resolveContext');
    expect(code).toContain('accessibleOrgUnitIds');
  });

  it('refuses a connection whose scope cannot be resolved', () => {
    // An admitted socket carrying `accessibleOrgUnitIds === undefined`
    // would read as org-wide to any future consumer of that field.
    const code = src();
    expect(code).toMatch(/catch\s*\(\s*error\s*\)/);
    expect(code).toContain("next(new Error('Invalid token'))");
  });

  it('refuses a token with no tenantId or userId', () => {
    expect(src()).toMatch(/if\s*\(\s*!payload\.tenantId\s*\|\|\s*!payload\.userId\s*\)/);
  });

  it('joins one room per accessible org unit for scoped callers', () => {
    const code = src();
    expect(code).toContain('orgUnitRoom(tenantId, unitId)');
    expect(code).toMatch(/for\s*\(\s*const unitId of/);
  });

  it('joins the org-wide room only when accessibleOrgUnitIds is null', () => {
    expect(src()).toMatch(
      /if\s*\(\s*accessibleOrgUnitIds\s*===\s*null\s*\)\s*\{\s*socket\.join\(\s*allUnitsRoom/
    );
  });

  it('never derives room membership from a client-supplied value', () => {
    const code = src();
    // handshake.auth.token is the only thing read from the client, and
    // it is verified before anything is derived from it.
    expect(code).not.toMatch(/handshake\.(query|auth)\.(orgUnitId|tenantId|vehicleId)/);
    expect(code).not.toMatch(/socket\.on\(\s*['"]join['"]/);
  });
});

describe('F-7: entity events are org-unit scoped, not tenant-wide', () => {
  it('emitToOrgUnit targets the unit room plus the org-wide room', () => {
    const code = codeOf('infrastructure/websocket/server.ts');
    expect(code).toMatch(
      /orgUnitId\s*\?\s*\[orgUnitRoom\(tenantId, orgUnitId\), allUnitsRoom\(tenantId\)\]/
    );
  });

  it('an event with no orgUnitId reaches org-wide subscribers ONLY', () => {
    // Fail closed. A vehicle with no org unit is missing information,
    // not shared reference data -- the REST reads for it already return
    // nothing to a scoped caller, so broadcasting here would show a
    // scoped user a vehicle their own map cannot display.
    const code = codeOf('infrastructure/websocket/server.ts');
    expect(code).toMatch(/:\s*\[allUnitsRoom\(tenantId\)\]/);
    // Specifically NOT the tenant-wide room.
    expect(code).not.toMatch(/:\s*\[tenantRoom\(tenantId\)\]/);
  });

  it('telematics emits location, alert and geofence events through emitToOrgUnit', () => {
    const code = codeOf('modules/telematics/services/telematics.service.ts');

    for (const event of [
      'vehicle:location',
      'vehicle:alert',
      'vehicle:geofence',
      'vehicle:geofence_inside',
    ]) {
      expect(code).toContain(`emitToOrgUnit(`);
      expect(code).toContain(event);
    }
  });

  it('NO telematics event uses emitToTenant (the original leak)', () => {
    // This is the assertion that fails if someone reintroduces a
    // tenant-wide broadcast of vehicle data.
    const code = codeOf('modules/telematics/services/telematics.service.ts');
    expect(code).not.toContain('emitToTenant');
  });

  it('the vehicle/expense/fuel/trip helpers are org-unit scoped', () => {
    const code = codeOf('infrastructure/websocket/server.ts');
    for (const helper of [
      'emitVehicleUpdated',
      'emitExpenseCreated',
      'emitFuelLogged',
      'emitReminderOverdue',
      'emitTripCreated',
    ]) {
      const body = new RegExp(`${helper}\\([^)]*\\)[^{]*\\{\\s*this\\.emitToOrgUnit`);
      expect(code).toMatch(body);
    }
  });
});

describe('F-7: client subscriptions are allow-listed', () => {
  it('rejects a topic that is not on the allow list', () => {
    // The old handler joined ANY room whose name began `event:`, chosen
    // by the client, unvalidated. Inert today because nothing emits to
    // those rooms -- and a live bypass the moment someone writes
    // io.to('event:' + x).
    const code = codeOf('infrastructure/websocket/server.ts');
    expect(code).toContain('SUBSCRIBABLE_TOPICS');
    expect(code).toContain('SUBSCRIBABLE_TOPICS.has(name)');
    expect(code).not.toMatch(/events\.forEach\([^)]*socket\.join\(`event:/);
  });

  it('caps the number of subscriptions a socket may request', () => {
    expect(codeOf('infrastructure/websocket/server.ts')).toContain(
      'MAX_SUBSCRIPTIONS_PER_SOCKET'
    );
  });

  it('joining a topic cannot widen room membership', () => {
    // Topic rooms are `event:<name>`; nothing emits to them, and
    // membership in a tenant/unit room is decided only at handshake.
    const code = codeOf('infrastructure/websocket/server.ts');
    // Bounded to the handler itself -- slicing to EOF would sweep in
    // emitToOrgUnit, which legitimately names every room helper.
    const from = code.indexOf("socket.on('subscribe'");
    const to = code.indexOf("socket.on('disconnect'", from);
    const subscribeBlock = code.slice(from, to > from ? to : undefined);
    expect(subscribeBlock).not.toContain('orgUnitRoom');
    expect(subscribeBlock).not.toContain('allUnitsRoom');
    expect(subscribeBlock).not.toContain('tenantRoom');
  });
});
