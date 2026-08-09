// modules/finance/controllers/depreciation.controller.ts
//
// HTTP surface for depreciation policy and charge posting.
// Request-parsing only; DepreciationService owns every rule, including
// the material-field lock that refuses a profile edit after charges
// exist.

import { NextRequest } from 'next/server';
import { depreciationService } from '../services/depreciation.service';
import {
  upsertDepreciationProfileSchema,
  postDepreciationSchema,
} from '@/shared/validations/finance.schema';
import { validateWithZod } from '@/shared/utils/validation.utils';
import { successResponse, createdResponse, errorResponse } from '@/server/utils/response.utils';
import { isAppError, describeError, ValidationError } from '@/server/errors/app.errors';
import { resolveTenantContext, resolveTenantContextWithUser } from '@/server/utils/tenant-context.utils';

async function parseJsonBody(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ValidationError('Request body must be valid JSON.');
  }
}

export class DepreciationController {
  /** GET /api/finance/depreciation/profiles  (optional ?vehicleId= for one) */
  async listProfiles(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      const vehicleId = req.nextUrl.searchParams.get('vehicleId');

      if (vehicleId) {
        const profile = await depreciationService.getProfile(context, vehicleId);
        return successResponse(profile);
      }

      const profiles = await depreciationService.listProfiles(context);
      return successResponse(profiles, { count: profiles.length });
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** POST /api/finance/depreciation/profiles -- create or update the vehicle's profile. */
  async upsertProfile(req: NextRequest) {
    try {
      const { context, userId } = await resolveTenantContextWithUser(req);
      const body = await parseJsonBody(req);

      const result = await validateWithZod(upsertDepreciationProfileSchema, body);
      if (!result.success || !result.data) {
        throw new ValidationError('Validation failed', result.errors);
      }

      const profile = await depreciationService.upsertProfile(context, userId, result.data);
      return createdResponse(profile);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * POST /api/finance/depreciation/post
   *
   * `?preview=true` computes the charge and returns it without writing.
   * Kept on the same route rather than a separate one so the preview and
   * the real post can never drift apart in how they load inputs -- they
   * call the same private loader in the service.
   */
  async postCharge(req: NextRequest) {
    try {
      const { context, userId } = await resolveTenantContextWithUser(req);
      const preview = req.nextUrl.searchParams.get('preview') === 'true';
      const body = await parseJsonBody(req);

      const result = await validateWithZod(postDepreciationSchema, body);
      if (!result.success || !result.data) {
        throw new ValidationError('Validation failed', result.errors);
      }

      if (preview) {
        const charge = await depreciationService.previewCharge(context, result.data);
        return successResponse({ preview: true, ...charge });
      }

      const posted = await depreciationService.postDepreciation(context, userId, result.data);
      // 200 rather than 201 when nothing was written (a zero charge, or a
      // fully depreciated asset) -- reporting 201 Created for a request
      // that created nothing is a lie the client would have to unpick
      // from the body.
      return posted.posted ? createdResponse(posted) : successResponse(posted);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (isAppError(error)) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[DepreciationController] Unexpected error:', describeError(error));
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const depreciationController = new DepreciationController();
