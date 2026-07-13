// modules/reporting/controllers/report-definition.controller.ts
//
// FIX (Critical): app/api/reporting/definitions/[id]/drilldown/route.ts
// calls `reportDefinitionController.drilldown(...)`, but this class never
// defined a `drilldown` method — every request to that route threw
// `TypeError: reportDefinitionController.drilldown is not a function` at
// runtime. Added `drilldown()` below, wired to the existing
// `drilldownService.drillInto()` (modules/reporting/services/drilldown.service.ts),
// which was fully implemented but never called from anywhere.
//
// FIX (Critical): the `preview` and `pivot` routes both called
// `previewPivot(...)` (a copy-paste error in the route files, fixed
// separately in those files) — `preview()` itself was correct and unused.
// No change needed here; documenting for the audit trail.

import { NextRequest } from 'next/server';
import { AuthContext } from '@/server/auth/auth-context';
import { reportBuilderService } from '../services/report-builder.service';
import { reportSchedulerService } from '../services/report-scheduler.service';
import { drilldownService } from '../services/drilldown.service';
import { successResponse, createdResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import { validateWithZod } from '@/shared/utils/validation.utils';
import {
  reportDefinitionCreateSchema,
  reportDefinitionUpdateSchema,
} from '@/shared/validations/report-definition.schema';
import { z } from 'zod';

const drilldownRequestSchema = z.object({
  groupValues: z.record(z.string(), z.unknown()),
});

export class ReportDefinitionController {
  async list(req: NextRequest, context: AuthContext) {
    try {
      return successResponse(await reportBuilderService.list(context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async get(req: NextRequest, context: AuthContext, id: string) {
    try {
      return successResponse(await reportBuilderService.get(id, context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** Runs the definition and returns the flat/grouped tabular preview for the builder UI. */
  async preview(req: NextRequest, context: AuthContext, id: string) {
    try {
      return successResponse(await reportBuilderService.preview(id, context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** Pivot-shaped preview, only valid when the definition has a saved pivot config. */
  async previewPivot(req: NextRequest, context: AuthContext, id: string) {
    try {
      return successResponse(await reportBuilderService.previewPivot(id, context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Drills into a specific group/row a user clicked on in a grouped
   * report result, returning the ungrouped detail rows behind it.
   * Body: `{ groupValues: Record<string, unknown> }` — the group key/value
   * pairs identifying the clicked cell (e.g. `{ status: "active" }`).
   */
  async drilldown(req: NextRequest, context: AuthContext, id: string) {
    try {
      const body = await req.json();
      const result = await validateWithZod(drilldownRequestSchema, body);
      if (!result.success || !result.data) {
        return errorResponse('Validation failed', 'VALIDATION_ERROR', 400, result.errors);
      }

      const definition = await reportBuilderService.get(id, context.tenantId);
      const detail = await drilldownService.drillInto(definition, context.tenantId, result.data.groupValues);
      return successResponse(detail);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async duplicate(req: NextRequest, context: AuthContext, id: string) {
    try {
      const duplicated = await reportBuilderService.duplicate(id, context.tenantId, context.userId);
      return createdResponse(duplicated);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async create(req: NextRequest, context: AuthContext) {
    try {
      const body = await req.json();
      const result = await validateWithZod(reportDefinitionCreateSchema, body);
      if (!result.success || !result.data) {
        return errorResponse('Validation failed', 'VALIDATION_ERROR', 400, result.errors);
      }
      const created = await reportBuilderService.create(result.data, context.tenantId, context.userId);

      // Wires ReportDefinition.schedule onto the platform cron catalogue.
      // Deliberately called here (not inside ReportBuilderService, per that
      // service's own comment) rather than silently skipped.
      if (created.schedule) {
        await reportSchedulerService.syncSchedule(created, context.tenantId, context.userId);
      }

      return createdResponse(created);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async update(req: NextRequest, context: AuthContext, id: string) {
    try {
      const body = await req.json();
      const result = await validateWithZod(reportDefinitionUpdateSchema, body);
      if (!result.success || !result.data) {
        return errorResponse('Validation failed', 'VALIDATION_ERROR', 400, result.errors);
      }
      const updated = await reportBuilderService.update(id, result.data, context.tenantId, context.userId);
      await reportSchedulerService.syncSchedule(updated, context.tenantId, context.userId);
      return successResponse(updated);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async delete(req: NextRequest, context: AuthContext, id: string) {
    try {
      await reportSchedulerService.removeSchedule(id, context.userId);
      await reportBuilderService.delete(id, context.tenantId, context.userId);
      return successResponse({ message: 'Report definition deleted successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[ReportDefinitionController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const reportDefinitionController = new ReportDefinitionController();