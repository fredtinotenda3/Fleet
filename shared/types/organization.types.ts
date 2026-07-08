// shared/types/organization.types.ts

import { BaseEntity } from './common.types';

export interface Organization extends BaseEntity {
  name: string;
  slug: string;
  logo?: string;
  branding: OrganizationBranding;
  settings: OrganizationSettings;
  subscription: OrganizationSubscription;
  features: OrganizationFeatures;
  status: 'active' | 'suspended' | 'archived';
  ownerId: string;
  members: OrganizationMember[];
  invites?: OrganizationInvite[];
  aiSettings?: OrganizationAISettings;
  reportingPreferences?: OrganizationReportingPreferences;
}

export interface OrganizationBranding {
  primaryColor: string;
  logoUrl?: string;
  faviconUrl?: string;
  companyName: string;
  theme: 'light' | 'dark' | 'system';
}

export interface OrganizationSettings {
  timezone: string;
  dateFormat: string;
  currency: string;
  distanceUnit: 'km' | 'mi';
  volumeUnit: 'L' | 'gal';
  language: string;
  notificationsEnabled: boolean;
  emailReports: boolean;
}

export interface OrganizationSubscription {
  tier: 'free' | 'professional' | 'enterprise';
  planId: string;
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  seats: number;
  usedSeats: number;
  startDate: Date;
  endDate?: Date;
  features: string[];
}

export interface OrganizationFeatures {
  maxVehicles: number;
  maxUsers: number;
  maxStorage: number;
  customBranding: boolean;
  advancedAnalytics: boolean;
  telematics: boolean;
  apiAccess: boolean;
  auditLogs: boolean;
  prioritySupport: boolean;
}

export interface OrganizationMember {
  userId: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  status: 'active' | 'invited' | 'suspended';
  invitedAt?: Date;
  joinedAt?: Date;
  invitedBy?: string;
}

export interface OrganizationInvite {
  _id?: string;
  organizationId: string;
  email: string;
  role: string;
  invitedBy: string;
  token: string;
  expiresAt: Date;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
}

export interface UserOrganization {
  userId: string;
  organizationId: string;
  role: string;
  permissions: string[];
  isDefault: boolean;
  joinedAt: Date;
}

export interface OrganizationAISettings {
  enabled: boolean;
  predictiveMaintenance: boolean;
  fuelFraudDetection: boolean;
  driverRiskScoring: boolean;
  expenseAnomalyDetection: boolean;
  /** 0-1. Below this confidence, AI insights are suppressed from dashboards. */
  confidenceThreshold: number;
}

export interface OrganizationReportingPreferences {
  defaultExportFormat: 'pdf' | 'csv' | 'excel' | 'word';
  autoWeeklyDigest: boolean;
  defaultDashboardId?: string;
}

export const DEFAULT_AI_SETTINGS: OrganizationAISettings = {
  enabled: false,
  predictiveMaintenance: true,
  fuelFraudDetection: true,
  driverRiskScoring: true,
  expenseAnomalyDetection: true,
  confidenceThreshold: 0.7,
};

export const DEFAULT_REPORTING_PREFERENCES: OrganizationReportingPreferences = {
  defaultExportFormat: 'pdf',
  autoWeeklyDigest: false,
};