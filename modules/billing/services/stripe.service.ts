/* eslint-disable @typescript-eslint/no-unused-vars */
// modules/billing/services/stripe.service.ts

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-06-24.dahlia',
});

export interface SubscriptionPlan {
  id: string;
  name: string;
  priceId: string;
  price: number;
  interval: 'month' | 'year';
  features: {
    maxVehicles: number;
    maxUsers: number;
    maxStorage: number;
    advancedAnalytics: boolean;
    telematics: boolean;
    apiAccess: boolean;
    auditLogs: boolean;
    prioritySupport: boolean;
    customBranding: boolean;
  };
}

export const PLANS: SubscriptionPlan[] = [
  {
    id: 'free',
    name: 'Free',
    priceId: 'price_free',
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
    priceId: 'price_professional',
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
    priceId: 'price_enterprise',
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

export class BillingService {
  async createCheckoutSession(organizationId: string, planId: string, userId: string, tenantId: string): Promise<string> {
    const plan = PLANS.find(p => p.id === planId);
    if (!plan) throw new Error('Invalid plan');

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: plan.priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXTAUTH_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXTAUTH_URL}/billing/canceled`,
      client_reference_id: organizationId,
      metadata: {
        organizationId,
        planId,
        userId,
      },
    });

    return session.url!;
  }

  async handleWebhook(event: Stripe.Event, tenantId: string): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object, tenantId);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object, tenantId);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionCanceled(event.data.object, tenantId);
        break;
      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(event.data.object, tenantId);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object, tenantId);
        break;
    }
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session, tenantId: string): Promise<void> {
    const organizationId = session.client_reference_id;
    const planId = session.metadata?.planId;

    if (organizationId && planId) {
      // Update organization subscription
      // await organizationService.updateSubscription(organizationId, planId, tenantId);
    }
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription, tenantId: string): Promise<void> {
    // Sync subscription status with organization
  }

  private async handleSubscriptionCanceled(subscription: Stripe.Subscription, tenantId: string): Promise<void> {
    // Downgrade to free plan
  }

  private async handlePaymentSucceeded(invoice: Stripe.Invoice, tenantId: string): Promise<void> {
    // Record successful payment
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice, tenantId: string): Promise<void> {
    // Notify organization owner
  }

  async getSubscriptionStatus(organizationId: string, tenantId: string): Promise<any> {
    // Retrieve subscription status from database
    return null;
  }

  async generateInvoice(organizationId: string, tenantId: string): Promise<Buffer> {
    // Generate PDF invoice
    return Buffer.from('');
  }
}

export const billingService = new BillingService();