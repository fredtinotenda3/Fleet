// shared/types/organization.types.ts

import { BaseEntity } from './common.types';
import {
  OrganizationContactDetails,
  OrganizationBusinessHours,
  OrganizationTaxSettings,
} from './organization.settings-addendum';

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
  contact?: OrganizationContactDetails;
  businessHours?: OrganizationBusinessHours;
  taxSettings?: OrganizationTaxSettings;
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
  weeklyDigest?: boolean;
  criticalAlertsOnly?: boolean;
  requireMfa?: boolean;
  sessionTimeoutMinutes?: number;
  passwordMinLength?: number;
  passwordRequireSymbol?: boolean;
  passwordRequireNumber?: boolean;
  passwordExpiryDays?: number;
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
  /**
   * The branch (OrgUnit type='branch', but any org unit is technically
   * accepted) this member is scoped to, if any. `undefined` means the
   * member's access follows their organization-wide role
   * (OrganizationMember.role) with no narrower restriction. Setting
   * this ALSO requires a corresponding UserScopeAssignment record
   * (modules/security) to actually be enforced by the Permission
   * Engine — this field alone is just a display/reference convenience
   * on the member row so the Members table can show "Branch: Harare
   * Depot" without an extra join. See
   * OrganizationService.addMemberDirect / addMember for where both are
   * written together.
   */
  orgUnitId?: string;
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
  /** Branch/org unit to scope this invitee to once they accept. */
  orgUnitId?: string;
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