// app/api/telematics/ingest/route.ts
//
// PHASE 0, F-5. This route was a bare delegate with no wrapper at all:
//
//   export async function POST(req) { return telematicsController.ingest(req); }
//
// The controller resolved a tenantId (so a 401 was enforced) and then
// wrote whatever it was given. No permission, no ownership check.
//
// Note that middleware.ts does NOT cover this path -- its matcher
// excludes non-versioned /api/*, so the 401 branch inside the
// middleware never runs for this route. Route-level protection is the
// only protection, which is exactly why the wrapper below is not
// optional.
//
// TELEMATICS_INGEST is deliberately a machine permission held by no
// ordinary role -- see server/permissions/roles.ts. Rate-limited
// because an ingestion endpoint is the one place a legitimate caller is
// expected to post in volume, which makes it the most attractive place
// to post in volume illegitimately.
import { NextRequest } from 'next/server';
import { telematicsController } from '@/modules/telematics/controllers/telematics.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth(
  (req: NextRequest) => telematicsController.ingest(req),
  { permission: Permission.TELEMATICS_INGEST, rateLimit: true }
);
