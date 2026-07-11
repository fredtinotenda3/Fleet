// modules/reporting/controllers/report-execution.controller.ts

import { NextRequest, NextResponse } from 'next/server';
import { AuthContext } from '@/server/auth/auth-context';
import { reportExecutionService } from '../services/report-execution.service';
import { successResponse, paginatedResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError } from '@/server/errors/app.errors';
import { validateWithZod } from '@/shared/utils/validation.utils';
import { generateExecutionSchema } from '@/shared/validations/report-execution.schema';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';

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
      const execution = await reportExecutionService.generate(result.data, context.tenantId, context.userId);
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
      return new NextResponse(buffer, {
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
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[ReportExecutionController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const reportExecutionController = new ReportExecutionController();