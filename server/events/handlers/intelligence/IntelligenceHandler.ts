// server/events/handlers/intelligence/IntelligenceHandler.ts

import { IEventHandler } from '../../base/IEventHandler';
import { DomainEvent } from '../../base/DomainEvent';
import { anomalyDetectionService } from '@/modules/intelligence/services/anomaly-detection.service';
import { predictiveMaintenanceService } from '@/modules/intelligence/services/predictive-maintenance.service';

export class IntelligenceHandler implements IEventHandler<DomainEvent> {
  async handle(event: DomainEvent): Promise<void> {
    const tenantId = (event.metadata?.tenantId as string) || 'default';

    switch (event.eventName) {
      case 'FuelLogged':
        this.runFuelAnomalyDetection(tenantId).catch(console.error);
        break;
      case 'ExpenseCreated':
        this.runExpenseAnomalyDetection(tenantId).catch(console.error);
        break;
      case 'TripCreated':
      case 'TripCompleted':
      case 'VehicleUpdated':
        if (event.eventName === 'VehicleUpdated' && event.payload.odometer !== undefined) {
          this.runPredictiveMaintenance(tenantId).catch(console.error);
        } else {
          this.runPredictiveMaintenance(tenantId).catch(console.error);
        }
        break;
      default:
        break;
    }
  }

  private async runFuelAnomalyDetection(tenantId: string): Promise<void> {
    await anomalyDetectionService.detectFuelAnomalies(tenantId);
  }

  private async runExpenseAnomalyDetection(tenantId: string): Promise<void> {
    await anomalyDetectionService.detectExpenseAnomalies(tenantId);
  }

  private async runPredictiveMaintenance(tenantId: string): Promise<void> {
    await predictiveMaintenanceService.predictMaintenanceNeeds(tenantId);
  }
}