// modules/billing/services/billing.service.ts

import { randomUUID } from 'crypto';
import { paynowClient, PaynowResultPayload } from '@/infrastructure/payments/paynow.client';
import { invoiceRepository, InvoiceRepository } from '../repositories/invoice.repository';
import { Invoice, SubscriptionTier, getPlan, PLANS } from '../types/billing.types';
import { organizationRepository } from '@/modules/organizations/repositories/organization.repository';
import { AppError, NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { notificationService } from '@/modules/notifications/services/notification.service';
import { webSocketManager } from '@/infrastructure/websocket/server';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { InvoicePaidEvent } from '@/modules/billing/events/InvoicePaidEvent';

export class BillingService {
  constructor(private readonly invoiceRepo: InvoiceRepository = invoiceRepository) {}

  getPlans() {
    return PLANS;
  }

  /**
   * Creates a pending Invoice for the requested plan and initiates a
   * Paynow web checkout against it. Returns the redirect URL for the
   * client to send the user to. This replaces Stripe's
   * `createCheckoutSession`; there is no Stripe-style "session" object —
   * the Invoice record IS our session, and the merchantReference we hand
   * to Paynow is the Invoice's own id so the result-URL webhook can find
   * it again unambiguously.
   */
  async initiateUpgrade(
    organizationId: string,
    planId: SubscriptionTier,
    tenantId: string,
    userId: string,
    payerEmail: string
  ): Promise<{ invoice: Invoice; redirectUrl: string }> {
    const plan = getPlan(planId);
    if (plan.price === 0) {
      throw new ValidationError('The free plan does not require payment');
    }

    const organization = await organizationRepository.findById(organizationId, tenantId, false, true);
    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    const now = new Date();
    const periodEnd = new Date(now);
    if (plan.interval === 'month') periodEnd.setMonth(periodEnd.getMonth() + 1);
    else periodEnd.setFullYear(periodEnd.getFullYear() + 1);

    const invoiceData: Omit<Invoice, '_id' | 'createdAt' | 'updatedAt'> = {
      tenantId,
      organizationId,
      planId,
      amount: plan.price,
      currency: 'USD',
      status: 'pending',
      merchantReference: `inv_${randomUUID()}`,
      periodStart: now,
      periodEnd,
      isDeleted: false,
    };

    const invoice = await this.invoiceRepo.create(invoiceData, tenantId, userId);

    const result = await paynowClient.createWebPayment(
      invoice.merchantReference,
      [{ name: `${plan.name} Plan (${plan.interval}ly)`, price: plan.price }],
      payerEmail
    );

    if (!result.success || !result.redirectUrl) {
      await this.invoiceRepo.updateStatus(invoice._id!, tenantId, 'failed', {
        failureReason: result.error || 'Paynow did not return a redirect URL',
      });
      throw new AppError(
        `Failed to initiate payment: ${result.error || 'unknown error'}`,
        'PAYNOW_INIT_FAILED',
        502
      );
    }

    await this.invoiceRepo.update(
      invoice._id!,
      { pollUrl: result.pollUrl, redirectUrl: result.redirectUrl } as Partial<Invoice>,
      tenantId
    );

    await auditLog.log({
      action: 'INVOICE_CREATED',
      userId,
      tenantId,
      entityType: 'invoice',
      entityId: invoice._id,
      metadata: { planId, amount: plan.price },
    });

    return {
      invoice: { ...invoice, pollUrl: result.pollUrl, redirectUrl: result.redirectUrl },
      redirectUrl: result.redirectUrl,
    };
  }

  /**
   * Mobile money (Ecocash/OneMoney) variant of initiateUpgrade. Returns
   * payment instructions to display to the user instead of a redirect.
   */
  async initiateMobileUpgrade(
    organizationId: string,
    planId: SubscriptionTier,
    tenantId: string,
    userId: string,
    payerEmail: string,
    phoneNumber: string,
    method: 'ecocash' | 'onemoney'
  ): Promise<{ invoice: Invoice; instructions: string }> {
    const plan = getPlan(planId);
    if (plan.price === 0) {
      throw new ValidationError('The free plan does not require payment');
    }

    const now = new Date();
    const periodEnd = new Date(now);
    if (plan.interval === 'month') periodEnd.setMonth(periodEnd.getMonth() + 1);
    else periodEnd.setFullYear(periodEnd.getFullYear() + 1);

    const invoiceData: Omit<Invoice, '_id' | 'createdAt' | 'updatedAt'> = {
      tenantId,
      organizationId,
      planId,
      amount: plan.price,
      currency: 'USD',
      status: 'pending',
      merchantReference: `inv_${randomUUID()}`,
      periodStart: now,
      periodEnd,
      isDeleted: false,
    };

    const invoice = await this.invoiceRepo.create(invoiceData, tenantId, userId);

    const result = await paynowClient.createMobilePayment(
      invoice.merchantReference,
      [{ name: `${plan.name} Plan (${plan.interval}ly)`, price: plan.price }],
      payerEmail,
      phoneNumber,
      method
    );

    if (!result.success) {
      await this.invoiceRepo.updateStatus(invoice._id!, tenantId, 'failed', {
        failureReason: result.error || 'Mobile payment initiation failed',
      });
      throw new AppError(
        `Failed to initiate mobile payment: ${result.error || 'unknown error'}`,
        'PAYNOW_MOBILE_INIT_FAILED',
        502
      );
    }

    await this.invoiceRepo.update(
      invoice._id!,
      { pollUrl: result.pollUrl } as Partial<Invoice>,
      tenantId
    );

    return {
      invoice: { ...invoice, pollUrl: result.pollUrl },
      instructions: result.instructions || 'Follow the prompt on your phone to complete payment.',
    };
  }

  /**
   * Handles an inbound Paynow result-URL POST. The caller (API route)
   * MUST have already verified the hash via `paynowClient.verifyResultHash`
   * before calling this — this method trusts its input completely and
   * does not re-verify, by design, so that verification only happens in
   * exactly one place.
   */
  async handleResultWebhook(payload: PaynowResultPayload): Promise<void> {
    const invoice = await this.invoiceRepo.findByMerchantReference(payload.reference);
    if (!invoice) {
      // Don't throw — an unknown reference might be a stale/replayed
      // webhook for a long-deleted invoice. Log and return 200 so Paynow
      // doesn't retry forever.
      console.warn(`[BillingService] Webhook for unknown invoice reference: ${payload.reference}`);
      return;
    }

    const status = payload.status?.toLowerCase();

    if (status === 'paid') {
      const updated = await this.invoiceRepo.markPaidIfPending(invoice._id!, payload.paynowreference);
      if (updated) {
        await this.applyPlanUpgrade(updated);
      }
      // If `updated` is null, the invoice was already paid/processed by
      // an earlier delivery of this same webhook — idempotent no-op.
    } else if (['cancelled', 'failed'].includes(status)) {
      await this.invoiceRepo.markFailedIfPending(invoice._id!, `Paynow reported status: ${payload.status}`);
    }
    // Other statuses (e.g. "Created", "Awaiting Delivery", "Sent") are
    // intermediate states — no action needed until a terminal status arrives.
  }

  private async applyPlanUpgrade(invoice: Invoice): Promise<void> {
    const plan = getPlan(invoice.planId);

    const organization = await organizationRepository.findById(
      invoice.organizationId,
      invoice.tenantId,
      false,
      true
    );
    if (!organization) {
      console.error(`[BillingService] Cannot apply upgrade: organization ${invoice.organizationId} not found`);
      return;
    }

    await organizationRepository.update(
      invoice.organizationId,
      {
        subscription: {
          tier: plan.id,
          planId: plan.id,
          status: 'active',
          seats: plan.features.maxUsers,
          usedSeats: organization.members.length,
          startDate: invoice.periodStart,
          endDate: invoice.periodEnd,
          features: Object.entries(plan.features)
            .filter(([, v]) => v === true)
            .map(([k]) => k),
        },
        features: plan.features,
      } as Partial<typeof organization>,
      invoice.tenantId,
      organization.ownerId,
      true
    );

    // Emit InvoicePaidEvent after successful plan upgrade
    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new InvoicePaidEvent(invoice, {
      tenantId: invoice.tenantId,
      userId: organization.ownerId,
    }));

    await auditLog.log({
      action: 'SUBSCRIPTION_UPGRADED',
      userId: organization.ownerId,
      tenantId: invoice.tenantId,
      entityType: 'organization',
      entityId: invoice.organizationId,
      metadata: { planId: plan.id, invoiceId: invoice._id },
    });

    webSocketManager.emitToTenant(invoice.tenantId, 'billing:upgraded', {
      organizationId: invoice.organizationId,
      planId: plan.id,
    });

    await notificationService.sendNotification(organization.ownerId, invoice.tenantId, {
      userId: organization.ownerId,
      type: 'system',
      title: 'Subscription Upgraded',
      message: `Your organization has been upgraded to the ${plan.name} plan`,
      priority: 'medium',
      data: { planId: plan.id },
      actionUrl: '/settings/billing',
      actionLabel: 'View Billing',
    });
  }

  /**
   * Manual fallback for when a user returns from the Paynow checkout
   * page but the result-URL webhook hasn't arrived yet (e.g. network
   * delay) — polls Paynow directly rather than waiting indefinitely.
   */
  async checkInvoiceStatus(invoiceId: string, tenantId: string): Promise<Invoice> {
    const invoice = await this.invoiceRepo.findById(invoiceId, tenantId);
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    if (invoice.status !== 'pending' || !invoice.pollUrl) {
      return invoice;
    }

    const status = await paynowClient.pollStatus(invoice.pollUrl);

    if (status.paid) {
      const updated = await this.invoiceRepo.markPaidIfPending(invoice._id!, status.paynowReference);
      if (updated) {
        await this.applyPlanUpgrade(updated);
        return updated;
      }
    }

    return invoice;
  }

  async getInvoicesForOrganization(organizationId: string, tenantId: string): Promise<Invoice[]> {
    return this.invoiceRepo.findByOrganization(organizationId, tenantId);
  }

  async expireStaleInvoices(): Promise<number> {
    return this.invoiceRepo.expireOldPendingInvoices();
  }
}

export const billingService = new BillingService();