// modules/telematics/adapters/cartrack/cartrack.adapter.ts
//
// The bridge between Cartrack's wire format and our own telematics
// pipeline. Deliberately does NOT write to tbltelematics directly --
// every matched reading goes through telematicsService.ingestTelematicsData,
// the same path modules/telematics/controllers/telematics.controller.ts's
// ingest() uses for any other device. That means Cartrack readings get
// the exact same speeding/fuel/DTC alerting, geofence entry/exit
// evaluation, and fleet-manager notifications as everything else in the
// module, with zero duplicated logic here.
//
// Vehicle matching is by license plate (Cartrack's `registration` field
// vs. our Vehicle.license_plate). A Cartrack vehicle that doesn't match
// any vehicle in this tenant is reported back as "unmatched" rather than
// silently dropped or silently created, since guessing which internal
// vehicle a stray registration belongs to is exactly the kind of
// guess server/utils/tenant-context.utils.ts's resolveCreationOrgUnitId
// refuses to make for org units -- the same discipline applies here.

import { vehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { telematicsService } from '../../services/telematics.service';
import { telematicsRepository } from '../../repositories/telematics.repository';
import { cartrackConfigRepository } from '../../repositories/cartrack-config.repository';
import { CartrackApiClient } from './cartrack-api.client';
import { CartrackVehicleStatus, CartrackSyncResult } from './cartrack.types';
import { TelematicsData, TelematicsLocation } from '../../types/telematics.types';
import { monitoring } from '@/infrastructure/monitoring/logger';
import { PROVIDER_CARTRACK } from '../../providers/provider.types';

const CARTRACK_DEVICE_PREFIX = 'cartrack-';

function deviceIdFor(terminalSerial: string): string {
  return `${CARTRACK_DEVICE_PREFIX}${terminalSerial}`;
}

export class CartrackAdapter {
  /** Builds an authenticated API client for a tenant from its stored (decrypted) config. Returns null if Cartrack isn't configured/enabled for this tenant. */
  private async buildClient(tenantId: string): Promise<CartrackApiClient | null> {
    const config = await cartrackConfigRepository.getResolvedConfig(tenantId);
    if (!config || !config.enabled) return null;

    return new CartrackApiClient({
      baseUrl: config.baseUrl,
      accountId: config.accountId,
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
    });
  }

  /**
   * Pulls the whole fleet's current status from Cartrack for one tenant,
   * matches each reading to an internal vehicle, and ingests it. Safe to
   * call repeatedly (idempotent per reading -- ingestTelematicsData just
   * appends a new timestamped point, same as any other device ping).
   */
  async syncOrganization(tenantId: string): Promise<CartrackSyncResult> {
    const result: CartrackSyncResult = {
      tenantId,
      matched: 0,
      unmatchedRegistrations: [],
      errors: [],
      syncedAt: new Date(),
    };

    const client = await this.buildClient(tenantId);
    if (!client) {
      result.errors.push('Cartrack is not configured or not enabled for this organization.');
      return result;
    }

    let statuses: CartrackVehicleStatus[];
    try {
      statuses = await client.getFleetStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Cartrack API error';
      result.errors.push(message);
      await cartrackConfigRepository.recordSyncResult(tenantId, 'error', message);
      monitoring.logError('[CartrackAdapter] Fleet status fetch failed', error as Error, { tenantId });
      return result;
    }

    for (const status of statuses) {
      try {
        const matched = await this.ingestStatus(tenantId, status);
        if (matched) {
          result.matched += 1;
        } else {
          result.unmatchedRegistrations.push(status.registration);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown ingestion error';
        result.errors.push(`${status.registration}: ${message}`);
        monitoring.logError('[CartrackAdapter] Failed to ingest vehicle status', error as Error, {
          tenantId,
          registration: status.registration,
        });
      }
    }

    await cartrackConfigRepository.recordSyncResult(
      tenantId,
      result.errors.length > 0 && result.matched === 0 ? 'error' : 'success',
      result.errors[0]
    );

    return result;
  }

  /** Maps and ingests a single Cartrack reading. Returns false (without throwing) when the registration doesn't match a known vehicle. */
  private async ingestStatus(tenantId: string, status: CartrackVehicleStatus): Promise<boolean> {
    const vehicle = await vehicleRepository.findByLicensePlate(status.registration, tenantId);
    if (!vehicle || !vehicle._id) return false;

    const deviceId = deviceIdFor(status.terminal_serial);
    await this.ensureDeviceRegistered(deviceId, status.terminal_serial, vehicle._id, tenantId);

    const timestamp = new Date(status.position.position_date);

    /**
     * PHASE 1, F-2 -- MISSING IS NOT ZERO.
     *
     * This block previously mapped every field Cartrack does not supply
     * to 0:
     *
     *   engine: { rpm: 0, coolantTemp: 0, fuelLevel: status.fuel_level_percent ?? 0,
     *             throttlePosition: 0, engineLoad: 0 },
     *   trip:   { odometer: status.odometer_km ?? 0, tripDistance: 0, tripDuration: 0,
     *             averageSpeed: status.position.speed, maxSpeed: status.position.speed, ... },
     *   fuel:   { consumptionRate: 0, instantConsumption: 0, fuelUsed: 0 },
     *   location: { altitude: status.position.altitude ?? 0, accuracy: 0 }
     *
     * telematics.types.ts was widened to make all of these optional
     * PRECISELY to stop this, and its doc comments name the
     * consequences. Eagle Track's adapter was updated; this one was
     * not, so the two providers disagreed about what "no data" means
     * while writing into the same collection.
     *
     * The two that were not merely cosmetic:
     *
     *   * `fuelLevel: 0` satisfies checkForAlerts' `< 10` branch, so
     *     every Cartrack vehicle that does not report fuel raised a
     *     HIGH-SEVERITY "Low fuel level" alert plus a fleet-manager
     *     notification ON EVERY POLL. That is an alert-fatigue engine:
     *     it trains operators to ignore the channel.
     *   * `odometer: 0` WINS over the vehicle's own recorded odometer in
     *     digital-twin's `latestTelemetry?.trip?.odometer ??
     *     vehicle.odometer ?? 0` chain, so a real recorded reading was
     *     replaced by a placeholder on every poll.
     *
     * WHAT CARTRACK ACTUALLY SUPPLIES (see cartrack.types.ts):
     * latitude, longitude, speed, heading, position_date, ignition_on,
     * and OPTIONALLY altitude, odometer_km, fuel_level_percent. Nothing
     * else. Everything else is now omitted rather than invented.
     *
     * averageSpeed / maxSpeed: DELIBERATELY OMITTED, not mapped from
     * `speed`. Cartrack's status payload is a point-in-time fix with no
     * trip aggregation at all, so the previous mapping presented an
     * INSTANTANEOUS reading as two trip statistics. A vehicle sampled
     * once while stationary reported a maximum speed of 0 for the trip;
     * one sampled at a red light reported an average of 0. Both are
     * fabrications with the shape of a measurement. This matches the
     * decision already made for Eagle Track's /api2/last, which has the
     * same limitation.
     *
     * idleTime: ALSO OMITTED. The old expression
     * (`ignition_on && speed === 0 ? 1 : 0`) is a boolean state --
     * "idling right now" -- written into a field the rest of the
     * codebase reads as a DURATION. Emitting 1 per poll means the
     * accumulated figure measures how often we happened to sample, not
     * how long the vehicle idled. The underlying fact is still
     * recoverable from ignition + speed on the reading itself.
     */
    const engine: TelematicsData['engine'] = {};
    if (status.fuel_level_percent !== undefined && status.fuel_level_percent !== null) {
      engine.fuelLevel = status.fuel_level_percent;
    }

    const trip: TelematicsData['trip'] = {};
    if (status.odometer_km !== undefined && status.odometer_km !== null) {
      trip.odometer = status.odometer_km;
    }

    const location: TelematicsLocation = {
      lat: status.position.latitude,
      lng: status.position.longitude,
      // A genuine 0 IS preserved: a stationary vehicle really is doing
      // 0 km/h, and Cartrack always supplies this field.
      speed: status.position.speed,
      heading: status.position.heading,
      timestamp,
    };
    if (status.position.altitude !== undefined && status.position.altitude !== null) {
      location.altitude = status.position.altitude;
    }
    // `accuracy` is never omitted-vs-supplied: Cartrack's status payload
    // has no horizontal-accuracy field at all, so it is always absent.

    const payload: Omit<TelematicsData, '_id' | 'createdAt' | 'updatedAt'> & { tenantId: string } = {
      deviceId,
      vehicleId: vehicle._id,
      tenantId,
      location,
      engine,
      trip,
      // Cartrack's fleet status API reports no fuel-flow signals
      // whatsoever -- no consumption rate, no instantaneous
      // consumption, no fuel used. An empty object says exactly that.
      fuel: {},
      timestamp,
    };

    await telematicsService.ingestTelematicsData(payload);
    await telematicsRepository.updateDeviceLastPing(deviceId, tenantId, payload.location);

    return true;
  }

  private async ensureDeviceRegistered(
    deviceId: string,
    externalDeviceId: string,
    vehicleId: string,
    tenantId: string
  ): Promise<void> {
    const existing = await telematicsRepository.getDevice(deviceId, tenantId);
    if (existing) return;

    await telematicsRepository.registerDevice(
      {
        deviceId,
        // PHASE 2: see the Eagle Track adapter for the reasoning. The
        // terminal serial is Cartrack's own device identifier.
        providerId: PROVIDER_CARTRACK,
        externalDeviceId,
        vehicleId,
        tenantId,
        type: 'gps',
        manufacturer: 'Cartrack',
        model: 'Fleet API',
        firmwareVersion: 'n/a',
        status: 'active',
        metadata: { source: 'cartrack' },
      },
      tenantId
    );
  }

  /** Verifies stored credentials for a tenant without pulling a full fleet payload -- backs the "test connection" action in settings. */
  async testConnection(tenantId: string): Promise<boolean> {
    const client = await this.buildClient(tenantId);
    if (!client) return false;
    return client.verifyCredentials();
  }
}

export const cartrackAdapter = new CartrackAdapter();