// app/api/reminders/route.ts

import { NextRequest } from 'next/server';
import { maintenanceController } from '@/modules/maintenance/controllers/maintenance.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { errorResponse } from '@/server/utils/response.utils';

export const GET = withAuth(
  async (req: NextRequest) => {
    const searchParams = req.nextUrl.searchParams;
    const action = searchParams.get('action');
    const id = searchParams.get('id');

    if (action === 'stats') return await maintenanceController.getMaintenanceStats(req);
    if (action === 'overdue') return await maintenanceController.getOverdueReminders(req);
    if (action === 'upcoming') return await maintenanceController.getUpcomingReminders(req);

    // Phase 2 Enterprise Export Framework
    if (action === 'export') return await maintenanceController.exportReminders(req);

    if (id) return await maintenanceController.getReminder(req, id);

    return await maintenanceController.getReminders(req);
  },
  { permission: Permission.MAINTENANCE_VIEW }
);

export const POST = withAuth(
  async (req: NextRequest) => await maintenanceController.createReminder(req),
  { permission: Permission.MAINTENANCE_CREATE }
);

export const PUT = withAuth(
  async (req: NextRequest) => {
    const id = req.nextUrl.searchParams.get('id');
    const action = req.nextUrl.searchParams.get('action');

    if (!id) {
      return errorResponse('Missing reminder ID', 'VALIDATION_ERROR', 400);
    }

    if (action === 'complete') {
      return await maintenanceController.completeReminder(req, id);
    }

    return await maintenanceController.updateReminder(req, id);
  },
  { anyPermission: [Permission.MAINTENANCE_EDIT, Permission.MAINTENANCE_COMPLETE] }
);

export const DELETE = withAuth(
  async (req: NextRequest) => {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return errorResponse('Missing reminder ID', 'VALIDATION_ERROR', 400);
    }
    return await maintenanceController.deleteReminder(req, id);
  },
  { permission: Permission.MAINTENANCE_DELETE }
);