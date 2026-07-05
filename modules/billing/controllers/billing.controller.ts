// modules/billing/controllers/billing.controller.ts

import { NextRequest } from 'next/server';
import { billingService } from '../services/billing.service';
import { paynowClient, PaynowResultPayload } from '@/infrastructure/payments/paynow.client';
import {
  upgradeRequestSchema,
  mobileUpgradeRequestSchema,
} from '@/shared/validations/billing.schema';
import {
  successResponse,
  createdResponse,
  errorResponse,
} from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import {
  getTenantFromRequest,
  getUserIdFromRequest,
} from '@/server/utils/context.utils';

export class BillingController {
  async getPlans() {
    return successResponse(billingService.getPlans());
  }

  async initiateUpgrade(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = upgradeRequestSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid upgrade request', parsed.error.flatten());
      }

      const { invoice, redirectUrl } = await billingService.initiateUpgrade(
        parsed.data.organizationId,
        parsed.data.planId,
        tenantId,
        userId,
        parsed.data.payerEmail
      );

      return createdResponse({ invoiceId: invoice._id, redirectUrl, pollUrl: invoice.pollUrl });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async initiateMobileUpgrade(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = mobileUpgradeRequestSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid mobile upgrade request', parsed.error.flatten());
      }

      const { invoice, instructions } = await billingService.initiateMobileUpgrade(
        parsed.data.organizationId,
        parsed.data.planId,
        tenantId,
        userId,
        parsed.data.payerEmail,
        parsed.data.phoneNumber,
        parsed.data.method
      );

      return createdResponse({ invoiceId: invoice._id, instructions, pollUrl: invoice.pollUrl });
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Handles Paynow's result-URL POST. Paynow posts this as
   * application/x-www-form-urlencoded. Critically, we build the payload
   * object by iterating the parsed form data IN THE ORDER RECEIVED rather
   * than destructuring named fields, because `verifyResultHash` depends
   * on concatenating values in their original field order â€” a hand-built
   * object literal with reordered keys would compute a different (wrong)
   * hash and reject every legitimate webhook.
   */
  async handleWebhook(req: NextRequest) {
    try {
      const contentType = req.headers.get('content-type') || '';
      let payload: PaynowResultPayload;

      if (contentType.includes('application/json')) {
        payload = (await req.json()) as PaynowResultPayload;
      } else {
        const formData = await req.formData();
        const ordered: Record<string, string> = {};
        for (const [key, value] of formData.entries()) {
          ordered[key] = String(value);
        }
        payload = ordered as PaynowResultPayload;
      }

      if (!paynowClient.verifyResultHash(payload)) {
        console.error('[BillingController] Paynow webhook hash verification FAILED', {
          reference: payload.reference,
        });
        // Return 200 anyway so Paynow doesn't endlessly retry a forged or
        // malformed request, but do NOT process it.
        return successResponse({ message: 'Hash verification failed, ignored' });
      }

      await billingService.handleResultWebhook(payload);
      return successResponse({ message: 'Webhook processed' });
    } catch (error) {
      console.error('[BillingController] Webhook processing error:', error);
      // Still return 200 to prevent Paynow retry storms on our own bugs;
      // the error is logged for investigation instead.
      return successResponse({ message: 'Webhook received' });
    }
  }

  async checkInvoiceStatus(req: NextRequest, invoiceId: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const invoice = await billingService.checkInvoiceStatus(invoiceId, tenantId);
      return successResponse(invoice);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async listInvoices(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const organizationId = req.nextUrl.searchParams.get('organizationId');

      if (!organizationId) {
        throw new ValidationError('organizationId query param is required');
      }

      const invoices = await billingService.getInvoicesForOrganization(organizationId, tenantId);
      return successResponse(invoices);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[BillingController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const billingController = new BillingController();