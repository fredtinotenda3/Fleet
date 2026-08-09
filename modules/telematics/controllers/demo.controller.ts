// modules/telematics/controllers/demo.controller.ts
//
// Demo Mode is a per-tenant switch, not org-unit scoped -- it decides
// whether the WHOLE organization's live map shows simulated or real
// data, same as a real fleet would either have Cartrack devices
// installed or not. Any authenticated member of the tenant can see the
// status; toggling it requires VEHICLE_EDIT (same permission used for
// acknowledging alerts elsewhere in this module) since it changes what
// every viewer sees on the live map.

import { NextRequest } from 'next/server';
import { demoStateRepository } from '../repositories/demo-state.repository';
import { demoModeToggleSchema } from '@/shared/validations/telematics-demo.schema';
import { successResponse } from '@/server/utils/response.utils';
import { ValidationError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';
import { handleTelematicsError } from './telematics-error.utils';
import { DemoModeStatus } from '../types/live-map.types';

export class DemoController {
  async getStatus(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const state = await demoStateRepository.getState(tenantId);

      const status: DemoModeStatus = {
        enabled: state?.enabled ?? false,
        startedAt: state?.startedAt?.toISOString(),
      };
      return successResponse(status);
    } catch (error) {
      return handleTelematicsError('DemoController', error);
    }
  }

  async setStatus(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = demoModeToggleSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid demo mode payload', parsed.error.flatten());
      }

      const state = await demoStateRepository.setEnabled(tenantId, parsed.data.enabled, userId);

      const status: DemoModeStatus = {
        enabled: state.enabled,
        startedAt: state.startedAt.toISOString(),
      };
      return successResponse(status);
    } catch (error) {
      return handleTelematicsError('DemoController', error);
    }
  }
}

export const demoController = new DemoController();