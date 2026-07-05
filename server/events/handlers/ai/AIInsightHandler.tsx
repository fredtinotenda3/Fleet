// server/events/handlers/ai/AIInsightHandler.ts

import { IEventHandler } from '@/server/events/base/IEventHandler';
import { DomainEvent } from '@/server/events/base/DomainEvent';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { webSocketManager } from '@/infrastructure/websocket/server';
import { monitoring } from '@/infrastructure/monitoring/logger';

/**
 * AIInsightHandler reacts to generated predictions by producing
 * actionable insights (dashboards, notifications, recommendations).
 * 
 * This is a chained handler: AIPredictionTriggerHandler does the heavy
 * ML work, then emits AIPredictionGenerated, which this handler
 * consumes to format and deliver the insight to the appropriate channels.
 */
export class AIInsightHandler implements IEventHandler<DomainEvent> {
  async handle(event: DomainEvent): Promise<void> {
    const tenantId = (event.metadata?.tenantId as string) || 'default';
    const payload = event.payload;

    try {
      // Format the prediction into an actionable insight
      const insight = this.formatInsight(payload, event.eventName);

      // Deliver via WebSocket for real-time dashboard updates
      webSocketManager.emitToTenant(tenantId, 'ai:insight', {
        type: payload.type || 'prediction',
        insight,
        severity: payload.severity || 'info',
        vehicleId: payload.vehicleId,
        metadata: payload.metadata || {},
        generatedAt: new Date().toISOString(),
      });

      // For high-severity insights, also trigger notifications
      if (payload.severity === 'high' || payload.severity === 'critical') {
        await this.dispatchNotification(tenantId, payload, insight);
      }

      monitoring.logInfo('[AIInsightHandler] Insight delivered', {
        tenantId,
        type: payload.type,
        severity: payload.severity,
        vehicleId: payload.vehicleId,
      });
    } catch (error) {
      monitoring.logError('[AIInsightHandler] Failed to process prediction', error as Error, {
        tenantId,
        eventType: event.eventName,
        predictionId: payload.predictionId,
      });
    }
  }

  /**
   * Format raw prediction data into a human-readable insight message
   * suitable for dashboards and notifications.
   */
  private formatInsight(payload: any, eventName: string): string {
    switch (payload.type) {
      case 'maintenance':
        return this.formatMaintenanceInsight(payload);
      case 'fuel_fraud':
        return this.formatFuelFraudInsight(payload);
      case 'expense_anomaly':
        return this.formatExpenseAnomalyInsight(payload);
      case 'cost_forecast':
        return this.formatCostForecastInsight(payload);
      default:
        return payload.message || `New prediction generated: ${payload.predictionId}`;
    }
  }

  private formatMaintenanceInsight(payload: any): string {
    const { vehicleId, predictedIssue, confidence, recommendedAction, estimatedCost } = payload;
    return `Vehicle ${vehicleId}: ${predictedIssue || 'Maintenance issue predicted'} ` +
           `(${Math.round(confidence * 100)}% confidence). ` +
           `${recommendedAction || 'Schedule inspection'}. ` +
           `${estimatedCost ? `Estimated cost: $${estimatedCost}` : ''}`;
  }

  private formatFuelFraudInsight(payload: any): string {
    const { vehicleId, anomalyType, details } = payload;
    return `Vehicle ${vehicleId}: Potential fuel fraud detected - ${anomalyType || 'Unusual pattern'}. ` +
           `${details || 'Review fuel logs for anomalies.'}`;
  }

  private formatExpenseAnomalyInsight(payload: any): string {
    const { anomalyCount, totalImpact, timeRange } = payload;
    return `${anomalyCount || 'Multiple'} expense anomalies detected ` +
           `${timeRange ? `in ${timeRange}` : 'recently'}. ` +
           `${totalImpact ? `Potential impact: $${totalImpact}` : 'Review expense records.'}`;
  }

  private formatCostForecastInsight(payload: any): string {
    const { vehicleId, forecastType, projectedCost, timeRange } = payload;
    return `Vehicle ${vehicleId}: ${forecastType || 'Cost'} forecast ` +
           `${timeRange ? `for ${timeRange}` : ''}: ` +
           `$${projectedCost || 'N/A'} projected.`;
  }

  /**
   * Dispatch high-severity insights as notifications via the event bus.
   * This allows the notification system to handle email, push, and
   * in-app delivery based on user preferences.
   */
  private async dispatchNotification(tenantId: string, payload: any, insight: string): Promise<void> {
    try {
      const bus = EventBusFactory.getInstance();
      
      // Emit an AIInsightAvailable event that the notification handler can pick up
      await bus.publish({
        eventName: 'AIInsightAvailable',
        payload: {
          type: payload.type,
          severity: payload.severity,
          insight,
          vehicleId: payload.vehicleId,
          predictionId: payload.predictionId,
          metadata: payload.metadata || {},
        },
        metadata: {
          tenantId,
          timestamp: new Date(),
        },
      } as any);
    } catch (error) {
      // Don't let notification failures block the insight delivery
      monitoring.logError('[AIInsightHandler] Notification dispatch failed', error as Error, {
        tenantId,
        predictionId: payload.predictionId,
      });
    }
  }
}

export const aiInsightHandler = new AIInsightHandler();