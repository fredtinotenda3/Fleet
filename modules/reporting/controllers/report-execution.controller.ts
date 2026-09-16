// modules/reporting/controllers/report-execution.controller.ts

import { NextRequest, NextResponse } from 'next/server';
import { AuthContext } from '@/server/auth/auth-context';
import { reportExecutionService } from '../services/report-execution.service';
import { reportBuilderService } from '../services/report-builder.service';
import { successResponse, paginatedResponse, errorResponse } from '@/server/utils/response.utils';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { AppError, isAppError, describeError } from '@/server/errors/app.errors';
import { validateWithZod } from '@/shared/utils/validation.utils';
import { generateExecutionSchema } from '@/shared/validations/report-execution.schema';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import { resolveTenantContext } from '@/server/utils/tenant-context.utils';
import { assertDataSourceAccess } from '../utils/data-source-authorization';

export class ReportExecutionController {
  async list(req: NextRequest, context: AuthContext) {
    try {
      const { page, limit } = validatePaginationParams(
        req.nextUrl.searchParams.get('page'),
        req.nextUrl.searchParams.get('limit')
      );
      const result = await reportExecutionService.list(context.tenantId, { page, limit });
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async get(req: NextRequest, context: AuthContext, id: string) {
    try {
      return successResponse(await reportExecutionService.get(id, context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async generate(req: NextRequest, context: AuthContext) {
    try {
      const body = await req.json();
      const result = await validateWithZod(generateExecutionSchema, body);
      if (!result.success || !result.data) {
        return errorResponse('Validation failed', 'VALIDATION_ERROR', 400, result.errors);
      }

      // R.3.7 prerequisite fix: EXPORT is the other high-impact path
      // (alongside scheduling) a data-source permission gap reaches --
      // a downloaded file is designed to be kept outside the platform
      // entirely. reportExecutionService.generate() re-fetches the
      // definition itself (for the export's `name`), so this is one
      // extra read for the permission check, not a new query pattern.
      // Dashboard-sourced generation (input.dashboardId) is deliberately
      // NOT covered here -- a dashboard aggregates multiple data sources
      // across possibly-independent widgets, and gating it correctly
      // would mean auditing every widget type's own data access, a
      // separate and larger prerequisite than this reporting-focused
      // fix. Flagged as a known, deliberately out-of-scope gap in the
      // R.3.7 handoff rather than silently expanded into.
      if (result.data.reportDefinitionId) {
        const definition = await reportBuilderService.get(result.data.reportDefinitionId, context.tenantId);
        assertDataSourceAccess(definition.dataSource, context);
      }

      // Org-unit scope for the report engine. Without this the engine
      // falls back to organization-wide, which is exactly the leak this
      // change closes -- so it is resolved here, at the request edge,
      // rather than left to each service.
      const tenantContext = await resolveTenantContext(req);
      const execution = await reportExecutionService.generate(result.data, context.tenantId, context.userId, tenantContext);
      return successResponse(execution);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * No route yet. Returns the raw file, not a JSON envelope -- callers
   * expecting successResponse()'s {success,data} shape would break here,
   * so this bypasses response.utils intentionally, the same way
   * app/api/fuellogs/receipt/route.ts returns non-enveloped responses
   * for binary payloads.
   */
  async download(req: NextRequest, context: AuthContext, id: string) {
    try {
      const { buffer, execution } = await reportExecutionService.download(id, context.tenantId, context.userId);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': execution.fileKey ? 'application/octet-stream' : 'application/json',
          'Content-Disposition': `attachment; filename="${execution.name}.${execution.format}"`,
        },
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (isAppError(error)) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[ReportExecutionController] Unexpected error:', describeError(error));
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const reportExecutionController = new ReportExecutionController();