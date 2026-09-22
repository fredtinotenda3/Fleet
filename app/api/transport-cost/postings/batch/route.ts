// app/api/transport-cost/postings/batch/route.ts
//
// Phase O3.

import { NextRequest } from 'next/server';
import { transportCostController } from '@/modules/transport-cost/controllers/transport-cost.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth(
  async (req: NextRequest) => transportCostController.postImportBatch(req),
  { permission: Permission.FINANCE_MANAGE }
);
