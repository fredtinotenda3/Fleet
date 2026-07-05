// modules/webhooks/controllers/webhook-subscription.controller.ts

import { NextRequest } from 'next/server';
import { webhookSubscriptionService } from '../services/webhook-subscription.service';
import { webhookDispatchService } from '../services/webhook-dispatch.service';
import { webhookDeliveryRepository } from '../repositories/webhook-delivery.repository';
import {
  webhookSubscriptionCreateSchema,
  webhookSubscriptionUpdateSchema,
} from '@/shared/validations/webhook.schema';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import { successResponse, createdResponse, paginatedResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError, ValidationError, NotFoundError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';

export class WebhookSubscriptionController {
  async list(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const subscriptions = await webhookSubscriptionService.list(tenantId);
      // Never leak the signing secret in a list response.
      const safe = subscriptions.map(({ secret, ...rest }) => rest);
      return successResponse(safe);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async get(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const subscription = await webhookSubscriptionService.get(id, tenantId);
      const { secret, ...safe } = subscription;
      return successResponse(safe);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async create(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = webhookSubscriptionCreateSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid webhook subscription payload', parsed.error.flatten());
      }

      const created = await webhookSubscriptionService.create(parsed.data, tenantId, userId);
      // Secret IS returned on creation — this is the only time the
      // caller can see it, mirroring how API key plaintext is returned
      // exactly once by ApiKeyService.createApiKey.
      return createdResponse(created);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async update(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = webhookSubscriptionUpdateSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid webhook subscription update', parsed.error.flatten());
      }

      const updated = await webhookSubscriptionService.update(id, parsed.data, tenantId, userId);
      const { secret, ...safe } = updated;
      return successResponse(safe);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async delete(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      await webhookSubscriptionService.delete(id, tenantId, userId);
      return successResponse({ message: 'Webhook subscription deleted' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async rotateSecret(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const updated = await webhookSubscriptionService.rotateSecret(id, tenantId, userId);
      // Rotation DOES return the new secret — same one-time-visibility
      // rule as create().
      return successResponse(updated);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async sendTest(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      // Confirm the subscription exists (and belongs to this tenant)
      // before queuing — sendTest() itself also checks, but doing it
      // here first gives a clean 404 instead of a generic 500 from a
      // service-layer throw of a plain Error.
      await webhookSubscriptionService.get(id, tenantId);
      const result = await webhookDispatchService.sendTest(id, tenantId);
      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async listDeliveries(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      await webhookSubscriptionService.get(id, tenantId); // 404 if not found/owned

      const { page, limit } = validatePaginationParams(
        req.nextUrl.searchParams.get('page'),
        req.nextUrl.searchParams.get('limit')
      );

      const result = await webhookDeliveryRepository.findBySubscription(id, tenantId, { page, limit });
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[WebhookSubscriptionController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const webhookSubscriptionController = new WebhookSubscriptionController();