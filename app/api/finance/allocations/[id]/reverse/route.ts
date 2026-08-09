// app/api/finance/allocations/[id]/reverse/route.ts

import { NextRequest } from 'next/server';
import { allocationController } from '@/modules/finance/controllers/allocation.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { AuthContext } from '@/server/auth/auth-context';

export const dynamic = 'force-dynamic';

export const POST = withAuth(
  (req: NextRequest, context: AuthContext, { params }: { params: { id: string } }) =>
    allocationController.reversePosting(req, params.id),
  { permission: Permission.FINANCE_MANAGE }
);
