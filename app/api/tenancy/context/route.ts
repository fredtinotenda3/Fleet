// app/api/tenancy/context/route.ts

import { NextRequest } from 'next/server';
import { tenancyController } from '@/modules/tenancy/controllers/tenancy.controller';
import { withAuth } from '@/server/middleware/with-auth';

export const GET = withAuth((req: NextRequest) => tenancyController.getContext(req));