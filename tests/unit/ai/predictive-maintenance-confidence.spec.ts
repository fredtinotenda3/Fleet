// tests/unit/ai/predictive-maintenance-confidence.spec.ts
//
// ROUND 5 FIX -- PredictiveMaintenanceService.buildPrediction's third
// confidence weight used to be
//
//     component.historicalFailureRate > 0 ? 0.7 : 0.9
//
// giving a component with NO recorded failure history a HIGHER
// confidence contribution than one with real historical data behind it.
// That inverts the relationship the file's own "DATA HONESTY AUDIT"
// comment says confidence is supposed to track ("sample size, data
// completeness" -- more evidence should never lower confidence). This
// pins the corrected direction (0.9 : 0.7) without touching the larger,
// deliberately-deferred AIConfidenceEnvelope migration that same comment
// documents.
//
// Reaches the private method the same way tests/security/
// fabricated-metrics.spec.ts does, since the property under test is
// arithmetic, not a database interaction.

import { PredictiveMaintenanceService } from '@/modules/ai/services/predictive-maintenance.service';

function callPrivate<T>(instance: object, method: string, ...args: unknown[]): T {
  return (instance as unknown as Record<string, (...a: unknown[]) => T>)[method](...args);
}

const VEHICLE = { _id: 'v1', license_plate: 'AFU0078' };

function componentWith(historicalFailureRate: number) {
  return {
    component: 'Engine',
    componentType: 'engine' as const,
    healthScore: 60,
    estimatedLifeRemaining: 90,
    failureProbability: 0.3,
    symptoms: [],
    historicalFailureRate,
  };
}

describe('PredictiveMaintenanceService: confidence rewards evidence, not its absence', () => {
  const service = new PredictiveMaintenanceService();

  it('REGRESSION: a component WITH historical failure data gets HIGHER confidence than one with none', () => {
    const withHistory = callPrivate<{ confidence: number }>(
      service,
      'buildPrediction',
      VEHICLE,
      componentWith(0.4),
      [],
      'pred-1'
    );
    const withoutHistory = callPrivate<{ confidence: number }>(
      service,
      'buildPrediction',
      VEHICLE,
      componentWith(0),
      [],
      'pred-2'
    );

    expect(withHistory.confidence).toBeGreaterThan(withoutHistory.confidence);
  });
});
