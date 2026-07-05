// modules/security/controllers/session.controller.ts

import { NextRequest } from 'next/server';
import { sessionService } from '../services/session.service';
import { sessionRevokeSchema } from '@/shared/validations/session.schema';
import { successResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError } from '@/server/errors/app.errors';
import { AuthContext, hasPermission } from '@/server/auth/auth-context';
import { Permission } from '@/server/permissions/roles';

export class SessionController {
  async listMySessions(req: NextRequest, context: AuthContext) {
    try {
      const sessions = await sessionService.listForUser(context.userId, context.tenantId, context.sessionId);
      return successResponse(sessions);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async listSessionsForUser(req: NextRequest, context: AuthContext, targetUserId: string) {
    try {
      const sessions = await sessionService.listForUser(targetUserId, context.tenantId);
      return successResponse(sessions);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async revokeSession(req: NextRequest, context: AuthContext, id: string) {
    try {
      const body = await req.json().catch(() => ({}));
      const parsed = sessionRevokeSchema.safeParse(body);
      const reason = parsed.success ? parsed.data.reason : undefined;

      const canManageAny = context.isSuperAdmin || hasPermission(context, Permission.SESSION_MANAGE);

      await sessionService.revokeSession(
        id,
        context.tenantId,
        context.userId,
        context.userId,
        canManageAny,
        reason || 'Revoked by user'
      );
      return successResponse({ message: 'Session revoked successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async revokeAllOtherSessions(req: NextRequest, context: AuthContext) {
    try {
      const count = await sessionService.revokeAllForUser(
        context.userId,
        context.tenantId,
        context.userId,
        context.sessionId,
        'Revoked all other sessions by user'
      );
      return successResponse({ message: `${count} other session(s) revoked`, count });
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[SessionController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const sessionController = new SessionController();