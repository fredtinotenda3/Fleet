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
import { AppError, ValidationError, isAppError, describeError } from '@/server/errors/app.errors';
import { validateWithZod } from '@/shared/utils/validation.utils';
import {
  reportDefinitionCreateSchema,
  reportDefinitionUpdateSchema,
} from '@/shared/validations/report-definition.schema';
import { z } from 'zod';
import { resolveTenantContext } from '@/server/utils/tenant-context.utils';
import { assertDataSourceAccess } from '../utils/data-source-authorization';

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
      // Org-unit scope for the report engine. Without this the engine
      // falls back to organization-wide, which is exactly the leak this
      // change closes -- so it is resolved here, at the request edge,
      // rather than left to each service.
      const tenantContext = await resolveTenantContext(req);
      return successResponse(
        await reportBuilderService.preview(id, context.tenantId, undefined, tenantContext, context)
      );
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** Pivot-shaped preview, only valid when the definition has a saved pivot config. */
  async previewPivot(req: NextRequest, context: AuthContext, id: string) {
    try {
      // Org-unit scope for the report engine. Without this the engine
      // falls back to organization-wide, which is exactly the leak this
      // change closes -- so it is resolved here, at the request edge,
      // rather than left to each service.
      const tenantContext = await resolveTenantContext(req);
      return successResponse(await reportBuilderService.previewPivot(id, context.tenantId, tenantContext, context));
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
      // R.3.7 prerequisite fix: the definition is already fetched here
      // (drillInto only needs it, not the id), so the data-source
      // permission check is asserted at this same edge rather than
      // threading AuthContext further into drilldown.service.ts.
      assertDataSourceAccess(definition.dataSource, context);
      // Org-unit scope for the report engine. Without this the engine
      // falls back to organization-wide, which is exactly the leak this
      // change closes -- so it is resolved here, at the request edge,
      // rather than left to each service.
      const tenantContext = await resolveTenantContext(req);
      const detail = await drilldownService.drillInto(definition, context.tenantId, result.data.groupValues, tenantContext);
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
        // R.3.7 prerequisite fix: a schedule that is actually enabled
        // EMAILS its output on a recurring, unattended basis -- the
        // single highest-impact path in the whole reporting surface for
        // a data-source permission gap, so it is asserted here, before
        // the cron job is ever created. Gated on schedule.enabled (not
        // just the presence of a schedule object) to match
        // syncSchedule's own internal gate -- saving a definition with a
        // disabled schedule must not require the data-source permission.
        if (created.schedule.enabled) {
          assertDataSourceAccess(created.dataSource, context);
        }
        // The creator's org-unit scope is frozen onto the schedule: a
        // scheduled run has no request and therefore no TenantContext,
        // and the engine defaulted to organization-wide without it --
        // on a path that emails its output.
        const scheduleContext = await resolveTenantContext(req);
        await reportSchedulerService.syncSchedule(
          created,
          context.tenantId,
          context.userId,
          scheduleContext.accessibleOrgUnitIds
        );
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
      // R.3.7 prerequisite fix -- see the identical check in create()
      // above for the full reasoning. Gated on schedule.enabled so
      // disabling a schedule (or editing an already-disabled one) never
      // requires the data-source permission.
      if (updated.schedule?.enabled) {
        assertDataSourceAccess(updated.dataSource, context);
      }
      // Re-freezes the scope on every update, so a definition edited by
      // a differently-scoped user runs under the scope of whoever last
      // saved it -- never wider than that person could read themselves.
      const scheduleContext = await resolveTenantContext(req);
      await reportSchedulerService.syncSchedule(
        updated,
        context.tenantId,
        context.userId,
        scheduleContext.accessibleOrgUnitIds
      );
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
    if (isAppError(error)) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[ReportDefinitionController] Unexpected error:', describeError(error));
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const reportDefinitionController = new ReportDefinitionController();