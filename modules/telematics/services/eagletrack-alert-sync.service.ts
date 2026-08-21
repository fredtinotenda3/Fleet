// modules/telematics/services/eagletrack-alert-sync.service.ts
//
// Imports the vendor's own alert feed --
// GET /api2/history?alertfilter=__allalert -- into tbltelematics_alerts.
//
// ---------------------------------------------------------------------
// WHY THE PROVIDER'S ALERTS RATHER THAN RE-DERIVING OUR OWN
// ---------------------------------------------------------------------
// Historical positions are ingested WITHOUT running our alert engine
// over them (see eagletrack-history.service.ts, and
// bulkUpsertHistoricalReadings' doc comment): replaying a month of
// points through the live path would re-raise every speeding alert and
// push a fleet-manager notification for each one.
//
// That leaves a real gap -- a backfilled window would have positions and
// no alerts at all -- and this service is the honest way to close it.
// The provider already evaluated its own triggers against those
// positions at the time, with thresholds an operator configured in the
// vendor UI. Importing those events is reporting what happened.
// Re-deriving them from our own thresholds would be manufacturing a
// different history and presenting it as the record.
//
// So: no event is created that the provider did not send, and no
// severity is invented beyond the conservative mapping in
// eagletrack-triggers.map.ts.
//
// ---------------------------------------------------------------------
// IDEMPOTENCY
// ---------------------------------------------------------------------
// Keyed on `providerAlertKey` (see buildVendorAlertKey): the vendor's
// own alert id where it supplies one, otherwise the uin + occurrence
// time + trigger tuple that makes two rows the same EVENT. Every
// component comes from the provider payload, never from our clock, so
// the key is stable across runs. Re-requesting an overlapping window --
// which happens whenever somebody scrubs the history slider backwards --
// writes nothing the second time.
//
// ---------------------------------------------------------------------
// SCOPING
// ---------------------------------------------------------------------
// Alerts are written with the matched vehicle's orgUnitId. That is not
// incidental: reading-alerts.ts documents that createAlert writes no
// orgUnitId while getActiveAlertsInScope applies the org-unit predicate,
// so every alert row written by the live path matches zero rows for
// every scoped caller. Fail-closed, never a leak -- but it means those
// alerts are invisible to exactly the branch managers they concern.
// Rows written HERE carry the unit and are visible correctly. The
// backfill for pre-existing rows remains the separate change it has
// always been.

import { monitoring } from '@/infrastructure/monitoring/logger';
import { parseVendorAlertRows } from '../adapters/eagletrack/eagletrack-payload.parsers';
import {
  describeTriggerType,
  triggerSeverity,
} from '../adapters/eagletrack/eagletrack-triggers.map';
import {
  EagleTrackAlertSyncResult,
  EagleTrackVendorAlert,
} from '../adapters/eagletrack/eagletrack.types';
import { EagleTrackApiClient } from '../adapters/eagletrack/eagletrack-api.client';
import { telematicsRepository } from '../repositories/telematics.repository';
import { TelematicsAlert } from '../types/telematics.types';
import { ScopedVehicle } from './telematics-scope.utils';

/** The vendor selector that turns /api2/history into an alert feed. */
export const EAGLETRACK_ALERT_FILTER = '__allalert';

/** Vendor page size, matching the history pull. */
const ALERT_PAGE_SIZE = 100;

/**
 * Pages pulled per import. Lower than the position history cap: an alert
 * feed is sparse by nature (a vehicle generating 2,000 alerts in one
 * window is a misconfigured trigger, not data worth paging through), and
 * this runs alongside a position pull on the same request.
 */
const MAX_ALERT_PAGES = 20;

export class EagleTrackAlertSyncService {
  /**
   * Imports vendor alerts for ONE already-scope-checked vehicle over one
   * window.
   *
   * Takes a ScopedVehicle rather than a vehicleId deliberately: the
   * ownership decision is made once, by assertVehicleInScope, at the
   * entry point. A service that re-derived it from an id would be a
   * second implementation of the same boundary, which is precisely what
   * telematics-scope.utils.ts exists to prevent.
   *
   * Never throws -- an alert import failing must not fail the history
   * request it runs alongside.
   */
  async importForVehicle(
    vehicle: ScopedVehicle,
    uin: string,
    client: EagleTrackApiClient,
    window: { from: Date; to: Date }
  ): Promise<EagleTrackAlertSyncResult> {
    const result: EagleTrackAlertSyncResult = {
      fetched: 0,
      imported: 0,
      duplicates: 0,
      unmatched: [],
      errors: [],
    };

    try {
      for (let pageIndex = 1; pageIndex <= MAX_ALERT_PAGES; pageIndex += 1) {
        const page = await client.getHistory({
          uin,
          from: window.from,
          to: window.to,
          pageSize: ALERT_PAGE_SIZE,
          pageIndex,
          alertFilter: EAGLETRACK_ALERT_FILTER,
        });

        const alerts = parseVendorAlertRows(page.rows, uin);
        if (alerts.length === 0) break;

        result.fetched += alerts.length;

        const written = await telematicsRepository.upsertVendorAlerts(
          alerts.map((alert) => this.toStoredAlert(alert, vehicle)),
          vehicle.tenantId
        );
        result.imported += written.imported;
        result.duplicates += written.duplicates;

        if (page.pageCount !== null && pageIndex >= page.pageCount) break;
        if (alerts.length < ALERT_PAGE_SIZE) break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Eagle Track API error';
      result.errors.push(`alerts: ${message}`);
      monitoring.logWarn('[EagleTrackAlertSync] Alert import failed', {
        tenantId: vehicle.tenantId,
        vehicleId: vehicle.vehicleId,
        error: message,
      });
    }

    return result;
  }

  /**
   * One vendor alert as a stored TelematicsAlert plus its reconciliation
   * fields.
   *
   * THE MESSAGE IS THE PROVIDER'S OWN when it sent one. Only when it did
   * not does this compose a label, and that label names the vendor type
   * verbatim ("Eagle Track: Speed Alert") rather than paraphrasing it
   * into something that sounds like one of our own alerts -- an operator
   * must be able to tell at a glance which system raised what.
   */
  private toStoredAlert(
    alert: EagleTrackVendorAlert,
    vehicle: ScopedVehicle
  ): {
    vehicleId: string;
    orgUnitId?: string;
    providerAlertKey: string;
    providerTriggerId?: string;
    providerTypeCode: number | null;
    providerTypeLabel: string | null;
    providerMetadata: Record<string, unknown>;
    alert: TelematicsAlert;
  } {
    const descriptor = describeTriggerType(alert.typeCode);

    return {
      vehicleId: vehicle.vehicleId,
      ...(vehicle.orgUnitId ? { orgUnitId: vehicle.orgUnitId } : {}),
      providerAlertKey: alert.providerAlertId,
      ...(alert.providerTriggerId ? { providerTriggerId: alert.providerTriggerId } : {}),
      providerTypeCode: alert.typeCode,
      providerTypeLabel: alert.typeLabel,
      // The row exactly as the provider sent it, plus what we could not
      // place. Opaque by design, like TelematicsData.providerMetadata --
      // nothing branches on it, so its contents can never change how an
      // alert is interpreted.
      providerMetadata: {
        source: 'eagletrack',
        uin: alert.uin,
        alertFilter: EAGLETRACK_ALERT_FILTER,
        unmappedFields: alert.unmappedFields,
        raw: alert.raw,
        ...(alert.position ? { position: alert.position } : {}),
      },
      alert: {
        // 'vendor' for Stop and Custom, which have no honest counterpart
        // in our vocabulary -- see eagletrack-triggers.map.ts.
        type: descriptor?.alertType ?? 'vendor',
        severity: triggerSeverity(descriptor),
        message:
          alert.message ??
          `Eagle Track: ${alert.typeLabel ?? `trigger type ${alert.typeCode ?? 'unknown'}`}`,
        // The PROVIDER's timestamp, never ingest time. An alert stamped
        // "now" would surface a months-old event as live.
        timestamp: alert.occurredAt,
      },
    };
  }
}

export const eagletrackAlertSyncService = new EagleTrackAlertSyncService();
