// modules/security/controllers/api-key.controller.ts

import { NextRequest } from 'next/server';
import { apiKeyService } from '../services/api-key.service';
import { apiKeyCreateSchema } from '@/shared/validations/api-key.schema';
import { successResponse, createdResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import { AuthContext } from '@/server/auth/auth-context';

export class ApiKeyController {
  async list(req: NextRequest, context: AuthContext) {
    try {
      const includeRevoked = req.nextUrl.searchParams.get('includeRevoked') === 'true';
      const keys = await apiKeyService.listForOrganization(context.tenantId, includeRevoked);
      return successResponse(keys);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async get(req: NextRequest, context: AuthContext, id: string) {
    try {
      const key = await apiKeyService.getById(id, context.tenantId);
      return successResponse(key);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async create(req: NextRequest, context: AuthContext) {
    try {
      const body = await req.json();
      const parsed = apiKeyCreateSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid API key request', parsed.error.flatten());
      }

      const result = await apiKeyService.createApiKey(parsed.data, context.tenantId, context.userId);
      return createdResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async revoke(req: NextRequest, context: AuthContext, id: string) {
    try {
      const body = await req.json().catch(() => ({}));
      await apiKeyService.revoke(id, context.tenantId, context.userId, body?.reason);
      return successResponse({ message: 'API key revoked successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[ApiKeyController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const apiKeyController = new ApiKeyController();