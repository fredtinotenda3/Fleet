// modules/ai/services/base-ai.service.ts

import { AIConfidence, AISeverity, AIPrediction, AIPredictionStatus, AIPredictionType } from '../types/ai.types';
import { randomUUID } from 'crypto';
import { monitoring } from '@/infrastructure/monitoring/logger';

export abstract class BaseAIService<T = unknown> {
  protected abstract readonly serviceName: string;
  protected abstract readonly predictionType: AIPredictionType;
  protected readonly MIN_CONFIDENCE = 0.6;
  protected readonly HIGH_CONFIDENCE = 0.85;

  /**
   * Generate a prediction ID
   */
  protected generatePredictionId(): string {
    return `pred_${this.predictionType}_${randomUUID().slice(0, 8)}`;
  }

  /**
   * Create a prediction result with consistent structure
   */
  protected createPrediction<U>(
    data: U,
    confidence: AIConfidence,
    severity: AISeverity,
    metadata?: Record<string, unknown>
  ): AIPrediction<U> {
    return {
      predictionId: this.generatePredictionId(),
      type: this.predictionType,
      confidence: Math.min(1, Math.max(0, confidence)),
      severity,
      status: 'pending',
      data,
      timestamp: new Date(),
      metadata,
    };
  }

  /**
   * Log a prediction event
   */
  protected logPrediction(data: Record<string, unknown>): void {
    monitoring.logInfo(`[AI:${this.serviceName}] Prediction generated`, {
      service: this.serviceName,
      predictionType: this.predictionType,
      ...data,
    });
  }

  /**
   * Log an error
   */
  protected logError(message: string, error: Error, data?: Record<string, unknown>): void {
    monitoring.logError(`[AI:${this.serviceName}] ${message}`, error, {
      service: this.serviceName,
      predictionType: this.predictionType,
      ...data,
    });
  }

  /**
   * Calculate confidence based on multiple factors
   */
  protected calculateConfidence(factors: { weight: number; value: number }[]): AIConfidence {
    const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
    if (totalWeight === 0) return 0;

    const weightedSum = factors.reduce((sum, f) => sum + f.weight * f.value, 0);
    return weightedSum / totalWeight;
  }

  /**
   * Determine severity based on confidence and other factors
   */
  protected determineSeverity(confidence: AIConfidence, riskFactor: number = 0.5): AISeverity {
    const combined = (confidence + riskFactor) / 2;

    if (combined > 0.8) return 'critical';
    if (combined > 0.65) return 'high';
    if (combined > 0.45) return 'medium';
    return 'low';
  }

  /**
   * Validate confidence is acceptable
   */
  protected isValidConfidence(confidence: AIConfidence): boolean {
    return confidence >= this.MIN_CONFIDENCE;
  }

  /**
   * Get the service name
   */
  getServiceName(): string {
    return this.serviceName;
  }
}