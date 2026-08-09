// modules/finance/controllers/gl-reconciliation.controller.ts
//
// HTTP surface for GL submissions and the reconciliation report.
// Request-parsing only.

import { NextRequest } from 'next/server';
import { glReconciliationService } from '../services/gl-reconciliation.service';
import { createGLSubmissionSchema } from '@/shared/validations/finance.schema';
import { validateWithZod } from '@/shared/utils/validation.utils';
import { successResponse, createdResponse, errorResponse } from '@/server/utils/response.utils';
import { isAppError, describeError, ValidationError } from '@/server/errors/app.errors';
import { resolveTenantContext, resolveTenantContextWithUser } from '@/server/utils/tenant-context.utils';

function requireDateParam(value: string | null, paramName: string): Date {
  if (!value) throw new ValidationError(`"${paramName}" is required.`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`Invalid "${paramName}" date: "${value}".`);
  }
  return parsed;
}

async function parseJsonBody(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ValidationError('Request body must be valid JSON.');
  }
}

export class GLReconciliationController {
  /** POST /api/finance/gl/submissions */
  async submit(req: NextRequest) {
    try {
      const { context, userId } = await resolveTenantContextWithUser(req);
      const body = await parseJsonBody(req);

      const result = await validateWithZod(createGLSubmissionSchema, body);
      if (!result.success || !result.data) {
        throw new ValidationError('Validation failed', result.errors);
      }

      const submission = await glReconciliationService.submit(context, userId, result.data);
      return createdResponse(submission);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** GET /api/finance/gl/submissions?periodStart=...&periodEnd=... */
  async listSubmissions(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      const params = req.nextUrl.searchParams;

      const submissions = await glReconciliationService.listSubmissions(
        context,
        requireDateParam(params.get('periodStart'), 'periodStart'),
        requireDateParam(params.get('periodEnd'), 'periodEnd')
      );

      return successResponse(submissions, { count: submissions.length });
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** GET /api/finance/gl/reconciliation?periodStart=...&periodEnd=... */
  async getReport(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      const params = req.nextUrl.searchParams;

      const report = await glReconciliationService.buildReport(
        context,
        requireDateParam(params.get('periodStart'), 'periodStart'),
        requireDateParam(params.get('periodEnd'), 'periodEnd')
      );

      return successResponse(report);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (isAppError(error)) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[GLReconciliationController] Unexpected error:', describeError(error));
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const glReconciliationController = new GLReconciliationController();
