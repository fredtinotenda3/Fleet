// modules/ai/types/ai.types.ts

import { BaseEntity } from '@/shared/types/common.types';

// ─── Base Types ──────────────────────────────────────────────────────────────

export type AIConfidence = number; // 0-1
export type AISeverity = 'low' | 'medium' | 'high' | 'critical';
export type AIPredictionStatus = 'pending' | 'confirmed' | 'dismissed' | 'actioned';

export interface AIPrediction<T = unknown> {
  predictionId: string;
  type: AIPredictionType;
  confidence: AIConfidence;
  severity: AISeverity;
  status: AIPredictionStatus;
  data: T;
  timestamp: Date;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export type AIPredictionType =
  | 'maintenance'
  | 'health_score'
  | 'driver_risk'
  | 'fuel_fraud'
  | 'expense_anomaly'
  | 'tire_wear'
  | 'engine_failure'
  | 'utilization'
  | 'cost'
  | 'route_optimization'
  | 'recommendation';

// ─── Domain Entity Types ────────────────────────────────────────────────────

export interface VehicleEntity {
  _id: string;
  license_plate: string;
  make?: string;
  model?: string;
  year?: number;
  isDeleted?: boolean;
}

export interface MaintenanceEntity {
  _id: string;
  license_plate: string;
  title?: string;
  category?: string;
  status: 'completed' | 'pending' | 'overdue' | 'scheduled' | 'cancelled';
  due_date?: Date;
  created_at?: Date;
}

export interface ExpenseEntity {
  _id: string;
  license_plate: string;
  amount: number;
  category?: string;
  date?: Date;
}

export interface TripEntity {
  _id: string;
  license_plate: string;
  distance_calculated: number;
  start_date?: Date;
  end_date?: Date;
}

export interface FuelEntity {
  _id: string;
  license_plate: string;
  fuel_volume: number;
  cost: number;
  odometer?: number;
  date?: Date;
}

// ─── Predictive Maintenance ─────────────────────────────────────────────────

export interface PredictiveMaintenancePrediction {
  predictionId: string;
  vehicleId: string;
  licensePlate: string;
  component: string;
  componentType: 'engine' | 'transmission' | 'brakes' | 'tires' | 'battery' | 'suspension' | 'electrical' | 'other';
  predictedFailureDate: Date;
  confidence: AIConfidence;
  severity: AISeverity;
  estimatedCost: number;
  recommendedAction: string;
  urgency: 'immediate' | 'soon' | 'planned' | 'monitor';
  contributingFactors: string[];
  historicalPatterns: Array<{
    date: Date;
    metric: string;
    value: number;
  }>;
}

// ─── Fleet Health Score ─────────────────────────────────────────────────────

export interface FleetHealthScore {
  overallScore: number; // 0-100
  timestamp: Date;
  vehicleScores: Array<{
    vehicleId: string;
    licensePlate: string;
    score: number;
    components: Record<string, number>;
  }>;
  metrics: {
    averageVehicleAge: number;
    averageMileage: number;
    maintenanceCompletionRate: number;
    pendingMaintenanceCount: number;
    overdueMaintenanceCount: number;
    averageDowntime: number;
    fuelEfficiencyAverage: number;
  };
  trends: {
    weekly: number[];
    monthly: number[];
    yearly: number[];
  };
  recommendations: FleetHealthRecommendation[];
}

export interface FleetHealthRecommendation {
priority: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  affectedVehicles: string[];
  estimatedCost: number;
  estimatedBenefit: number;
  roi: number;
}

// ─── Driver Risk Score ──────────────────────────────────────────────────────

export interface DriverRiskScore {
  driverId: string;
  driverName: string;
  overallScore: number; // 0-100 (lower = safer)
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  metrics: {
    speedingEvents: number;
    hardBrakes: number;
    hardAccelerations: number;
    idlingTime: number;
    nightDrivingHours: number;
    fatigueScore: number;
    distractionScore: number;
    safetyScore: number;
  };
  trends: Array<{
    date: Date;
    score: number;
  }>;
  recommendations: string[];
  incidents: Array<{
    date: Date;
    type: string;
    severity: string;
    location: string;
  }>;
}

// ─── Fuel Fraud Detection ──────────────────────────────────────────────────

export interface FuelFraudAlert {
  alertId: string;
  vehicleId: string;
  licensePlate: string;
  confidence: AIConfidence;
  severity: AISeverity;
  timestamp: Date;
  anomalies: FuelAnomaly[];
  patterns: FuelPattern[];
  recommendation: string;
  status: 'open' | 'investigating' | 'confirmed' | 'false_positive';
}

export interface FuelAnomaly {
  type: 'overconsumption' | 'underconsumption' | 'fuel_volume' | 'cost' | 'frequency' | 'location' | 'time';
  expected: number;
  actual: number;
  deviation: number;
  percentageDeviation: number;
}

export interface FuelPattern {
  pattern: 'weekly' | 'monthly' | 'location' | 'driver' | 'vehicle';
  description: string;
  confidence: AIConfidence;
}

// ─── Expense Anomaly Detection ─────────────────────────────────────────────

export interface ExpenseAnomalyAlert {
  alertId: string;
  entityId: string;
  entityType: 'vehicle' | 'organization' | 'driver';
  confidence: AIConfidence;
  severity: AISeverity;
  timestamp: Date;
  anomalies: ExpenseAnomaly[];
  pattern: string;
  recommendation: string;
  status: 'open' | 'investigating' | 'confirmed' | 'false_positive';
}

export interface ExpenseAnomaly {
  type: 'amount' | 'frequency' | 'category' | 'vendor' | 'time';
  expected: number;
  actual: number;
  deviation: number;
  percentageDeviation: number;
  description: string;
}

// ─── Tire Wear Prediction ──────────────────────────────────────────────────

export interface TireWearPrediction {
  tireId: string;
  vehicleId: string;
  licensePlate: string;
  position: 'front_left' | 'front_right' | 'rear_left' | 'rear_right' | 'spare';
  currentDepth: number; // mm
  predictedWear: number; // mm
  remainingLifeKm: number;
  estimatedRemainingDays: number;
  confidence: AIConfidence;
  severity: AISeverity;
  recommendedAction: string;
  replacementUrgency: 'immediate' | 'soon' | 'planned';
  factors: {
    distance: number;
    load: number;
    roadConditions: string;
    temperature: number;
    pressure: number;
  };
}

// ─── Engine Failure Prediction ─────────────────────────────────────────────

export interface EngineFailurePrediction {
  vehicleId: string;
  licensePlate: string;
  engineHealthScore: number; // 0-100
  predictedFailureDate: Date;
  confidence: AIConfidence;
  severity: AISeverity;
  probableCause: string;
  symptoms: string[];
  recommendedAction: string;
  estimatedRepairCost: number;
  estimatedDowntime: number; // days
  contributingFactors: {
    mileage: number;
    maintenanceHistory: string;
    operatingConditions: string;
    engineLoad: number;
    temperatureExposures: number;
  };
}

// ─── Utilization Prediction ────────────────────────────────────────────────

export interface UtilizationPrediction {
  vehicleId: string;
  licensePlate: string;
  currentUtilization: number; // percentage
  predictedUtilization: number; // percentage
  confidence: AIConfidence;
  timeframe: {
    start: Date;
    end: Date;
  };
  factors: {
    seasonal: number;
    trend: number;
    cyclic: number;
    irregular: number;
  };
  recommendations: {
    action: string;
    potentialSaving: number;
  }[];
}

// ─── Cost Prediction ────────────────────────────────────────────────────────

export interface CostPrediction {
  vehicleId: string;
  licensePlate: string;
  period: 'week' | 'month' | 'quarter' | 'year';
  predictedCost: number;
  confidence: AIConfidence;
  breakdown: {
    fuel: number;
    maintenance: number;
    repairs: number;
    insurance: number;
    other: number;
  };
  factors: {
    mileageProjection: number;
    historicalTrend: number;
    seasonalAdjustment: number;
    maintenanceSchedule: number;
  };
  comparison: {
    averageSimilar: number;
    percentile: number;
  };
}

// ─── Route Optimization ────────────────────────────────────────────────────

export interface RouteOptimization {
  routeId: string;
  vehicleId: string;
  licensePlate: string;
  startLocation: GeoLocation;
  endLocation: GeoLocation;
  waypoints: GeoLocation[];
  distance: number;
  estimatedDuration: number;
  fuelConsumption: number;
  cost: number;
  confidence: AIConfidence;
  factors: {
    traffic: number;
    weather: number;
    roadConditions: number;
    driverPerformance: number;
  };
  alternatives: RouteAlternative[];
}

export interface GeoLocation {
  lat: number;
  lng: number;
  address?: string;
}

export interface RouteAlternative {
  routeId: string;
  distance: number;
  duration: number;
  fuelConsumption: number;
  cost: number;
  traffic: number;
  tolls: number;
}

// ─── Fleet Recommendations ──────────────────────────────────────────────────

export interface FleetRecommendation {
  id: string;
  type: 'maintenance' | 'replacement' | 'optimization' | 'training' | 'strategy';
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: {
    cost: number;
    efficiency: number;
    safety: number;
  };
  timeframe: 'immediate' | 'short_term' | 'medium_term' | 'long_term';
  implementationSteps: string[];
  roi: number;
  confidence: AIConfidence;
  relatedVehicles: string[];
}

// ─── Model Registry ────────────────────────────────────────────────────────

export interface AIModel extends BaseEntity {
  modelId: string;
  name: string;
  type: 'classification' | 'regression' | 'forecasting' | 'anomaly_detection' | 'recommendation';
  version: string;
  description: string;
  algorithm: string;
  features: string[];
  target: string;
  metrics: {
    accuracy?: number;
    precision?: number;
    recall?: number;
    f1?: number;
    rmse?: number;
    mae?: number;
    r2?: number;
  };
  trainingData: {
    size: number;
    dateRange: {
      start: Date;
      end: Date;
    };
  };
  status: 'draft' | 'training' | 'active' | 'deprecated' | 'archived';
  createdAt: Date;
  updatedAt: Date;
  deployedAt?: Date;
  deployedBy?: string;
}

// ─── AI Training Data ──────────────────────────────────────────────────────

export interface AITrainingData extends BaseEntity {
  dataId: string;
  type: 'historical' | 'synthetic' | 'real_time';
  source: string;
  features: Record<string, unknown>;
  target?: unknown;
  label?: string;
  timestamp: Date;
  qualityScore: number;
  metadata: Record<string, unknown>;
}

// ─── AI Service Response Types ─────────────────────────────────────────────

export interface AIResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  predictionId?: string;
  confidence?: AIConfidence;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface AIBatchResult<T = unknown> {
  success: boolean;
  results: AIBatchItem<T>[];
  total: number;
  succeeded: number;
  failed: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface AIBatchItem<T = unknown> {
  entityId: string;
  success: boolean;
  data?: T;
  error?: string;
}


// Add these interfaces to ai.types.ts

export interface OrganizationMember {
  userId: string;
  name?: string;
  email?: string;
}

export interface TripEntity {
  _id: string;
  license_plate: string;
  driver_id: string;
  date: Date;
  distance_calculated: number;
  trip_duration?: number;
  start_location?: string;
  end_location?: string;
}

export interface TelematicsEntity {
  timestamp: Date;
  location?: {
    speed: number;
    lat: number;
    lng: number;
  };
  alerts?: Array<{
    type: string;
    timestamp: Date;
    location?: {
      lat: number;
      lng: number;
    };
  }>;
  trip?: {
    idleTime: number;
  };
}

export interface DriverTelematicsData {
  driverId: string;
  driverName: string;
  trips: TripEntity[];
  telematics: TelematicsEntity[];
  speedingEvents: number;
  hardBrakes: number;
  hardAccelerations: number;
  idlingTime: number;
  nightDrivingHours: number;
}