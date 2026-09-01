// modules/intelligence/services/anomaly-detection.service.ts
//
// FIX: detection logic was previously pure/transient -- it computed
// real anomalies from real fuel/expense data but every caller (in
// particular IntelligenceHandler, triggered on every FuelLogged and
// ExpenseCreated event) discarded the results. This pass adds a
// persistence layer on top of the SAME detection math (unchanged
// below) via anomalyRepository, with fingerprint-based dedup so
// re-running detection across a burst of related events doesn't
// spam duplicate open anomalies for the same vehicle.
//
// detectFuelAnomalies/detectExpenseAnomalies keep their original
// transient signatures for any existing callers; the new
// detectAndPersist* methods are what IntelligenceHandler now calls.

import { fuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { expenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { anomalyRepository } from '@/modules/intelligence/repositories/anomaly.repository';
import { vehicleIdentityResolver } from '@/modules/vehicles/services/vehicle-identity-resolver.service';
import { Anomaly, AnomalySeverity } from '@/shared/types/anomaly.types';
import '@/shared/types/anomaly.tenancy-addendum';
import crypto from 'crypto';
import type { AIEvidence } from '@/modules/ai/types/ai-evidence.types';
import { evidenceFromRows } from '@/modules/ai/services/ai-evidence.builders';

export interface DetectedAnomaly {
  type: 'fuel' | 'expense' | 'maintenance';
  severity: AnomalySeverity;
  message: string;
  data: any;
  recommendation: string;
  licensePlate?: string;
  /**
   * BACKLOG ITEM 7 -- the stored rows behind this detection.
   *
   * `data` already carries the computed figures, but those are the
   * model's own output and cannot be re-checked. These references can.
   */
  evidence?: AIEvidence[];
}

// Backward-compatible alias -- some existing callers may reference this name.
export type { DetectedAnomaly as Anomaly };

function dayBucket(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function makeFingerprint(category: string, licensePlate: string | undefined, bucket: string): string {
  const raw = `${category}:${licensePlate ?? 'unknown'}:${bucket}`;
  return crypto.createHash('sha1').update(raw).digest('hex');
}

export class AnomalyDetectionService {
  async detectFuelAnomalies(tenantId: string): Promise<DetectedAnomaly[]> {
    const anomalies: DetectedAnomaly[] = [];

    const fuelLogs = await fuelRepository.findMany({}, tenantId);
    const logsByVehicle = new Map<string, any[]>();

    for (const log of fuelLogs) {
      if (!logsByVehicle.has(log.license_plate)) {
        logsByVehicle.set(log.license_plate, []);
      }
      logsByVehicle.get(log.license_plate)!.push(log);
    }

    for (const [licensePlate, logs] of logsByVehicle) {
      logs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      let totalFuel = 0;
      let totalDistance = 0;

      for (let i = 1; i < logs.length; i++) {
        const current = logs[i];
        const previous = logs[i - 1];

        if (current.odometer && previous.odometer) {
          const distance = current.odometer - previous.odometer;
          if (distance > 0) {
            totalDistance += distance;
            totalFuel += current.fuel_volume;
          }
        }
      }

      const avgEfficiency = totalFuel > 0 ? totalDistance / totalFuel : 0;

      const recentLogs = logs.slice(-5);
      for (const log of recentLogs) {
        if (log.odometer) {
          const prevLog = logs[logs.indexOf(log) - 1];
          if (prevLog?.odometer) {
            const distance = log.odometer - prevLog.odometer;
            const efficiency = distance / log.fuel_volume;

            if (avgEfficiency > 0 && efficiency < avgEfficiency * 0.7) {
              /**
               * BACKLOG ITEM 7 -- exactly the two rows the finding is
               * a comparison OF.
               *
               * The efficiency figure is (log.odometer -
               * prevLog.odometer) / log.fuel_volume, so those two
               * refuels ARE the computation. Citing the whole vehicle
               * history instead would be broader and less useful: a
               * reviewer wants the pair that produced the number, and
               * the fleet baseline it was compared against is a derived
               * average, not a fetchable record.
               */
              anomalies.push({
                type: 'fuel',
                severity: 'medium',
                message: `Unusual fuel consumption detected for vehicle ${licensePlate}`,
                data: { licensePlate, efficiency, avgEfficiency, log },
                recommendation: 'Check for fuel leaks, tire pressure, or driving behavior',
                licensePlate,
                evidence: evidenceFromRows('tblfuellogs', [log, prevLog], {
                  observedAtField: 'date',
                  valueField: 'fuel_volume',
                }),
              });
            }
          }
        }
      }
    }

    return anomalies;
  }

  async detectExpenseAnomalies(tenantId: string): Promise<DetectedAnomaly[]> {
    const anomalies: DetectedAnomaly[] = [];

    const expenses = await expenseRepository.findMany({}, tenantId);
    const expensesByVehicle = new Map<string, any[]>();

    for (const expense of expenses) {
      if (!expensesByVehicle.has(expense.license_plate)) {
        expensesByVehicle.set(expense.license_plate, []);
      }
      expensesByVehicle.get(expense.license_plate)!.push(expense);
    }

    for (const [licensePlate, vehicleExpenses] of expensesByVehicle) {
      const monthlyTotals = new Map<string, number>();
      for (const expense of vehicleExpenses) {
        const month = new Date(expense.date).toISOString().slice(0, 7);
        monthlyTotals.set(month, (monthlyTotals.get(month) || 0) + expense.amount);
      }

      const monthlyValues = Array.from(monthlyTotals.values());
      const avgMonthly = monthlyValues.reduce((a, b) => a + b, 0) / monthlyValues.length;

      const lastMonth = new Date().toISOString().slice(0, 7);
      const lastMonthTotal = monthlyTotals.get(lastMonth) || 0;

      if (avgMonthly > 0 && lastMonthTotal > avgMonthly * 1.5) {
        /**
         * BACKLOG ITEM 7 -- the expenses that made up the spike month.
         *
         * The finding is "this month's total is 1.5x the average", so
         * the rows a reviewer needs are the ones summing to that total,
         * not every expense the vehicle has ever had. Filtered to the
         * month under test for exactly that reason.
         */
        const spikeMonthExpenses = vehicleExpenses.filter(
          (e) => new Date(e.date).toISOString().slice(0, 7) === lastMonth
        );

        anomalies.push({
          type: 'expense',
          severity: lastMonthTotal > avgMonthly * 2.5 ? 'high' : 'medium',
          message: `Unusual expense increase for vehicle ${licensePlate}`,
          data: { licensePlate, lastMonthTotal, avgMonthly },
          recommendation: 'Review recent expenses for unusual patterns',
          licensePlate,
          evidence: evidenceFromRows('tblexpenses', spikeMonthExpenses, {
            observedAtField: 'date',
            valueField: 'amount',
          }),
        });
      }
    }

    return anomalies;
  }

  async runFullDetection(tenantId: string): Promise<DetectedAnomaly[]> {
    const [fuelAnomalies, expenseAnomalies] = await Promise.all([
      this.detectFuelAnomalies(tenantId),
      this.detectExpenseAnomalies(tenantId),
    ]);

    return [...fuelAnomalies, ...expenseAnomalies];
  }

  /**
   * Runs fuel anomaly detection and persists each result, skipping any
   * that duplicate an already-open anomaly for the same vehicle/day.
   * Returns only the newly-created (persisted) anomalies, so callers
   * (IntelligenceHandler) can tell "nothing new happened" apart from
   * "found some but they're already tracked."
   */
  async detectAndPersistFuelAnomalies(tenantId: string, userId: string = 'system'): Promise<Anomaly[]> {
    const detected = await this.detectFuelAnomalies(tenantId);
    return this.persistBatch(detected, 'fuel', tenantId, userId);
  }

  async detectAndPersistExpenseAnomalies(tenantId: string, userId: string = 'system'): Promise<Anomaly[]> {
    const detected = await this.detectExpenseAnomalies(tenantId);
    return this.persistBatch(detected, 'expense', tenantId, userId);
  }

  /**
   * PHASE 0 FIX (item 7 spillover, same bug class as item 1): the
   * anomaly.tenancy-addendum.ts declaration for `Anomaly.orgUnitId`
   * says "BACKFILL: from the vehicle identified by
   * Anomaly.licensePlate" -- but nothing ever actually resolved and
   * set it at write time; every persisted anomaly had orgUnitId
   * undefined. Combined with AnomalyRepository's org-unit-scoped reads
   * (tenantScopeService.buildFilter), the practical effect was
   * fail-closed invisibility: a scope-restricted caller's anomaly feed
   * was always empty, regardless of how many anomalies existed for
   * their vehicles.
   *
   * Reuses VehicleIdentityResolver (Phase 0 item 3) rather than a
   * bespoke plate lookup -- the exact "resolve a mutable license plate
   * to the vehicle's own orgUnitId, tenant-scoped, fail-closed on an
   * ambiguous or missing plate" problem it exists for.
   */
  private async persistBatch(
    detected: DetectedAnomaly[],
    category: 'fuel' | 'expense' | 'maintenance',
    tenantId: string,
    userId: string
  ): Promise<Anomaly[]> {
    const created: Anomaly[] = [];

    for (const item of detected) {
      const fingerprint = makeFingerprint(category, item.licensePlate, dayBucket());

      const existing = await anomalyRepository.findOpenByFingerprint(fingerprint, tenantId);
      if (existing) continue; // already tracked and still open -- don't duplicate

      const vehicleLookup = await vehicleIdentityResolver.resolveByPlate(item.licensePlate, tenantId);
      const orgUnitId = vehicleLookup.status === 'resolved' ? vehicleLookup.vehicle.orgUnitId : undefined;

      const saved = await anomalyRepository.create(
        {
          tenantId,
          category,
          severity: item.severity,
          status: 'open',
          title: this.titleFor(category, item),
          message: item.message,
          recommendation: item.recommendation,
          licensePlate: item.licensePlate,
          data: item.data,
          // BACKLOG ITEM 7. Omitted when the detection cited nothing,
          // rather than persisted as an empty array -- see the note on
          // Anomaly.evidence.
          ...(item.evidence?.length ? { evidence: item.evidence } : {}),
          fingerprint,
          orgUnitId,
          detectedAt: new Date(),
          isDeleted: false,
        } as Omit<Anomaly, '_id' | 'createdAt' | 'updatedAt'>,
        tenantId,
        userId
      );

      created.push(saved);
    }

    return created;
  }

  private titleFor(category: string, item: DetectedAnomaly): string {
    if (category === 'fuel') return `Fuel efficiency anomaly${item.licensePlate ? ` – ${item.licensePlate}` : ''}`;
    if (category === 'expense') return `Expense spike${item.licensePlate ? ` – ${item.licensePlate}` : ''}`;
    return 'Anomaly detected';
  }
}

export const anomalyDetectionService = new AnomalyDetectionService();