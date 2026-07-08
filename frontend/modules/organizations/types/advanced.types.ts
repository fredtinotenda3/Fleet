// frontend/modules/organizations/types/advanced.types.ts

export interface OrganizationAISettings {
  enabled: boolean;
  predictiveMaintenance: boolean;
  fuelFraudDetection: boolean;
  driverRiskScoring: boolean;
  expenseAnomalyDetection: boolean;
  confidenceThreshold: number;
}

export interface OrganizationReportingPreferences {
  defaultExportFormat: 'pdf' | 'csv' | 'excel' | 'word';
  autoWeeklyDigest: boolean;
  defaultDashboardId?: string;
}

export interface OrganizationActivitySummary {
  last30DaysAuditEvents: number;
  last7DaysAuditEvents: number;
}

export interface PluginSummary {
  _id: string;
  name: string;
  description?: string;
  version: string;
  enabled: boolean;
  capabilities: string[];
}

export interface BillingPlan {
  id: string;
  name: string;
  tier: 'free' | 'professional' | 'enterprise';
  priceMonthly: number;
  seats: number;
  features: string[];
}

export interface Invoice {
  _id: string;
  number: string;
  amount: number;
  currency: string;
  status: 'paid' | 'open' | 'void' | 'uncollectible';
  issuedAt: string;
  dueAt?: string;
  pdfUrl?: string;
}

export interface AuditLogEntry {
  _id: string;
  action: string;
  userId: string;
  entityType: string;
  entityId: string;
  category?: string;
  severity?: 'info' | 'warning' | 'critical';
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogPage {
  data: AuditLogEntry[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface ChainVerificationResult {
  valid: boolean;
  brokenAtSequence?: number;
  reason?: string;
  checkedEntries: number;
  verifiedAt: string;
}