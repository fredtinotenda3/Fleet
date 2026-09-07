// server/events/handlers/ai/AIPredictionTriggerHandler.ts
//
// ---------------------------------------------------------------------
// THIS HANDLER WAS ENTIRELY DEAD. READ THIS BEFORE CHANGING IT.
// ---------------------------------------------------------------------
// Every branch below read `payload.vehicleId`:
//
//     case 'FuelLogged':
//       this.triggerFuelFraudDetection(payload.vehicleId as string, tenantId)
//         .catch(() => undefined);
//
// NO domain event in this codebase has ever carried a `vehicleId`. They
// all carry `entityId` plus `license_plate` -- FuelLoggedEvent,
// TripCreatedEvent, TripUpdatedEvent, VehicleUpdatedEvent,
// ReminderCreatedEvent and ReminderCompletedEvent are each constructed
// that way, and the DigitalTwinProjectionHandler already resolves the
// plate to an id for exactly this reason.
//
// So `payload.vehicleId` was `undefined` on every event, and:
//
//   * `predictiveMaintenanceService.predictVehicle(undefined, tenantId)`
//     and `fuelFraudDetectionService.detectVehicleFraud(undefined,
//     tenantId)` were
//     the actual calls made;
//   * the `as string` cast made that type-check;
//   * `.catch(() => undefined)` swallowed the resulting failure with no
//     log line, no metric and no dead-letter entry.
//
// The consequence is the product one: predictive maintenance and fuel
// fraud detection have never once been triggered by an event. They ran
// only when a user opened a screen that called their API route directly.
// The platform's core claim -- that recording operational data produces
// intelligence without anyone asking for it -- was not happening.
//
// Two of the five branches were dead for a second, independent reason:
// `TripCompleted` is a declared event name that nothing ever publishes,
// and `MaintenanceCompleted` is not a registered event name at all (see
// server/events/event-names.ts). They are replaced below with the events
// that ARE published.
//
// ---------------------------------------------------------------------
// WHY THE FAILURE WAS INVISIBLE, AND WHAT CHANGED
// ---------------------------------------------------------------------
// `.catch(() => undefined)` is the reason this survived. A trigger that
// cannot possibly work looked identical to a trigger with nothing to do.
// The swallow is KEPT -- an AI prediction must never fail the write that
// triggered it -- but it now logs, so the next dead trigger announces
// itself instead of being inferred from an empty predictions table.

import { IEventHandler } from '@/server/events/base/IEventHandler';
import { DomainEvent } from '@/server/events/base/DomainEvent';
import { predictiveMaintenanceService } from '@/modules/ai/services';
import { monitoring } from '@/infrastructure/monitoring/logger';
import { resolveEventTenantOrWarn } from '@/server/events/utils/event-tenant.utils';
import { vehicleIdentityResolver } from '@/modules/vehicles/services/vehicle-identity-resolver.service';

export class AIPredictionTriggerHandler implements IEventHandler<DomainEvent> {
  async handle(event: DomainEvent): Promise<void> {
    const tenantId = resolveEventTenantOrWarn(event, 'AIPredictionTriggerHandler');
    if (!tenantId) return;
    const payload = event.payload;
    const plate = payload.license_plate as string | undefined;

    switch (event.eventName) {
      /**
       * Odometer movement is what shifts a service interval, so an
       * update that does not touch it should not re-run the model.
       */
      case 'VehicleUpdated':
        if (payload.odometer !== undefined || this.changed(payload, 'odometer')) {
          void this.triggerMaintenancePrediction(plate, tenantId, event.eventName);
        }
        break;

      /**
       * TripCreated, not TripCompleted. `TripCompleted` is declared in
       * event-names.ts but nothing publishes it -- trips are recorded
       * complete (they carry start and end odometers at creation), so
       * TripCreated is the event that actually occurs, and it is what
       * bootstrap.ts subscribes this handler to.
       *
       * Every case in this switch corresponds to exactly one
       * bus.subscribe() call in server/events/bootstrap.ts. Adding a
       * case with no subscription -- or a subscription with no case --
       * produces precisely the silent dead branch this whole file
       * exists to correct, so keep the two lists aligned.
       */
      case 'TripCreated':
        void this.triggerMaintenancePrediction(plate, tenantId, event.eventName);
        break;

      case 'FuelLogged':
        void this.triggerFuelFraudDetection(plate, tenantId, event.eventName);
        break;

      case 'ExpenseCreated':
        // Tenant-wide by design: expense anomaly detection compares an
        // expense against its peers, so it takes no vehicle.
        void this.triggerExpenseAnomalyDetection(tenantId);
        break;

      /**
       * ReminderCompleted, not MaintenanceCompleted. The latter is not
       * a registered event name and was never published; completing a
       * reminder is what actually signals that service happened, and it
       * is the event that should reset the forecast.
       */
      case 'ReminderCompleted':
        void this.triggerMaintenancePrediction(plate, tenantId, event.eventName);
        break;
    }
  }

  /** True when `changes` (VehicleUpdatedEvent's diff) touches `field`. */
  private changed(payload: Record<string, unknown>, field: string): boolean {
    const changes = payload.changes;
    if (!changes || typeof changes !== 'object') return false;
    return Object.prototype.hasOwnProperty.call(changes, field);
  }

  /**
   * Plate -> canonical vehicle id.
   *
   * Uses vehicleIdentityResolver rather than a bare findByLicensePlate
   * so an AMBIGUOUS plate (two active vehicles, which nothing in the
   * schema prevents) declines to run rather than attributing a fraud
   * signal or a maintenance forecast to whichever row Mongo returned
   * first. Tenant-scoped by the resolver; org-unit scope does not apply
   * here because an event handler has no acting user.
   */
  private async resolveVehicle(
    licensePlate: string | undefined,
    tenantId: string,
    eventName: string
  ): Promise<string | null> {
    if (!licensePlate) {
      monitoring.logError(
        'AI prediction trigger skipped: event carried no license_plate',
        new Error('missing license_plate'),
        { eventName, tenantId }
      );
      return null;
    }

    const result = await vehicleIdentityResolver.resolveByPlate(licensePlate, tenantId);
    if (result.status === 'resolved') return result.vehicle._id ?? null;

    monitoring.logError(
      `AI prediction trigger skipped: vehicle ${result.status} for plate`,
      new Error(`vehicle ${result.status}`),
      { eventName, tenantId, licensePlate }
    );
    return null;
  }

  private async triggerMaintenancePrediction(
    licensePlate: string | undefined,
    tenantId: string,
    eventName: string
  ): Promise<void> {
    try {
      const vehicleId = await this.resolveVehicle(licensePlate, tenantId, eventName);
      if (!vehicleId) return;
      await predictiveMaintenanceService.predictVehicle(vehicleId, tenantId);
    } catch (error) {
      // Swallowed deliberately -- a prediction must never fail the write
      // that triggered it -- but LOGGED, which is what the original
      // `.catch(() => undefined)` did not do and why this handler could
      // be dead for so long without anyone noticing.
      monitoring.logError('AI maintenance prediction trigger failed', error as Error, {
        eventName,
        licensePlate,
        tenantId,
      });
    }
  }

  private async triggerFuelFraudDetection(
    licensePlate: string | undefined,
    tenantId: string,
    eventName: string
  ): Promise<void> {
    try {
      const vehicleId = await this.resolveVehicle(licensePlate, tenantId, eventName);
      if (!vehicleId) return;
      const { fuelFraudDetectionService } = await import('@/modules/ai/services');
      await fuelFraudDetectionService.detectVehicleFraud(vehicleId, tenantId);
    } catch (error) {
      monitoring.logError('AI fuel fraud detection trigger failed', error as Error, {
        eventName,
        licensePlate,
        tenantId,
      });
    }
  }

  private async triggerExpenseAnomalyDetection(tenantId: string): Promise<void> {
    try {
      const { expenseAnomalyDetectionService } = await import('@/modules/ai/services');
      await expenseAnomalyDetectionService.detectAnomalies(tenantId);
    } catch (error) {
      monitoring.logError('AI expense anomaly detection trigger failed', error as Error, {
        tenantId,
      });
    }
  }
}

export const aiPredictionTriggerHandler = new AIPredictionTriggerHandler();
