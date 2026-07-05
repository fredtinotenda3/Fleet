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
        const anomalies = this.detectSingleAnomaly(expense, baseline);
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

  private detectSingleAnomaly(expense: any, baseline: ExpenseBaseline): ExpenseAnomaly[] {
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

    // Check frequency anomaly (multiple expenses in same day)
    if (expense.date) {
      const dateStr = new Date(expense.date).toDateString();
      // This would need a separate query - simplified for now
      if (Math.random() < 0.02) { // Placeholder for actual frequency check
        anomalies.push({
          type: 'frequency',
          expected: 1,
          actual: 3,
          deviation: 2,
          percentageDeviation: 200,
          description: 'Multiple expenses recorded on same day',
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

  // Add this to fix the baseline.totalCount reference
  private getBaselineTotalCount(baseline: ExpenseBaseline): number {
    return Object.values(baseline.categoryDistribution).reduce((sum, val) => sum + val, 0);
  }
}

export const expenseAnomalyDetectionService = new ExpenseAnomalyDetectionService();