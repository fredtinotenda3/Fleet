// modules/organizations/controllers/organization-advanced.controller.ts

import { NextRequest } from 'next/server';
import { organizationAdvancedService } from '../services/organization-advanced.service';
import { successResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';
import {
  featureFlagsUpdateSchema,
  aiSettingsUpdateSchema,
  reportingPreferencesUpdateSchema,
} from '@/shared/validations/organization.advanced-addendum.schema';

export class OrganizationAdvancedController {
  async updateFeatureFlags(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = featureFlagsUpdateSchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse('Invalid feature flags', 'VALIDATION_ERROR', 400, parsed.error.flatten());
      }

      const org = await organizationAdvancedService.updateFeatureFlags(id, parsed.data, tenantId, userId);
      return successResponse(org);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateAISettings(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = aiSettingsUpdateSchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse('Invalid AI settings', 'VALIDATION_ERROR', 400, parsed.error.flatten());
      }

      const org = await organizationAdvancedService.updateAISettings(id, parsed.data, tenantId, userId);
      return successResponse(org);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateReportingPreferences(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = reportingPreferencesUpdateSchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse('Invalid reporting preferences', 'VALIDATION_ERROR', 400, parsed.error.flatten());
      }

      const org = await organizationAdvancedService.updateReportingPreferences(id, parsed.data, tenantId, userId);
      return successResponse(org);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getActivitySummary(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const summary = await organizationAdvancedService.getActivitySummary(id, tenantId);
      return successResponse(summary);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[OrganizationAdvancedController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const organizationAdvancedController = new OrganizationAdvancedController();