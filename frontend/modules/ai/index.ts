// ai Module
// Barrel exports for the ai feature module.
//
// Currently covers the driver-risk scorecard (GET /api/ai/driver-risk)
// only. The other app/api/ai/** routes (fleet-health, fuel-fraud,
// expense-anomalies, predictive-maintenance) are unrelated predictions
// with their own shapes and are not wired up here yet.

export { DriverScorecardPage } from './pages';
export { DriverRiskGauge, DriverRiskSubScore, DriverRiskTrend, DriverIncidentList } from './components';
export { useDriverRiskList, useDriverRisk, useDriverRiskTrend, driverRiskKeys } from './hooks';
export { driverRiskApi } from './services';
export { AI_ROUTES } from './routes';
export type {
  DriverRiskScore,
  DriverRiskLevel,
  DriverRiskMetrics,
  DriverRiskTrendPoint,
  DriverRiskIncident,
  DriverRiskEvidence,
  DriverRiskBatchItem,
  DriverRiskBatchResult,
} from './types';

