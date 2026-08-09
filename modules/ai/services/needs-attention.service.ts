// modules/ai/services/needs-attention.service.ts
//
// Unified, priority-ranked "Needs Attention" feed. Combines all five
// AI services (predictive maintenance, fleet health, driver risk, fuel
// fraud, expense anomalies) with compliance and maintenance-reminder
// data into a single list, sorted so the most urgent/severe/costly
// item always sorts first regardless of which source produced it.
//
// Scoping: this service adds NO new reads of its own. Every call it
// makes is to an already org-unit-scoped read (the five AI services,
// complianceService.listInScope/list, maintenanceQueryService's
// overdue/upcoming reminder queries) and simply forwards the caller's
// `TenantContext` straight through. See tests/security/
// needs-attention-scope.spec.ts for the property this guarantees:
// the context is threaded to every source, never dropped.
//
// Failure isolation: each source is read behind its own try/catch. If
// one throws, that source contributes zero items (and is listed in
// `unavailableSources`) rather than failing the whole feed -- a
// telematics blip in fuel-fraud shouldn't blank out an overdue
// compliance record.

import { predictiveMaintenanceService } from './predictive-maintenance.service';
import { fleetHealthService } from './fleet-health.service';
import { driverRiskService } from './driver-risk.service';
import { fuelFraudDetectionService } from './fuel-fraud-detection.service';
import { expenseAnomalyDetectionService } from './expense-anomaly-detection.service';
import { complianceService } from '@/modules/compliance/services/compliance.service';
import { maintenanceQueryService } from '@/modules/maintenance/services/maintenance-query.service';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { monitoring } from '@/infrastructure/monitoring/logger';
import type { AISeverity } from '../types/ai.types';
import type {
  NeedsAttentionFeed,
  NeedsAttentionItem,
  NeedsAttentionSource,
  NeedsAttentionUrgency,
} from '../types/needs-attention.types';

const ALL_SOURCES: NeedsAttentionSource[] = [
  'predictive_maintenance',
  'fleet_health',
  'driver_risk',
  'fuel_fraud',
  'expense_anomaly',
  'compliance',
  'maintenance',
];

// Higher = more urgent. Deliberately dominates the score so a critical
// item always outranks a low one no matter its cost (see the spec's
// "ranks a critical item above a low-severity item" test).
const SEVERITY_WEIGHT: Record<AISeverity, number> = {
  critical: 100,
  high: 75,
  medium: 50,
  low: 25,
};

const URGENCY_WEIGHT: Record<NeedsAttentionUrgency, number> = {
  overdue: 40,
  immediate: 40,
  soon: 20,
  planned: 10,
  monitor: 5,
};

/** Diminishing-returns cost contribution so a very expensive but minor item can't outrank a genuinely critical one. */
function costFactor(cost: number): number {
  if (!cost || cost <= 0) return 0;
  return Math.min(Math.sqrt(cost), 50);
}

function priorityScore(severity: AISeverity, urgency: NeedsAttentionUrgency, cost: number): number {
  return SEVERITY_WEIGHT[severity] + URGENCY_WEIGHT[urgency] + costFactor(cost);
}

/** Severity -> urgency for sources that only report a severity (AI predictions, driver risk, etc). */
function urgencyFromSeverity(severity: AISeverity): NeedsAttentionUrgency {
  switch (severity) {
    case 'critical':
      return 'immediate';
    case 'high':
      return 'soon';
    case 'medium':
      return 'planned';
    default:
      return 'monitor';
  }
}

function makeItem(
  source: NeedsAttentionSource,
  id: string,
  severity: AISeverity,
  urgency: NeedsAttentionUrgency,
  title: string,
  description: string,
  cost: number,
  extra?: Partial<Pick<NeedsAttentionItem, 'dueDate' | 'entityId' | 'entityLabel'>>
): NeedsAttentionItem {
  return {
    id: `${source}:${id}`,
    source,
    severity,
    urgency,
    title,
    description,
    cost,
    priorityScore: priorityScore(severity, urgency, cost),
    ...extra,
  };
}

/** Runs `fn`; on failure records `source` as unavailable and returns an empty list rather than throwing. */
async function safeSource(
  source: NeedsAttentionSource,
  fn: () => Promise<NeedsAttentionItem[]>,
  unavailableSources: NeedsAttentionSource[]
): Promise<NeedsAttentionItem[]> {
  try {
    return await fn();
  } catch (error) {
    unavailableSources.push(source);
    monitoring.logError(`[needsAttentionService] source failed: ${source}`, error as Error);
    return [];
  }
}

export class NeedsAttentionService {
  async getFeed(tenantId: string, context?: TenantContext, limit = 50): Promise<NeedsAttentionFeed> {
    const unavailableSources: NeedsAttentionSource[] = [];

    const [
      predictiveMaintenanceItems,
      fleetHealthItems,
      driverRiskItems,
      fuelFraudItems,
      expenseAnomalyItems,
      complianceItems,
      maintenanceItems,
    ] = await Promise.all([
      safeSource('predictive_maintenance', () => this.readPredictiveMaintenance(tenantId, context), unavailableSources),
      safeSource('fleet_health', () => this.readFleetHealth(tenantId, context), unavailableSources),
      safeSource('driver_risk', () => this.readDriverRisk(tenantId, context), unavailableSources),
      safeSource('fuel_fraud', () => this.readFuelFraud(tenantId, context), unavailableSources),
      safeSource('expense_anomaly', () => this.readExpenseAnomalies(tenantId, context), unavailableSources),
      safeSource('compliance', () => this.readCompliance(tenantId, context), unavailableSources),
      safeSource('maintenance', () => this.readMaintenance(tenantId, context), unavailableSources),
    ]);

    const items = [
      ...predictiveMaintenanceItems,
      ...fleetHealthItems,
      ...driverRiskItems,
      ...fuelFraudItems,
      ...expenseAnomalyItems,
      ...complianceItems,
      ...maintenanceItems,
    ].sort((a, b) => b.priorityScore - a.priorityScore);

    const bySource = ALL_SOURCES.reduce((acc, source) => {
      acc[source] = 0;
      return acc;
    }, {} as Record<NeedsAttentionSource, number>);

    const bySeverity: Record<AISeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };

    for (const item of items) {
      bySource[item.source] += 1;
      bySeverity[item.severity] += 1;
    }

    return {
      items: items.slice(0, limit),
      total: items.length,
      bySource,
      bySeverity,
      unavailableSources,
      generatedAt: new Date(),
    };
  }

  // ─── Per-source readers ────────────────────────────────────────────────

  private async readPredictiveMaintenance(tenantId: string, context?: TenantContext): Promise<NeedsAttentionItem[]> {
    const batch = await predictiveMaintenanceService.predictAll(tenantId, context);
    if (!batch.success) return [];

    return batch.results
      .filter((r) => r.success && r.data)
      .map((r) => {
        const p = r.data!;
        const urgency: NeedsAttentionUrgency =
          p.urgency === 'immediate' ? 'immediate' : p.urgency === 'soon' ? 'soon' : p.urgency === 'planned' ? 'planned' : 'monitor';
        return makeItem(
          'predictive_maintenance',
          p.predictionId || r.entityId,
          p.severity,
          urgency,
          `${p.component} may fail soon`,
          `${p.licensePlate}: ${p.recommendedAction}`,
          p.estimatedCost,
          { dueDate: p.predictedFailureDate, entityId: p.vehicleId, entityLabel: p.licensePlate }
        );
      });
  }

  private async readFleetHealth(tenantId: string, context?: TenantContext): Promise<NeedsAttentionItem[]> {
    const result = await fleetHealthService.calculateHealthScore(tenantId, context);
    if (!result.success || !result.data) return [];

    return result.data.recommendations.map((rec, index) => {
      const severity: AISeverity = rec.priority;
      const urgency = urgencyFromSeverity(severity);
      return makeItem(
        'fleet_health',
        `${rec.category}-${index}`,
        severity,
        urgency,
        rec.title,
        rec.description,
        rec.estimatedCost,
        { entityLabel: rec.affectedVehicles.slice(0, 3).join(', ') || undefined }
      );
    });
  }

  private async readDriverRisk(tenantId: string, context?: TenantContext): Promise<NeedsAttentionItem[]> {
    const batch = await driverRiskService.calculateDriverRisk(tenantId, context);
    if (!batch.success) return [];

    return batch.results
      .filter((r) => r.success && r.data)
      .filter((r) => r.data!.riskLevel === 'high' || r.data!.riskLevel === 'critical')
      .map((r) => {
        const d = r.data!;
        const severity: AISeverity = d.riskLevel;
        return makeItem(
          'driver_risk',
          d.driverId || r.entityId,
          severity,
          urgencyFromSeverity(severity),
          `${d.driverName}: elevated driving risk`,
          d.recommendations[0] || `Risk score ${d.overallScore}/100`,
          0,
          { entityId: d.driverId, entityLabel: d.driverName }
        );
      });
  }

  private async readFuelFraud(tenantId: string, context?: TenantContext): Promise<NeedsAttentionItem[]> {
    const batch = await fuelFraudDetectionService.detectFraud(tenantId, context);
    if (!batch.success) return [];

    return batch.results
      .filter((r) => r.success && r.data)
      .map((r) => {
        const alert = r.data!;
        const cost = alert.anomalies
          .filter((a) => a.type === 'cost')
          .reduce((sum, a) => sum + Math.abs(a.deviation), 0);
        return makeItem(
          'fuel_fraud',
          alert.alertId || r.entityId,
          alert.severity,
          urgencyFromSeverity(alert.severity),
          `Possible fuel fraud: ${alert.licensePlate}`,
          alert.recommendation,
          cost,
          { entityId: alert.vehicleId, entityLabel: alert.licensePlate }
        );
      });
  }

  private async readExpenseAnomalies(tenantId: string, context?: TenantContext): Promise<NeedsAttentionItem[]> {
    const batch = await expenseAnomalyDetectionService.detectAnomalies(tenantId, context);
    if (!batch.success) return [];

    return batch.results
      .filter((r) => r.success && r.data)
      .map((r) => {
        const alert = r.data!;
        const cost = alert.anomalies
          .filter((a) => a.type === 'amount')
          .reduce((sum, a) => sum + Math.abs(a.deviation), 0);
        return makeItem(
          'expense_anomaly',
          alert.alertId || r.entityId,
          alert.severity,
          urgencyFromSeverity(alert.severity),
          `Unusual expense pattern: ${alert.pattern}`,
          alert.recommendation,
          cost,
          { entityId: alert.entityId }
        );
      });
  }

  private async readCompliance(tenantId: string, context?: TenantContext): Promise<NeedsAttentionItem[]> {
    const pagination = { page: 1, limit: 200 };
    const [rules, page] = await Promise.all([
      complianceService.listRules(undefined, tenantId),
      context
        ? complianceService.listInScope(undefined, undefined, pagination, context)
        : complianceService.list(undefined, undefined, pagination, tenantId),
    ]);

    const ruleMap = new Map(rules.map((rule) => [rule._id, rule]));

    return page.data
      .filter((record) => record.status === 'overdue' || record.status === 'due_soon')
      .map((record) => {
        const rule = ruleMap.get(record.ruleId);
        const severity: AISeverity = record.status === 'overdue' ? 'critical' : 'medium';
        const urgency: NeedsAttentionUrgency = record.status === 'overdue' ? 'overdue' : 'soon';
        return makeItem(
          'compliance',
          String(record._id),
          severity,
          urgency,
          rule?.name || 'Compliance requirement due',
          `${record.entityType} ${record.entityId}${rule?.description ? `: ${rule.description}` : ''}`,
          0,
          { dueDate: record.dueDate, entityId: record.entityId }
        );
      });
  }

  private async readMaintenance(tenantId: string, context?: TenantContext): Promise<NeedsAttentionItem[]> {
    const [overdue, upcoming] = await Promise.all([
      maintenanceQueryService.getOverdueReminders(tenantId, context),
      maintenanceQueryService.getUpcomingReminders(tenantId, 14, context),
    ]);

    const overdueItems = overdue.map((reminder) =>
      makeItem(
        'maintenance',
        String(reminder._id),
        'critical',
        'overdue',
        reminder.title,
        `${reminder.license_plate}: overdue since ${new Date(reminder.due_date).toLocaleDateString()}`,
        reminder.estimated_cost || 0,
        { dueDate: reminder.due_date, entityLabel: reminder.license_plate }
      )
    );

    const upcomingItems = upcoming.map((reminder) =>
      makeItem(
        'maintenance',
        String(reminder._id),
        'medium',
        'soon',
        reminder.title,
        `${reminder.license_plate}: due ${new Date(reminder.due_date).toLocaleDateString()}`,
        reminder.estimated_cost || 0,
        { dueDate: reminder.due_date, entityLabel: reminder.license_plate }
      )
    );

    return [...overdueItems, ...upcomingItems];
  }
}

export const needsAttentionService = new NeedsAttentionService();
