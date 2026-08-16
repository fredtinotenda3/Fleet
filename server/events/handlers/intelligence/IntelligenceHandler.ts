// server/events/handlers/intelligence/IntelligenceHandler.ts
//
// FIX: previously called anomalyDetectionService.detectFuelAnomalies /
// detectExpenseAnomalies and threw the results away. Now calls the
// detectAndPersist* variants, which write results to tblanomalies via
// anomalyRepository, and additionally raises an in-app notification
// for anything persisted at medium+ severity, targeted at whoever
// triggered the originating event (best available "owner" signal on
// a fuel-log/expense-created event -- there is no per-vehicle
// assignee/driver-owner field wired through event metadata today).

import { IEventHandler } from '../../base/IEventHandler';
import { DomainEvent } from '../../base/DomainEvent';
import { anomalyDetectionService } from '@/modules/intelligence/services/anomaly-detection.service';
import { notificationService } from '@/modules/notifications/services/notification.service';
import { Anomaly } from '@/shared/types/anomaly.types';

export class IntelligenceHandler implements IEventHandler<DomainEvent> {
  async handle(event: DomainEvent): Promise<void> {
    const tenantId = (event.metadata?.tenantId as string) || 'default';
    const userId = (event.metadata?.userId as string) || undefined;

    switch (event.eventName) {
      case 'FuelLogged':
        this.runFuelAnomalyDetection(tenantId, userId).catch(console.error);
        break;
      case 'ExpenseCreated':
        this.runExpenseAnomalyDetection(tenantId, userId).catch(console.error);
        break;
      // PHASE 0: 'TripCreated' | 'TripCompleted' | 'VehicleUpdated' used
      // to also trigger runPredictiveMaintenance() here. Removed --
      // see the Phase 0 completion report's predictive-maintenance
      // consolidation section for the full evidence trail. Short
      // version: it called the OTHER predictive-maintenance
      // implementation (modules/intelligence/services/
      // predictive-maintenance.service.ts, now deleted), which (a) ran
      // an unscoped `vehicleRepository.findMany({}, tenantId)` across
      // the tenant's ENTIRE fleet on every single trip completion
      // rather than the one vehicle the event was about, (b) discarded
      // every prediction it computed (the return value was never
      // assigned, persisted, or read), and (c) defaulted to a
      // `'default'` tenantId on a missing event.metadata.tenantId,
      // which server/tenancy/tenant-scope.ts's resolveTenantScope()
      // now hard-rejects -- so this branch was, at best, an expensive
      // no-op, and at worst a per-event thrown-and-swallowed error.
      // AIPredictionTriggerHandler (server/events/handlers/ai/) already
      // subscribes to these same events and correctly calls
      // modules/ai/services' predictiveMaintenanceService.predictVehicle()
      // for the SPECIFIC vehicle the event names, with proper
      // tenant resolution (resolveEventTenantOrWarn) -- that is the
      // sole, authoritative event-triggered path now.
      default:
        break;
    }
  }

  private async runFuelAnomalyDetection(tenantId: string, triggeredBy?: string): Promise<void> {
    const created = await anomalyDetectionService.detectAndPersistFuelAnomalies(tenantId, triggeredBy);
    await this.notifyNewAnomalies(created, tenantId, triggeredBy);
  }

  private async runExpenseAnomalyDetection(tenantId: string, triggeredBy?: string): Promise<void> {
    const created = await anomalyDetectionService.detectAndPersistExpenseAnomalies(tenantId, triggeredBy);
    await this.notifyNewAnomalies(created, tenantId, triggeredBy);
  }

  /**
   * Notifies about newly-created anomalies at medium severity or above.
   * Uses the existing 'fuel_anomaly' notification type for fuel-category
   * anomalies (already defined in NotificationService's default
   * preferences) and the generic 'alert' type for everything else, so
   * this doesn't require adding a new NotificationType to the shared
   * union. Silently no-ops if there's no triggeredBy user to notify --
   * the anomaly is still persisted and visible via GET /api/anomalies
   * regardless.
   */
  private async notifyNewAnomalies(created: Anomaly[], tenantId: string, triggeredBy?: string): Promise<void> {
    if (!triggeredBy) return;

    for (const anomaly of created) {
      if (anomaly.severity === 'low') continue;

      const notificationType = anomaly.category === 'fuel' ? 'fuel_anomaly' : 'alert';

      await notificationService
        .sendNotification(triggeredBy, tenantId, {
          userId: triggeredBy,
          type: notificationType as any,
          title: anomaly.title,
          message: anomaly.message,
          priority: anomaly.severity === 'high' || anomaly.severity === 'critical' ? 'high' : 'medium',
          data: { anomalyId: anomaly._id, category: anomaly.category, licensePlate: anomaly.licensePlate },
          actionUrl: `/anomalies/${anomaly._id}`,
          actionLabel: 'Review',
        } as any)
        .catch(() => undefined);
    }
  }
}