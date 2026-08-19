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
  LiveMapGeofence,
  LiveMapRouteHistory,
  LiveMapDataSource,
} from '../types/live-map.types';
import { Geofence, TelematicsData } from '../types/telematics.types';

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
 */
export function providerSourceFor(deviceId: string | undefined): LiveMapDataSource {
  if (typeof deviceId === 'string' && deviceId.startsWith('eagletrack-')) return 'eagletrack';
  return 'cartrack';
}

/** Below this speed (km/h) a vehicle with a recent fix is considered idle rather than moving. */
const IDLE_SPEED_THRESHOLD_KMH = 3;
/** A real fix older than this is treated as offline rather than stale-but-current. */
const STALE_FIX_MINUTES = 15;
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

  private async resolveRealVehicle(vehicle: Vehicle, context: TenantContext): Promise<LiveMapVehicle> {
    const base = this.baseVehicleFields(vehicle);
    const vehicleId = normalizeVehicleId(vehicle._id);

    if (!vehicleId) {
      return { ...base, status: 'offline', source: 'unavailable', position: null };
    }

    const latest = await telematicsRepository.getLatestTelematicsDataInScope(vehicleId, context);
    if (!latest || !latest.location) {
      return { ...base, status: 'offline', source: 'unavailable', position: null };
    }

    const ageMinutes = (Date.now() - new Date(latest.timestamp).getTime()) / 60_000;
    const status = ageMinutes > STALE_FIX_MINUTES ? 'offline' : this.statusFromSpeed(latest.location.speed);

    return {
      ...base,
      status,
      source: providerSourceFor(latest.deviceId),
      position: {
        lat: latest.location.lat,
        lng: latest.location.lng,
        speed: latest.location.speed,
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
      return { ...base, status: 'offline', source: 'unavailable', position: null };
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
      status: sim.status === 'idle' ? 'idle' : 'moving',
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

  private baseVehicleFields(vehicle: Vehicle): Omit<LiveMapVehicle, 'status' | 'source' | 'position'> {
    return {
      vehicleId: normalizeVehicleId(vehicle._id) ?? '',
      licensePlate: vehicle.license_plate,
      make: vehicle.make,
      model: vehicle.model,
      orgUnitId: vehicle.orgUnitId,
    };
  }

  private statusFromSpeed(speed: number): 'moving' | 'idle' {
    return speed > IDLE_SPEED_THRESHOLD_KMH ? 'moving' : 'idle';
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