// modules/finance/controllers/finance-settings.controller.ts
//
// HTTP surface for organization-level finance configuration.
//
// GET returns BOTH the saved settings and the resolved effective values,
// with `usingDefaults` telling the caller which it is. A settings screen
// that cannot distinguish "the tenant chose transaction-date" from
// "nobody has configured this and transaction-date is our default" will
// present an inferred value as a confirmed one -- and FX policy is
// exactly the field where that matters.

import { NextRequest } from 'next/server';
import { financeSettingsService } from '../services/finance-settings.service';
import { updateFinanceSettingsSchema } from '@/shared/validations/finance.schema';
import { validateWithZod } from '@/shared/utils/validation.utils';
import { successResponse, errorResponse } from '@/server/utils/response.utils';
import { isAppError, describeError, ValidationError } from '@/server/errors/app.errors';
import { resolveTenantContext, resolveTenantContextWithUser } from '@/server/utils/tenant-context.utils';

export class FinanceSettingsController {
  /** GET /api/finance/settings */
  async getSettings(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);

      const [saved, resolved] = await Promise.all([
        financeSettingsService.getSaved(context.organizationId),
        financeSettingsService.resolve(context.organizationId),
      ]);

      return successResponse({ saved: saved ?? null, resolved });
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** PUT /api/finance/settings */
  async updateSettings(req: NextRequest) {
    try {
      const { context, userId } = await resolveTenantContextWithUser(req);

      let body: unknown;
      try {
        body = await req.json();
      } catch {
        throw new ValidationError('Request body must be valid JSON.');
      }

      const result = await validateWithZod(updateFinanceSettingsSchema, body);
      if (!result.success || !result.data) {
        throw new ValidationError('Validation failed', result.errors);
      }

      const { settings, reportingCurrencyChanged } = await financeSettingsService.update(
        context,
        userId,
        result.data
      );

      return successResponse(
        { settings },
        reportingCurrencyChanged
          ? {
              // Surfaced as response meta rather than swallowed: existing
              // postings keep the reportingCurrency they were written
              // under (by design -- see the update() doc comment), so any
              // period spanning this change now contains two reporting
              // currencies and the cost engine will refuse to total it.
              warning:
                'Reporting currency changed. Existing postings retain their original reporting ' +
                'currency, so cost-per-km for any period spanning this change will report ' +
                'mixedReportingCurrencies instead of a total. Re-post or reverse affected periods ' +
                'if a single-currency view is required.',
            }
          : undefined
      );
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (isAppError(error)) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[FinanceSettingsController] Unexpected error:', describeError(error));
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const financeSettingsController = new FinanceSettingsController();
