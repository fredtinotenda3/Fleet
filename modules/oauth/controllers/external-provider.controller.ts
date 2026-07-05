/* eslint-disable @typescript-eslint/no-unused-vars */
// modules/oauth/controllers/external-provider.controller.ts

import { NextRequest } from 'next/server';
import { externalProviderService, ExternalProviderService } from '../services/external-provider.service';
import {
  externalProviderCreateSchema,
  externalProviderUpdateSchema,
} from '@/shared/validations/oauth.schema';
import { successResponse, createdResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';
import { Permission } from '@/server/permissions/roles';
import { withAuth } from '@/server/middleware/with-auth';

export class ExternalProviderController {
  constructor(private readonly service: ExternalProviderService = externalProviderService) {}

  async listProviders(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const activeOnly = req.nextUrl.searchParams.get('activeOnly') !== 'false';
      const providers = await this.service.listProviders(tenantId, activeOnly);
      return successResponse(providers);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getProvider(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const provider = await this.service.getProvider(id, tenantId);
      return successResponse(provider);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createProvider(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = externalProviderCreateSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid external provider request', parsed.error.flatten());
      }

      const provider = await this.service.createProvider(parsed.data, tenantId, userId);
      return createdResponse(provider);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateProvider(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = externalProviderUpdateSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid external provider update', parsed.error.flatten());
      }

      const provider = await this.service.updateProvider(id, parsed.data, tenantId, userId);
      return successResponse(provider);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async deleteProvider(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);

      await this.service.deleteProvider(id, tenantId, userId);
      return successResponse({ message: 'External provider deleted successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async discover(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const email = req.nextUrl.searchParams.get('email');

      if (!email) {
        throw new ValidationError('email query parameter is required');
      }

      const result = await this.service.discoverByEmail(email, tenantId);
      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[ExternalProviderController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const externalProviderController = new ExternalProviderController();