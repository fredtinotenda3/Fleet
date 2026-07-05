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