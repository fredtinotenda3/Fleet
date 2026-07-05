// modules/notifications/controllers/notification.controller.ts

import { NextRequest } from 'next/server';
import { notificationService } from '../services/notification.service';
import { notificationPreferencesUpdateSchema } from '@/shared/validations/notification.schema';
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
} from '@/server/utils/context.utils';

export class NotificationController {
  async getNotifications(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const searchParams = req.nextUrl.searchParams;

      const { page, limit } = validatePaginationParams(
        searchParams.get('page'),
        searchParams.get('limit')
      );
      const unreadOnly = searchParams.get('unreadOnly') === 'true';

      const result = await notificationService.getNotifications(
        userId,
        tenantId,
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

      const count = await notificationService.getUnreadCount(userId, tenantId);
      return successResponse({ count });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async markAsRead(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);

      await notificationService.markAsRead(id, userId, tenantId);
      return successResponse({ message: 'Notification marked as read' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async markAllAsRead(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);

      const count = await notificationService.markAllAsRead(userId, tenantId);
      return successResponse({ message: 'All notifications marked as read', count });
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

      // Transform data to ensure channels are complete if provided
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