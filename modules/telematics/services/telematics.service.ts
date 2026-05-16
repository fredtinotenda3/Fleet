// modules/telematics/services/telematics.service.ts

import { telematicsRepository } from '../repositories/telematics.repository';
import { TelematicsData, TelematicsAlert, Geofence } from '../types/telematics.types';
import { webSocketManager } from '@/infrastructure/websocket/server';
import { queueService, JobType } from '@/infrastructure/queue/queue.service';
import { notificationService } from '@/modules/notifications/services/notification.service';

export class TelematicsService {
  async ingestTelematicsData(data: Omit<TelematicsData, '_id' | 'createdAt' | 'updatedAt' | 'tenantId'>): Promise<void> {
    // Store telematics data
    await telematicsRepository.create(data, data.tenantId);
    
    // Check for alerts
    const alerts = this.checkForAlerts(data);
    
    if (alerts.length > 0) {
      await this.processAlerts(alerts, data);
    }
    
    // Update real-time location
    if (data.location) {
      webSocketManager.emitToTenant(data.tenantId, 'vehicle:location', {
        vehicleId: data.vehicleId,
        location: data.location,
        timestamp: data.timestamp,
      });
    }
    
    // Queue for analytics processing
    await queueService.addJob('process-telematics' as JobType, {
      type: 'process-telematics' as JobType,
      payload: { dataId: data._id },
      tenantId: data.tenantId,
    });
  }
  
  private checkForAlerts(data: TelematicsData): TelematicsAlert[] {
    const alerts: TelematicsAlert[] = [];
    
    // Speeding alert (over 120 km/h)
    if (data.location && data.location.speed > 120) {
      alerts.push({
        type: 'speeding',
        severity: 'high',
        message: `Vehicle exceeding speed limit: ${data.location.speed} km/h`,
        value: data.location.speed,
        threshold: 120,
        timestamp: data.timestamp,
      });
    }
    
    // Hard brake alert (deceleration > 8 km/h per second)
    // This would require previous data point comparison
    
    // Engine fault alert
    if (data.engine.dtcCodes && data.engine.dtcCodes.length > 0) {
      alerts.push({
        type: 'engine',
        severity: 'critical',
        message: `Engine fault codes detected: ${data.engine.dtcCodes.join(', ')}`,
        value: data.engine.dtcCodes.length,
        timestamp: data.timestamp,
      });
    }
    
    // Low fuel alert
    if (data.engine.fuelLevel < 10) {
      alerts.push({
        type: 'maintenance',
        severity: 'high',
        message: `Low fuel level: ${data.engine.fuelLevel}%`,
        value: data.engine.fuelLevel,
        threshold: 10,
        timestamp: data.timestamp,
      });
    }
    
    return alerts;
  }
  
  private async processAlerts(alerts: TelematicsAlert[], data: TelematicsData): Promise<void> {
    for (const alert of alerts) {
      // Store alert
      await telematicsRepository.createAlert(data.vehicleId, alert, data.tenantId);
      
      // Send real-time alert
      webSocketManager.emitToTenant(data.tenantId, 'vehicle:alert', {
        vehicleId: data.vehicleId,
        alert,
      });
      
      // Send notification for critical alerts
      if (alert.severity === 'critical' || alert.severity === 'high') {
        await notificationService.sendBulkNotification(
          [], // Would get list of fleet managers
          data.tenantId,
          {
            userId: '', // Would be replaced
            type: 'alert',
            title: `Vehicle Alert: ${alert.type}`,
            message: alert.message,
            priority: alert.severity === 'critical' ? 'critical' : 'high',
            data: { vehicleId: data.vehicleId, alert },
            actionUrl: `/vehicles/${data.vehicleId}`,
            actionLabel: 'View Vehicle',
          }
        );
      }
    }
  }
  
  async getCurrentLocation(vehicleId: string, tenantId: string): Promise<TelematicsData | null> {
    return telematicsRepository.getLatestTelematicsData(vehicleId, tenantId);
  }
  
  async getVehicleHistory(vehicleId: string, startDate: Date, endDate: Date, tenantId: string): Promise<TelematicsData[]> {
    return telematicsRepository.getTelematicsHistory(vehicleId, startDate, endDate, tenantId);
  }
  
  async createGeofence(geofence: Omit<Geofence, '_id' | 'createdAt' | 'updatedAt'>, tenantId: string, userId: string): Promise<Geofence> {
    return telematicsRepository.createGeofence(geofence, tenantId, userId);
  }
  
  async checkGeofence(vehicleId: string, location: { lat: number; lng: number }, tenantId: string): Promise<void> {
    const geofences = await telematicsRepository.getActiveGeofences(vehicleId, tenantId);
    
    for (const geofence of geofences) {
      const isInside = this.isPointInGeofence(location, geofence);
      
      // Track state and trigger alerts on state change
      const previousState = await telematicsRepository.getGeofenceState(vehicleId, geofence._id!);
      
      if (previousState !== isInside) {
        await telematicsRepository.setGeofenceState(vehicleId, geofence._id!, isInside);
        
        if (isInside && geofence.alerts.entry) {
          await this.triggerGeofenceAlert(vehicleId, geofence, 'entry', tenantId);
        } else if (!isInside && geofence.alerts.exit) {
          await this.triggerGeofenceAlert(vehicleId, geofence, 'exit', tenantId);
        }
      }
    }
  }
  
  private isPointInGeofence(point: { lat: number; lng: number }, geofence: Geofence): boolean {
    // Implementation for point-in-geofence checking
    // Supports circle, polygon, and route geofences
    return true; // Placeholder
  }
  
  private async triggerGeofenceAlert(vehicleId: string, geofence: Geofence, event: 'entry' | 'exit', tenantId: string): Promise<void> {
    webSocketManager.emitToTenant(tenantId, 'vehicle:geofence', {
      vehicleId,
      geofence: geofence.name,
      event,
      timestamp: new Date(),
    });
    
    await notificationService.sendBulkNotification(
      [],
      tenantId,
      {
        userId: '',
        type: 'alert',
        title: `Vehicle ${event === 'entry' ? 'Entered' : 'Exited'} Geofence`,
        message: `Vehicle ${vehicleId} ${event === 'entry' ? 'entered' : 'exited'} ${geofence.name}`,
        priority: 'medium',
        data: { vehicleId, geofence: geofence.name, event },
        actionUrl: `/vehicles/${vehicleId}`,
        actionLabel: 'View Vehicle',
      }
    );
  }
}

export const telematicsService = new TelematicsService();