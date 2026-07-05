
// modules/security/controllers/sso.controller.ts

import { NextRequest } from 'next/server';
import { ssoService } from '../services/sso.service';
import { ssoConnectionCreateSchema, ssoConnectionUpdateSchema } from '@/shared/validations/sso.schema';
import { successResponse, createdResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';

export class SsoController {
  async list(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const connections = await ssoService.list(tenantId);
      return successResponse(connections);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async get(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const connection = await ssoService.get(id, tenantId);
      return successResponse(connection);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async create(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = ssoConnectionCreateSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid SSO connection definition', parsed.error.flatten());
      }

      const connection = await ssoService.create({ ...parsed.data, organizationId: tenantId }, tenantId, userId);
      const { clientSecretEncrypted, ...safe } = connection;
      return createdResponse(safe);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async update(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = ssoConnectionUpdateSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid SSO connection update', parsed.error.flatten());
      }

      const connection = await ssoService.update(id, parsed.data, tenantId, userId);
      const { clientSecretEncrypted, ...safe } = connection;
      return successResponse(safe);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async delete(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      await ssoService.delete(id, tenantId, userId);
      return successResponse({ message: 'SSO connection deleted' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[SsoController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const ssoController = new SsoController();