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
import { LiveMapPayload, LiveMapVehicle, LiveMapGeofence } from '../types/live-map.types';
import { Geofence, TelematicsData } from '../types/telematics.types';

/** Below this speed (km/h) a vehicle with a recent fix is considered idle rather than moving. */
const IDLE_SPEED_THRESHOLD_KMH = 3;
/** A real fix older than this is treated as offline rather than stale-but-current. */
const STALE_FIX_MINUTES = 15;
/** Minimum spacing between persisted demo samples for the same vehicle, so polling the map doesn't flood tbltelematics. */
const DEMO_SAMPLE_THROTTLE_MS = 20_000;
/** How many vehicles the live map will render at once -- generous for a fleet dashboard without being unbounded. */
const MAX_LIVE_MAP_VEHICLES = 500;

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

  private async resolveRealVehicle(vehicle: Vehicle, context: TenantContext): Promise<LiveMapVehicle> {
    const base = this.baseVehicleFields(vehicle);

    if (!vehicle._id) {
      return { ...base, status: 'offline', source: 'unavailable', position: null };
    }

    const latest = await telematicsRepository.getLatestTelematicsDataInScope(vehicle._id, context);
    if (!latest || !latest.location) {
      return { ...base, status: 'offline', source: 'unavailable', position: null };
    }

    const ageMinutes = (Date.now() - new Date(latest.timestamp).getTime()) / 60_000;
    const status = ageMinutes > STALE_FIX_MINUTES ? 'offline' : this.statusFromSpeed(latest.location.speed);

    return {
      ...base,
      status,
      source: 'cartrack',
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
    if (!vehicle._id) {
      return { ...base, status: 'offline', source: 'unavailable', position: null };
    }

    const elapsedSeconds = Math.max(0, (Date.now() - startedAt.getTime()) / 1000);
    const sim = simulateVehicleState(vehicle._id, elapsedSeconds);

    // Fire-and-forget: don't let a throttled/slow persistence write hold
    // up the map response the caller is waiting on. Failures here only
    // affect route-history depth, never the live position returned below.
    void this.maybePersistDemoSample(vehicle._id, tenantId, sim).catch(() => undefined);

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
      vehicleId: vehicle._id ?? '',
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