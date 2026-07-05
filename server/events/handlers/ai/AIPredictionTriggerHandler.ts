// server/events/handlers/ai/AIPredictionTriggerHandler.ts

import { IEventHandler } from '@/server/events/base/IEventHandler';
import { DomainEvent } from '@/server/events/base/DomainEvent';
import { predictiveMaintenanceService } from '@/modules/ai/services';
import { monitoring } from '@/infrastructure/monitoring/logger';

export class AIPredictionTriggerHandler implements IEventHandler<DomainEvent> {
  async handle(event: DomainEvent): Promise<void> {
    const tenantId = (event.metadata?.tenantId as string) || 'default';
    const payload = event.payload;

    switch (event.eventName) {
      case 'VehicleUpdated':
        if (payload.odometer !== undefined) {
          this.triggerMaintenancePrediction(payload.vehicleId as string, tenantId).catch(() => undefined);
        }
        break;
      case 'TripCompleted':
        this.triggerMaintenancePrediction(payload.vehicleId as string, tenantId).catch(() => undefined);
        break;
      case 'FuelLogged':
        this.triggerFuelFraudDetection(payload.vehicleId as string, tenantId).catch(() => undefined);
        break;
      case 'ExpenseCreated':
        this.triggerExpenseAnomalyDetection(tenantId).catch(() => undefined);
        break;
      case 'MaintenanceCompleted':
        this.triggerMaintenancePrediction(payload.vehicleId as string, tenantId).catch(() => undefined);
        break;
    }
  }

  private async triggerMaintenancePrediction(vehicleId: string, tenantId: string): Promise<void> {
    try {
      await predictiveMaintenanceService.predictVehicle(vehicleId, tenantId);
    } catch (error) {
      monitoring.logError('AI prediction trigger failed', error as Error, { vehicleId, tenantId });
    }
  }

  private async triggerFuelFraudDetection(vehicleId: string, tenantId: string): Promise<void> {
    try {
      const { fuelFraudDetectionService } = await import('@/modules/ai/services');
      await fuelFraudDetectionService.detectVehicleFraud(vehicleId, tenantId);
    } catch (error) {
      monitoring.logError('Fuel fraud detection trigger failed', error as Error, { vehicleId, tenantId });
    }
  }

  private async triggerExpenseAnomalyDetection(tenantId: string): Promise<void> {
    try {
      const { expenseAnomalyDetectionService } = await import('@/modules/ai/services');
      await expenseAnomalyDetectionService.detectAnomalies(tenantId);
    } catch (error) {
      monitoring.logError('Expense anomaly detection trigger failed', error as Error, { tenantId });
    }
  }
}