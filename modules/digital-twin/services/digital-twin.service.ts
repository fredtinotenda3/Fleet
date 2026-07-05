// modules/digital-twin/services/digital-twin.service.ts

import { randomUUID } from 'crypto';
import { digitalTwinRepository, DigitalTwinRepository } from '../repositories/digital-twin.repository';
import {
  VehicleDigitalTwin,
  TwinAlert,
  TwinAlertSeverity,
  DigitalTwinFilters,
  FleetTwinSummary,
} from '../types/digital-twin.types';
import { vehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { telematicsRepository } from '@/modules/telematics/repositories/telematics.repository';
import { fuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { tripRepository } from '@/modules/trips/repositories/trip.repository';
import { maintenanceRepository } from '@/modules/maintenance/repositories/maintenance.repository';
import { NotFoundError } from '@/server/errors/app.errors';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { DigitalTwinUpdatedEvent } from '../events/DigitalTwinUpdatedEvent';
import { webSocketManager } from '@/infrastructure/websocket/server';
import { monitoring } from '@/infrastructure/monitoring/logger';

const YTD_START = () => new Date(new Date().getFullYear(), 0, 1);

function insuranceStatusFor(expiry?: string | Date | null): 'active' | 'expiring_soon' | 'expired' | 'unknown' {
  if (!expiry) return 'unknown';
  const exp = new Date(expiry);
  if (isNaN(exp.getTime())) return 'unknown';
  const daysLeft = Math.ceil((exp.getTime() - Date.now()) / 86_400_000);
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 30) return 'expiring_soon';
  return 'active';
}

function computeHealthScore(params: {
  overdueReminders: number;
  openWorkOrders: number;
  activeCriticalAlerts: number;
  insuranceStatus: string;
}): number {
  let score = 100;
  score -= Math.min(40, params.overdueReminders * 10);
  score -= Math.min(20, params.openWorkOrders * 5);
  score -= Math.min(30, params.activeCriticalAlerts * 15);
  if (params.insuranceStatus === 'expired') score -= 15;
  else if (params.insuranceStatus === 'expiring_soon') score -= 5;
  return Math.max(0, Math.min(100, score));
}

export class DigitalTwinService {
  constructor(private readonly repo: DigitalTwinRepository = digitalTwinRepository) {}

  async getTwin(vehicleId: string, tenantId: string, autoBuild: boolean = true): Promise<VehicleDigitalTwin> {
    const existing = await this.repo.findByVehicleId(vehicleId, tenantId);
    if (existing) return existing;
    if (!autoBuild) throw new NotFoundError('Digital twin not found');
    return this.rebuildTwin(vehicleId, tenantId);
  }

  async listTwins(
    filters: DigitalTwinFilters,
    pagination: PaginationParams,
    tenantId: string
  ): Promise<PaginatedResponse<VehicleDigitalTwin>> {
    return this.repo.listFiltered(filters, tenantId, pagination);
  }

  async getFleetSummary(tenantId: string): Promise<FleetTwinSummary> {
    return this.repo.getFleetSummary(tenantId);
  }

  async acknowledgeAlert(vehicleId: string, alertId: string, tenantId: string): Promise<void> {
    const ok = await this.repo.acknowledgeAlert(vehicleId, tenantId, alertId);
    if (!ok) throw new NotFoundError('Alert not found on this vehicle twin');
  }

  /**
   * Full rebuild of a vehicle's twin from every source-of-record module.
   * Used for: first-time twin creation, manual admin "resync", and
   * periodic reconciliation to correct any projection drift from missed
   * events. Safe to call at any time — fully idempotent overwrite.
   */
  async rebuildTwin(vehicleId: string, tenantId: string): Promise<VehicleDigitalTwin> {
    const vehicle = await vehicleRepository.findById(vehicleId, tenantId, false, true);
    if (!vehicle) throw new NotFoundError('Vehicle not found');

    const [latestTelemetry, activeAlerts, lastFuel, lastTrip, overdueReminders, upcomingReminders] =
      await Promise.all([
        telematicsRepository.getLatestTelematicsData(vehicleId, tenantId).catch(() => null),
        telematicsRepository.getActiveAlerts(vehicleId, tenantId).catch(() => []),
        fuelRepository
          .findByLicensePlate(vehicle.license_plate, tenantId, { page: 1, limit: 1, sortBy: 'date', sortOrder: 'desc' })
          .catch(() => ({ data: [] as any[] })),
        tripRepository
          .findByLicensePlate(vehicle.license_plate, tenantId, { page: 1, limit: 1, sortBy: 'date', sortOrder: 'desc' })
          .catch(() => ({ data: [] as any[] })),
        maintenanceRepository.getOverdueReminders(tenantId).catch(() => []),
        maintenanceRepository.getUpcomingReminders(tenantId, 30).catch(() => []),
      ]);

    const yearStart = YTD_START();
    const [fuelStats, tripStats] = await Promise.all([
      fuelRepository.getFuelStats(tenantId, { startDate: yearStart }).catch(() => null),
      tripRepository.getTripStats(tenantId, { startDate: yearStart }).catch(() => null),
    ]);

    const vehicleOverdue = overdueReminders.filter((r) => r.license_plate === vehicle.license_plate);
    const vehicleUpcoming = upcomingReminders.filter((r) => r.license_plate === vehicle.license_plate);

    let openWorkOrders = 0;
    let lastWorkOrderCompletedAt: Date | undefined;
    try {
      const { workOrderRepository } = await import('@/modules/workorders/repositories/workorder.repository');
      const { data: orders } = await workOrderRepository.getFiltered(
        { license_plate: vehicle.license_plate },
        tenantId,
        { page: 1, limit: 100, sortBy: 'createdAt', sortOrder: 'desc' }
      );
      openWorkOrders = (orders || []).filter((w) => !['completed', 'cancelled'].includes(w.status)).length;
      const completed = (orders || [])
        .filter((w) => w.status === 'completed' && w.completedAt)
        .sort((a, b) => {
          const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
          const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
          return bTime - aTime;
        });
      lastWorkOrderCompletedAt = completed[0]?.completedAt ? new Date(completed[0].completedAt) : undefined;
    } catch {
      // Workorders module not wired for this deployment/tenant yet — skip.
    }

    const insuranceStatus = insuranceStatusFor(vehicle.registration_expiry || null);

    const activeCriticalAlertCount = activeAlerts.filter(
      (a) => a.severity === 'critical' || a.severity === 'high'
    ).length;

    const healthScore = computeHealthScore({
      overdueReminders: vehicleOverdue.length,
      openWorkOrders,
      activeCriticalAlerts: activeCriticalAlertCount,
      insuranceStatus,
    });

    const twinAlerts: TwinAlert[] = activeAlerts.map((a) => ({
      id: randomUUID(),
      source: 'telematics',
      type: a.type,
      severity: a.severity as TwinAlertSeverity,
      message: a.message,
      raisedAt: new Date(a.timestamp),
      acknowledged: false,
    }));

    if (vehicleOverdue.length > 0) {
      twinAlerts.push({
        id: randomUUID(),
        source: 'maintenance',
        type: 'maintenance_overdue',
        severity: 'high',
        message: `${vehicleOverdue.length} maintenance item(s) overdue`,
        raisedAt: new Date(),
        acknowledged: false,
      });
    }

    if (insuranceStatus === 'expired' || insuranceStatus === 'expiring_soon') {
      twinAlerts.push({
        id: randomUUID(),
        source: 'compliance',
        type: 'insurance_status',
        severity: insuranceStatus === 'expired' ? 'critical' : 'medium',
        message: `Insurance ${insuranceStatus === 'expired' ? 'has expired' : 'expiring within 30 days'}`,
        raisedAt: new Date(),
        acknowledged: false,
      });
    }

    const twin: VehicleDigitalTwin = {
      tenantId,
      vehicleId,
      license_plate: vehicle.license_plate,
      currentState: {
        status: vehicle.status,
        odometer: latestTelemetry?.trip?.odometer ?? vehicle.odometer ?? 0,
        healthScore,
        lastUpdated: new Date(),
      },
      location: latestTelemetry?.location
        ? {
            lat: latestTelemetry.location.lat,
            lng: latestTelemetry.location.lng,
            speed: latestTelemetry.location.speed,
            heading: latestTelemetry.location.heading,
            accuracy: latestTelemetry.location.accuracy,
            recordedAt: new Date(latestTelemetry.location.timestamp),
          }
        : null,
      sensors: latestTelemetry?.engine
        ? {
            rpm: latestTelemetry.engine.rpm,
            coolantTemp: latestTelemetry.engine.coolantTemp,
            fuelLevel: latestTelemetry.engine.fuelLevel,
            throttlePosition: latestTelemetry.engine.throttlePosition,
            engineLoad: latestTelemetry.engine.engineLoad,
            dtcCodes: latestTelemetry.engine.dtcCodes || [],
            recordedAt: new Date(latestTelemetry.timestamp),
          }
        : null,
      fuel: {
        lastFuelDate: lastFuel.data[0]?.date ? new Date(lastFuel.data[0].date) : undefined,
        lastFuelVolume: lastFuel.data[0]?.fuel_volume,
        lastFuelCost: lastFuel.data[0]?.cost,
        fuelYTD: fuelStats?.totalFuel ?? 0,
        costYTD: fuelStats?.totalCost ?? 0,
        averageEfficiency: fuelStats?.efficiency ?? null,
      },
      trips: {
        lastTripDate: lastTrip.data[0]?.date ? new Date(lastTrip.data[0].date) : undefined,
        distanceYTD: tripStats?.totalDistance ?? 0,
        tripCountYTD: tripStats?.totalTrips ?? 0,
      },
      driver: {
        driverId: lastTrip.data[0]?.driver_id,
      },
      maintenance: {
        lastServiceDate: vehicle.last_service_date ? new Date(vehicle.last_service_date) : undefined,
        nextDueDate: vehicleUpcoming[0]?.due_date ? new Date(vehicleUpcoming[0].due_date) : undefined,
        openReminders: vehicleUpcoming.length,
        overdueReminders: vehicleOverdue.length,
      },
      repairs: {
        openWorkOrders,
        lastCompletedAt: lastWorkOrderCompletedAt,
      },
      tires: [],
      documents: [
        ...(vehicle.registration_expiry
          ? [{ type: 'registration' as const, label: 'Vehicle Registration', expiresAt: new Date(vehicle.registration_expiry) }]
          : []),
        ...(vehicle.insurance_provider
          ? [{ type: 'insurance' as const, label: vehicle.insurance_provider, expiresAt: vehicle.registration_expiry ? new Date(vehicle.registration_expiry) : undefined }]
          : []),
      ],
      insurance: {
        provider: vehicle.insurance_provider,
        expiryDate: vehicle.registration_expiry ? new Date(vehicle.registration_expiry) : undefined,
        status: insuranceStatus,
      },
      inspection: {
        lastInspectionDate: undefined,
        nextDueDate: undefined,
        status: 'unknown',
      },
      alerts: twinAlerts,
      version: 0,
    } as VehicleDigitalTwin;

    const saved = await this.repo.replaceFull(twin, tenantId);
    await this.emitUpdated(saved, 'DigitalTwinRebuilt');
    return saved;
  }

  // ── Incremental projection handlers (called by DigitalTwinProjectionHandler) ──

  async applyVehicleChange(vehicleId: string, licensePlate: string, tenantId: string, patch: Record<string, unknown>, eventName: string) {
    return this.applyAndBroadcast(vehicleId, licensePlate, tenantId, patch, eventName);
  }

  async applyLocationUpdate(
    vehicleId: string,
    licensePlate: string,
    tenantId: string,
    location: { lat: number; lng: number; speed: number; heading: number; accuracy?: number; timestamp: Date },
    eventName: string
  ) {
    return this.applyAndBroadcast(
      vehicleId,
      licensePlate,
      tenantId,
      { location: { ...location, recordedAt: location.timestamp } },
      eventName
    );
  }

  async applySensorUpdate(
    vehicleId: string,
    licensePlate: string,
    tenantId: string,
    sensors: Record<string, unknown>,
    eventName: string
  ) {
    return this.applyAndBroadcast(vehicleId, licensePlate, tenantId, { sensors }, eventName);
  }

  async applyFuelLogged(
    vehicleId: string,
    licensePlate: string,
    tenantId: string,
    fuelVolume: number,
    cost: number,
    date: Date,
    eventName: string
  ) {
    return this.applyAndBroadcast(
      vehicleId,
      licensePlate,
      tenantId,
      {
        'fuel.lastFuelDate': date,
        'fuel.lastFuelVolume': fuelVolume,
        'fuel.lastFuelCost': cost,
      },
      eventName
    );
  }

  async applyTripEvent(vehicleId: string, licensePlate: string, tenantId: string, date: Date, eventName: string) {
    return this.applyAndBroadcast(vehicleId, licensePlate, tenantId, { 'trips.lastTripDate': date }, eventName);
  }

  async applyMaintenanceOverdue(vehicleId: string, licensePlate: string, tenantId: string, eventName: string) {
    const alert: TwinAlert = {
      id: randomUUID(),
      source: 'maintenance',
      type: 'maintenance_overdue',
      severity: 'high',
      message: 'A maintenance reminder is now overdue',
      raisedAt: new Date(),
      acknowledged: false,
    };

    const collection = await (this.repo as any).getCollection();
    await collection.updateOne(
      { vehicleId, tenantId, isDeleted: { $ne: true } },
      {
        $inc: { 'maintenance.overdueReminders': 1, version: 1 },
        $push: { alerts: { $each: [alert], $slice: -50 } },
        $set: { updatedAt: new Date(), lastEventName: eventName },
        $setOnInsert: {
          vehicleId, license_plate: licensePlate, tenantId,
          createdAt: new Date(), isDeleted: false, tires: [], documents: [],
        },
      },
      { upsert: true }
    );

    const twin = await this.getTwin(vehicleId, tenantId, false).catch(() => null);
    if (twin) await this.emitUpdated(twin, eventName);
  }

  async applyTelemetryAlert(
    vehicleId: string,
    licensePlate: string,
    tenantId: string,
    alert: { type: string; severity: TwinAlertSeverity; message: string },
    eventName: string
  ) {
    await this.repo.pushAlert(vehicleId, tenantId, {
      id: randomUUID(),
      source: 'telematics',
      type: alert.type,
      severity: alert.severity,
      message: alert.message,
      raisedAt: new Date(),
      acknowledged: false,
    });
    const twin = await this.getTwin(vehicleId, tenantId, false).catch(() => null);
    if (twin) await this.emitUpdated(twin, eventName);
  }

  private async applyAndBroadcast(
    vehicleId: string,
    licensePlate: string,
    tenantId: string,
    patch: Record<string, unknown>,
    eventName: string,
    isOverdueBump: boolean = false
  ): Promise<VehicleDigitalTwin> {
    const finalPatch = isOverdueBump ? {} : patch;
    const twin = await this.repo.applyPatch(vehicleId, licensePlate, tenantId, finalPatch, eventName);

    if (isOverdueBump) {
      const collection = await (this.repo as any).getCollection();
      await collection.updateOne(
        { vehicleId, tenantId },
        { $inc: { 'maintenance.overdueReminders': 1 } }
      );
    }

    await this.emitUpdated(twin, eventName);
    return twin;
  }

  private async emitUpdated(twin: VehicleDigitalTwin, sourceEvent: string): Promise<void> {
    try {
      const bus = EventBusFactory.getInstance();
      await bus.publish(new DigitalTwinUpdatedEvent(twin, sourceEvent, { tenantId: twin.tenantId }));
      webSocketManager.emitToTenant(twin.tenantId, 'digital_twin:updated', {
        vehicleId: twin.vehicleId,
        license_plate: twin.license_plate,
        healthScore: twin.currentState.healthScore,
        alertCount: twin.alerts.filter((a) => !a.acknowledged).length,
      });
    } catch (error) {
      monitoring.logError('[DigitalTwinService] Failed to broadcast twin update', error as Error, {
        vehicleId: twin.vehicleId,
      });
    }
  }
}

export const digitalTwinService = new DigitalTwinService();