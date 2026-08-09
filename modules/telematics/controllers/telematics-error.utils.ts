// modules/telematics/controllers/telematics-error.utils.ts
//
// Same error-classification behaviour as
// TelematicsController.handleError (telematics.controller.ts), factored
// out so the new live-map/demo/cartrack controllers can share it without
// duplicating the private method three more times or editing the
// existing, already-tested controller.

import { errorResponse } from '@/server/utils/response.utils';
import { isAppError, describeError } from '@/server/errors/app.errors';

export function handleTelematicsError(source: string, error: unknown) {
  if (isAppError(error)) {
    return errorResponse(error.message, error.code, error.statusCode, error.details);
  }
  if (error instanceof Error) {
    return errorResponse(error.message, 'VALIDATION_ERROR', 400);
  }
  console.error(`[${source}] Unexpected error:`, describeError(error));
  return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
}