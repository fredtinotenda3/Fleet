// modules/notifications/controllers/__tests__/notification.controller.test.ts
//
// Complements notification-broadcast.authorization.test.ts. That suite
// proves authorizeBroadcast() throws/resolves correctly in isolation;
// this suite proves NotificationController.createBroadcast() actually
// wires that outcome into the real HTTP contract -- i.e. that a thrown
// ForbiddenError becomes a 403 response body, not just an uncaught
// rejection, and that a malformed broadcast payload is rejected by
// schema validation *before* authorizeBroadcast (and therefore before
// any TenantContextService/DB lookup) ever runs.
//
// Everything the controller imports besides the errors module is
// mocked, so this test is only exercising NotificationController's own
// sequencing (validate -> authorize -> persist -> respond), not
// re-testing notificationService, the validation schema, or
// authorizeBroadcast's internals -- each of those already has its own
// test coverage.

import { NextRequest } from 'next/server';
import { NotificationController } from '../notification.controller';
import { notificationService } from '../../services/notification.service';
import { authorizeBroadcast } from '../../authorization/notification-broadcast.authorization';
import { notificationBroadcastCreateSchema } from '@/shared/validations/notification.schema';
import {
  getTenantFromRequest,
  getUserIdFromRequest,
  getUserRolesFromRequest,
  isSuperAdmin,
} from '@/server/utils/context.utils';
import { successResponse, errorResponse } from '@/server/utils/response.utils';
import { ForbiddenError, ValidationError } from '@/server/errors/app.errors';

jest.mock('../../services/notification.service', () => ({
  notificationService: { sendBroadcastNotification: jest.fn() },
}));
jest.mock('../../authorization/notification-broadcast.authorization', () => ({
  authorizeBroadcast: jest.fn(),
}));
jest.mock('@/shared/validations/notification.schema', () => ({
  notificationBroadcastCreateSchema: { safeParse: jest.fn() },
  notificationPreferencesUpdateSchema: { safeParse: jest.fn() },
}));
jest.mock('@/server/utils/context.utils', () => ({
  getTenantFromRequest: jest.fn(),
  getUserIdFromRequest: jest.fn(),
  getUserRolesFromRequest: jest.fn(),
  isSuperAdmin: jest.fn(),
}));
jest.mock('@/server/utils/response.utils', () => ({
  successResponse: jest.fn((data) => ({ status: 200, body: { success: true, data } })),
  paginatedResponse: jest.fn(),
  errorResponse: jest.fn((message, code, statusCode, details) => ({
    status: statusCode,
    body: { success: false, error: { code, message, details } },
  })),
}));
// tenantContextService is only used by getNotifications/getUnreadCount/etc,
// not createBroadcast, but the controller module imports it at module
// scope, so it still needs a mock to load in isolation.
jest.mock('@/modules/tenancy/services/tenant-context.service', () => ({
  tenantContextService: { resolveContext: jest.fn() },
}));

const mockSendBroadcast = notificationService.sendBroadcastNotification as jest.Mock;
const mockAuthorize = authorizeBroadcast as jest.Mock;
const mockSafeParse = notificationBroadcastCreateSchema.safeParse as jest.Mock;
const mockGetTenant = getTenantFromRequest as jest.Mock;
const mockGetUserId = getUserIdFromRequest as jest.Mock;
const mockGetRoles = getUserRolesFromRequest as jest.Mock;
const mockIsSuperAdmin = isSuperAdmin as jest.Mock;

const VALID_BODY = {
  orgUnitId: 'branch-a',
  type: 'alert',
  title: 'Scheduled maintenance window',
  message: 'The workshop will be closed Saturday.',
  priority: 'medium',
};

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/notifications/broadcast', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('NotificationController.createBroadcast', () => {
  let controller: NotificationController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new NotificationController();
    mockGetTenant.mockResolvedValue('org-1');
    mockGetUserId.mockResolvedValue('u-1');
    mockGetRoles.mockResolvedValue(['branch_manager']);
    mockIsSuperAdmin.mockResolvedValue(false);
  });

  it('rejects an invalid payload with 400 before authorizeBroadcast is ever called', async () => {
    mockSafeParse.mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: { title: ['Required'] } }) },
    });

    const req = makeRequest({ orgUnitId: 'branch-a' }); // missing required fields
    await controller.createBroadcast(req);

    expect(mockAuthorize).not.toHaveBeenCalled();
    expect(mockSendBroadcast).not.toHaveBeenCalled();
    expect(errorResponse).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      new ValidationError('x').statusCode, // 400, from the real ValidationError class
      expect.anything()
    );
  });

  it('requirement 7: a role authorizeBroadcast rejects (driver/mechanic/viewer/etc.) surfaces as HTTP 403, and nothing is persisted', async () => {
    mockSafeParse.mockReturnValue({ success: true, data: VALID_BODY });
    mockAuthorize.mockRejectedValue(new ForbiddenError('You do not have permission to broadcast notifications'));

    const req = makeRequest(VALID_BODY);
    const result: any = await controller.createBroadcast(req);

    expect(mockSendBroadcast).not.toHaveBeenCalled();
    expect(result.status).toBe(new ForbiddenError('x').statusCode); // 403
    expect(result.status).toBe(403);
  });

  it('requirement 5/6/8: an authorized manager reaches sendBroadcastNotification with the exact target orgUnitId, and gets a success response', async () => {
    mockSafeParse.mockReturnValue({ success: true, data: VALID_BODY });
    mockAuthorize.mockResolvedValue({
      organizationId: 'org-1',
      organizationName: 'org-1',
      accessibleOrgUnitIds: ['branch-a'],
    });
    mockSendBroadcast.mockResolvedValue({ _id: 'notif-1', ...VALID_BODY, tenantId: 'org-1' });

    const req = makeRequest(VALID_BODY, { 'x-org-unit-id': 'branch-a' });
    const result: any = await controller.createBroadcast(req);

    expect(mockAuthorize).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        tenantId: 'org-1',
        roles: ['branch_manager'],
        isSuperAdmin: false,
        activeOrgUnitId: 'branch-a',
        targetOrgUnitId: 'branch-a',
      })
    );
    expect(mockSendBroadcast).toHaveBeenCalledWith(
      'branch-a',
      'org-1',
      expect.objectContaining({ title: VALID_BODY.title, type: VALID_BODY.type })
    );
    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
  });

  it('never calls sendBroadcastNotification when authorization has not resolved (fail-closed ordering)', async () => {
    mockSafeParse.mockReturnValue({ success: true, data: VALID_BODY });
    let resolveAuthorize!: (v: unknown) => void;
    mockAuthorize.mockReturnValue(new Promise((resolve) => (resolveAuthorize = resolve)));

    const req = makeRequest(VALID_BODY);
    const pending = controller.createBroadcast(req);

    // While authorizeBroadcast is still pending, the write path must not
    // have fired yet -- proves createBroadcast awaits authorization
    // rather than firing the write optimistically.
    expect(mockSendBroadcast).not.toHaveBeenCalled();

    resolveAuthorize({ organizationId: 'org-1', organizationName: 'org-1', accessibleOrgUnitIds: ['branch-a'] });
    mockSendBroadcast.mockResolvedValue({ _id: 'notif-2', ...VALID_BODY, tenantId: 'org-1' });
    await pending;

    expect(mockSendBroadcast).toHaveBeenCalledTimes(1);
  });
});