// modules/security/controllers/mfa.controller.ts

import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { mfaService } from '../services/mfa.service';
import { mfaEnrollVerifySchema, mfaCodeSchema } from '@/shared/validations/mfa.schema';
import { successResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';

async function getUserEmail(req: NextRequest): Promise<string> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  return (token as any)?.email || 'account';
}

export class MfaController {
  async status(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const enabled = await mfaService.isEnabled(userId, tenantId);
      const remainingBackupCodes = enabled ? await mfaService.remainingBackupCodes(userId) : 0;
      return successResponse({ enabled, remainingBackupCodes });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async enrollStart(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const email = await getUserEmail(req);
      const result = await mfaService.enrollStart(userId, tenantId, email);
      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async enrollVerify(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = mfaEnrollVerifySchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid verification request', parsed.error.flatten());
      }

      const result = await mfaService.enrollVerify(userId, tenantId, parsed.data.code);
      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async disable(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = mfaCodeSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('A code or backup code is required', parsed.error.flatten());
      }

      await mfaService.disable(userId, tenantId, parsed.data.code, parsed.data.backupCode);
      return successResponse({ message: 'MFA disabled successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async regenerateBackupCodes(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = mfaCodeSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('A code or backup code is required', parsed.error.flatten());
      }

      const codes = await mfaService.regenerateBackupCodes(
        userId,
        tenantId,
        parsed.data.code,
        parsed.data.backupCode
      );
      return successResponse({ backupCodes: codes });
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[MfaController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const mfaController = new MfaController();