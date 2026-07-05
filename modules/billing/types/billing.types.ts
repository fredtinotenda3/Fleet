// modules/billing/types/billing.types.ts

import { BaseEntity } from '@/shared/types/common.types';

export type SubscriptionTier = 'free' | 'professional' | 'enterprise';
export type BillingInterval = 'month' | 'year';

export interface PlanFeatures {
  maxVehicles: number;
  maxUsers: number;
  maxStorage: number;
  advancedAnalytics: boolean;
  telematics: boolean;
  apiAccess: boolean;
  auditLogs: boolean;
  prioritySupport: boolean;
  customBranding: boolean;
}

export interface SubscriptionPlan {
  id: SubscriptionTier;
  name: string;
  price: number; // USD, Paynow settles in USD or ZWL depending on merchant config
  interval: BillingInterval;
  features: PlanFeatures;
}

export type InvoiceStatus = 'pending' | 'paid' | 'cancelled' | 'expired' | 'failed';

/**
 * One invoice = one Paynow payment attempt for one billing cycle.
 * Since Paynow has no native "subscription" object, recurring billing is
 * modeled here as: a scheduled job creates an Invoice each cycle, the
 * service initiates a Paynow payment against it, and the result-URL
 * webhook updates this record's status when Paynow reports the outcome.
 */
export interface Invoice extends BaseEntity {
  organizationId: string;
  planId: SubscriptionTier;
  amount: number;
  currency: 'USD' | 'ZWL';
  status: InvoiceStatus;
  merchantReference: string; // our own unique reference sent to Paynow
  paynowReference?: string; // Paynow's reference, returned in the init response
  pollUrl?: string;
  redirectUrl?: string;
  paidAt?: Date;
  periodStart: Date;
  periodEnd: Date;
  failureReason?: string;
}

export interface OrganizationSubscriptionState {
  organizationId: string;
  tier: SubscriptionTier;
  status: 'active' | 'past_due' | 'cancelled';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  seats: number;
  usedSeats: number;
}

export const PLANS: SubscriptionPlan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    interval: 'month',
    features: {
      maxVehicles: 5,
      maxUsers: 3,
      maxStorage: 1,
      advancedAnalytics: false,
      telematics: false,
      apiAccess: false,
      auditLogs: false,
      prioritySupport: false,
      customBranding: false,
    },
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 99,
    interval: 'month',
    features: {
      maxVehicles: 50,
      maxUsers: 20,
      maxStorage: 50,
      advancedAnalytics: true,
      telematics: true,
      apiAccess: true,
      auditLogs: true,
      prioritySupport: false,
      customBranding: false,
    },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 499,
    interval: 'month',
    features: {
      maxVehicles: 500,
      maxUsers: 100,
      maxStorage: 500,
      advancedAnalytics: true,
      telematics: true,
      apiAccess: true,
      auditLogs: true,
      prioritySupport: true,
      customBranding: true,
    },
  },
];

export function getPlan(tier: SubscriptionTier): SubscriptionPlan {
  const plan = PLANS.find((p) => p.id === tier);
  if (!plan) throw new Error(`Unknown plan tier: ${tier}`);
  return plan;
}