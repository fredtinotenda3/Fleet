/* eslint-disable @typescript-eslint/no-unused-vars */
// modules/ai/services/expense-anomaly-detection.service.ts

import { BaseAIService } from './base-ai.service';
import {
  ExpenseAnomalyAlert,
  ExpenseAnomaly,
  AIResult,
  AIBatchResult,
} from '../types/ai.types';
import { expenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { expenseTypeRepository } from '@/modules/expenses/repositories/expense-type.repository';

interface ExpenseBaseline {
  averageAmount: number;
  averageFrequency: number;
  categoryDistribution: Record<string, number>;
  vendorDistribution: Record<string, number>;
   totalCount: number;
}

/**
 * Same-vehicle expenses recorded on the same calendar day at or above
 * this count are flagged as a frequency anomaly. Replaces the previous
 * `Math.random() < 0.02` placeholder, which fired on ~2% of expenses at
 * random regardless of whether they actually clustered on a day.
 */
const SAME_DAY_FREQUENCY_THRESHOLD = 3;

export class ExpenseAnomalyDetectionService extends BaseAIService {
  protected readonly serviceName = 'ExpenseAnomalyDetection';
  protected readonly predictionType = 'expense_anomaly';

  async detectAnomalies(tenantId: string): Promise<AIBatchResult<ExpenseAnomalyAlert>> {
    try {
      const [expenses, expenseTypes] = await Promise.all([
        expenseRepository.findMany({ isDeleted: { $ne: true } }, tenantId),
        expenseTypeRepository.findActive(tenantId),
      ]);

      const baseline = this.calculateBaseline(expenses, expenseTypes);
      const dailyFrequency = this.buildDailyFrequencyMap(expenses);

      const alerts: ExpenseAnomalyAlert[] = [];
      const results: AIBatchResult<ExpenseAnomalyAlert> = {
        success: true,
        results: [],
        total: expenses.length,
        succeeded: 0,
        failed: 0,
        timestamp: new Date(),
      };

      for (const expense of expenses) {
        const anomalies = this.detectSingleAnomaly(expense, baseline, dailyFrequency);
        if (anomalies.length > 0) {
          const alert = this.createAlert(expense, anomalies, tenantId);
          alerts.push(alert);
          results.results.push({
            entityId: expense._id!,
            success: true,
            data: alert,
          });
          results.succeeded++;
        } else {
          results.results.push({
            entityId: expense._id!,
            success: true,
            data: undefined,
          });
          results.succeeded++;
        }
      }

      return results;
    } catch (error) {
      this.logError('Failed to detect expense anomalies', error as Error, { tenantId });
      return {
        success: false,
        results: [],
        total: 0,
        succeeded: 0,
        failed: 0,
        timestamp: new Date(),
      };
    }
  }

  private calculateBaseline(expenses: any[], expenseTypes: any[]): ExpenseBaseline {
    const categoryDistribution: Record<string, number> = {};
    const vendorDistribution: Record<string, number> = {};

    let totalAmount = 0;
    const totalCount = expenses.length || 1; // Avoid division by zero

    // Build category lookup
    const typeMap = new Map();
    for (const type of expenseTypes) {
      typeMap.set(type._id?.toString(), type);
    }

    for (const expense of expenses) {
      totalAmount += expense.amount || 0;

      // Get category from expense type
      let category = 'Other';
      if (expense.expense_type_id) {
        const type = typeMap.get(expense.expense_type_id.toString());
        if (type) {
          category = type.category || 'Other';
        }
      }
      categoryDistribution[category] = (categoryDistribution[category] || 0) + 1;

      // Vendor tracking (if available)
      const vendor = expense.vendor || expense.description || 'Unknown';
      vendorDistribution[vendor] = (vendorDistribution[vendor] || 0) + 1;
    }

    // Normalize distributions
    const normalizedCategory: Record<string, number> = {};
    const normalizedVendor: Record<string, number> = {};

    for (const [key, value] of Object.entries(categoryDistribution)) {
      normalizedCategory[key] = value / totalCount;
    }

    for (const [key, value] of Object.entries(vendorDistribution)) {
      normalizedVendor[key] = value / totalCount;
    }

    return {
      averageAmount: totalAmount / totalCount,
      averageFrequency: totalCount / (expenses.length > 0 ? 1 : 1),
      categoryDistribution: normalizedCategory,
      vendorDistribution: normalizedVendor,
      totalCount: expenses.length,
    };
  }

  /**
   * Builds a real `license_plate|day` -> count map across all expenses,
   * used by detectSingleAnomaly's frequency check below. Replaces the
   * previous `Math.random() < 0.02` placeholder, which produced
   * "Multiple expenses recorded on same day" alerts with no relationship
   * to whether that was actually true.
   */
  private buildDailyFrequencyMap(expenses: any[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const expense of expenses) {
      if (!expense.date) continue;
      const key = `${expense.license_plate || 'unknown'}|${new Date(expense.date).toDateString()}`;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }

  private detectSingleAnomaly(
    expense: any,
    baseline: ExpenseBaseline,
    dailyFrequency: Map<string, number>
  ): ExpenseAnomaly[] {
    const anomalies: ExpenseAnomaly[] = [];

    // Check amount anomaly
    const amountDeviation = (expense.amount || 0) - baseline.averageAmount;
    const amountPercentageDeviation = baseline.averageAmount > 0
      ? (amountDeviation / baseline.averageAmount) * 100
      : 0;

    if (Math.abs(amountPercentageDeviation) > 50) {
      anomalies.push({
        type: 'amount',
        expected: baseline.averageAmount,
        actual: expense.amount || 0,
        deviation: amountDeviation,
        percentageDeviation: amountPercentageDeviation,
        description: `Expense amount ${expense.amount} is ${Math.abs(amountPercentageDeviation).toFixed(0)}% ${amountPercentageDeviation > 0 ? 'above' : 'below'} average`,
      });
    }

    // Get category
    let category = 'Other';
    if (expense.expense_type?.category) {
      category = expense.expense_type.category;
    }

    // Check category anomaly
    const categoryFrequency = baseline.categoryDistribution[category] || 0;
    if (categoryFrequency < 0.1 && baseline.totalCount > 20) {
      anomalies.push({
        type: 'category',
        expected: 0.1,
        actual: categoryFrequency,
        deviation: 0,
        percentageDeviation: 0,
        description: `Unusual expense category: ${category}`,
      });
    }

    // Check vendor anomaly (using description as proxy)
    const vendor = expense.description || expense.notes || 'Unknown';
    const vendorFrequency = baseline.vendorDistribution[vendor] || 0;

    if (vendorFrequency < 0.05 && baseline.totalCount > 20) {
      anomalies.push({
        type: 'vendor',
        expected: 0.05,
        actual: vendorFrequency,
        deviation: 0,
        percentageDeviation: 0,
        description: `Unusual vendor/description: ${vendor}`,
      });
    }

    // Check time anomaly (weekend/holiday)
    if (expense.date) {
      const date = new Date(expense.date);
      const day = date.getDay();
      if (day === 0 || day === 6) {
        anomalies.push({
          type: 'time',
          expected: 0,
          actual: 1,
          deviation: 0,
          percentageDeviation: 0,
          description: `Expense recorded on ${day === 0 ? 'Sunday' : 'Saturday'}`,
        });
      }
    }

    // FIX (high -- fabricated data): replaced `Math.random() < 0.02`
    // with a real same-day, same-vehicle count lookup against
    // dailyFrequency, built once per detectAnomalies() run from actual
    // expense dates rather than fired randomly on ~2% of expenses.
    if (expense.date) {
      const key = `${expense.license_plate || 'unknown'}|${new Date(expense.date).toDateString()}`;
      const countThatDay = dailyFrequency.get(key) || 1;
      if (countThatDay >= SAME_DAY_FREQUENCY_THRESHOLD) {
        anomalies.push({
          type: 'frequency',
          expected: 1,
          actual: countThatDay,
          deviation: countThatDay - 1,
          percentageDeviation: (countThatDay - 1) * 100,
          description: `${countThatDay} expenses recorded for this vehicle on the same day`,
        });
      }
    }

    return anomalies;
  }

  private createAlert(
    expense: any,
    anomalies: ExpenseAnomaly[],
    tenantId: string
  ): ExpenseAnomalyAlert {
    const confidence = this.calculateConfidence([
      { weight: 0.5, value: Math.min(1, anomalies.length / 3) },
      { weight: 0.3, value: Math.min(1, Math.abs(anomalies[0]?.percentageDeviation || 0) / 100) },
      { weight: 0.2, value: 0.7 },
    ]);

    const severity = this.determineSeverity(
      confidence,
      Math.min(1, anomalies.length / 4)
    );

    // Determine entity type
    let entityType: 'vehicle' | 'organization' | 'driver' = 'organization';
    if (expense.license_plate) {
      entityType = 'vehicle';
    }

    return {
      alertId: `expense_alert_${expense._id}_${Date.now()}`,
      entityId: expense._id!,
      entityType,
      confidence,
      severity,
      timestamp: new Date(),
      anomalies,
      pattern: this.detectPattern(anomalies),
      recommendation: this.generateRecommendation(anomalies),
      status: 'open',
    };
  }

  private detectPattern(anomalies: ExpenseAnomaly[]): string {
    const types = anomalies.map(a => a.type);
    const uniqueTypes = [...new Set(types)];

    if (uniqueTypes.includes('amount') && uniqueTypes.includes('category')) {
      return 'Unusual amount in unusual category';
    }

    if (uniqueTypes.includes('amount')) {
      return 'Amount significantly above or below normal';
    }

    if (uniqueTypes.includes('category')) {
      return 'Unusual expense category';
    }

    if (uniqueTypes.includes('vendor')) {
      return 'Unusual vendor for expense type';
    }

    if (uniqueTypes.includes('time')) {
      return 'Expense recorded at unusual time';
    }

    return 'Multiple anomalies detected';
  }

  private generateRecommendation(anomalies: ExpenseAnomaly[]): string {
    if (anomalies.some(a => a.type === 'amount' && Math.abs(a.percentageDeviation) > 100)) {
      return 'Immediate review required - significant expense amount deviation';
    }

    if (anomalies.some(a => a.type === 'category')) {
      return 'Review expense categorization for accuracy';
    }

    if (anomalies.some(a => a.type === 'vendor')) {
      return 'Verify vendor legitimacy and pricing';
    }

    if (anomalies.some(a => a.type === 'time')) {
      return 'Review expense timing - possible off-hours spending';
    }

    return 'Monitor expense pattern for further anomalies';
  }

  // FIX (medium -- dead & incorrect helper removed): getBaselineTotalCount()
  // summed baseline.categoryDistribution values, which are normalized
  // frequencies that sum to ~1.0 across all categories, not a count.
  // It was never called anywhere in this codebase; if it had been wired
  // in later it would have silently returned ~1 instead of an actual
  // expense count. baseline.totalCount (set correctly in
  // calculateBaseline above) is the real count and is what every other
  // method in this file already uses.
}

export const expenseAnomalyDetectionService = new ExpenseAnomalyDetectionService();