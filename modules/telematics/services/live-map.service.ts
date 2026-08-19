// modules/telematics/services/live-map.service.ts
//
// Assembles the payload for GET /api/telematics/live-map: every vehicle
// the caller may see (org-unit scoped, via the same
// getFilteredVehiclesInScope() the Vehicles list page uses), each with
// either its latest real telematics fix or -- when Demo Mode is on for
// this tenant -- a deterministically simulated position, plus the
// geofences visible to the caller.
//
// SCOPING: vehicles come from vehicleRepository.getFilteredVehiclesInScope,
// which applies tenantScopeService.buildFilter(context, 'orgUnitId') --
// the same predicate every other scoped list in the product uses. Real
// telematics fixes are read through
// telematicsRepository.getLatestTelematicsDataInScope, which layers the
// SAME org-unit predicate on top of the vehicleId lookup, so a caller
// can never read another org unit's GPS trace even if they somehow
// guessed a vehicleId outside their scope. Demo-simulated positions are
// computed in-process (no query), but are still only ever generated for
// vehicles the scoped vehicle list already returned -- so scoping is
// inherited from that one query, not re-derived per source.

import { vehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { Vehicle } from '@/shared/types/vehicle.types';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { telematicsRepository } from '../repositories/telematics.repository';
import { telematicsService } from './telematics.service';
import { demoStateRepository } from '../repositories/demo-state.repository';
import { simulateVehicleState, SimulatedVehicleState } from '../demo/demo-simulator.service';
import {
  LiveMapPayload,
  LiveMapVehicle,
  LiveMapVehicleDetail,
  LiveMapVehicleStatus,
  LiveMapAlertState,
  LiveMapGeofence,
  LiveMapRouteHistory,
  LiveMapDataSource,
} from '../types/live-map.types';
import { Geofence, TelematicsAlert, TelematicsData } from '../types/telematics.types';
import { deriveReadingAlerts, maxSeverity } from './reading-alerts';
import { describeIoCode, EAGLETRACK_IO } from '../adapters/eagletrack/eagletrack-io.map';

/**
 * Labels a real fix with the provider that produced it.
 *
 * Derived from the device-id prefix each provider adapter stamps
 * (`eagletrack-<uin>`, `cartrack-<terminal_serial>`) rather than from a
 * stored provider field, because TelematicsDevice has no such field
 * today and adding one would require backfilling every existing device.
 *
 * APPROXIMATE BY CONSTRUCTION: 'cartrack' remains the fallback for any
 * device that is not identifiably Eagle Track, which includes devices
 * that post to the generic ingest endpoint and have nothing to do with
 * Cartrack. That was already the behaviour before Eagle Track existed
 * (the label was hardcoded), so this is strictly an improvement rather
 * than a new inaccuracy -- but the correct fix is a first-class
 * `provider` field on TelematicsDevice, set at registration and
 * backfilled from the prefix. Noted as a follow-up rather than done
 * here, since it touches every existing device row.
 *
 * The `demo-` branch is additive, for getVehicleDetail below: demo
 * fixes are persisted through the SAME ingestTelematicsData pipeline as
 * real ones (see maybePersistDemoSample), with deviceId `demo-<vehicleId>`,
 * so a raw TelematicsData row read back for the detail panel needs this
 * to label a demo fix as 'demo' rather than falling into the 'cartrack'
 * default. resolveDemoVehicle below never calls this function -- it
 * already knows its own source without inspecting the device id -- so
 * this branch cannot change that path's behaviour.
 */
export function providerSourceFor(deviceId: string | undefined): LiveMapDataSource {
  if (typeof deviceId === 'string' && deviceId.startsWith('eagletrack-')) return 'eagletrack';
  if (typeof deviceId === 'string' && deviceId.startsWith('demo-')) return 'demo';
  return 'cartrack';
}

/**
 * Pulls device-health signals out of providerMetadata for the vehicle
 * detail panel, without assuming any particular provider populated it.
 *
 * providerMetadata is deliberately opaque (`Record<string, unknown>` --
 * see TelematicsData's doc comment), so this narrows defensively field
 * by field rather than casting the whole object: only Eagle Track
 * writes a `signalQuality` shape today (EagleTrackReadingMetadata), and
 * this must degrade to "no device health data" rather than throw for
 * every other provider (Cartrack, demo) whose providerMetadata is
 * absent or shaped differently.
 */
function extractDeviceHealth(
  providerMetadata: Record<string, unknown> | undefined
): LiveMapVehicleDetail['deviceHealth'] {
  const signalQuality = providerMetadata?.signalQuality;
  const parsedSignal =
    signalQuality && typeof signalQuality === 'object' ? (signalQuality as Record<string, unknown>) : {};
  const { batteryPercent, gsmQuality, gpsSatellites } = parsedSignal;

  const health = {
    batteryPercent: typeof batteryPercent === 'number' ? batteryPercent : undefined,
    gsmQuality: typeof gsmQuality === 'number' ? gsmQuality : undefined,
    gpsSatellites: typeof gpsSatellites === 'number' ? gpsSatellites : undefined,
    batteryVoltage: numericIoMetadata(providerMetadata, EAGLETRACK_IO.BATTERY_VOLTS),
    powerVoltage: numericIoMetadata(providerMetadata, EAGLETRACK_IO.POWER_VOLTS),
  };

  // All signals absent is the same as no device health at all -- don't
  // hand the UI an object it would just render as five "No data" rows.
  if (Object.values(health).every((value) => value === undefined)) {
    return undefined;
  }
  return health;
}

/**
 * Reads one numeric signal out of EagleTrackReadingMetadata.io, which is
 * keyed by the vendor's own documented NAMES rather than raw IO codes
 * (that is what collectMetadataOnlyIo writes).
 *
 * The key is derived through describeIoCode rather than hardcoded as
 * the string 'Battery', so renaming a code in EAGLETRACK_IO_CATALOGUE
 * cannot silently turn this into a permanent "No data" -- the catalogue
 * stays the single source of truth for that mapping, exactly as it is
 * on the write side.
 */
function numericIoMetadata(
  providerMetadata: Record<string, unknown> | undefined,
  code: string
): number | undefined {
  const io = providerMetadata?.io;
  if (!io || typeof io !== 'object') return undefined;

  const value = (io as Record<string, unknown>)[describeIoCode(code)];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Whether the PROVIDER itself declared the tracker offline on the
 * snapshot this reading came from.
 *
 * Eagle Track carries this as a first-class `offline` boolean, which the
 * adapter records verbatim on providerMetadata (see
 * EagleTrackReadingMetadata.offline). Narrowed defensively rather than
 * cast, because providerMetadata is opaque by design and Cartrack/demo
 * readings have no such field: `undefined` means "the provider did not
 * say", which is different from "the provider said online" and is
 * treated as such by resolveLiveStatus.
 */
export function readProviderOffline(
  providerMetadata: Record<string, unknown> | undefined
): boolean | undefined {
  const offline = providerMetadata?.offline;
  return typeof offline === 'boolean' ? offline : undefined;
}

/** At or below this speed (km/h) a reporting vehicle is idle rather than moving. */
export const IDLE_SPEED_THRESHOLD_KMH = 3;
/**
 * A fix older than this is flagged STALE. It is explicitly NOT the
 * offline decision any more -- see resolveLiveStatus.
 *
 * It used to be: `ageMinutes > STALE_FIX_MINUTES ? 'offline' : ...`.
 * Fleets whose trackers report on a slower duty cycle than every 15
 * minutes (parked overnight, low-power mode, a poll interval measured in
 * tens of minutes) therefore rendered as 100% offline, in grey, with no
 * heading wedge -- which is the whole of the "every vehicle is a plain
 * grey dot" symptom. Kept as a secondary indicator because "this fix is
 * a while old" is still worth telling an operator; it just isn't the
 * same claim as "this vehicle is not reporting".
 */
export const STALE_FIX_MINUTES = 15;
/**
 * Hard ceiling: a fix older than this cannot describe the present,
 * whatever speed it recorded, so the vehicle is offline.
 *
 * This is what stops the opposite failure from the one being fixed: a
 * tracker that dies mid-journey keeps returning its last snapshot with a
 * non-zero speed, and a rule of "speed beats age" alone would show it as
 * actively moving, at a frozen location, forever.
 */
export const OFFLINE_FIX_MINUTES = 60;
/** Minimum spacing between persisted demo samples for the same vehicle, so polling the map doesn't flood tbltelematics. */
const DEMO_SAMPLE_THROTTLE_MS = 20_000;
/** How many vehicles the live map will render at once -- generous for a fleet dashboard without being unbounded. */
const MAX_LIVE_MAP_VEHICLES = 500;
/** Default lookback window for a vehicle's route-trail breadcrumb. */
const DEFAULT_ROUTE_HISTORY_MINUTES = 60;
/** Hard ceiling on the lookback window, so a caller can't force a full-collection scan via a huge `minutes` value. */
const MAX_ROUTE_HISTORY_MINUTES = 24 * 60;
/** Points are for a lightweight breadcrumb trail, not a full replay -- capped well below getTelematicsHistoryInScope's own 1000 default. */
const MAX_ROUTE_HISTORY_POINTS = 200;

/**
 * Normalizes a vehicle id to the plain hex string every other part of
 * the system stores/queries by.
 *
 * ROOT CAUSE OF THE "live-map never shows real telematics" bug: unlike
 * every other read path in this codebase (findOne/findMany/findById/
 * findWithPagination all route through BaseRepository.normalizeDoc,
 * which converts Mongo's `_id: ObjectId` to `_id: string`),
 * vehicleRepository.getFilteredVehiclesInScope() -- the query this
 * service uses to list vehicles -- returns collection.find().toArray()
 * RAW, with only a type-level `as Vehicle[]` cast. At runtime
 * `vehicle._id` coming out of it is still a live ObjectId instance, not
 * a string, even though the Vehicle type says `_id: string`.
 *
 * That would be harmless for a field that's only ever displayed, but
 * this service uses vehicle._id as a JOIN KEY into tbltelematics:
 * telematicsRepository.getLatestTelematicsDataInScope(vehicle._id, ...)
 * builds a Mongo filter `{ vehicleId: <that value>, ... }`. Every real
 * telematics row -- Cartrack and Eagle Track alike -- is written with
 * `vehicleId` as a normalized STRING, because both adapters resolve
 * their match through vehicleRepository.findByLicensePlate(), which
 * (unlike getFilteredVehiclesInScope) DOES go through findOne() and
 * therefore IS normalized. An ObjectId filter value can never equal a
 * stored string, so the query silently returns zero rows for every
 * vehicle regardless of source or demoMode -- real telematics could
 * never surface here no matter how correctly it was ingested.
 *
 * Fixed at the point of use, in this service, rather than in
 * vehicleRepository: that repository is shared by five other modules
 * (trips, fuel, workshop, maintenance, the vehicles list itself), none
 * of which use the id as a cross-collection join key the way this
 * service does, so widening that fix here keeps the change scoped to
 * live-map's own source resolution.
 */
function normalizeVehicleId(rawId: unknown): string | null {
  if (typeof rawId === 'string') {
    const trimmed = rawId.trim();
    return trimmed ? trimmed : null;
  }
  // Duck-typed rather than `instanceof ObjectId` so this also normalizes
  // anything else Mongo-ObjectId-shaped (e.g. a driver-version mismatch
  // producing a BSON ObjectId from a different mongodb package instance,
  // which fails `instanceof` across module boundaries but still exposes
  // toHexString()).
  if (
    rawId &&
    typeof rawId === 'object' &&
    typeof (rawId as { toHexString?: unknown }).toHexString === 'function'
  ) {
    return (rawId as { toHexString: () => string }).toHexString();
  }
  return null;
}

/**
 * The live-map status decision, in one pure function so it can be unit
 * tested without a database and so the map marker and the detail panel
 * can never disagree about the same vehicle.
 *
 * OFFLINE IS A DISJUNCTION, which is what makes this correct rather than
 * merely re-ordered. A vehicle is offline if ANY of the following holds:
 *
 *   * it has no position at all;
 *   * the provider itself says the tracker is offline;
 *   * the fix is older than OFFLINE_FIX_MINUTES.
 *
 * Because it is an OR, the order of those three checks carries no
 * meaning and cannot be got subtly wrong later. It also settles the one
 * genuine conflict in the inputs: a provider that reports
 * `offline: false` on an hours-old snapshot cannot make that snapshot
 * live, so the age ceiling must be able to override the vendor flag,
 * while the vendor flag can only ever ADD offline, never remove it.
 *
 * Only once the vehicle is known to be reporting does speed decide
 * between moving and idle. STALE_FIX_MINUTES appears nowhere in this
 * function -- that is the point of the change.
 *
 * WORTH KNOWING about the vendor flag in practice: Eagle Track's
 * ingestion skips a snapshot whose fix it already holds, so a tracker
 * that goes quiet stops producing new rows and the stored reading keeps
 * whatever `offline` value it had when it was last written. The vendor
 * flag is therefore a bonus signal when present, and fix age does most
 * of the work -- which is exactly the "prefer the provider's own field
 * when available" behaviour, no more.
 */
export function resolveLiveStatus(input: {
  hasPosition: boolean;
  speed: number;
  fixAgeMinutes: number;
  providerOffline?: boolean;
}): LiveMapVehicleStatus {
  const { hasPosition, speed, fixAgeMinutes, providerOffline } = input;

  if (!hasPosition) return 'offline';
  if (providerOffline === true) return 'offline';
  if (!Number.isFinite(fixAgeMinutes) || fixAgeMinutes > OFFLINE_FIX_MINUTES) return 'offline';

  return speed > IDLE_SPEED_THRESHOLD_KMH ? 'moving' : 'idle';
}

/** Secondary indicator only. Never consulted by resolveLiveStatus. */
export function isStaleFix(fixAgeMinutes: number): boolean {
  return Number.isFinite(fixAgeMinutes) && fixAgeMinutes > STALE_FIX_MINUTES;
}

/**
 * Alert state for one reading, or null when nothing is flagged.
 *
 * THREE SOURCES, all read off the row already in hand -- no extra query
 * per vehicle (see reading-alerts.ts for why the alert store is not
 * consulted):
 *
 *   1. deriveReadingAlerts() -- the same speeding / DTC / low-fuel rules
 *      the ingestion path uses to CREATE alerts, so a red marker means
 *      the same thing as a row in tbltelematics_alerts.
 *   2. `alerts` embedded on the reading itself, when a caller of the
 *      generic HTTP ingest endpoint supplied them.
 *   3. The provider's own alerting. Eagle Track's `alert.cmd` /
 *      `alert.trigger` are recorded verbatim on providerMetadata and
 *      deliberately NOT reconciled with our alert engine (see the
 *      adapter header) -- so they are surfaced as an unmapped vendor
 *      alert at 'medium' rather than being assigned a severity we have
 *      no basis for.
 *
 * Reasons are deduplicated and ordered worst-first so the UI can show
 * the most serious cause without sorting.
 */
export function resolveAlertState(latest: TelematicsData): LiveMapAlertState | null {
  const alerts: TelematicsAlert[] = [...deriveReadingAlerts(latest)];

  if (Array.isArray(latest.alerts)) {
    for (const stored of latest.alerts) {
      // An acknowledged alert has been dealt with; it must not keep the
      // marker red forever.
      if (stored && !stored.acknowledgedAt) alerts.push(stored);
    }
  }

  const vendorAlert = readVendorAlert(latest.providerMetadata);
  if (vendorAlert) {
    alerts.push({
      type: 'engine',
      severity: 'medium',
      message: vendorAlert,
      timestamp: latest.timestamp,
    });
  }

  if (alerts.length === 0) return null;

  const severity = alerts.reduce<TelematicsAlert['severity']>(
    (worst, alert) => maxSeverity(worst, alert.severity),
    'low'
  );

  const rank: Record<TelematicsAlert['severity'], number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const reasons = Array.from(
    new Set([...alerts].sort((a, b) => rank[a.severity] - rank[b.severity]).map((alert) => alert.message))
  );

  return { severity, reasons };
}

/**
 * Eagle Track's vendor-side alert, as a display string, or null.
 *
 * The adapter only records this when at least one of cmd/trigger is
 * non-zero (0/0 is the vendor's "no alert" resting state), so its mere
 * presence is the signal. The ids are shown raw because they reference
 * vendor-side trigger objects we do not fetch -- printing an invented
 * label for them would be exactly the kind of fabrication the rest of
 * this change removes.
 */
function readVendorAlert(providerMetadata: Record<string, unknown> | undefined): string | null {
  const vendorAlert = providerMetadata?.vendorAlert;
  if (!vendorAlert || typeof vendorAlert !== 'object') return null;

  const { cmd, trigger } = vendorAlert as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof cmd === 'number' && cmd !== 0) parts.push(`cmd ${cmd}`);
  if (typeof trigger === 'number' && trigger !== 0) parts.push(`trigger ${trigger}`);
  if (parts.length === 0) return null;

  return `Provider alert (${parts.join(', ')})`;
}

export class LiveMapService {
  async getLiveMapData(context: TenantContext): Promise<LiveMapPayload> {
    const [demoState, vehiclesPage, geofences] = await Promise.all([
      demoStateRepository.getState(context.organizationId),
      vehicleRepository.getFilteredVehiclesInScope(
        {},
        { page: 1, limit: MAX_LIVE_MAP_VEHICLES, sortBy: 'license_plate', sortOrder: 'asc' },
        context
      ),
      telematicsRepository.getActiveGeofencesInScope(undefined, context),
    ]);

    const demoEnabled = demoState?.enabled ?? false;

    const vehicles = await Promise.all(
      vehiclesPage.data.map((vehicle) =>
        demoEnabled
          ? this.resolveDemoVehicle(vehicle, context.organizationId, demoState!.startedAt)
          : this.resolveRealVehicle(vehicle, context)
      )
    );

    return {
      demoMode: demoEnabled,
      generatedAt: new Date().toISOString(),
      vehicles,
      geofences: geofences.map(this.toLiveMapGeofence),
    };
  }

  /**
   * Recent GPS trail for one vehicle, for drawing the breadcrumb line on
   * the live map. Goes through the SAME org-unit-scoped query
   * (getTelematicsHistoryInScope) as everything else that reads GPS
   * history -- a caller outside the vehicle's org unit gets an empty
   * trail, never another org unit's route, because the vehicleId alone
   * carries no authorization and the scope predicate is applied
   * server-side regardless of what the caller asked for.
   *
   * Works for both real (Cartrack) and demo vehicles unchanged: demo
   * positions are persisted through the same tbltelematics pipeline
   * (see resolveDemoVehicle/maybePersistDemoSample below), inheriting
   * the same orgUnitId the vehicle has, so this query doesn't need to
   * know or care which source produced the points it returns.
   */
  async getVehicleRouteHistory(
    vehicleId: string,
    context: TenantContext,
    minutes: number = DEFAULT_ROUTE_HISTORY_MINUTES
  ): Promise<LiveMapRouteHistory> {
    const clampedMinutes = Math.min(Math.max(1, minutes), MAX_ROUTE_HISTORY_MINUTES);
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - clampedMinutes * 60_000);

    const history = await telematicsRepository.getTelematicsHistoryInScope(
      vehicleId,
      startDate,
      endDate,
      context,
      MAX_ROUTE_HISTORY_POINTS
    );

    // Repository returns newest-first (sortOrder: 'desc'); the map wants
    // a chronological trail to draw a line in the direction of travel.
    const points = history
      .filter((entry) => Boolean(entry.location))
      .map((entry) => ({
        lat: entry.location!.lat,
        lng: entry.location!.lng,
        speed: entry.location!.speed,
        timestamp: new Date(entry.timestamp).toISOString(),
      }))
      .reverse();

    return { vehicleId, points };
  }

  /**
   * Full live-telemetry detail for one vehicle, for the detail panel
   * shown when a vehicle is selected on the live map -- everything
   * already ingested and stored on its latest TelematicsData row
   * (engine, trip/odometer, fuel, device health), not just the compact
   * `position` used for the map marker.
   *
   * SCOPING: goes through the exact same org-unit-scoped read
   * (getLatestTelematicsDataInScope) that resolveRealVehicle uses for
   * the map marker itself -- a caller outside the vehicle's org unit
   * gets `null`, never another org unit's telemetry, for the same
   * reason getVehicleRouteHistory above does.
   *
   * Works unchanged for demo vehicles: resolveDemoVehicle persists demo
   * samples through the SAME ingestTelematicsData pipeline real devices
   * use (see maybePersistDemoSample), so a demo vehicle's full engine/
   * trip/fuel readings are already sitting in the same collection this
   * reads from -- no separate demo-only code path is needed here.
   */
  async getVehicleDetail(vehicleId: string, context: TenantContext): Promise<LiveMapVehicleDetail | null> {
    const latest = await telematicsRepository.getLatestTelematicsDataInScope(vehicleId, context);
    if (!latest) {
      return null;
    }
    return this.toVehicleDetail(vehicleId, latest);
  }

  private toVehicleDetail(vehicleId: string, latest: TelematicsData): LiveMapVehicleDetail {
    const location = latest.location
      ? {
          lat: latest.location.lat,
          lng: latest.location.lng,
          speed: latest.location.speed,
          heading: latest.location.heading,
          timestamp: new Date(latest.timestamp).toISOString(),
        }
      : null;

    const fixAgeSeconds = latest.location
      ? Math.max(0, Math.round((Date.now() - new Date(latest.timestamp).getTime()) / 1000))
      : null;

    const fixAgeMinutes = fixAgeSeconds !== null ? fixAgeSeconds / 60 : Infinity;
    const status = resolveLiveStatus({
      hasPosition: Boolean(latest.location),
      speed: latest.location?.speed ?? 0,
      fixAgeMinutes,
      providerOffline: readProviderOffline(latest.providerMetadata),
    });

    return {
      vehicleId,
      status,
      stale: isStaleFix(fixAgeMinutes),
      alert: resolveAlertState(latest),
      source: providerSourceFor(latest.deviceId),
      location,
      fixAgeSeconds,
      odometer: latest.trip?.odometer,
      trip: latest.trip
        ? {
            tripDistance: latest.trip.tripDistance,
            tripDuration: latest.trip.tripDuration,
            averageSpeed: latest.trip.averageSpeed,
            maxSpeed: latest.trip.maxSpeed,
            idleTime: latest.trip.idleTime,
          }
        : undefined,
      engine: latest.engine
        ? {
            rpm: latest.engine.rpm,
            coolantTemp: latest.engine.coolantTemp,
            fuelLevel: latest.engine.fuelLevel,
            throttlePosition: latest.engine.throttlePosition,
            engineLoad: latest.engine.engineLoad,
            dtcCodes: latest.engine.dtcCodes,
          }
        : undefined,
      fuel: latest.fuel
        ? {
            consumptionRate: latest.fuel.consumptionRate,
            instantConsumption: latest.fuel.instantConsumption,
            fuelUsed: latest.fuel.fuelUsed,
          }
        : undefined,
      deviceHealth: extractDeviceHealth(latest.providerMetadata),
    };
  }

  private async resolveRealVehicle(vehicle: Vehicle, context: TenantContext): Promise<LiveMapVehicle> {
    const base = this.baseVehicleFields(vehicle);
    const vehicleId = normalizeVehicleId(vehicle._id);

    if (!vehicleId) {
      return { ...base, status: 'offline', stale: false, alert: null, source: 'unavailable', position: null };
    }

    const latest = await telematicsRepository.getLatestTelematicsDataInScope(vehicleId, context);
    if (!latest || !latest.location) {
      // No fix at all (or a reading with no position): `stale` is left
      // false deliberately -- there is no fix here to have gone stale,
      // and flagging one would put a "stale fix" hint on a vehicle that
      // has never reported. The offline status already says everything
      // that is known.
      return { ...base, status: 'offline', stale: false, alert: null, source: 'unavailable', position: null };
    }

    const fixAgeMinutes = (Date.now() - new Date(latest.timestamp).getTime()) / 60_000;

    return {
      ...base,
      status: resolveLiveStatus({
        hasPosition: true,
        speed: latest.location.speed,
        fixAgeMinutes,
        providerOffline: readProviderOffline(latest.providerMetadata),
      }),
      stale: isStaleFix(fixAgeMinutes),
      alert: resolveAlertState(latest),
      source: providerSourceFor(latest.deviceId),
      position: {
        lat: latest.location.lat,
        lng: latest.location.lng,
        speed: latest.location.speed,
        // Passed through as-is, INCLUDING absent: a provider that does
        // not report a bearing must not have one invented for it here
        // (0 would render as due north on every such vehicle).
        heading: latest.location.heading,
        fuelLevel: latest.engine?.fuelLevel,
        timestamp: new Date(latest.timestamp).toISOString(),
      },
    };
  }

  private async resolveDemoVehicle(vehicle: Vehicle, tenantId: string, startedAt: Date): Promise<LiveMapVehicle> {
    const base = this.baseVehicleFields(vehicle);
    const vehicleId = normalizeVehicleId(vehicle._id);
    if (!vehicleId) {
      return { ...base, status: 'offline', stale: false, alert: null, source: 'unavailable', position: null };
    }

    const elapsedSeconds = Math.max(0, (Date.now() - startedAt.getTime()) / 1000);
    const sim = simulateVehicleState(vehicleId, elapsedSeconds);

    // Fire-and-forget: don't let a throttled/slow persistence write hold
    // up the map response the caller is waiting on. Failures here only
    // affect route-history depth, never the live position returned below.
    // Uses the SAME normalized vehicleId as above -- persisting the raw
    // (possibly unnormalized) vehicle._id here is exactly how a stale,
    // frozen demo row could end up permanently shadowing real telematics
    // later (see normalizeVehicleId's doc comment).
    void this.maybePersistDemoSample(vehicleId, tenantId, sim).catch(() => undefined);

    return {
      ...base,
      // Demo mode's own architecture is unchanged: the simulator remains
      // the authority on a demo vehicle's status, and its positions are
      // generated for "now", so there is no fix age to evaluate and
      // nothing to be stale or alerting about.
      status: sim.status === 'idle' ? 'idle' : 'moving',
      stale: false,
      alert: null,
      source: 'demo',
      position: {
        lat: sim.lat,
        lng: sim.lng,
        speed: sim.speed,
        heading: sim.heading,
        fuelLevel: sim.fuelLevel,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Writes a demo sample through the SAME telematicsService.ingestTelematicsData
   * pipeline real device data uses, so demo vehicles get real alert
   * evaluation, real geofence entry/exit detection, and real route
   * history -- throttled so repeated map polls don't write a row per
   * request.
   */
  private async maybePersistDemoSample(
    vehicleId: string,
    tenantId: string,
    sim: SimulatedVehicleState
  ): Promise<void> {
    const deviceId = `demo-${vehicleId}`;
    const latest = await telematicsRepository.getLatestTelematicsData(vehicleId, tenantId);
    if (latest && Date.now() - new Date(latest.timestamp).getTime() < DEMO_SAMPLE_THROTTLE_MS) {
      return;
    }

    const now = new Date();
    const payload: Omit<TelematicsData, '_id' | 'createdAt' | 'updatedAt'> & { tenantId: string } = {
      deviceId,
      vehicleId,
      tenantId,
      location: {
        lat: sim.lat,
        lng: sim.lng,
        speed: sim.speed,
        heading: sim.heading,
        altitude: 0,
        accuracy: 5,
        timestamp: now,
      },
      engine: {
        rpm: sim.status === 'moving' ? 1800 : 800,
        coolantTemp: 90,
        fuelLevel: sim.fuelLevel,
        throttlePosition: sim.status === 'moving' ? 40 : 0,
        engineLoad: sim.status === 'moving' ? 50 : 5,
      },
      trip: {
        odometer: sim.odometerKm,
        tripDistance: 0,
        tripDuration: 0,
        averageSpeed: sim.speed,
        maxSpeed: sim.speed,
        idleTime: sim.status === 'idle' ? 1 : 0,
      },
      fuel: {
        consumptionRate: 0,
        instantConsumption: 0,
        fuelUsed: 0,
      },
      timestamp: now,
    };

    await telematicsService.ingestTelematicsData(payload);
  }

  private baseVehicleFields(vehicle: Vehicle): Omit<LiveMapVehicle, 'status' | 'stale' | 'alert' | 'source' | 'position'> {
    return {
      vehicleId: normalizeVehicleId(vehicle._id) ?? '',
      licensePlate: vehicle.license_plate,
      make: vehicle.make,
      model: vehicle.model,
      orgUnitId: vehicle.orgUnitId,
    };
  }

  private toLiveMapGeofence(geofence: Geofence): LiveMapGeofence {
    return {
      id: geofence._id ?? '',
      name: geofence.name,
      type: geofence.type,
      coordinates: geofence.coordinates,
      active: geofence.active,
    };
  }
}

export const liveMapService = new LiveMapService();