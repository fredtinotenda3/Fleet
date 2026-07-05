// server/events/handlers/digital-twin/DigitalTwinProjectionHandler.ts

import { IEventHandler } from '@/server/events/base/IEventHandler';
import { DomainEvent } from '@/server/events/base/DomainEvent';
import { digitalTwinService } from '@/modules/digital-twin/services/digital-twin.service';
import { monitoring } from '@/infrastructure/monitoring/logger';
import {
  VEHICLE_CREATED,
  VEHICLE_UPDATED,
  VEHICLE_STATUS_CHANGED,
  FUEL_LOGGED,
  TRIP_CREATED,
  TRIP_COMPLETED,
  REMINDER_OVERDUE,
  REMINDER_COMPLETED,
  TELEMATICS_DATA_INGESTED,
  GEOFENCE_ALERT,
  WORK_ORDER_COMPLETED,
} from '@/server/events/event-names';

/**
 * Single subscriber that keeps every VehicleDigitalTwin projection
 * up to date incrementally, in response to domain events raised across
 * the whole platform (vehicles, fuel, trips, maintenance, telematics,
 * workorders). This is intentionally the ONLY place that writes to the
 * digital-twin collection outside of an explicit rebuild â€” keeping twin
 * mutation logic centralized here (rather than scattered across each
 * domain's own command handlers) is what lets new domains hook into the
 * twin later with a single new `case` branch instead of touching N
 * other modules.
 *
 * Failures here are swallowed (logged, not thrown): a missed twin
 * projection update must never fail the original business operation
 * that triggered the event, and can always be corrected later via
 * DigitalTwinService.rebuildTwin().
 */
export class DigitalTwinProjectionHandler implements IEventHandler<DomainEvent> {
  async handle(event: DomainEvent): Promise<void> {
    const payload = event.payload as Record<string, any>;
    const tenantId = (event.metadata?.tenantId as string) || (payload.tenantId as string) || 'default';

    try {
      switch (event.eventName) {
        case VEHICLE_CREATED:
        case VEHICLE_UPDATED:
        case VEHICLE_STATUS_CHANGED: {
          const vehicleId = payload.entityId as string;
          const licensePlate = payload.license_plate as string;
          if (!vehicleId || !licensePlate) return;
          await digitalTwinService.applyVehicleChange(
            vehicleId,
            licensePlate,
            tenantId,
            {
              'currentState.status': payload.newStatus || payload.status,
            },
            event.eventName
          );
          return;
        }

        case FUEL_LOGGED: {
          const vehicleId = await this.resolveVehicleId(payload.license_plate, tenantId);
          if (!vehicleId) return;
          await digitalTwinService.applyFuelLogged(
            vehicleId,
            payload.license_plate,
            tenantId,
            payload.fuel_volume,
            payload.cost,
            new Date(event.occurredOn),
            event.eventName
          );
          return;
        }

        case TRIP_CREATED:
        case TRIP_COMPLETED: {
          const vehicleId = await this.resolveVehicleId(payload.license_plate, tenantId);
          if (!vehicleId) return;
          await digitalTwinService.applyTripEvent(
            vehicleId,
            payload.license_plate,
            tenantId,
            new Date(payload.date || event.occurredOn),
            event.eventName
          );
          return;
        }

        case REMINDER_OVERDUE: {
          const vehicleId = await this.resolveVehicleId(payload.license_plate, tenantId);
          if (!vehicleId) return;
          await digitalTwinService.applyMaintenanceOverdue(vehicleId, payload.license_plate, tenantId, event.eventName);
          return;
        }

        case REMINDER_COMPLETED: {
          const vehicleId = await this.resolveVehicleId(payload.license_plate, tenantId);
          if (!vehicleId) return;
          await digitalTwinService.applyVehicleChange(
            vehicleId,
            payload.license_plate,
            tenantId,
            { 'maintenance.lastServiceDate': new Date(payload.completion_date || event.occurredOn) },
            event.eventName
          );
          return;
        }

        case TELEMATICS_DATA_INGESTED: {
          const vehicleId = payload.vehicleId as string;
          if (!vehicleId || !payload.location) return;
          await digitalTwinService.applyLocationUpdate(
            vehicleId,
            payload.license_plate || vehicleId,
            tenantId,
            {
              lat: payload.location.lat,
              lng: payload.location.lng,
              speed: payload.location.speed,
              heading: payload.location.heading,
              accuracy: payload.location.accuracy,
              timestamp: new Date(payload.location.timestamp || event.occurredOn),
            },
            event.eventName
          );
          if (payload.engine) {
            await digitalTwinService.applySensorUpdate(
              vehicleId,
              payload.license_plate || vehicleId,
              tenantId,
              { ...payload.engine, recordedAt: new Date(event.occurredOn) },
              event.eventName
            );
          }
          return;
        }

        case GEOFENCE_ALERT: {
          const vehicleId = payload.vehicleId as string;
          if (!vehicleId) return;
          await digitalTwinService.applyTelemetryAlert(
            vehicleId,
            payload.license_plate || vehicleId,
            tenantId,
            { type: 'geofence', severity: 'medium', message: payload.message || 'Geofence event' },
            event.eventName
          );
          return;
        }

        case WORK_ORDER_COMPLETED: {
          const vehicleId = await this.resolveVehicleId(payload.license_plate, tenantId);
          if (!vehicleId) return;
          await digitalTwinService.applyVehicleChange(
            vehicleId,
            payload.license_plate,
            tenantId,
            { 'repairs.lastCompletedAt': new Date(event.occurredOn) },
            event.eventName
          );
          return;
        }

        default:
          return;
      }
    } catch (error) {
      monitoring.logError('[DigitalTwinProjectionHandler] Failed to project event', error as Error, {
        eventName: event.eventName,
      });
    }
  }

  private async resolveVehicleId(licensePlate: string | undefined, tenantId: string): Promise<string | null> {
    if (!licensePlate) return null;
    const { vehicleRepository } = await import('@/modules/vehicles/repositories/vehicle.repository');
    const vehicle = await vehicleRepository.findByLicensePlate(licensePlate, tenantId);
    return vehicle?._id ?? null;
  }
}

export const digitalTwinProjectionHandler = new DigitalTwinProjectionHandler();