// modules/telematics/services/telematics.service.ts

import { telematicsRepository } from '../repositories/telematics.repository';
import { TelematicsData, TelematicsAlert, Geofence } from '../types/telematics.types';
import {
  isPointInCircle,
  isPointInPolygon,
  isPointNearRoute,
  LatLng,
} from '../utils/geo.utils';
import { webSocketManager } from '@/infrastructure/websocket/server';
import { queueService, JobType } from '@/infrastructure/queue/queue.service';
import { notificationService } from '@/modules/notifications/services/notification.service';
import { organizationRepository } from '@/modules/organizations/repositories/organization.repository';

const SPEEDING_THRESHOLD_KMH = 120;
const LOW_FUEL_THRESHOLD_PERCENT = 10;

export class TelematicsService {
  async ingestTelematicsData(
    data: Omit<TelematicsData, '_id' | 'createdAt' | 'updatedAt'> & { tenantId: string }
  ): Promise<void> {
    await telematicsRepository.create(data, data.tenantId);

    const alerts = this.checkForAlerts(data);
    if (alerts.length > 0) {
      await this.processAlerts(alerts, data);
    }

    if (data.location) {
      webSocketManager.emitToTenant(data.tenantId, 'vehicle:location', {
        vehicleId: data.vehicleId,
        location: data.location,
        timestamp: data.timestamp,
      });

      // Geofence evaluation runs on every location ping.
      await this.checkGeofence(data.vehicleId, data.location, data.tenantId);
    }

    await queueService.addJob(JobType.REFRESH_ANALYTICS, {
      type: JobType.REFRESH_ANALYTICS,
      payload: { vehicleId: data.vehicleId },
      tenantId: data.tenantId,
    });
  }

  async bulkIngest(
    dataArray: Array<Omit<TelematicsData, '_id' | 'createdAt' | 'updatedAt'> & { tenantId: string }>
  ): Promise<void> {
    if (dataArray.length === 0) return;

    const byTenant = new Map<string, typeof dataArray>();
    for (const item of dataArray) {
      const group = byTenant.get(item.tenantId) || [];
      group.push(item);
      byTenant.set(item.tenantId, group);
    }

    for (const [tenantId, items] of byTenant) {
      await telematicsRepository.bulkInsertTelematics(items, tenantId);
    }

    // Alerts and geofence checks still run per-item since they depend on
    // each point's individual values, but at least the write is batched.
    for (const item of dataArray) {
      const alerts = this.checkForAlerts(item);
      if (alerts.length > 0) {
        await this.processAlerts(alerts, item);
      }
      if (item.location) {
        await this.checkGeofence(item.vehicleId, item.location, item.tenantId);
      }
    }
  }

  private checkForAlerts(
    data: Omit<TelematicsData, '_id' | 'createdAt' | 'updatedAt'>
  ): TelematicsAlert[] {
    const alerts: TelematicsAlert[] = [];

    if (data.location && data.location.speed > SPEEDING_THRESHOLD_KMH) {
      alerts.push({
        type: 'speeding',
        severity: 'high',
        message: `Vehicle exceeding speed limit: ${data.location.speed} km/h`,
        value: data.location.speed,
        threshold: SPEEDING_THRESHOLD_KMH,
        timestamp: data.timestamp,
      });
    }

    if (data.engine?.dtcCodes && data.engine.dtcCodes.length > 0) {
      alerts.push({
        type: 'engine',
        severity: 'critical',
        message: `Engine fault codes detected: ${data.engine.dtcCodes.join(', ')}`,
        value: data.engine.dtcCodes.length,
        timestamp: data.timestamp,
      });
    }

    if (data.engine && data.engine.fuelLevel < LOW_FUEL_THRESHOLD_PERCENT) {
      alerts.push({
        type: 'maintenance',
        severity: 'high',
        message: `Low fuel level: ${data.engine.fuelLevel}%`,
        value: data.engine.fuelLevel,
        threshold: LOW_FUEL_THRESHOLD_PERCENT,
        timestamp: data.timestamp,
      });
    }

    return alerts;
  }

  private async processAlerts(
    alerts: TelematicsAlert[],
    data: Omit<TelematicsData, '_id' | 'createdAt' | 'updatedAt'> & { tenantId: string }
  ): Promise<void> {
    const fleetManagerIds = await this.getFleetManagerIds(data.tenantId);

    for (const alert of alerts) {
      await telematicsRepository.createAlert(data.vehicleId, alert, data.tenantId);

      webSocketManager.emitToTenant(data.tenantId, 'vehicle:alert', {
        vehicleId: data.vehicleId,
        alert,
      });

      if ((alert.severity === 'critical' || alert.severity === 'high') && fleetManagerIds.length > 0) {
        await notificationService.sendBulkNotification(fleetManagerIds, data.tenantId, {
          type: 'alert',
          title: `Vehicle Alert: ${alert.type}`,
          message: alert.message,
          priority: alert.severity === 'critical' ? 'critical' : 'high',
          data: { vehicleId: data.vehicleId, alert },
          actionUrl: `/vehicles/${data.vehicleId}`,
          actionLabel: 'View Vehicle',
        });
      }
    }
  }

  /**
   * Resolves the fleet managers/owner who should receive vehicle alerts
   * for a tenant. The original code passed an empty `userId: ''` and an
   * empty recipient array to `sendBulkNotification`, which meant alert
   * notifications were silently never delivered to anyone.
   */
  private async getFleetManagerIds(tenantId: string): Promise<string[]> {
    try {
      const organization = await organizationRepository.findById(tenantId, tenantId, false, true);
      if (!organization) return [];

      return organization.members
        .filter((m) => ['organization_owner', 'fleet_manager'].includes(m.role))
        .map((m) => m.userId);
    } catch {
      return [];
    }
  }

  async getCurrentLocation(vehicleId: string, tenantId: string): Promise<TelematicsData | null> {
    return telematicsRepository.getLatestTelematicsData(vehicleId, tenantId);
  }

  async getVehicleHistory(
    vehicleId: string,
    startDate: Date,
    endDate: Date,
    tenantId: string
  ): Promise<TelematicsData[]> {
    return telematicsRepository.getTelematicsHistory(vehicleId, startDate, endDate, tenantId);
  }

  async createGeofence(
    geofence: Omit<Geofence, '_id' | 'createdAt' | 'updatedAt'>,
    tenantId: string,
    userId: string
  ): Promise<Geofence> {
    this.validateGeofenceCoordinates(geofence);
    return telematicsRepository.createGeofence(geofence, tenantId, userId);
  }

  private validateGeofenceCoordinates(geofence: Pick<Geofence, 'type' | 'coordinates'>): void {
    if (geofence.type === 'circle') {
      const coords = geofence.coordinates as any;
      if (!coords?.center || typeof coords.radius !== 'number' || coords.radius <= 0) {
        throw new Error('Circle geofence requires a center point and a positive radius');
      }
    } else if (geofence.type === 'polygon') {
      const coords = geofence.coordinates as any;
      if (!Array.isArray(coords?.points) || coords.points.length < 3) {
        throw new Error('Polygon geofence requires at least 3 points');
      }
    } else if (geofence.type === 'route') {
      const coords = geofence.coordinates as any;
      if (!Array.isArray(coords?.points) || coords.points.length < 2) {
        throw new Error('Route geofence requires at least 2 points');
      }
      if (typeof coords.tolerance !== 'number' || coords.tolerance <= 0) {
        throw new Error('Route geofence requires a positive tolerance in meters');
      }
    }
  }

  /**
   * Evaluates a vehicle's current location against all active geofences
   * for the tenant, fetching state for all relevant geofences in one
   * batched read and writing all changes in one batched write â€” rather
   * than one DB round trip per geofence as in the original implementation.
   */
  async checkGeofence(
    vehicleId: string,
    location: { lat: number; lng: number },
    tenantId: string
  ): Promise<void> {
    const geofences = await telematicsRepository.getActiveGeofences(vehicleId, tenantId);
    if (geofences.length === 0) return;

    const geofenceIds = geofences.map((g) => g._id!).filter(Boolean);
    const previousStates = await telematicsRepository.getGeofenceStatesForVehicle(
      vehicleId,
      geofenceIds
    );

    const stateUpdates: Array<{ geofenceId: string; isInside: boolean }> = [];

    for (const geofence of geofences) {
      if (!this.isGeofenceActiveNow(geofence)) continue;

      const isInside = this.isPointInGeofence(location, geofence);
      const previousState = previousStates.get(geofence._id!);

      if (previousState !== isInside) {
        stateUpdates.push({ geofenceId: geofence._id!, isInside });

        if (isInside && geofence.alerts.entry) {
          await this.triggerGeofenceAlert(vehicleId, geofence, 'entry', tenantId);
        } else if (!isInside && geofence.alerts.exit) {
          await this.triggerGeofenceAlert(vehicleId, geofence, 'exit', tenantId);
        }
      } else if (isInside && geofence.alerts.inside) {
        // Vehicle remains inside on a schedule-restricted geofence â€”
        // emit a lightweight live update without a full alert record.
        webSocketManager.emitToTenant(tenantId, 'vehicle:geofence_inside', {
          vehicleId,
          geofence: geofence.name,
          timestamp: new Date(),
        });
      }
    }

    if (stateUpdates.length > 0) {
      await telematicsRepository.setGeofenceStates(vehicleId, stateUpdates);
    }
  }

  /**
   * Real containment test, dispatching to the correct geometry per
   * geofence type. The original implementation was a hardcoded
   * `return true`, meaning every geofence reported "inside" regardless
   * of actual vehicle location.
   */
  private isPointInGeofence(point: LatLng, geofence: Geofence): boolean {
    switch (geofence.type) {
      case 'circle': {
        const coords = geofence.coordinates as { center: LatLng; radius: number };
        return isPointInCircle(point, coords.center, coords.radius);
      }
      case 'polygon': {
        const coords = geofence.coordinates as { points: LatLng[] };
        return isPointInPolygon(point, coords.points);
      }
      case 'route': {
        const coords = geofence.coordinates as { points: LatLng[]; tolerance: number };
        return isPointNearRoute(point, coords.points, coords.tolerance);
      }
      default:
        return false;
    }
  }

  private isGeofenceActiveNow(geofence: Geofence): boolean {
    if (!geofence.schedule) return true;

    const now = new Date();
    const currentDay = now.getDay();
    if (!geofence.schedule.daysOfWeek.includes(currentDay)) return false;

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [startH, startM] = geofence.schedule.startTime.split(':').map(Number);
    const [endH, endM] = geofence.schedule.endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  private async triggerGeofenceAlert(
    vehicleId: string,
    geofence: Geofence,
    event: 'entry' | 'exit',
    tenantId: string
  ): Promise<void> {
    webSocketManager.emitToTenant(tenantId, 'vehicle:geofence', {
      vehicleId,
      geofence: geofence.name,
      event,
      timestamp: new Date(),
    });

    await telematicsRepository.createAlert(
      vehicleId,
      {
        type: 'geofence',
        severity: 'medium',
        message: `Vehicle ${event === 'entry' ? 'entered' : 'exited'} ${geofence.name}`,
        timestamp: new Date(),
      },
      tenantId
    );

    const fleetManagerIds = await this.getFleetManagerIds(tenantId);
    if (fleetManagerIds.length === 0) return;

    await notificationService.sendBulkNotification(fleetManagerIds, tenantId, {
      type: 'alert',
      title: `Vehicle ${event === 'entry' ? 'Entered' : 'Exited'} Geofence`,
      message: `Vehicle ${vehicleId} ${event === 'entry' ? 'entered' : 'exited'} ${geofence.name}`,
      priority: 'medium',
      data: { vehicleId, geofence: geofence.name, event },
      actionUrl: `/vehicles/${vehicleId}`,
      actionLabel: 'View Vehicle',
    });
  }

  async acknowledgeAlert(alertId: string, userId: string, tenantId: string): Promise<boolean> {
    return telematicsRepository.acknowledgeAlert(alertId, userId, tenantId);
  }

  async getActiveAlerts(vehicleId: string, tenantId: string): Promise<TelematicsAlert[]> {
    return telematicsRepository.getActiveAlerts(vehicleId, tenantId);
  }

  async getOfflineDevices(tenantId: string, minutesOffline: number = 5) {
    return telematicsRepository.getOfflineDevices(tenantId, minutesOffline);
  }
}

export const telematicsService = new TelematicsService();