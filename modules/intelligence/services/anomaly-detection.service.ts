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
import { Anomaly, AnomalySeverity } from '@/shared/types/anomaly.types';
import crypto from 'crypto';

export interface DetectedAnomaly {
  type: 'fuel' | 'expense' | 'maintenance';
  severity: AnomalySeverity;
  message: string;
  data: any;
  recommendation: string;
  licensePlate?: string;
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
              anomalies.push({
                type: 'fuel',
                severity: 'medium',
                message: `Unusual fuel consumption detected for vehicle ${licensePlate}`,
                data: { licensePlate, efficiency, avgEfficiency, log },
                recommendation: 'Check for fuel leaks, tire pressure, or driving behavior',
                licensePlate,
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
        anomalies.push({
          type: 'expense',
          severity: lastMonthTotal > avgMonthly * 2.5 ? 'high' : 'medium',
          message: `Unusual expense increase for vehicle ${licensePlate}`,
          data: { licensePlate, lastMonthTotal, avgMonthly },
          recommendation: 'Review recent expenses for unusual patterns',
          licensePlate,
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
          fingerprint,
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