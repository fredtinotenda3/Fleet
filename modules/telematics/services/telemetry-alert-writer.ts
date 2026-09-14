// modules/telematics/services/telemetry-alert-writer.ts
//
// WAVE 2 -- the single place that turns a derived TelematicsAlert into a
// written row, a live websocket event, and (for high/critical severity)
// a fleet-manager notification.
//
// ---------------------------------------------------------------------
// WHY THIS WAS EXTRACTED
// ---------------------------------------------------------------------
// Before Wave 2, "record an alert" existed in exactly one place: the
// body of TelematicsService.processAlerts's loop. Wave 2 adds a SECOND
// caller -- the rule engine's `create_telemetry_alert` action
// (modules/rules/actions/telematics-actions.ts), reached only when
// TELEMETRY_RULE_ENGINE_ENABLED is on (see telemetry-rule-engine.config.ts).
//
// The DUPLICATE ALERT INVARIANT this migration must uphold requires
// there to be exactly ONE authoritative implementation of "what does it
// mean to record and notify an alert" -- not exactly one caller of it.
// Two copies of resolveAlertOwnership + createAlert + the websocket emit
// + the notification gate would drift the first time either path
// changed (a new notification channel added to one and not the other, a
// severity threshold tweaked in one and not the other), and the two
// alert paths would then silently disagree about what "the same alert"
// looks like. Extracting this here, unchanged in behaviour, means the
// legacy reading-alerts.ts path and the new rule-engine path literally
// call the same function -- they cannot drift because there is only one
// definition to drift from.
//
// This file is a straight extraction of TelematicsService.processAlerts'
// per-alert body and its `getFleetManagerIds` helper. No behaviour
// changed: same call order (resolve ownership -> persist -> websocket
// emit -> conditional notify), same websocket event name and payload,
// same notification title/message/priority/actionUrl shape, same
// severity gate (critical or high, and only when there is at least one
// recipient).

import { telematicsRepository } from '../repositories/telematics.repository';
import { TelematicsAlert } from '../types/telematics.types';
import { webSocketManager } from '@/infrastructure/websocket/server';
import { notificationService } from '@/modules/notifications/services/notification.service';
import { resolveOrganization } from '@/server/tenancy/organization-resolver';
import { resolveAlertOwnership } from './alert-ownership.resolver';

/**
 * Fleet managers/owner who should receive vehicle alert notifications
 * for a tenant.
 *
 * Moved here unchanged from TelematicsService.getFleetManagerIds. The
 * original code's own history note applies to every caller of this
 * function: passing an empty recipient array to sendBulkNotification
 * means the notification is silently never delivered to anyone, so a
 * failed resolution here (organization not found, lookup error) must
 * still let the alert itself be written -- it degrades to "recorded but
 * nobody was notified", not "the write failed".
 */
export async function getFleetManagerIds(tenantId: string): Promise<string[]> {
  try {
    const organization = await resolveOrganization(tenantId);
    if (!organization) return [];

    return organization.members
      .filter((m) => ['organization_owner', 'fleet_manager'].includes(m.role))
      .map((m) => m.userId);
  } catch {
    return [];
  }
}

/**
 * Records one alert: resolves ownership from the vehicle record,
 * persists the row, emits the live websocket event, and -- for
 * high/critical severity -- notifies fleet managers.
 *
 * IDENTICAL for every caller, by construction: this is the whole point
 * of the extraction (see the file header).
 *
 * `fleetManagerIds`, when supplied, is used instead of a fresh lookup.
 * The legacy ingestion loop (TelematicsService.processAlerts) resolves
 * it ONCE per reading and passes it to every alert in that reading's
 * batch (up to three alerts share one lookup) -- an efficiency the
 * original code already had and this extraction preserves. A caller
 * that omits it (the rule-engine action, which is invoked once per
 * matched rule rather than once per reading) gets it resolved lazily
 * here, and ONLY when the alert's own severity would actually trigger a
 * notification -- so a rule whose action never reaches critical/high
 * severity never pays for the lookup at all.
 *
 * Never throws for a resolution failure it can degrade safely from: an
 * unresolvable ownership still writes the alert (fail-closed on
 * visibility, matching alert-ownership.resolver.ts's own contract), and
 * a failed fleet-manager lookup still leaves the alert recorded with no
 * one notified. A failure in the write itself (`createAlert`) or in the
 * notification call is NOT swallowed here -- it propagates to the
 * caller exactly as it did before extraction, so callers that need to
 * observe it (rule-engine's own per-action error capture in
 * `evaluateAndExecute`) still can.
 */
export async function recordAndNotifyAlert(
  vehicleId: string,
  alert: TelematicsAlert,
  tenantId: string,
  orgUnitId: string | undefined,
  fleetManagerIds?: string[]
): Promise<void> {
  const ownership = await resolveAlertOwnership(vehicleId, tenantId);
  await telematicsRepository.createAlert(vehicleId, alert, tenantId, ownership);

  // PHASE 0, F-7: an alert names the vehicle and the behaviour
  // (speeding, harsh braking), so it is at least as sensitive as the
  // position that produced it. Unchanged from the pre-extraction call:
  // no new try/catch was added here, so a websocket failure propagates
  // exactly as it did before this file existed.
  webSocketManager.emitToOrgUnit(tenantId, orgUnitId, 'vehicle:alert', {
    vehicleId,
    alert,
  });

  if (alert.severity === 'critical' || alert.severity === 'high') {
    const recipients = fleetManagerIds ?? (await getFleetManagerIds(tenantId));
    if (recipients.length > 0) {
      await notificationService.sendBulkNotification(recipients, tenantId, {
        type: 'alert',
        title: `Vehicle Alert: ${alert.type}`,
        message: alert.message,
        priority: alert.severity === 'critical' ? 'critical' : 'high',
        data: { vehicleId, alert },
        actionUrl: `/vehicles/${vehicleId}`,
        actionLabel: 'View Vehicle',
      });
    }
  }
}
