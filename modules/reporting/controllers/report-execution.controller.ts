// modules/reporting/controllers/report-execution.controller.ts

import { NextRequest, NextResponse } from 'next/server';
import { reportExecutionService } from '../services/report-execution.service';
import { AuthContext } from '@/server/auth/auth-context';
import { successResponse, createdResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError } from '@/server/errors/app.errors';
import { generateExecutionSchema } from '@/shared/validations/report-execution.schema';
import { ExecutionFormat } from '../types/report-execution.types';

const MIME_MAP: Record<ExecutionFormat, string> = {
  pdf: 'application/pdf',
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  word: 'application/msword',
  json: 'application/json',
};
const EXT_MAP: Record<ExecutionFormat, string> = { pdf: 'pdf', excel: 'xlsx', csv: 'csv', word: 'doc', json: 'json' };

export class ReportExecutionController {
  async generate(req: NextRequest, context: AuthContext) {
    try {
      const body = await req.json();
      const parsed = generateExecutionSchema.safeParse(body);
      if (!parsed.success) return errorResponse('Invalid execution request', 'VALIDATION_ERROR', 400, parsed.error.flatten());
      return createdResponse(await reportExecutionService.generate(parsed.data, context.tenantId, context.userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async list(req: NextRequest, context: AuthContext) {
    try {
      const page = Number(req.nextUrl.searchParams.get('page') ?? '1');
      const limit = Number(req.nextUrl.searchParams.get('limit') ?? '25');
      const result = await reportExecutionService.list(context.tenantId, { page, limit });
      return NextResponse.json({ success: true, data: result.data, pagination: result.pagination });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getById(_req: NextRequest, context: AuthContext, params: { id: string }) {
    try {
      return successResponse(await reportExecutionService.get(params.id, context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async download(_req: NextRequest, context: AuthContext, params: { id: string }) {
    try {
      const { buffer, execution } = await reportExecutionService.download(params.id, context.tenantId, context.userId);
      const filename = `${execution.name.replace(/[^a-z0-9_\-]+/gi, '_')}.${EXT_MAP[execution.format]}`;
      
      // Convert Buffer to Uint8Array for NextResponse compatibility
      const uint8Array = new Uint8Array(buffer);
      
      return new NextResponse(uint8Array, {
        status: 200,
        headers: {
          'Content-Type': MIME_MAP[execution.format],
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': buffer.length.toString(),
        },
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) return errorResponse(error.message, error.code, error.statusCode, error.details);
    console.error('[ReportExecutionController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const reportExecutionController = new ReportExecutionController();