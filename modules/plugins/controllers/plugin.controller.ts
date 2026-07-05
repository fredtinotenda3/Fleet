// modules/plugins/controllers/plugin.controller.ts

import { NextRequest } from 'next/server';
import { pluginService } from '../services/plugin.service';
import {
  pluginRegisterSchema,
  pluginInstallCreateSchema,
  pluginInstallUpdateSchema,
} from '@/shared/validations/plugin.schema';
import { successResponse, createdResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';

/**
 * Two distinct surfaces live behind this controller:
 *   - Catalogue (registerPlugin/listCatalogue/getManifest): platform-wide,
 *     not tenant-scoped. registerPlugin is gated to Permission.PLUGIN_REGISTER
 *     (super-admin only, mirrors PLATFORM_MANAGE) at the route level.
 *   - Installation lifecycle (install/update/enable/disable/uninstall/
 *     listInstalled/getInstallation): tenant-scoped to the calling
 *     organization via getTenantFromRequest, gated to PLUGIN_VIEW/PLUGIN_MANAGE.
 */
export class PluginController {
  // ── Catalogue ──────────────────────────────────────────────────────

  async registerPlugin(req: NextRequest) {
    try {
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = pluginRegisterSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid plugin registration payload', parsed.error.flatten());
      }

      const registered = await pluginService.registerPlugin(
        parsed.data.manifest,
        parsed.data.isSystemPlugin,
        userId
      );
      return createdResponse(registered);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async listCatalogue(_req: NextRequest) {
    try {
      const catalogue = await pluginService.listCatalogue();
      return successResponse(catalogue);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getManifest(_req: NextRequest, pluginId: string) {
    try {
      const registered = await pluginService.getManifest(pluginId);
      return successResponse(registered);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ── Installation lifecycle ────────────────────────────────────────

  async install(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = pluginInstallCreateSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid plugin install request', parsed.error.flatten());
      }

      const installation = await pluginService.install(parsed.data, tenantId, userId);
      return createdResponse(installation);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async listInstalled(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const installations = await pluginService.listInstalled(tenantId);
      return successResponse(installations);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getInstallation(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const installation = await pluginService.getInstallation(id, tenantId);
      return successResponse(installation);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async update(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = pluginInstallUpdateSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid plugin update request', parsed.error.flatten());
      }

      const updated = await pluginService.update(id, parsed.data, tenantId, userId);
      return successResponse(updated);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async enable(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const updated = await pluginService.enable(id, tenantId, userId);
      return successResponse(updated);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async disable(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const updated = await pluginService.disable(id, tenantId, userId);
      return successResponse(updated);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async uninstall(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      await pluginService.uninstall(id, tenantId, userId);
      return successResponse({ message: 'Plugin uninstalled successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[PluginController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const pluginController = new PluginController();