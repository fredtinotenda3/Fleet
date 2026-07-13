// app/api/reminders/import/route.ts
import { NextRequest } from 'next/server';
import { maintenanceController } from '@/modules/maintenance/controllers/maintenance.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth(
  async (req: NextRequest) => maintenanceController.importReminders(req),
  { permission: Permission.MAINTENANCE_CREATE }
);