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
import { workOrderRepository } from '@/modules/workorders/repositories/workorder.repository';
import { workOrderService } from '@/modules/workorders/services/workorder.service';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { attentionItemRepository } from '@/modules/attention/repositories/attention-item.repository';
import { attentionOwnershipResolver } from '@/modules/attention/services/attention-ownership.resolver';
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
  extra?: Partial<Pick<NeedsAttentionItem, 'dueDate' | 'entityId' | 'entityLabel' | 'href' | 'ownerTarget'>>
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

    // Persist a snapshot of the full (pre-`limit`) list into
    // attention_items so the queue survives past this single
    // request/response -- see modules/attention/repositories/
    // attention-item.repository.ts. This is a side effect layered on
    // top of the existing live computation: it never changes what this
    // method returns, and a persistence failure is swallowed (logged,
    // not thrown) for the same reason each source read is -- a storage
    // blip shouldn't blank out an otherwise-successful feed response.
    await this.persistFeed(tenantId, items, context);

    return {
      items: items.slice(0, limit),
      total: items.length,
      bySource,
      bySeverity,
      unavailableSources,
      generatedAt: new Date(),
    };
  }

  /**
   * Upserts this refresh's items into attention_items, keyed so repeat
   * calls update the same rows instead of duplicating them.
   *
   * PHASE 0 FIX: orgUnitId is now resolved PER ITEM, from that item's
   * own `ownerTarget` (set by each per-source reader below), via
   * AttentionOwnershipResolver -- not tagged uniformly with the
   * caller's `activeOrgUnitId` as this used to do. A Harare-scoped
   * caller who surfaces an item about a Bulawayo vehicle now persists
   * that row with orgUnitId = Bulawayo, matching the vehicle's own
   * scope, not the caller's. See the 'attention' entry in
   * server/tenancy/module-scope.registry.ts for the full history of
   * this decision.
   *
   * Resolution runs for every item concurrently (bounded by however
   * many items a single refresh produces, typically well under 100)
   * rather than sequentially, for the same reason the per-source reads
   * above run via Promise.all -- there is no ordering dependency
   * between resolving one item's owner and another's.
   *
   * A resolution failure for one item (including "cannot be
   * determined") never blocks the others: AttentionOwnershipResolver
   * itself never throws (see its fail-closed contract), so this is
   * defence in depth, not the primary safety mechanism.
   */
  private async persistFeed(
    tenantId: string,
    items: NeedsAttentionItem[],
    context?: TenantContext
  ): Promise<void> {
    try {
      const resolvedOrgUnitIds = await Promise.all(
        items.map((item) => attentionOwnershipResolver.resolveOrgUnitId(tenantId, item.ownerTarget))
      );
      const withOwnership = items.map((item, index) => ({
        item,
        orgUnitId: resolvedOrgUnitIds[index],
      }));
      await attentionItemRepository.upsertFeedItems(tenantId, withOwnership);
    } catch (error) {
      monitoring.logError('[needsAttentionService] failed to persist attention_items', error as Error);
    }
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
          {
            dueDate: p.predictedFailureDate,
            entityId: p.vehicleId,
            entityLabel: p.licensePlate,
            ownerTarget: { kind: 'vehicle', vehicleId: p.vehicleId },
          }
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
        {
          entityLabel: rec.affectedVehicles.slice(0, 3).join(', ') || undefined,
          // A fleet-health recommendation spans zero or more vehicles
          // (see FleetHealthRecommendation.affectedVehicles), so there
          // is no single owning entity to resolve. Fails closed --
          // orgUnitId is left unset rather than guessed from any one
          // of the affected vehicles.
          ownerTarget: { kind: 'none' },
        }
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
          {
            entityId: d.driverId,
            entityLabel: d.driverName,
            // d.driverId is OrganizationMember.userId (see
            // driver-risk.service.ts), not a tbldrivers _id -- resolve
            // via the organization's embedded member record, not
            // driverRepository. See attention-ownership.resolver.ts.
            ownerTarget: { kind: 'organization-member', userId: d.driverId },
          }
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
          {
            entityId: alert.vehicleId,
            entityLabel: alert.licensePlate,
            ownerTarget: { kind: 'vehicle', vehicleId: alert.vehicleId },
          }
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
          {
            entityId: alert.entityId,
            // alert.entityId here is the EXPENSE record's own _id (see
            // expense-anomaly-detection.service.ts), not a vehicle or
            // driver id -- confirmed from the service's own
            // makeAlert-equivalent construction. The expense record
            // already carries its own orgUnitId, inherited from its
            // vehicle at write time (see expense.types.ts), so this
            // resolves via a single expense lookup rather than a
            // second hop through the vehicle it references.
            ownerTarget: { kind: 'expense', expenseId: alert.entityId },
          }
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
          {
            dueDate: record.dueDate,
            entityId: record.entityId,
            // The compliance RECORD (not the rule) already carries its
            // own orgUnitId, inherited from the vehicle or driver it
            // is evidence about at write time -- see
            // compliance.tenancy-addendum.ts. `record` here came from
            // an org-unit-scoped read (complianceService.listInScope),
            // so this value is trustworthy without a second lookup.
            ownerTarget: { kind: 'org-unit-direct', orgUnitId: record.orgUnitId },
          }
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
        {
          dueDate: reminder.due_date,
          entityLabel: reminder.license_plate,
          // Reminder already carries its own orgUnitId, inherited from
          // its vehicle at write time -- see maintenance.types.ts.
          ownerTarget: { kind: 'org-unit-direct', orgUnitId: reminder.orgUnitId },
        }
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
        {
          dueDate: reminder.due_date,
          entityLabel: reminder.license_plate,
          ownerTarget: { kind: 'org-unit-direct', orgUnitId: reminder.orgUnitId },
        }
      )
    );

    // Open work orders (from the DVIR module or created manually) that
    // haven't been picked up yet. Kept in its own try/catch, separate
    // from the safeSource() wrapper around the whole of readMaintenance,
    // so a failure here degrades to "no work-order items" rather than
    // also discarding the overdue/upcoming reminder items above -- see
    // needs-attention-scope.spec.ts's failure-isolation test, which
    // exercises exactly this function without mocking work orders.
    const workOrderItems = await this.readOpenWorkOrders(tenantId, context);

    return [...overdueItems, ...upcomingItems, ...workOrderItems];
  }

  /**
   * Open work orders not yet picked up by a mechanic -- most notably
   * the ones DVIRService.submit() auto-creates from a driver-reported
   * defect, which is how "submitted defect -> appears in the Needs
   * Attention queue immediately" (no separate polling/sync step) is
   * satisfied. A work order leaves this list the moment it's assigned,
   * same lifecycle as a reminder leaving once it's resolved.
   */
  private async readOpenWorkOrders(tenantId: string, context?: TenantContext): Promise<NeedsAttentionItem[]> {
    try {
      const pagination = { page: 1, limit: 100 };
      const result = context
        ? await workOrderRepository.getFilteredInScope({ status: 'open' }, context, pagination)
        : await workOrderService.list({ status: 'open' }, pagination, tenantId);

      return result.data.map((wo) => {
        const severity: AISeverity =
          wo.priority === 'critical' ? 'critical' : wo.priority === 'high' ? 'high' : wo.priority === 'low' ? 'low' : 'medium';
        const fromDvir = (wo as { source?: string }).source === 'dvir';
        return makeItem(
          'maintenance',
          String(wo._id),
          severity,
          urgencyFromSeverity(severity),
          wo.title,
          `${wo.license_plate}: ${wo.description || 'Work order raised'}${fromDvir ? ' (reported by driver inspection)' : ''}`,
          wo.totalCost || 0,
          {
            entityLabel: wo.license_plate,
            href: `/workorders?license_plate=${encodeURIComponent(wo.license_plate)}`,
            // WorkOrder already carries its own orgUnitId (the
            // workshop org unit, falling back to the vehicle's own at
            // creation time -- see workorder.tenancy-addendum.ts).
            ownerTarget: { kind: 'org-unit-direct', orgUnitId: wo.orgUnitId },
          }
        );
      });
    } catch (error) {
      monitoring.logError('[needsAttentionService] readOpenWorkOrders failed', error as Error);
      return [];
    }
  }
}

export const needsAttentionService = new NeedsAttentionService();
