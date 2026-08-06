// modules/notifications/controllers/notification.controller.ts

import { NextRequest } from 'next/server';
import { notificationService } from '../services/notification.service';
import {
  notificationPreferencesUpdateSchema,
  notificationBroadcastCreateSchema,
} from '@/shared/validations/notification.schema';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import {
  successResponse,
  paginatedResponse,
  errorResponse,
} from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import {
  getTenantFromRequest,
  getUserIdFromRequest,
  getUserRolesFromRequest,
  isSuperAdmin,
} from '@/server/utils/context.utils';
import { tenantContextService } from '@/modules/tenancy/services/tenant-context.service';
import { authorizeBroadcast } from '../authorization/notification-broadcast.authorization';

/**
 * Reads the "which of my accessible org units is active right now"
 * header -- per the audit note on tenant-context.service.ts, this only
 * ever narrows *within* what resolveContext() already computed from
 * real UserScopeAssignment records; it is never itself a source of
 * access.
 */
function getActiveOrgUnitId(req: NextRequest): string | undefined {
  return req.headers.get('x-org-unit-id') ?? undefined;
}

export class NotificationController {
  private async resolveContext(req: NextRequest, tenantId: string, userId: string) {
    const [roles, superAdmin] = await Promise.all([
      getUserRolesFromRequest(req),
      isSuperAdmin(req),
    ]);
    return tenantContextService.resolveContext(
      userId,
      tenantId,
      roles,
      superAdmin,
      getActiveOrgUnitId(req)
    );
  }

  async getNotifications(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const context = await this.resolveContext(req, tenantId, userId);

      const searchParams = req.nextUrl.searchParams;
      const { page, limit } = validatePaginationParams(
        searchParams.get('page'),
        searchParams.get('limit')
      );
      const unreadOnly = searchParams.get('unreadOnly') === 'true';

      const result = await notificationService.getNotificationsInScope(
        userId,
        context,
        { page, limit },
        unreadOnly
      );

      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getUnreadCount(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const context = await this.resolveContext(req, tenantId, userId);

      const count = await notificationService.getUnreadCountInScope(userId, context);
      return successResponse({ count });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async markAsRead(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const context = await this.resolveContext(req, tenantId, userId);

      await notificationService.markAsReadInScope(id, userId, context);
      return successResponse({ message: 'Notification marked as read' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async markAllAsRead(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const context = await this.resolveContext(req, tenantId, userId);

      const count = await notificationService.markAllAsReadInScope(userId, context);
      return successResponse({ message: 'All notifications marked as read', count });
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * FIX (Phase C -- write-path security): previously created a broadcast
   * for any authenticated user, for any orgUnitId, with no role or
   * scope check at all -- an authenticated Driver could broadcast to a
   * branch they have no assignment to. Now gated by authorizeBroadcast()
   * (role check + TenantContextService scope resolution + org-unit
   * membership check) before sendBroadcastNotification() is ever
   * called. See notification-broadcast.authorization.ts for the
   * requirement-by-requirement rationale.
   */
  async createBroadcast(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = notificationBroadcastCreateSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid broadcast payload', parsed.error.flatten());
      }

      const [roles, superAdmin] = await Promise.all([
        getUserRolesFromRequest(req),
        isSuperAdmin(req),
      ]);

      const { orgUnitId, ...notification } = parsed.data;

      await authorizeBroadcast({
        userId,
        tenantId,
        roles,
        isSuperAdmin: superAdmin,
        activeOrgUnitId: getActiveOrgUnitId(req),
        targetOrgUnitId: orgUnitId,
      });

      const created = await notificationService.sendBroadcastNotification(
        orgUnitId,
        tenantId,
        notification
      );

      return successResponse(created);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getPreferences(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);

      const preferences = await notificationService.getPreferences(userId, tenantId);
      return successResponse(preferences);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updatePreferences(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = notificationPreferencesUpdateSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid preferences payload', parsed.error.flatten());
      }

      const updateData: any = {};

      if (parsed.data.channels) {
        updateData.channels = {
          in_app: parsed.data.channels.in_app ?? false,
          email: parsed.data.channels.email ?? false,
          push: parsed.data.channels.push ?? false,
        };
      }

      if (parsed.data.types) {
        updateData.types = parsed.data.types;
      }

      if (parsed.data.digest) {
        updateData.digest = {
          enabled: parsed.data.digest.enabled ?? false,
          frequency: parsed.data.digest.frequency ?? 'daily',
        };
      }

      const preferences = await notificationService.updatePreferences(
        userId,
        tenantId,
        updateData
      );
      return successResponse(preferences);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[NotificationController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const notificationController = new NotificationController();