// app/api/finance/settings/route.ts
//
// PUT is FINANCE_MANAGE, which BRANCH_MANAGER deliberately does not
// hold: reporting currency and FX policy are organization-level and a
// branch changing them would silently restate every other branch's
// figures. See finance-settings.types.ts.

import { NextRequest } from 'next/server';
import { financeSettingsController } from '@/modules/finance/controllers/finance-settings.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const dynamic = 'force-dynamic';

export const GET = withAuth(
  (req: NextRequest) => financeSettingsController.getSettings(req),
  { permission: Permission.FINANCE_VIEW }
);

export const PUT = withAuth(
  (req: NextRequest) => financeSettingsController.updateSettings(req),
  { permission: Permission.FINANCE_MANAGE }
);
